import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnalysisAttentionHero,
  AnalysisDeadlineSummary,
  AnalysisReferenceHeader,
  AnalysisReferencePlanCard,
  AnalysisTabs,
  AppText,
  colors,
  type AnalysisTabKey,
  getHeaderTop,
  HealthInsightsPage,
  shadows,
  sizes,
  spacing,
} from '../design-system';
import { api } from '../convex/_generated/api';
import { useAgentAutomationState } from '../lib/agent-automation-manager';
import { analysisCatalogByKey } from '../lib/analysis-catalog';
import { useConnectivity } from '../lib/connectivity';
import { useHealthStore } from '../lib/health-store';
import type { CarePlanItem } from '../lib/health-types';
import { persistLabDocument } from '../lib/local-files';
import {
  calculateCompletionScore,
  latestCarePlanDueAt,
} from '../lib/product-insights';

const bloodTubesImage = require('../assets/analyses/blood-tubes.png');
const ultrasoundImage = require('../assets/analyses/ultrasound.png');
const hysteroscopeImage = require('../assets/analyses/hysteroscope.png');
const mascotHandsImage = require('../assets/analyses/mascot-hands-reference.png');

const e2eDocumentFixtureUri =
  __DEV__ && process.env.EXPO_PUBLIC_E2E_MODE === '1'
    ? Platform.OS === 'ios'
      ? (process.env.EXPO_PUBLIC_E2E_DOCUMENT_FIXTURE_IOS_URI ??
        process.env.EXPO_PUBLIC_E2E_SCAN_FIXTURE_IOS_URI)
      : Platform.OS === 'android'
        ? (process.env.EXPO_PUBLIC_E2E_DOCUMENT_FIXTURE_ANDROID_URI ??
          process.env.EXPO_PUBLIC_E2E_SCAN_FIXTURE_ANDROID_URI)
        : undefined
    : undefined;

type PlannedAnalysis = {
  carePlan: CarePlanItem;
  category: string;
  clinic: string;
  description: string;
  dueLabel: string;
  dueValue: string;
  id: string;
  image?: ImageSourcePropType;
  purpose: string;
  requirements: string[];
  statusLabel: string;
  tab: Exclude<AnalysisTabKey, 'completed'>;
  title: string;
  validityLabel: string;
  validityValue: string;
};

type PendingAnalysisAttachment = {
  kind: 'file' | 'photo';
  name: string;
  uri: string;
};

function automationFailureStatus({
  errorCode,
  nextRetryAt,
}: {
  errorCode?: string;
  nextRetryAt?: number;
}) {
  const retryText = nextRetryAt
    ? ` Следующая попытка — ${new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(nextRetryAt))}.`
    : ' Новая проверка запустится после следующего подтверждённого изменения.';

  switch (errorCode) {
    case 'RATE_LIMITED':
      return {
        title: 'Проверка отложена из-за лимита',
        description: `Данные сохранены, план не потерян.${retryText}`,
      };
    case 'PROVIDER_UNAVAILABLE':
    case 'TRANSPORT_ERROR':
      return {
        title: 'Сервис плана временно недоступен',
        description: `Последняя попытка не завершилась, но данные остались на устройстве.${retryText}`,
      };
    case 'CONTENT_FILTERED':
      return {
        title: 'План не удалось сформировать автоматически',
        description:
          'Сферка не смогла безопасно обработать текущий набор данных. Измените или дополните записи и попробуйте снова.',
      };
    case 'INVALID_AGENT_PLAN_PROPOSAL':
    case 'INVALID_REQUEST':
    case 'INVALID_TOOL_RESULT':
      return {
        title: 'Проверка завершилась без подходящего плана',
        description: `Сферка отклонила неполный результат и ничего не изменила.${retryText}`,
      };
    default:
      return {
        title: 'Первая проверка пока не завершилась',
        description: `Настройки приняты, последняя попытка завершилась ошибкой.${retryText}`,
      };
  }
}

const planImages: Record<string, ImageSourcePropType> = {
  'blood-tubes': bloodTubesImage,
  ultrasound: ultrasoundImage,
  hysteroscope: hysteroscopeImage,
};

function formatPlanDate(timestamp?: number) {
  if (!timestamp) return 'Дата уточняется';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(timestamp));
}

function normalizePlanDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18);
}

function latestUpcomingPlanDate(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 5, 0, 18);
}

function viewModelForPlan(item: CarePlanItem): PlannedAnalysis {
  const catalog = analysisCatalogByKey.get(item.catalogKey);
  const statusLabel = item.safetyHoldAt
    ? 'Приостановлено'
    : item.requiresClinician || item.riskTier !== 'low'
      ? 'Обсудить с врачом'
      : item.provisional
        ? 'Предварительная оценка'
        : 'Подтверждено';
  return {
    carePlan: item,
    category: catalog?.category ?? item.category,
    clinic:
      item.requiresClinician || item.riskTier !== 'low'
        ? 'Обсудите необходимость и сроки с профильным врачом'
        : 'Это рекомендация для планирования, а не медицинское назначение',
    description: catalog?.specimen ?? item.description,
    dueLabel: item.status === 'current' ? 'Рекомендуемый срок' : 'Ориентир',
    dueValue: formatPlanDate(item.dueAt),
    id: item.localId,
    image: item.illustrationKey ? planImages[item.illustrationKey] : undefined,
    purpose: item.rationale || catalog?.purpose || item.description,
    requirements: [catalog?.specimen ?? item.description].filter(Boolean),
    statusLabel,
    tab: item.status === 'current' ? 'current' : 'upcoming',
    title: item.title,
    validityLabel: 'Основание',
    validityValue:
      item.scheduleBasis === 'model_inference'
        ? 'Оценка ИИ'
        : item.scheduleBasis === 'clinician'
          ? 'Назначение врача'
          : item.scheduleBasis === 'user'
            ? 'Указано вами'
            : 'Подтверждённые данные',
  };
}

function recommendationReasonLabel(reasonCode?: string) {
  const labels: Record<string, string> = {
    MODEL_PLAN_PROPOSAL_VALIDATED:
      'Добавлено после проверки профиля и подтверждённых данных.',
    MODEL_REPLACEMENT_VALIDATED:
      'Добавлено вместо ближайшего пункта после появления новых данных; рекомендация остаётся предварительной.',
    NEW_CONFIRMED_EVIDENCE_SUPPORTED_BETTER_CANDIDATE:
      'Ближайший пункт заменён после появления новых данных; рекомендация остаётся предварительной.',
    NEW_EVIDENCE_SUPPORTED_BETTER_CANDIDATE:
      'Ближайший пункт заменён после появления новых данных; рекомендация остаётся предварительной.',
    DUE_WINDOW_REACHED:
      'Срок наступил, поэтому пункт перенесён в текущий план.',
    CONFIRMED_RESULT_MATCHED_DUE_WINDOW:
      'Найден подтверждённый результат за соответствующий период.',
    CURRENT_ITEM_REQUIRES_CLINICIAN_REVIEW:
      'Пункт приостановлен до обсуждения с врачом.',
    PREGNANCY_REQUIRES_CLINICIAN_SAFETY_REVIEW:
      'При беременности требуется отдельная оценка безопасности врачом.',
    CONFIRMED_CONTRAST_ALLERGY_REQUIRES_CLINICIAN_REVIEW:
      'Указана тяжёлая аллергическая реакция, поэтому требуется оценка врачом.',
  };
  return reasonCode
    ? (labels[reasonCode] ?? 'План пересмотрен по подтверждённым данным.')
    : 'Это предварительная рекомендация, основанная на доступных подтверждённых данных.';
}

export default function AnalysesScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId?: string }>();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { isKnown: connectionKnown, isOffline } = useConnectivity();
  const insets = useSafeAreaInsets();
  const headerTop = getHeaderTop(insets.top);
  const {
    applyCarePlanAction,
    confirmCarePlanSchedule,
    carePlanItems,
    documents,
    journalEntries,
    labResults,
    profile,
    scanResults,
    addLabResult,
    preferences,
    recommendationEvents,
    readOnly,
  } = useHealthStore();
  const [activeTab, setActiveTab] = useState<AnalysisTabKey>('current');
  const [selectedAnalysis, setSelectedAnalysis] = useState<PlannedAnalysis>();
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAnalysisAttachment>();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [schedulePickerVisible, setSchedulePickerVisible] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() =>
    normalizePlanDate(new Date()),
  );
  const [attachmentPicking, setAttachmentPicking] = useState(false);
  const [modalViewportHeight, setModalViewportHeight] = useState(0);
  const [modalContentHeight, setModalContentHeight] = useState(0);
  const [chartsVisible, setChartsVisible] = useState(false);
  const handledSource = useRef<string | undefined>(undefined);
  const plannedAnalyses = useMemo(
    () =>
      carePlanItems
        .filter(
          (item) =>
            !item.deletedAt &&
            (item.status === 'current' || item.status === 'upcoming'),
        )
        .sort((left, right) =>
          (left.dueAt ?? Infinity) === (right.dueAt ?? Infinity)
            ? left.title.localeCompare(right.title, 'ru')
            : (left.dueAt ?? Infinity) - (right.dueAt ?? Infinity),
        )
        .map(viewModelForPlan),
    [carePlanItems],
  );
  const recommendationsEnabled =
    preferences.find((item) => !item.deletedAt)?.medicalRecommendations ===
    true;
  const agentPreferences = preferences.find((item) => !item.deletedAt);
  const agentStatus = useQuery(
    api.agent.status,
    isAuthenticated && !readOnly ? {} : 'skip',
  );
  const agentAutomationState = useAgentAutomationState();
  const agentLastSuccessfulRunAt = agentPreferences?.agentLastSuccessfulRunAt;
  const emptyPlanStatus = !recommendationsEnabled
    ? {
        title: 'Автономный план выключен',
        description:
          'Включите автономные рекомендации в профиле, если хотите получать персональный предварительный план.',
      }
    : isOffline
      ? {
          title: 'План ждёт подключения',
          description:
            'Данные остаются на устройстве. Проверка начнётся после восстановления стабильного соединения.',
        }
      : !connectionKnown || (isAuthenticated && !agentStatus)
        ? {
            title: 'Проверяем подключение и настройки',
            description:
              'Обычно это занимает несколько секунд. Экран обновится автоматически.',
          }
        : !isAuthenticated || readOnly
          ? {
              title: 'Обновление недоступно в этом режиме',
              description:
                'Персональный план создаётся только после входа в нативном приложении.',
            }
          : !agentStatus
            ? {
                title: 'Проверяем настройки Ассистента',
                description:
                  'Экран обновится автоматически после ответа сервера.',
              }
            : !agentStatus.enabled
              ? {
                  title: 'Ассистент временно выключен',
                  description:
                    'Сервис автономного плана отключён администратором. Локальные результаты остаются доступны.',
                }
              : !agentStatus.consentAccepted
                ? {
                    title: 'Нужно согласие для Ассистента',
                    description:
                      'Сначала включите Ассистента в чате и подтвердите категории данных, которые он сможет использовать.',
                  }
                : !agentStatus.automationEnabled
                  ? {
                      title: 'Автономные проверки недоступны',
                      description:
                        'Сервер временно не принимает фоновые проверки плана. Попробуйте позже.',
                    }
                  : !agentStatus.providerConfigured
                    ? {
                        title: 'Сервис плана не настроен',
                        description:
                          'Подключение к модели на сервере неполное. Локальные данные в безопасности; администратору нужно проверить настройки провайдера.',
                      }
                    : !agentStatus.automationAccepted
                      ? {
                          title: 'Настройка не подтверждена',
                          description:
                            'Выключите и снова включите автономные рекомендации в профиле.',
                        }
                      : agentAutomationState.phase === 'checking'
                        ? {
                            title: 'Проверяем план сейчас',
                            description:
                              'Сферка получила актуальные данные и ждёт ответ сервиса. Обычно это занимает меньше минуты.',
                          }
                        : agentAutomationState.phase === 'retrying' ||
                            agentAutomationState.phase === 'failed'
                          ? automationFailureStatus(agentAutomationState)
                          : agentLastSuccessfulRunAt
                            ? {
                                title: 'План проверен — активных пунктов нет',
                                description: `Последняя успешная проверка: ${new Intl.DateTimeFormat(
                                  'ru-RU',
                                  { dateStyle: 'medium', timeStyle: 'short' },
                                ).format(
                                  new Date(agentLastSuccessfulRunAt),
                                )}. Новые подтверждённые данные запустят следующую проверку.`,
                              }
                            : {
                                title: 'Готовим первую проверку плана',
                                description:
                                  'Она запускается после 30 секунд стабильного подключения. При временной ошибке Сферка повторит попытку с безопасной задержкой.',
                              };

  useEffect(() => {
    if (!sourceId || handledSource.current === sourceId) return;
    const plan = plannedAnalyses.find((item) => item.id === sourceId);
    if (plan) {
      handledSource.current = sourceId;
      setActiveTab(plan.tab);
      openAnalysis(plan);
      return;
    }
    const archivedPlan = carePlanItems.find(
      (item) => !item.deletedAt && item.localId === sourceId,
    );
    if (archivedPlan) {
      handledSource.current = sourceId;
      setActiveTab('completed');
      Alert.alert(
        archivedPlan.title,
        archivedPlan.status === 'completed'
          ? `Выполнено ${new Date(
              archivedPlan.performedAt ?? archivedPlan.updatedAt,
            ).toLocaleDateString('ru-RU')}`
          : archivedPlan.status === 'declined'
            ? 'Вы отказались от этой рекомендации.'
            : 'Рекомендация была заменена после пересмотра плана.',
      );
      return;
    }
    const result = labResults.find(
      (item) => !item.deletedAt && item.localId === sourceId,
    );
    if (result) {
      handledSource.current = sourceId;
      setActiveTab('completed');
      Alert.alert(
        result.title,
        `${new Date(result.collectedAt).toLocaleDateString('ru-RU')} · ${
          result.status === 'unreviewed'
            ? 'файл сохранён, содержимое не прочитано'
            : result.status === 'attention'
              ? 'требует внимания'
              : 'подтверждено'
        }`,
      );
      return;
    }
    const scan = scanResults.find(
      (item) => !item.deletedAt && item.localId === sourceId,
    );
    if (scan) {
      handledSource.current = sourceId;
      setActiveTab('completed');
      Alert.alert(
        scan.testSystemKey === 'ovulation-strip'
          ? 'Тест на овуляцию'
          : scan.testSystemKey === 'pregnancy-strip'
            ? 'Тест на беременность'
            : scan.testSystemKey,
        `${new Date(scan.capturedAt).toLocaleDateString('ru-RU')} · ${
          scan.confirmedByUser
            ? scan.confirmedValue === 'positive'
              ? 'положительный результат'
              : scan.confirmedValue === 'negative'
                ? 'отрицательный результат'
                : 'недействительный результат'
            : 'ожидает подтверждения'
        }`,
      );
    }
  }, [carePlanItems, labResults, plannedAnalyses, scanResults, sourceId]);

  const savedResults = useMemo(
    () => labResults.filter((item) => !item.deletedAt),
    [labResults],
  );
  const savedScans = useMemo(
    () =>
      scanResults
        .filter((item) => !item.deletedAt)
        .sort((left, right) => right.capturedAt - left.capturedAt),
    [scanResults],
  );
  const completedPlans = useMemo(
    () =>
      carePlanItems
        .filter((item) => !item.deletedAt && item.status === 'completed')
        .filter((item) => {
          const linkedByDocument = documents.some(
            (document) =>
              !document.deletedAt &&
              document.linkedCarePlanLocalId === item.localId,
          );
          const linkedByCompletionEvidence = savedResults.some(
            (result) =>
              item.performedAt === result.collectedAt &&
              item.evidenceRefs.some(
                (ref) =>
                  ref.source === 'test' && ref.localId === result.localId,
              ),
          );
          return !linkedByDocument && !linkedByCompletionEvidence;
        })
        .sort(
          (left, right) =>
            (right.performedAt ?? right.updatedAt) -
            (left.performedAt ?? left.updatedAt),
        ),
    [carePlanItems, documents, savedResults],
  );

  const attachedResultsByPlan = useMemo(() => {
    const result = new Map<string, (typeof savedResults)[number]>();
    for (const item of savedResults) {
      const document = documents.find(
        (candidate) =>
          !candidate.deletedAt &&
          (candidate.localId === item.sourceDocumentLocalId ||
            candidate.linkedLabResultLocalId === item.localId) &&
          candidate.hasLocalFile &&
          Boolean(candidate.localFileUri),
      );
      if (item.hasLocalSourceDocument && document) {
        result.set(item.catalogKey, item);
      }
    }
    return result;
  }, [documents, savedResults]);

  const closeAnalysis = () => {
    if (saving || attachmentPicking) return;
    setSelectedAnalysis(undefined);
    setPendingAttachment(undefined);
    setAttachmentError(undefined);
    setSchedulePickerVisible(false);
  };

  const openAnalysis = (analysis: PlannedAnalysis) => {
    setSelectedAnalysis(analysis);
    setPendingAttachment(undefined);
    setAttachmentError(undefined);
    setScheduleDate(
      normalizePlanDate(
        new Date(Math.max(Date.now(), analysis.carePlan.dueAt ?? Date.now())),
      ),
    );
    setSchedulePickerVisible(false);
  };

  const saveUserConfirmedSchedule = async (date: Date) => {
    if (
      !selectedAnalysis ||
      selectedAnalysis.carePlan.status !== 'upcoming' ||
      saving
    )
      return;
    const confirmedAt = Date.now();
    setSaving(true);
    try {
      await confirmCarePlanSchedule(selectedAnalysis.carePlan, {
        basis: 'user',
        dueAt: normalizePlanDate(date).getTime(),
        evidenceRefs: [
          {
            source: 'care-plan',
            localId: selectedAnalysis.carePlan.localId,
            label: 'care-plan',
            occurredAt: confirmedAt,
          },
        ],
      });
      setSchedulePickerVisible(false);
      setSelectedAnalysis(undefined);
      setPendingAttachment(undefined);
      setAttachmentError(undefined);
    } catch {
      Alert.alert(
        'Не удалось сохранить срок',
        'Проверьте выбранную дату и попробуйте ещё раз.',
      );
    } finally {
      setSaving(false);
    }
  };

  const requestUserConfirmedSchedule = () => {
    if (!selectedAnalysis || selectedAnalysis.carePlan.status !== 'upcoming')
      return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: scheduleDate,
        mode: 'date',
        minimumDate: normalizePlanDate(new Date()),
        maximumDate: latestUpcomingPlanDate(),
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type !== 'set' || !date) return;
          const normalized = normalizePlanDate(date);
          setScheduleDate(normalized);
          Alert.alert(
            'Подтвердить срок?',
            `${formatPlanDate(normalized.getTime())}. Дата будет отмечена как указанная вами, а не назначенная врачом.`,
            [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Сохранить',
                onPress: () => void saveUserConfirmedSchedule(normalized),
              },
            ],
          );
        },
      });
      return;
    }
    setSchedulePickerVisible(true);
  };

  const pickAnalysisAttachment = async (kind: 'file' | 'photo') => {
    setAttachmentPicking(true);
    setAttachmentError(undefined);

    try {
      if (e2eDocumentFixtureUri) {
        setPendingAttachment({
          kind,
          name: 'e2e-lab-result.jpg',
          uri: e2eDocumentFixtureUri,
        });
        return;
      }

      if (kind === 'photo') {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setAttachmentError(
            'Разрешите доступ к фото, чтобы выбрать результат.',
          );
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
        });
        if (result.canceled) return;

        const asset = result.assets[0];
        setPendingAttachment({
          kind,
          name: asset.fileName || 'Фото результата',
          uri: asset.uri,
        });
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/pdf', 'image/*'],
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      setPendingAttachment({
        kind,
        name: asset.name || 'Файл результата',
        uri: asset.uri,
      });
    } catch (cause) {
      console.error('Picking analysis attachment failed', cause);
      setAttachmentError(
        'Не удалось прикрепить результат. Попробуйте ещё раз.',
      );
    } finally {
      setAttachmentPicking(false);
    }
  };

  const saveAnalysisAttachment = async () => {
    if (!selectedAnalysis || !pendingAttachment || readOnly) return;

    setSaving(true);
    setAttachmentError(undefined);
    try {
      const persistedDocumentUri = await persistLabDocument(
        pendingAttachment.uri,
      );
      await addLabResult({
        catalogKey: selectedAnalysis.carePlan.catalogKey,
        title: selectedAnalysis.title,
        collectedAt: Date.now(),
        status: 'unreviewed',
        analytes: [
          {
            name: 'Результат',
            value: 'Прикреплён',
          },
        ],
        hasLocalSourceDocument: true,
        localDocumentUri: persistedDocumentUri,
      });
      setSelectedAnalysis(undefined);
      setPendingAttachment(undefined);
    } catch (cause) {
      console.error('Saving planned analysis result failed', cause);
      setAttachmentError('Не удалось сохранить результат.');
    } finally {
      setSaving(false);
    }
  };

  const modalScrollEnabled =
    modalViewportHeight > 0 && modalContentHeight > modalViewportHeight + 1;

  const visiblePlans =
    activeTab === 'upcoming'
      ? plannedAnalyses.filter((item) => item.tab === 'upcoming')
      : plannedAnalyses.filter((item) => item.tab === 'current');
  const currentPlans = plannedAnalyses.filter((item) => item.tab === 'current');
  const upcomingPlans = plannedAnalyses.filter(
    (item) => item.tab === 'upcoming',
  );
  const attentionScore = calculateCompletionScore(
    currentPlans.map((item) => item.carePlan.catalogKey),
    new Set(attachedResultsByPlan.keys()),
  );
  const selectedSavedResult = selectedAnalysis
    ? attachedResultsByPlan.get(selectedAnalysis.carePlan.catalogKey)
    : undefined;
  const selectedPlanEvents = selectedAnalysis
    ? recommendationEvents
        .filter(
          (event) =>
            !event.deletedAt &&
            event.carePlanLocalId === selectedAnalysis.carePlan.localId,
        )
        .sort((left, right) => right.occurredAt - left.occurredAt)
    : [];
  const selectedEvidence = selectedAnalysis
    ? selectedAnalysis.carePlan.evidenceRefs.map((ref) => {
        if (ref.source === 'journal')
          return (
            journalEntries.find(
              (item) => !item.deletedAt && item.localId === ref.localId,
            )?.label ?? 'Запись дневника'
          );
        if (ref.source === 'test')
          return (
            labResults.find(
              (item) => !item.deletedAt && item.localId === ref.localId,
            )?.title ?? 'Подтверждённый результат'
          );
        if (ref.source === 'care-plan') return ref.label;
        return ref.label;
      })
    : [];
  const hasSelectedResult = Boolean(pendingAttachment || selectedSavedResult);

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerTop + 48,
            paddingBottom: Math.max(insets.bottom + 118, 132),
          },
        ]}
      >
        <View style={styles.heroWrap}>
          <AnalysisAttentionHero
            mascot={mascotHandsImage}
            score={attentionScore}
            onPress={() => setActiveTab('current')}
          />
        </View>

        <AnalysisDeadlineSummary
          currentDeadline={formatPlanDate(
            latestCarePlanDueAt(currentPlans.map((item) => item.carePlan)),
          )}
          currentCount={currentPlans.length}
          upcomingDeadline={formatPlanDate(
            latestCarePlanDueAt(upcomingPlans.map((item) => item.carePlan)),
          )}
          upcomingCount={upcomingPlans.length}
          onCurrent={() => setActiveTab('current')}
          onUpcoming={() => setActiveTab('upcoming')}
          style={styles.summaryWrap}
        />

        <View style={styles.tabsWrap}>
          <AnalysisTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            variant={2}
          />
        </View>

        {activeTab !== 'completed' ? (
          <View style={styles.cardsList}>
            {visiblePlans.length ? (
              visiblePlans.map((item) => (
                <AnalysisReferencePlanCard
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  dueLabel={item.dueLabel}
                  dueValue={item.dueValue}
                  validityLabel={item.validityLabel}
                  validityValue={item.validityValue}
                  hasAttachedResult={attachedResultsByPlan.has(
                    item.carePlan.catalogKey,
                  )}
                  image={item.image}
                  statusLabel={item.statusLabel}
                  onView={() => openAnalysis(item)}
                />
              ))
            ) : (
              <View accessibilityLiveRegion="polite" style={styles.emptyState}>
                {recommendationsEnabled &&
                !isOffline &&
                (!connectionKnown ||
                  (isAuthenticated && !agentStatus) ||
                  agentAutomationState.phase === 'checking') ? (
                  <ActivityIndicator
                    color={colors.brand.primary}
                    style={styles.emptySpinner}
                  />
                ) : null}
                <AppText
                  role="body"
                  weight="semibold"
                  style={styles.emptyTitle}
                >
                  {emptyPlanStatus.title}
                </AppText>
                <AppText
                  role="caption"
                  color={colors.text.secondary}
                  style={styles.emptyDescription}
                >
                  {emptyPlanStatus.description}
                </AppText>
                {!readOnly ? (
                  <Pressable
                    cssInterop={false}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: '/profile',
                        params: { panel: 'permissions' },
                      })
                    }
                    style={({ pressed }) => [
                      styles.emptySettingsButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText weight="semibold" color={colors.brand.primary}>
                      Проверить настройки
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        ) : savedResults.length ||
          savedScans.length ||
          completedPlans.length ? (
          <View style={styles.cardsList}>
            {savedResults.map((result) => {
              const firstAnalyte = result.analytes[0];
              const catalog = analysisCatalogByKey.get(result.catalogKey);
              return (
                <AnalysisReferencePlanCard
                  key={result.localId}
                  title={result.title}
                  dueLabel="Дата сдачи"
                  dueValue={new Date(result.collectedAt).toLocaleDateString(
                    'ru-RU',
                  )}
                  validityLabel={firstAnalyte?.name ?? 'Результат'}
                  validityValue={
                    firstAnalyte
                      ? `${firstAnalyte.value}${firstAnalyte.unit ? ` ${firstAnalyte.unit}` : ''}`
                      : 'Сохранён'
                  }
                  image={
                    catalog?.illustrationKey
                      ? planImages[catalog.illustrationKey]
                      : undefined
                  }
                  statusLabel={
                    result.status === 'unreviewed'
                      ? 'Файл сохранён · содержимое не прочитано'
                      : result.status === 'attention'
                        ? 'Требует внимания'
                        : 'Подтверждено'
                  }
                  onView={() =>
                    Alert.alert(
                      result.title,
                      [
                        `Дата сдачи: ${new Date(result.collectedAt).toLocaleDateString('ru-RU')}`,
                        result.analytes.length
                          ? result.analytes
                              .map(
                                (analyte) =>
                                  `${analyte.name}: ${analyte.value}${analyte.unit ? ` ${analyte.unit}` : ''}`,
                              )
                              .join('\n')
                          : 'Структурированные показатели не добавлены.',
                      ].join('\n\n'),
                    )
                  }
                />
              );
            })}
            {savedScans.map((result) => (
              <AnalysisReferencePlanCard
                key={result.localId}
                title={
                  result.testSystemKey === 'ovulation-strip'
                    ? 'Тест на овуляцию'
                    : result.testSystemKey === 'pregnancy-strip'
                      ? 'Тест на беременность'
                      : result.testSystemKey
                }
                dueLabel="Дата теста"
                dueValue={new Date(result.capturedAt).toLocaleDateString(
                  'ru-RU',
                )}
                validityLabel="Результат"
                validityValue={
                  result.confirmedValue === 'positive'
                    ? 'Положительный'
                    : result.confirmedValue === 'negative'
                      ? 'Отрицательный'
                      : 'Недействительный'
                }
                statusLabel={
                  result.confirmedByUser
                    ? 'Подтверждено пользователем'
                    : 'Ожидает подтверждения'
                }
                onView={() =>
                  Alert.alert(
                    result.testSystemKey === 'ovulation-strip'
                      ? 'Тест на овуляцию'
                      : result.testSystemKey === 'pregnancy-strip'
                        ? 'Тест на беременность'
                        : result.testSystemKey,
                    `${new Date(result.capturedAt).toLocaleDateString('ru-RU')} · ${
                      result.confirmedValue === 'positive'
                        ? 'положительный результат'
                        : result.confirmedValue === 'negative'
                          ? 'отрицательный результат'
                          : 'недействительный результат'
                    }`,
                  )
                }
              />
            ))}
            {completedPlans.map((item) => {
              const catalog = analysisCatalogByKey.get(item.catalogKey);
              return (
                <AnalysisReferencePlanCard
                  key={item.localId}
                  title={item.title}
                  description={catalog?.specimen ?? item.description}
                  dueLabel="Дата выполнения"
                  dueValue={new Date(
                    item.performedAt ?? item.updatedAt,
                  ).toLocaleDateString('ru-RU')}
                  validityLabel="Основание"
                  validityValue={
                    item.scheduleBasis === 'clinician'
                      ? 'Назначение врача'
                      : item.scheduleBasis === 'user'
                        ? 'Указано вами'
                        : item.scheduleBasis === 'confirmed_data'
                          ? 'Подтверждённые данные'
                          : 'Предварительный план'
                  }
                  image={
                    item.illustrationKey
                      ? planImages[item.illustrationKey]
                      : undefined
                  }
                  statusLabel="Отмечено выполненным"
                  onView={() =>
                    Alert.alert(
                      item.title,
                      [
                        catalog?.specimen ?? item.description,
                        `Выполнено: ${new Date(
                          item.performedAt ?? item.updatedAt,
                        ).toLocaleDateString('ru-RU')}`,
                      ].join('\n\n'),
                    )
                  }
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <AppText role="body" weight="regular" style={styles.emptyTitle}>
              Здесь появятся результаты
            </AppText>
          </View>
        )}
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={[
          colors.surface.canvas,
          colors.surface.canvas,
          'rgba(245,243,243,0)',
        ]}
        locations={[0, 0.72, 1]}
        style={[styles.headerFade, { height: headerTop + 48 }]}
      />

      <View style={[styles.fixedHeader, { top: headerTop }]}>
        <AnalysisReferenceHeader
          onChart={() => setChartsVisible(true)}
          onDate={() => setActiveTab('current')}
          onCalendar={() => setActiveTab('upcoming')}
        />
      </View>

      <Modal
        animationType="slide"
        onRequestClose={closeAnalysis}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={Boolean(selectedAnalysis)}
      >
        <View style={styles.analysisModalRoot}>
          <Pressable
            accessibilityLabel="Закрыть карточку анализа"
            disabled={saving || attachmentPicking}
            onPress={closeAnalysis}
            style={styles.analysisModalScrim}
          />

          <ScrollView
            alwaysBounceVertical={false}
            bounces={modalScrollEnabled}
            contentContainerStyle={styles.analysisModalPageContent}
            onContentSizeChange={(_width, height) =>
              setModalContentHeight(height)
            }
            onLayout={({ nativeEvent }) =>
              setModalViewportHeight(nativeEvent.layout.height)
            }
            scrollEnabled={modalScrollEnabled}
            showsVerticalScrollIndicator={false}
            style={styles.analysisModalPageScroll}
          >
            <Pressable
              accessibilityLabel="Закрыть карточку анализа"
              disabled={saving || attachmentPicking}
              onPress={closeAnalysis}
              style={styles.analysisModalDismissArea}
            />

            {selectedAnalysis ? (
              <View
                style={[
                  styles.analysisModalSheet,
                  { paddingBottom: Math.max(insets.bottom + 102, 118) },
                ]}
              >
                <View style={styles.analysisModalHandle} />

                <View style={styles.analysisModalHero}>
                  {selectedAnalysis.image ? (
                    <View style={styles.analysisModalImageWrap}>
                      <Image
                        accessible
                        accessibilityLabel={`Изображение: ${selectedAnalysis.title}`}
                        resizeMode="contain"
                        source={selectedAnalysis.image}
                        style={styles.analysisModalImage}
                      />
                      <LinearGradient
                        pointerEvents="none"
                        colors={['rgba(255,255,255,0)', '#FFFFFF']}
                        locations={[0.42, 1]}
                        style={styles.analysisModalImageFade}
                      />
                    </View>
                  ) : (
                    <View style={styles.analysisModalNoImage}>
                      <AppText
                        weight="semibold"
                        color={colors.brand.primary}
                        style={styles.analysisModalNoImageText}
                      >
                        {selectedAnalysis.title.slice(0, 1)}
                      </AppText>
                    </View>
                  )}

                  <View style={styles.analysisModalHeroCopy}>
                    <AppText
                      role="caption"
                      weight="semibold"
                      color={colors.brand.primary}
                      style={styles.analysisModalCategory}
                    >
                      {selectedAnalysis.category}
                    </AppText>
                    <AppText
                      role="title"
                      weight="semibold"
                      style={styles.analysisModalTitle}
                    >
                      {selectedAnalysis.title}
                    </AppText>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                      style={styles.analysisModalDescription}
                    >
                      {selectedAnalysis.description}
                    </AppText>
                    <AppText
                      role="caption"
                      weight="semibold"
                      color={colors.brand.burgundy}
                      style={styles.analysisModalStatus}
                    >
                      {selectedAnalysis.statusLabel}
                    </AppText>
                  </View>
                </View>

                <View style={styles.analysisModalDates}>
                  <View style={styles.analysisModalDateCell}>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                      style={styles.analysisModalMetaLabel}
                    >
                      {selectedAnalysis.dueLabel}
                    </AppText>
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalMetaValue}
                    >
                      {selectedAnalysis.dueValue}
                    </AppText>
                  </View>
                  <View style={styles.analysisModalDateDivider} />
                  <View style={styles.analysisModalDateCell}>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                      style={styles.analysisModalMetaLabel}
                    >
                      {selectedAnalysis.validityLabel}
                    </AppText>
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalMetaValue}
                    >
                      {selectedAnalysis.validityValue}
                    </AppText>
                  </View>
                </View>

                <View style={styles.analysisModalSections}>
                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Что именно нужно сдать
                    </AppText>
                    <View style={styles.analysisModalInfoCard}>
                      {selectedAnalysis.requirements.map((requirement) => (
                        <View
                          key={requirement}
                          style={styles.analysisModalRequirement}
                        >
                          <View style={styles.analysisModalBullet} />
                          <AppText
                            role="label"
                            style={styles.analysisModalRequirementText}
                          >
                            {requirement}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Почему это изменилось
                    </AppText>
                    <View style={styles.analysisModalInfoCard}>
                      <AppText
                        role="label"
                        color={colors.text.secondary}
                        style={styles.analysisModalBodyText}
                      >
                        {recommendationReasonLabel(
                          selectedPlanEvents[0]?.reasonCode ??
                            selectedAnalysis.carePlan.safetyHoldReason,
                        )}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Основания
                    </AppText>
                    <View style={styles.analysisModalInfoCard}>
                      {selectedEvidence.length ? (
                        selectedEvidence.slice(0, 6).map((label, index) => (
                          <View
                            key={`${label}-${index}`}
                            style={styles.analysisModalRequirement}
                          >
                            <View style={styles.analysisModalBullet} />
                            <AppText
                              role="label"
                              style={styles.analysisModalRequirementText}
                            >
                              {label}
                            </AppText>
                          </View>
                        ))
                      ) : (
                        <AppText role="label" color={colors.text.secondary}>
                          Общая цель профиля; рекомендация остаётся
                          предварительной.
                        </AppText>
                      )}
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Зачем это нужно?
                    </AppText>
                    <View style={styles.analysisModalInfoCard}>
                      <AppText
                        role="label"
                        color={colors.text.secondary}
                        style={styles.analysisModalBodyText}
                      >
                        {selectedAnalysis.purpose}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Как использовать рекомендацию
                    </AppText>
                    <View style={styles.analysisModalClinicCard}>
                      <View style={styles.analysisModalClinicIcon}>
                        <AppText
                          role="label"
                          weight="semibold"
                          color={colors.brand.primary}
                        >
                          +
                        </AppText>
                      </View>
                      <View style={styles.analysisModalClinicCopy}>
                        <AppText role="label" weight="semibold">
                          {selectedAnalysis.clinic}
                        </AppText>
                        <AppText role="caption" color={colors.text.secondary}>
                          Сферка не записывает на процедуры и не заменяет врача
                        </AppText>
                      </View>
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Управление планом
                    </AppText>
                    <View style={styles.analysisModalPlanActions}>
                      <Pressable
                        cssInterop={false}
                        accessibilityRole="button"
                        disabled={readOnly || saving}
                        onPress={() => {
                          void applyCarePlanAction(
                            selectedAnalysis.carePlan,
                            'complete',
                          ).then(closeAnalysis);
                        }}
                        style={({ pressed }) => [
                          styles.analysisModalPlanButton,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText weight="semibold" color={colors.brand.primary}>
                          Отметить выполненным
                        </AppText>
                      </Pressable>
                      {selectedAnalysis.carePlan.status === 'upcoming' ? (
                        <Pressable
                          cssInterop={false}
                          accessibilityRole="button"
                          accessibilityLabel="Уточнить срок рекомендации"
                          disabled={readOnly || saving}
                          onPress={requestUserConfirmedSchedule}
                          style={({ pressed }) => [
                            styles.analysisModalPlanButton,
                            styles.analysisModalPlanButtonSecondary,
                            pressed && styles.pressed,
                          ]}
                        >
                          <AppText
                            weight="medium"
                            color={colors.text.secondary}
                          >
                            Уточнить срок
                          </AppText>
                        </Pressable>
                      ) : null}
                      {Platform.OS === 'ios' &&
                      schedulePickerVisible &&
                      selectedAnalysis.carePlan.status === 'upcoming' ? (
                        <View style={styles.analysisModalSchedulePicker}>
                          <AppText
                            role="caption"
                            color={colors.text.secondary}
                            style={styles.analysisModalScheduleHint}
                          >
                            Срок будет отмечен как указанный вами, а не как
                            назначение врача.
                          </AppText>
                          <DateTimePicker
                            value={scheduleDate}
                            mode="date"
                            display="compact"
                            locale="ru-RU"
                            minimumDate={normalizePlanDate(new Date())}
                            maximumDate={latestUpcomingPlanDate()}
                            accentColor={colors.brand.primary}
                            onChange={(_event, date) => {
                              if (date)
                                setScheduleDate(normalizePlanDate(date));
                            }}
                          />
                          <View style={styles.analysisModalScheduleActions}>
                            <Pressable
                              cssInterop={false}
                              accessibilityRole="button"
                              disabled={saving}
                              onPress={() => setSchedulePickerVisible(false)}
                              style={({ pressed }) => [
                                styles.analysisModalScheduleAction,
                                pressed && styles.pressed,
                              ]}
                            >
                              <AppText color={colors.text.secondary}>
                                Отмена
                              </AppText>
                            </Pressable>
                            <Pressable
                              cssInterop={false}
                              accessibilityRole="button"
                              disabled={saving}
                              onPress={() =>
                                void saveUserConfirmedSchedule(scheduleDate)
                              }
                              style={({ pressed }) => [
                                styles.analysisModalScheduleAction,
                                styles.analysisModalScheduleActionPrimary,
                                pressed && styles.pressed,
                              ]}
                            >
                              <AppText
                                weight="semibold"
                                color={colors.text.inverse}
                              >
                                Сохранить
                              </AppText>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                      <Pressable
                        cssInterop={false}
                        accessibilityRole="button"
                        disabled={readOnly || saving}
                        onPress={() => {
                          Alert.alert(
                            'Отказаться от рекомендации?',
                            'Сферка не предложит этот пункт снова в течение 90 дней.',
                            [
                              { text: 'Отмена', style: 'cancel' },
                              {
                                text: 'Отказаться',
                                style: 'destructive',
                                onPress: () => {
                                  void applyCarePlanAction(
                                    selectedAnalysis.carePlan,
                                    'decline',
                                  ).then(closeAnalysis);
                                },
                              },
                            ],
                          );
                        }}
                        style={({ pressed }) => [
                          styles.analysisModalPlanButton,
                          styles.analysisModalPlanButtonSecondary,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText weight="medium" color={colors.text.secondary}>
                          Отказаться
                        </AppText>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <View style={styles.analysisModalAttachmentHeading}>
                      <AppText role="label" weight="semibold">
                        Прикрепить результат
                      </AppText>
                      {hasSelectedResult ? (
                        <View style={styles.analysisModalReadyPill}>
                          <View style={styles.analysisModalReadyDot} />
                          <AppText
                            role="caption"
                            weight="semibold"
                            color={colors.brand.primary}
                          >
                            Прикреплён
                          </AppText>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.analysisModalAttachmentCard}>
                      {pendingAttachment || selectedSavedResult ? (
                        <View style={styles.analysisModalAttachmentStatus}>
                          <View style={styles.analysisModalFileIcon}>
                            <AppText
                              role="label"
                              weight="semibold"
                              color={colors.brand.primary}
                            >
                              ✓
                            </AppText>
                          </View>
                          <View style={styles.analysisModalAttachmentCopy}>
                            <AppText
                              role="label"
                              weight="semibold"
                              numberOfLines={1}
                            >
                              {pendingAttachment?.name ||
                                'Результат обследования'}
                            </AppText>
                            <AppText
                              role="caption"
                              color={colors.text.secondary}
                            >
                              {pendingAttachment
                                ? 'Будет сохранён после подтверждения'
                                : 'Сохранён на устройстве'}
                            </AppText>
                          </View>
                        </View>
                      ) : (
                        <AppText
                          role="caption"
                          color={colors.text.secondary}
                          style={styles.analysisModalAttachmentHint}
                        >
                          Добавьте заключение или результаты лаборатории
                        </AppText>
                      )}

                      <View style={styles.analysisModalAttachmentActions}>
                        {(['file', 'photo'] as const).map((kind) => (
                          <Pressable
                            cssInterop={false}
                            key={kind}
                            accessibilityRole="button"
                            accessibilityLabel={
                              kind === 'file'
                                ? 'Прикрепить файл результата'
                                : 'Прикрепить фото результата'
                            }
                            disabled={attachmentPicking || saving}
                            onPress={() => void pickAnalysisAttachment(kind)}
                            style={({ pressed }) => [
                              styles.analysisModalAttachmentButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            {attachmentPicking ? (
                              <ActivityIndicator
                                color={colors.brand.primary}
                                size="small"
                              />
                            ) : (
                              <>
                                <AppText
                                  role="label"
                                  weight="semibold"
                                  color={colors.brand.primary}
                                >
                                  {kind === 'file' ? 'Файл' : 'Фото'}
                                </AppText>
                                <AppText
                                  role="caption"
                                  color={colors.text.secondary}
                                >
                                  {kind === 'file'
                                    ? 'PDF или изображение'
                                    : 'Из галереи'}
                                </AppText>
                              </>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {attachmentError ? (
                      <AppText
                        role="caption"
                        color={colors.state.error}
                        style={styles.analysisModalError}
                      >
                        {attachmentError}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.analysisModalActionsFixed,
              { paddingBottom: Math.max(insets.bottom + 18, 34) },
            ]}
          >
            <View style={styles.analysisModalActions}>
              <View style={styles.analysisModalActionSlot}>
                <View style={styles.analysisModalCancel}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Закрыть"
                    disabled={saving || attachmentPicking}
                    onPress={closeAnalysis}
                    style={StyleSheet.absoluteFillObject}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.analysisModalActionContent,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText role="label" weight="medium">
                          Закрыть
                        </AppText>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={styles.analysisModalActionSlot}>
                <View
                  style={[
                    styles.analysisModalSave,
                    !hasSelectedResult && styles.analysisModalSaveDisabled,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    testID="e2e-analysis-save"
                    accessibilityLabel={
                      pendingAttachment ? 'Сохранить результат' : 'Готово'
                    }
                    accessibilityState={{
                      disabled:
                        saving ||
                        attachmentPicking ||
                        readOnly ||
                        !hasSelectedResult,
                    }}
                    disabled={
                      saving ||
                      attachmentPicking ||
                      readOnly ||
                      !hasSelectedResult
                    }
                    onPress={() =>
                      pendingAttachment
                        ? void saveAnalysisAttachment()
                        : closeAnalysis()
                    }
                    style={StyleSheet.absoluteFillObject}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.analysisModalActionContent,
                          pressed && styles.pressed,
                        ]}
                      >
                        {saving ? (
                          <ActivityIndicator color={colors.text.inverse} />
                        ) : (
                          <AppText
                            role="label"
                            weight="medium"
                            color={colors.text.inverse}
                          >
                            {pendingAttachment ? 'Сохранить' : 'Готово'}
                          </AppText>
                        )}
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <HealthInsightsPage
        visible={chartsVisible}
        initialPeriod="90"
        onClose={() => setChartsVisible(false)}
        onExportPress={() => {
          setChartsVisible(false);
          router.push({
            pathname: '/profile',
            params: { panel: 'exports' },
          });
        }}
        profile={profile}
        journalEntries={journalEntries}
        labResults={labResults}
        scanResults={scanResults}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  headerFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 8,
  },
  fixedHeader: {
    position: 'absolute',
    right: sizes.screenGutter,
    left: sizes.screenGutter,
    zIndex: 10,
  },
  addButtonDisabled: {
    backgroundColor: colors.state.disabled,
  },
  heroWrap: {
    marginTop: spacing.md,
    zIndex: 2,
  },
  summaryWrap: {
    alignSelf: 'stretch',
    marginTop: 16,
  },
  tabsWrap: {
    marginTop: 16,
  },
  cardsList: {
    marginTop: 20,
    gap: spacing.md,
  },
  emptyState: {
    marginTop: 32,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { textAlign: 'center', fontSize: 17, lineHeight: 22 },
  emptyDescription: {
    marginTop: spacing.xs,
    maxWidth: 310,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
  },
  emptySpinner: { marginBottom: spacing.sm },
  emptySettingsButton: {
    marginTop: spacing.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#FBE7F0',
    paddingHorizontal: spacing.lg,
  },
  analysisModalRoot: {
    flex: 1,
  },
  analysisModalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(43,31,36,0.24)',
  },
  analysisModalPageScroll: {
    flex: 1,
  },
  analysisModalPageContent: {
    flexGrow: 1,
  },
  analysisModalDismissArea: {
    flex: 1,
    minHeight: 88,
  },
  analysisModalSheet: {
    width: '100%',
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface.raised,
    ...shadows.floating,
  },
  analysisModalHandle: {
    width: 38,
    height: 5,
    marginBottom: 16,
    borderRadius: 3,
    backgroundColor: '#DED9DB',
    alignSelf: 'center',
  },
  analysisModalHero: {
    minHeight: 126,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(33,31,32,0.10)',
    paddingBottom: 14,
  },
  analysisModalImageWrap: {
    width: 104,
    height: 116,
    overflow: 'hidden',
    flexShrink: 0,
  },
  analysisModalNoImage: {
    width: 92,
    height: 92,
    flexShrink: 0,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.18)',
  },
  analysisModalNoImageText: {
    fontSize: 34,
    lineHeight: 38,
  },
  analysisModalImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.12 }],
  },
  analysisModalImageFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 38,
  },
  analysisModalHeroCopy: {
    minWidth: 0,
    flex: 1,
  },
  analysisModalCategory: {
    marginBottom: 5,
    fontSize: 12,
    lineHeight: 15,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  analysisModalTitle: {
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.55,
  },
  analysisModalDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 18,
  },
  analysisModalStatus: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 15,
  },
  analysisModalDates: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(33,31,32,0.10)',
  },
  analysisModalDateCell: {
    minWidth: 0,
    flex: 1,
    gap: 2,
    paddingHorizontal: 8,
  },
  analysisModalDateDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: 'rgba(33,31,32,0.12)',
  },
  analysisModalMetaLabel: {
    fontSize: 13.5,
    lineHeight: 16,
  },
  analysisModalMetaValue: {
    fontSize: 17,
    lineHeight: 20,
  },
  analysisModalSections: {
    paddingTop: 20,
    gap: 20,
  },
  analysisModalSection: {
    gap: 9,
  },
  analysisModalInfoCard: {
    gap: 9,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.08)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalRequirement: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  analysisModalBullet: {
    width: 7,
    height: 7,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  analysisModalRequirementText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
  },
  analysisModalBodyText: {
    fontSize: 15,
    lineHeight: 20,
  },
  analysisModalClinicCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.18)',
    backgroundColor: '#FFF7FA',
  },
  analysisModalPlanActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  analysisModalPlanButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.22)',
    backgroundColor: '#FFF0F6',
    paddingHorizontal: 10,
  },
  analysisModalPlanButtonSecondary: {
    borderColor: 'rgba(33,31,32,0.10)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalSchedulePicker: {
    width: '100%',
    flexBasis: '100%',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalScheduleHint: {
    fontSize: 13,
    lineHeight: 17,
  },
  analysisModalScheduleActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  analysisModalScheduleAction: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 13,
  },
  analysisModalScheduleActionPrimary: {
    backgroundColor: colors.brand.primary,
  },
  analysisModalClinicIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F5E8ED',
  },
  analysisModalClinicCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  analysisModalAttachmentHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  analysisModalReadyPill: {
    height: 25,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 13,
    backgroundColor: '#FFF0F6',
  },
  analysisModalReadyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  analysisModalAttachmentCard: {
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.09)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalAttachmentStatus: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  analysisModalFileIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#FFF0F6',
  },
  analysisModalAttachmentCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  analysisModalAttachmentHint: {
    paddingHorizontal: 2,
    fontSize: 14,
    lineHeight: 18,
  },
  analysisModalAttachmentActions: {
    flexDirection: 'row',
    gap: 10,
  },
  analysisModalAttachmentButton: {
    minWidth: 0,
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.20)',
    backgroundColor: colors.surface.raised,
  },
  analysisModalError: {
    marginTop: -2,
    paddingHorizontal: 2,
  },
  analysisModalActionsFixed: {
    position: 'absolute',
    zIndex: 6,
    right: 0,
    bottom: 0,
    left: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.surface.raised,
    shadowColor: '#2B131B',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 12,
  },
  analysisModalActions: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    gap: 12,
  },
  analysisModalActionSlot: {
    flex: 1,
    height: 48,
  },
  analysisModalActionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisModalCancel: {
    position: 'relative',
    height: 48,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#F5F1F2',
  },
  analysisModalSave: {
    position: 'relative',
    height: 48,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: colors.brand.primary,
  },
  analysisModalSaveDisabled: {
    opacity: 0.38,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
});
