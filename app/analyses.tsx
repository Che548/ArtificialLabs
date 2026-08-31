import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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
  HealthInsightsPage,
  getHeaderTop,
  sizes,
  spacing,
} from '../design-system';
import { api } from '../convex/_generated/api';
import { useAgentAutomationState } from '../lib/agent-automation-manager';
import { analysisCatalogByKey } from '../lib/analysis-catalog';
import { useConnectivity } from '../lib/connectivity';
import { useHealthStore } from '../lib/health-store';
import type {
  CarePlanItem,
  HealthDocument,
  LabResult,
} from '../lib/health-types';
import { persistLabDocument } from '../lib/local-files';
import { latestCarePlanDueAt } from '../lib/product-insights';

const bloodTubesImage = require('../assets/analyses/blood-tubes.png');
const ultrasoundImage = require('../assets/analyses/ultrasound.png');
const hysteroscopeImage = require('../assets/analyses/hysteroscope.png');
const mascotHandsImage = require('../assets/analyses/mascot-hands-reference.png');
const lipidProfileReferenceImage = require('../assets/analyses/reference/lipid-profile.png');
const ferritinReferenceImage = require('../assets/analyses/reference/ferritin.png');

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

const resultInterpretationMaxLength = 2000;

type PlannedAnalysis = {
  carePlan: CarePlanItem;
  category: string;
  description: string;
  dueLabel: string;
  dueValue: string;
  id: string;
  image?: ImageSourcePropType;
  purpose: string;
  requirements: string[];
  statusLabel: string;
  tab: AnalysisTabKey;
  title: string;
  validityLabel: string;
  validityValue: string;
};

type PendingAnalysisAttachment = {
  kind: 'file' | 'photo';
  mimeType?: string;
  name: string;
  uri: string;
};

type SavedAnalysisAttachment = {
  document: HealthDocument;
  result: LabResult;
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

function AnalysisUploadIcon() {
  return (
    <Svg width={50} height={50} viewBox="0 0 50 50">
      <Path
        d="M25 31V9m0 0-8 8m8-8 8 8"
        fill="none"
        stroke={colors.brand.primary}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 25v7.5A8.5 8.5 0 0 0 20.5 41h9a8.5 8.5 0 0 0 8.5-8.5V25"
        fill="none"
        stroke={colors.brand.primary}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AnalysisResultIcon() {
  return (
    <Svg width={50} height={50} viewBox="0 0 50 50">
      <Path
        d="M15 7h13l8 8v28H15V7Z"
        fill="none"
        stroke={colors.brand.primary}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M28 7v8h8M20 29l4 4 7-8"
        fill="none"
        stroke={colors.brand.primary}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function formatPlanDate(timestamp?: number) {
  if (!timestamp) return 'Дата уточняется';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(timestamp));
}

function attachmentCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun =
    mod10 === 1 && mod100 !== 11
      ? 'файл'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'файла'
        : 'файлов';
  return `${count} ${noun}`;
}

function normalizePlanDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18);
}

function latestUpcomingPlanDate(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 5, 0, 18);
}

function viewModelForPlan(item: CarePlanItem): PlannedAnalysis {
  const catalog = analysisCatalogByKey.get(item.catalogKey);
  const completed = item.status === 'completed';
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
    description: catalog?.specimen ?? item.description,
    dueLabel: completed
      ? 'Дата выполнения'
      : item.status === 'current'
        ? 'Рекомендуемый срок'
        : 'Сдать до',
    dueValue: formatPlanDate(
      completed ? (item.performedAt ?? item.updatedAt) : item.dueAt,
    ),
    id: item.localId,
    image: item.illustrationKey ? planImages[item.illustrationKey] : undefined,
    purpose: item.rationale || catalog?.purpose || item.description,
    requirements: [catalog?.specimen ?? item.description].filter(Boolean),
    statusLabel,
    tab: completed
      ? 'completed'
      : item.status === 'current'
        ? 'current'
        : 'upcoming',
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
    USER_RECORDED_COMPLETION: 'Вы отметили анализ выполненным.',
    USER_RESTORED_TO_PLAN: 'Вы вернули анализ в активный план.',
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
    saveLabResult,
    deleteLabAttachment,
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
  const [completionInterpretationVisible, setCompletionInterpretationVisible] =
    useState(false);
  const [completionInterpretation, setCompletionInterpretation] = useState('');
  const [completionInterpretationError, setCompletionInterpretationError] =
    useState<string>();
  const [photoInterpretationVisible, setPhotoInterpretationVisible] =
    useState(false);
  const [photoInterpretation, setPhotoInterpretation] = useState('');
  const [photoInterpretationError, setPhotoInterpretationError] =
    useState<string>();
  const [editingInterpretationKey, setEditingInterpretationKey] =
    useState<string>();
  const [interpretationDraft, setInterpretationDraft] = useState('');
  const [interpretationError, setInterpretationError] = useState<string>();
  const [pendingAttachmentInterpretation, setPendingAttachmentInterpretation] =
    useState('');
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
      if (archivedPlan.status === 'completed') {
        openAnalysis(viewModelForPlan(archivedPlan));
        return;
      }
      Alert.alert(
        archivedPlan.title,
        archivedPlan.status === 'declined'
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
  const completedPlanByResultId = useMemo(() => {
    const result = new Map<string, CarePlanItem>();
    const completed = carePlanItems.filter(
      (item) => !item.deletedAt && item.status === 'completed',
    );
    for (const savedResult of savedResults) {
      const document = documents.find(
        (candidate) =>
          !candidate.deletedAt &&
          (candidate.localId === savedResult.sourceDocumentLocalId ||
            candidate.linkedLabResultLocalId === savedResult.localId),
      );
      const plan = document?.linkedCarePlanLocalId
        ? completed.find(
            (candidate) => candidate.localId === document.linkedCarePlanLocalId,
          )
        : completed.find(
            (candidate) =>
              candidate.evidenceRefs.some(
                (ref) =>
                  ref.source === 'test' && ref.localId === savedResult.localId,
              ) ||
              (candidate.catalogKey === savedResult.catalogKey &&
                candidate.performedAt === savedResult.collectedAt),
          );
      if (plan) result.set(savedResult.localId, plan);
    }
    return result;
  }, [carePlanItems, documents, savedResults]);
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
    if (photoInterpretationVisible) {
      setPhotoInterpretationVisible(false);
      setPhotoInterpretation('');
      setPhotoInterpretationError(undefined);
      setPendingAttachment(undefined);
      setPendingAttachmentInterpretation('');
      return;
    }
    if (completionInterpretationVisible) {
      setCompletionInterpretationVisible(false);
      setCompletionInterpretationError(undefined);
      return;
    }
    setSelectedAnalysis(undefined);
    setPendingAttachment(undefined);
    setAttachmentError(undefined);
    setSchedulePickerVisible(false);
    setCompletionInterpretation('');
    setCompletionInterpretationError(undefined);
    setPhotoInterpretationVisible(false);
    setPhotoInterpretation('');
    setPhotoInterpretationError(undefined);
    setEditingInterpretationKey(undefined);
    setInterpretationDraft('');
    setInterpretationError(undefined);
    setPendingAttachmentInterpretation('');
  };

  const openAnalysis = (analysis: PlannedAnalysis) => {
    setSelectedAnalysis(analysis);
    setPendingAttachment(undefined);
    setAttachmentError(undefined);
    setCompletionInterpretationVisible(false);
    setCompletionInterpretation('');
    setCompletionInterpretationError(undefined);
    setPhotoInterpretationVisible(false);
    setPhotoInterpretation('');
    setPhotoInterpretationError(undefined);
    setEditingInterpretationKey(undefined);
    setInterpretationDraft('');
    setInterpretationError(undefined);
    setPendingAttachmentInterpretation('');
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
          mimeType: 'image/jpeg',
          name: 'e2e-lab-result.jpg',
          uri: e2eDocumentFixtureUri,
        });
        setPendingAttachmentInterpretation('');
        if (kind === 'photo') {
          setPhotoInterpretation('');
          setPhotoInterpretationError(undefined);
          setPhotoInterpretationVisible(true);
        }
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
          mimeType: asset.mimeType,
          name: asset.fileName || 'Фото результата',
          uri: asset.uri,
        });
        setPendingAttachmentInterpretation('');
        setPhotoInterpretation('');
        setPhotoInterpretationError(undefined);
        setPhotoInterpretationVisible(true);
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
        mimeType: asset.mimeType,
        name: asset.name || 'Файл результата',
        uri: asset.uri,
      });
      setPendingAttachmentInterpretation('');
    } catch (cause) {
      console.error('Picking analysis attachment failed', cause);
      setAttachmentError(
        'Не удалось прикрепить результат. Попробуйте ещё раз.',
      );
    } finally {
      setAttachmentPicking(false);
    }
  };

  const saveAnalysisAttachment = async ({
    interpretation,
    keepOpen = false,
  }: {
    interpretation?: string;
    keepOpen?: boolean;
  } = {}) => {
    if (!selectedAnalysis || !pendingAttachment || readOnly) return false;

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
        interpretation: interpretation?.trim() || undefined,
        analytes: [
          {
            name: 'Результат',
            value: 'Прикреплён',
          },
        ],
        hasLocalSourceDocument: true,
        localDocumentUri: persistedDocumentUri,
        localDocumentMimeType: pendingAttachment.mimeType,
        localDocumentName: pendingAttachment.name,
      });
      setPendingAttachment(undefined);
      setPendingAttachmentInterpretation('');
      if (!keepOpen) setSelectedAnalysis(undefined);
      return true;
    } catch (cause) {
      console.error('Saving planned analysis result failed', cause);
      setAttachmentError('Не удалось сохранить результат.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const savePhotoInterpretation = async () => {
    const interpretation = photoInterpretation.trim();
    if (!interpretation) {
      setPhotoInterpretationError('Добавьте интерпретацию фотографии.');
      return;
    }
    const saved = await saveAnalysisAttachment({
      interpretation,
      keepOpen: true,
    });
    if (!saved) {
      setPhotoInterpretationError(
        'Не удалось сохранить фото и интерпретацию. Попробуйте ещё раз.',
      );
      return;
    }
    setPhotoInterpretationVisible(false);
    setPhotoInterpretation('');
    setPhotoInterpretationError(undefined);
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
  const firstReferencePlan = visiblePlans[0] ?? plannedAnalyses[0];
  const secondReferencePlan =
    visiblePlans[1] ?? plannedAnalyses[1] ?? firstReferencePlan;
  const selectedAnalysisCompleted =
    selectedAnalysis?.carePlan.status === 'completed';
  const selectedSavedResults = selectedAnalysis
    ? savedResults
        .filter((result) => {
          const resultDocuments = documents.filter(
            (candidate) =>
              !candidate.deletedAt &&
              (candidate.localId === result.sourceDocumentLocalId ||
                candidate.linkedLabResultLocalId === result.localId),
          );
          if (
            resultDocuments.some(
              (document) =>
                document.linkedCarePlanLocalId ===
                selectedAnalysis.carePlan.localId,
            )
          )
            return true;
          if (selectedAnalysisCompleted)
            return (
              selectedAnalysis.carePlan.evidenceRefs.some(
                (ref) =>
                  ref.source === 'test' && ref.localId === result.localId,
              ) ||
              (result.catalogKey === selectedAnalysis.carePlan.catalogKey &&
                result.collectedAt === selectedAnalysis.carePlan.performedAt)
            );
          return (
            !resultDocuments.some(
              (document) => document.linkedCarePlanLocalId,
            ) && result.catalogKey === selectedAnalysis.carePlan.catalogKey
          );
        })
        .sort((left, right) => right.collectedAt - left.collectedAt)
    : [];
  const selectedSavedAttachments: SavedAnalysisAttachment[] =
    selectedSavedResults.flatMap((result) =>
      documents
        .filter(
          (candidate) =>
            !candidate.deletedAt &&
            (candidate.localId === result.sourceDocumentLocalId ||
              candidate.linkedLabResultLocalId === result.localId) &&
            candidate.hasLocalFile &&
            Boolean(candidate.localFileUri),
        )
        .map((document) => ({ document, result })),
    );
  const selectedPlanEvents = selectedAnalysis
    ? recommendationEvents
        .filter(
          (event) =>
            !event.deletedAt &&
            event.carePlanLocalId === selectedAnalysis.carePlan.localId,
        )
        .sort((left, right) => right.occurredAt - left.occurredAt)
    : [];
  const selectedCompletionInterpretation = selectedPlanEvents.find(
    (event) => event.type === 'completed' && event.resultInterpretation,
  )?.resultInterpretation;
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
  const hasSelectedResult = Boolean(
    pendingAttachment || selectedSavedAttachments.length,
  );
  const visibleAttachmentCount =
    selectedSavedAttachments.length + (pendingAttachment ? 1 : 0);

  const openSelectedResult = async (document: HealthDocument) => {
    const uri = document?.localFileUri;
    if (!uri) {
      Alert.alert(
        'Файл недоступен',
        'Сохранённый файл не найден на устройстве.',
      );
      return;
    }
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          'Просмотр недоступен',
          'На этом устройстве нельзя открыть сохранённый файл.',
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Открыть результат',
        mimeType:
          document.mimeType ??
          (/\.pdf(?:$|\?)/i.test(document.title)
            ? 'application/pdf'
            : 'image/jpeg'),
      });
    } catch (cause) {
      console.error('Opening saved analysis result failed', cause);
      Alert.alert('Не удалось открыть результат', 'Попробуйте ещё раз.');
    }
  };

  const beginInterpretationEditing = (key: string, interpretation?: string) => {
    if (readOnly || saving) return;
    setInterpretationDraft(interpretation ?? '');
    setInterpretationError(undefined);
    setEditingInterpretationKey(key);
  };

  const saveAttachmentInterpretation = async (result?: LabResult) => {
    if (readOnly || saving) return;
    if (!result) {
      setPendingAttachmentInterpretation(interpretationDraft.trim());
      setEditingInterpretationKey(undefined);
      setInterpretationError(undefined);
      return;
    }
    setSaving(true);
    setInterpretationError(undefined);
    try {
      await saveLabResult({
        ...result,
        interpretation: interpretationDraft.trim() || undefined,
      });
      setEditingInterpretationKey(undefined);
    } catch (cause) {
      console.error('Updating saved result interpretation failed', cause);
      setInterpretationError(
        'Не удалось сохранить интерпретацию. Попробуйте ещё раз.',
      );
    } finally {
      setSaving(false);
    }
  };

  const removePendingAttachment = () => {
    setPendingAttachment(undefined);
    setPendingAttachmentInterpretation('');
    if (editingInterpretationKey === 'pending') {
      setEditingInterpretationKey(undefined);
      setInterpretationDraft('');
      setInterpretationError(undefined);
    }
  };

  const requestDeleteSavedAttachment = (
    attachment: SavedAnalysisAttachment,
  ) => {
    if (readOnly || saving) return;
    Alert.alert(
      'Удалить файл?',
      `Файл «${attachment.document.title}» и его интерпретация будут удалены.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            setSaving(true);
            void deleteLabAttachment(attachment.result, attachment.document)
              .then(() => {
                if (editingInterpretationKey === attachment.result.localId) {
                  setEditingInterpretationKey(undefined);
                  setInterpretationDraft('');
                  setInterpretationError(undefined);
                }
              })
              .catch((cause) => {
                console.error('Deleting lab attachment failed', cause);
                setAttachmentError(
                  'Не удалось удалить файл. Попробуйте ещё раз.',
                );
              })
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  };

  const renderAttachmentInterpretation = ({
    currentValue,
    key,
    result,
  }: {
    currentValue?: string;
    key: string;
    result?: LabResult;
  }) => {
    const editing = editingInterpretationKey === key;
    return (
      <View style={styles.analysisModalSavedInterpretation}>
        <View style={styles.analysisModalSavedInterpretationHeader}>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.text.secondary}
            style={styles.analysisModalSavedInterpretationLabel}
          >
            Интерпретация
          </AppText>
          {!editing && !readOnly ? (
            <AppText
              role="caption"
              weight="semibold"
              color={colors.brand.primary}
            >
              Изменить
            </AppText>
          ) : null}
        </View>

        {editing ? (
          <View style={styles.analysisModalInterpretationEditor}>
            <TextInput
              accessibilityLabel="Редактировать интерпретацию результата"
              autoFocus
              multiline
              maxLength={resultInterpretationMaxLength}
              onChangeText={setInterpretationDraft}
              placeholder="Добавьте краткую интерпретацию результата"
              placeholderTextColor={colors.text.secondary}
              selectionColor={colors.brand.primary}
              style={styles.analysisModalInterpretationInput}
              value={interpretationDraft}
            />
            <View style={styles.analysisModalInterpretationActions}>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => {
                  setEditingInterpretationKey(undefined);
                  setInterpretationError(undefined);
                }}
                style={({ pressed }) => [
                  styles.analysisModalInterpretationAction,
                  pressed && styles.pressed,
                ]}
              >
                <AppText weight="medium">Отмена</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void saveAttachmentInterpretation(result)}
                style={({ pressed }) => [
                  styles.analysisModalInterpretationAction,
                  styles.analysisModalInterpretationActionPrimary,
                  pressed && styles.pressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator color={colors.text.inverse} size="small" />
                ) : (
                  <AppText weight="semibold" color={colors.text.inverse}>
                    Сохранить
                  </AppText>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.analysisModalInterpretationField}>
            <AppText
              role="label"
              color={currentValue ? colors.text.primary : colors.text.secondary}
              style={styles.analysisModalSavedInterpretationText}
            >
              {currentValue || 'Нажмите, чтобы добавить интерпретацию'}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Изменить интерпретацию результата"
              disabled={readOnly || saving}
              onPress={() => beginInterpretationEditing(key, currentValue)}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        )}

        {editing && interpretationError ? (
          <AppText role="caption" color={colors.state.error}>
            {interpretationError}
          </AppText>
        ) : null}
      </View>
    );
  };

  const restoreSelectedAnalysis = async () => {
    if (!selectedAnalysisCompleted || !selectedAnalysis || saving || readOnly)
      return;
    setSaving(true);
    try {
      await applyCarePlanAction(selectedAnalysis.carePlan, 'restore');
      const catalog = analysisCatalogByKey.get(
        selectedAnalysis.carePlan.catalogKey,
      );
      setActiveTab(
        selectedAnalysis.carePlan.riskTier === 'low' &&
          !selectedAnalysis.carePlan.requiresClinician &&
          (catalog?.riskFlags.length ?? 1) === 0
          ? 'current'
          : 'upcoming',
      );
      setSelectedAnalysis(undefined);
      setPendingAttachment(undefined);
      setAttachmentError(undefined);
      setSchedulePickerVisible(false);
    } catch (cause) {
      console.error('Restoring completed analysis failed', cause);
      Alert.alert(
        'Не удалось вернуть анализ',
        'Попробуйте ещё раз. Результат останется сохранённым.',
      );
    } finally {
      setSaving(false);
    }
  };

  const requestAnalysisCompletion = () => {
    if (!selectedAnalysis || selectedAnalysisCompleted || readOnly || saving)
      return;
    setCompletionInterpretation(selectedCompletionInterpretation ?? '');
    setCompletionInterpretationError(undefined);
    setCompletionInterpretationVisible(true);
  };

  const completeSelectedAnalysis = async () => {
    if (!selectedAnalysis || selectedAnalysisCompleted || readOnly || saving)
      return;
    const resultInterpretation = completionInterpretation.trim();
    if (!resultInterpretation) {
      setCompletionInterpretationError(
        'Добавьте краткую интерпретацию результата.',
      );
      return;
    }

    setSaving(true);
    setCompletionInterpretationError(undefined);
    try {
      await applyCarePlanAction(selectedAnalysis.carePlan, 'complete', {
        resultInterpretation,
      });
      setCompletionInterpretationVisible(false);
      setCompletionInterpretation('');
      setSelectedAnalysis(undefined);
      setPendingAttachment(undefined);
      setAttachmentError(undefined);
      setSchedulePickerVisible(false);
    } catch (cause) {
      console.error('Completing analysis with interpretation failed', cause);
      setCompletionInterpretationError(
        'Не удалось сохранить интерпретацию. Попробуйте ещё раз.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar hidden={false} style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerTop + 64,
            paddingBottom: Math.max(insets.bottom + 118, 132),
          },
        ]}
      >
        <View style={styles.heroWrap}>
          <AnalysisAttentionHero
            mascot={mascotHandsImage}
            score={72}
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
            <AnalysisReferencePlanCard
              title="Lipid Profile"
              description="Cardiovascular risk check"
              dueLabel="Due"
              dueValue="28d"
              image={lipidProfileReferenceImage}
              onView={
                firstReferencePlan
                  ? () => openAnalysis(firstReferencePlan)
                  : undefined
              }
            />
            <AnalysisReferencePlanCard
              title="Ferritin"
              description="Kidney & metabolic quick check"
              dueLabel="Status"
              dueValue="Ready"
              hasAttachedResult
              image={ferritinReferenceImage}
              onView={
                secondReferencePlan
                  ? () => openAnalysis(secondReferencePlan)
                  : undefined
              }
            />
          </View>
        ) : savedResults.length ||
          savedScans.length ||
          completedPlans.length ? (
          <View style={styles.cardsList}>
            {savedResults.map((result) => {
              const firstAnalyte = result.analytes[0];
              const catalog = analysisCatalogByKey.get(result.catalogKey);
              const completedPlan = completedPlanByResultId.get(result.localId);
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
                  onView={() => {
                    if (completedPlan) {
                      openAnalysis(viewModelForPlan(completedPlan));
                      return;
                    }
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
                    );
                  }}
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
                  image={
                    item.illustrationKey
                      ? planImages[item.illustrationKey]
                      : undefined
                  }
                  onView={() => openAnalysis(viewModelForPlan(item))}
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
          'rgba(249,249,249,1)',
          'rgba(255,248,251,0.94)',
          'rgba(249,249,249,0)',
        ]}
        locations={[0, 0.58, 1]}
        style={[styles.headerFade, { height: headerTop + 78 }]}
      />

      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(249,249,249,0)',
          'rgba(255,248,251,0.86)',
          'rgba(255,255,255,1)',
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[
          styles.navbarFade,
          { height: Math.max(insets.bottom + 72, 112) },
        ]}
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
                  </View>
                </View>

                <View style={styles.analysisModalDates}>
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

                <View style={styles.analysisModalSections}>
                  <View style={styles.analysisModalSection}>
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalSectionTitle}
                    >
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

                  {selectedAnalysisCompleted &&
                  selectedCompletionInterpretation ? (
                    <View style={styles.analysisModalSection}>
                      <AppText
                        role="label"
                        weight="semibold"
                        style={styles.analysisModalSectionTitle}
                      >
                        Интерпретация результата
                      </AppText>
                      <View style={styles.analysisModalInfoCard}>
                        <AppText
                          role="label"
                          style={styles.analysisModalBodyText}
                        >
                          {selectedCompletionInterpretation}
                        </AppText>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.analysisModalSection}>
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalSectionTitle}
                    >
                      {selectedAnalysisCompleted
                        ? 'История'
                        : 'Почему это в плане'}
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
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalSectionTitle}
                    >
                      Учтено
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
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalSectionTitle}
                    >
                      Зачем сдавать
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
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalSectionTitle}
                    >
                      Действия
                    </AppText>
                    <View style={styles.analysisModalPlanActions}>
                      {selectedAnalysisCompleted ? (
                        <View
                          style={[
                            styles.analysisModalPlanPrimarySurface,
                            (readOnly || saving) &&
                              styles.analysisModalControlDisabled,
                          ]}
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Вернуть анализ в план"
                            disabled={readOnly || saving}
                            onPress={() => void restoreSelectedAnalysis()}
                            style={StyleSheet.absoluteFillObject}
                          >
                            {({ pressed }) => (
                              <View
                                style={[
                                  styles.analysisModalPlanButtonContent,
                                  pressed && styles.pressed,
                                ]}
                              >
                                {saving ? (
                                  <ActivityIndicator
                                    color={colors.text.inverse}
                                  />
                                ) : (
                                  <AppText
                                    weight="semibold"
                                    color={colors.text.inverse}
                                  >
                                    Вернуть в план
                                  </AppText>
                                )}
                              </View>
                            )}
                          </Pressable>
                        </View>
                      ) : (
                        <>
                          <View
                            style={[
                              styles.analysisModalPlanPrimarySurface,
                              (readOnly || saving) &&
                                styles.analysisModalControlDisabled,
                            ]}
                          >
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Отметить анализ выполненным и добавить интерпретацию"
                              disabled={readOnly || saving}
                              onPress={requestAnalysisCompletion}
                              style={StyleSheet.absoluteFillObject}
                            >
                              {({ pressed }) => (
                                <View
                                  style={[
                                    styles.analysisModalPlanButtonContent,
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <AppText
                                    weight="semibold"
                                    color={colors.text.inverse}
                                  >
                                    Отметить выполненным
                                  </AppText>
                                </View>
                              )}
                            </Pressable>
                          </View>

                          <View style={styles.analysisModalPlanSecondaryGrid}>
                            {selectedAnalysis.carePlan.status === 'upcoming' ? (
                              <View
                                style={[
                                  styles.analysisModalPlanSecondarySurface,
                                  (readOnly || saving) &&
                                    styles.analysisModalControlDisabled,
                                ]}
                              >
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Уточнить срок рекомендации"
                                  disabled={readOnly || saving}
                                  onPress={requestUserConfirmedSchedule}
                                  style={StyleSheet.absoluteFillObject}
                                >
                                  {({ pressed }) => (
                                    <View
                                      style={[
                                        styles.analysisModalPlanButtonContent,
                                        pressed && styles.pressed,
                                      ]}
                                    >
                                      <AppText weight="medium">
                                        Уточнить срок
                                      </AppText>
                                    </View>
                                  )}
                                </Pressable>
                              </View>
                            ) : null}

                            <View
                              style={[
                                styles.analysisModalPlanSecondarySurface,
                                (readOnly || saving) &&
                                  styles.analysisModalControlDisabled,
                              ]}
                            >
                              <Pressable
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
                                style={StyleSheet.absoluteFillObject}
                              >
                                {({ pressed }) => (
                                  <View
                                    style={[
                                      styles.analysisModalPlanButtonContent,
                                      pressed && styles.pressed,
                                    ]}
                                  >
                                    <AppText
                                      weight="medium"
                                      color={colors.state.error}
                                    >
                                      Отказаться
                                    </AppText>
                                  </View>
                                )}
                              </Pressable>
                            </View>
                          </View>

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
                                  accessibilityRole="button"
                                  disabled={saving}
                                  onPress={() =>
                                    setSchedulePickerVisible(false)
                                  }
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
                        </>
                      )}
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <View style={styles.analysisModalAttachmentHeading}>
                      <AppText
                        role="label"
                        weight="semibold"
                        style={styles.analysisModalSectionTitle}
                      >
                        {selectedAnalysisCompleted
                          ? 'Результат'
                          : 'Прикрепить результат'}
                      </AppText>
                      {hasSelectedResult ? (
                        <AppText
                          role="caption"
                          weight="semibold"
                          color={colors.brand.primary}
                        >
                          Прикреплён
                        </AppText>
                      ) : null}
                    </View>

                    <View
                      style={[
                        styles.analysisModalUploadPanel,
                        (attachmentPicking || saving) &&
                          styles.analysisModalControlDisabled,
                      ]}
                    >
                      <View style={styles.analysisModalUploadBody}>
                        <View style={styles.analysisModalUploadIconTile}>
                          {selectedAnalysisCompleted ? (
                            <AnalysisResultIcon />
                          ) : (
                            <AnalysisUploadIcon />
                          )}
                        </View>

                        <View style={styles.analysisModalUploadCopy}>
                          {visibleAttachmentCount > 0 ? (
                            <>
                              <AppText
                                role="label"
                                weight="semibold"
                                numberOfLines={2}
                                style={styles.analysisModalUploadTitle}
                              >
                                Добавленные файлы
                              </AppText>
                              <AppText
                                role="caption"
                                color={colors.text.secondary}
                                style={styles.analysisModalUploadDescription}
                              >
                                {attachmentCountLabel(visibleAttachmentCount)}
                              </AppText>
                            </>
                          ) : (
                            <>
                              <AppText
                                role="label"
                                weight="semibold"
                                style={styles.analysisModalUploadTitle}
                              >
                                {selectedAnalysisCompleted
                                  ? 'К этому анализу результат не прикреплён'
                                  : 'Выберите документ'}
                              </AppText>
                              <AppText
                                role="caption"
                                color={colors.text.secondary}
                                style={styles.analysisModalUploadDescription}
                              >
                                {selectedAnalysisCompleted
                                  ? 'Информация о выполнении сохранена в плане'
                                  : 'Файлы или фото из галереи'}
                              </AppText>
                            </>
                          )}
                        </View>

                        {visibleAttachmentCount > 0 ? (
                          <View style={styles.analysisModalFileList}>
                            {pendingAttachment ? (
                              <View style={styles.analysisModalAttachmentCard}>
                                <View style={styles.analysisModalFileRow}>
                                  {pendingAttachment.kind === 'photo' ||
                                  pendingAttachment.mimeType?.startsWith(
                                    'image/',
                                  ) ? (
                                    <Image
                                      source={{ uri: pendingAttachment.uri }}
                                      style={styles.analysisModalPhotoPreview}
                                    />
                                  ) : (
                                    <View
                                      style={styles.analysisModalFilePreview}
                                    >
                                      <AnalysisResultIcon />
                                    </View>
                                  )}
                                  <View style={styles.analysisModalFileCopy}>
                                    <AppText
                                      role="label"
                                      weight="medium"
                                      numberOfLines={1}
                                    >
                                      {pendingAttachment.name}
                                    </AppText>
                                    <AppText
                                      role="caption"
                                      color={colors.text.secondary}
                                    >
                                      Будет сохранён после подтверждения
                                    </AppText>
                                  </View>
                                  <View
                                    style={styles.analysisModalDeleteButton}
                                  >
                                    <AppText
                                      weight="medium"
                                      color={colors.text.secondary}
                                      style={styles.analysisModalDeleteIcon}
                                    >
                                      ×
                                    </AppText>
                                    <Pressable
                                      accessibilityRole="button"
                                      accessibilityLabel={`Удалить файл ${pendingAttachment.name}`}
                                      disabled={saving}
                                      onPress={removePendingAttachment}
                                      style={StyleSheet.absoluteFillObject}
                                    />
                                  </View>
                                </View>
                                {renderAttachmentInterpretation({
                                  currentValue: pendingAttachmentInterpretation,
                                  key: 'pending',
                                })}
                              </View>
                            ) : null}

                            {selectedSavedAttachments.map((attachment) => {
                              const isPhoto =
                                attachment.document.mimeType?.startsWith(
                                  'image/',
                                ) ||
                                /\.(?:heic|jpe?g|png|webp)$/i.test(
                                  attachment.document.title,
                                );
                              return (
                                <View
                                  key={attachment.result.localId}
                                  style={styles.analysisModalAttachmentCard}
                                >
                                  <View style={styles.analysisModalFileRow}>
                                    <View
                                      style={
                                        styles.analysisModalAttachmentOpenArea
                                      }
                                    >
                                      {isPhoto ? (
                                        <Image
                                          source={{
                                            uri: attachment.document
                                              .localFileUri,
                                          }}
                                          style={
                                            styles.analysisModalPhotoPreview
                                          }
                                        />
                                      ) : (
                                        <View
                                          style={
                                            styles.analysisModalFilePreview
                                          }
                                        >
                                          <AnalysisResultIcon />
                                        </View>
                                      )}
                                      <View
                                        style={styles.analysisModalFileCopy}
                                      >
                                        <AppText
                                          role="label"
                                          weight="medium"
                                          numberOfLines={1}
                                        >
                                          {attachment.document.title}
                                        </AppText>
                                        <AppText
                                          role="caption"
                                          color={colors.text.secondary}
                                        >
                                          {isPhoto
                                            ? 'Фото · нажмите для просмотра'
                                            : 'Файл · нажмите, чтобы открыть'}
                                        </AppText>
                                      </View>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`Открыть файл ${attachment.document.title}`}
                                        disabled={saving}
                                        onPress={() =>
                                          void openSelectedResult(
                                            attachment.document,
                                          )
                                        }
                                        style={StyleSheet.absoluteFillObject}
                                      />
                                    </View>
                                    <View
                                      style={styles.analysisModalDeleteButton}
                                    >
                                      <AppText
                                        weight="medium"
                                        color={colors.text.secondary}
                                        style={styles.analysisModalDeleteIcon}
                                      >
                                        ×
                                      </AppText>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`Удалить файл ${attachment.document.title}`}
                                        disabled={saving}
                                        onPress={() =>
                                          requestDeleteSavedAttachment(
                                            attachment,
                                          )
                                        }
                                        style={StyleSheet.absoluteFillObject}
                                      />
                                    </View>
                                  </View>
                                  {renderAttachmentInterpretation({
                                    currentValue:
                                      attachment.result.interpretation,
                                    key: attachment.result.localId,
                                    result: attachment.result,
                                  })}
                                </View>
                              );
                            })}
                          </View>
                        ) : null}

                        {!selectedAnalysisCompleted ? (
                          <View style={styles.analysisModalUploadActions}>
                            <View
                              style={[
                                styles.analysisModalUploadButton,
                                styles.analysisModalUploadButtonPrimary,
                              ]}
                            >
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Прикрепить файл результата"
                                disabled={attachmentPicking || saving}
                                onPress={() =>
                                  void pickAnalysisAttachment('file')
                                }
                                style={StyleSheet.absoluteFillObject}
                              >
                                {({ pressed }) => (
                                  <View
                                    style={[
                                      styles.analysisModalUploadButtonContent,
                                      pressed && styles.pressed,
                                    ]}
                                  >
                                    {attachmentPicking ? (
                                      <ActivityIndicator
                                        color={colors.text.inverse}
                                        size="small"
                                      />
                                    ) : (
                                      <AppText
                                        weight="semibold"
                                        color={colors.text.inverse}
                                      >
                                        Выбрать файл
                                      </AppText>
                                    )}
                                  </View>
                                )}
                              </Pressable>
                            </View>

                            <View style={styles.analysisModalUploadButton}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Прикрепить фото результата"
                                disabled={attachmentPicking || saving}
                                onPress={() =>
                                  void pickAnalysisAttachment('photo')
                                }
                                style={StyleSheet.absoluteFillObject}
                              >
                                {({ pressed }) => (
                                  <View
                                    style={[
                                      styles.analysisModalUploadButtonContent,
                                      pressed && styles.pressed,
                                    ]}
                                  >
                                    <AppText weight="medium">
                                      Добавить фото
                                    </AppText>
                                  </View>
                                )}
                              </Pressable>
                            </View>
                          </View>
                        ) : null}
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
                        ? void saveAnalysisAttachment({
                            interpretation: pendingAttachmentInterpretation,
                          })
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
                            weight="semibold"
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

          {completionInterpretationVisible ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.completionDialogLayer}
            >
              <Pressable
                accessibilityLabel="Закрыть ввод интерпретации"
                disabled={saving}
                onPress={() => {
                  setCompletionInterpretationVisible(false);
                  setCompletionInterpretationError(undefined);
                }}
                style={styles.completionDialogScrim}
              />

              <View style={styles.completionDialogCard}>
                <View style={styles.completionDialogHeader}>
                  <AppText
                    role="title"
                    weight="semibold"
                    style={styles.completionDialogTitle}
                  >
                    Интерпретация результата
                  </AppText>
                  <AppText
                    role="caption"
                    color={colors.text.secondary}
                    style={styles.completionDialogDescription}
                  >
                    Кратко зафиксируйте показатели, заключение врача или важные
                    детали результата.
                  </AppText>
                </View>

                <View
                  style={[
                    styles.completionDialogInputWrap,
                    completionInterpretationError &&
                      styles.completionDialogInputError,
                  ]}
                >
                  <TextInput
                    accessibilityLabel="Текстовая интерпретация результата"
                    editable={!saving}
                    maxLength={resultInterpretationMaxLength}
                    multiline
                    onChangeText={(value) => {
                      setCompletionInterpretation(value);
                      if (completionInterpretationError)
                        setCompletionInterpretationError(undefined);
                    }}
                    placeholder="Например: показатели в пределах нормы, врач рекомендовал контроль через 6 месяцев…"
                    placeholderTextColor="#A39D9A"
                    selectionColor={colors.brand.primary}
                    style={styles.completionDialogInput}
                    textAlignVertical="top"
                    value={completionInterpretation}
                  />
                  <AppText
                    role="caption"
                    color="#A39D9A"
                    style={styles.completionDialogCounter}
                  >
                    {completionInterpretation.length}/
                    {resultInterpretationMaxLength}
                  </AppText>
                </View>

                {completionInterpretationError ? (
                  <AppText
                    role="caption"
                    color={colors.state.error}
                    style={styles.completionDialogError}
                  >
                    {completionInterpretationError}
                  </AppText>
                ) : null}

                <View style={styles.completionDialogActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => {
                      setCompletionInterpretationVisible(false);
                      setCompletionInterpretationError(undefined);
                    }}
                    style={({ pressed }) => [
                      styles.completionDialogButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppText weight="medium">Отмена</AppText>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Сохранить интерпретацию и завершить анализ"
                    accessibilityState={{
                      disabled:
                        saving || !completionInterpretation.trim().length,
                    }}
                    disabled={saving || !completionInterpretation.trim().length}
                    onPress={() => void completeSelectedAnalysis()}
                    style={({ pressed }) => [
                      styles.completionDialogButton,
                      styles.completionDialogButtonPrimary,
                      !completionInterpretation.trim().length &&
                        styles.completionDialogButtonDisabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator color={colors.text.inverse} />
                    ) : (
                      <AppText weight="semibold" color={colors.text.inverse}>
                        Сохранить и завершить
                      </AppText>
                    )}
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          ) : null}

          {photoInterpretationVisible && pendingAttachment?.kind === 'photo' ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.photoInterpretationLayer}
            >
              <Pressable
                accessibilityLabel="Отменить интерпретацию фотографии"
                disabled={saving}
                onPress={() => {
                  setPhotoInterpretationVisible(false);
                  setPhotoInterpretation('');
                  setPhotoInterpretationError(undefined);
                  setPendingAttachment(undefined);
                  setPendingAttachmentInterpretation('');
                }}
                style={styles.completionDialogScrim}
              />

              <View style={styles.photoInterpretationCard}>
                <View style={styles.photoInterpretationHeader}>
                  <AppText
                    role="title"
                    weight="semibold"
                    style={styles.photoInterpretationTitle}
                  >
                    Интерпретация фото
                  </AppText>
                  <AppText
                    role="caption"
                    color={colors.text.secondary}
                    style={styles.photoInterpretationDescription}
                  >
                    Проверьте снимок и кратко запишите показатели или заключение
                    из результата.
                  </AppText>
                </View>

                <Image
                  accessible
                  accessibilityLabel="Выбранное фото результата"
                  resizeMode="contain"
                  source={{ uri: pendingAttachment.uri }}
                  style={styles.photoInterpretationPreview}
                />

                <View
                  style={[
                    styles.photoInterpretationInputWrap,
                    photoInterpretationError &&
                      styles.completionDialogInputError,
                  ]}
                >
                  <TextInput
                    accessibilityLabel="Интерпретация фотографии результата"
                    editable={!saving}
                    maxLength={resultInterpretationMaxLength}
                    multiline
                    onChangeText={(value) => {
                      setPhotoInterpretation(value);
                      if (photoInterpretationError)
                        setPhotoInterpretationError(undefined);
                    }}
                    placeholder="Например: гемоглобин 128 г/л, остальные показатели без отклонений…"
                    placeholderTextColor="#A39D9A"
                    selectionColor={colors.brand.primary}
                    style={styles.photoInterpretationInput}
                    textAlignVertical="top"
                    value={photoInterpretation}
                  />
                  <AppText
                    role="caption"
                    color="#A39D9A"
                    style={styles.completionDialogCounter}
                  >
                    {photoInterpretation.length}/{resultInterpretationMaxLength}
                  </AppText>
                </View>

                {photoInterpretationError ? (
                  <AppText
                    role="caption"
                    color={colors.state.error}
                    style={styles.completionDialogError}
                  >
                    {photoInterpretationError}
                  </AppText>
                ) : null}

                <View style={styles.photoInterpretationActions}>
                  <View style={styles.photoInterpretationActionSlot}>
                    <View
                      style={[
                        styles.analysisModalCancel,
                        StyleSheet.absoluteFill,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Отмена"
                        disabled={saving}
                        onPress={() => {
                          setPhotoInterpretationVisible(false);
                          setPhotoInterpretation('');
                          setPhotoInterpretationError(undefined);
                          setPendingAttachment(undefined);
                          setPendingAttachmentInterpretation('');
                        }}
                        style={StyleSheet.absoluteFill}
                      >
                        {({ pressed }) => (
                          <View
                            style={[
                              styles.analysisModalActionContent,
                              pressed && styles.pressed,
                            ]}
                          >
                            <AppText role="label" weight="medium">
                              Отмена
                            </AppText>
                          </View>
                        )}
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.photoInterpretationActionSlot}>
                    <View
                      style={[
                        styles.photoInterpretationDoneButton,
                        StyleSheet.absoluteFill,
                        !photoInterpretation.trim().length &&
                          styles.photoInterpretationDoneButtonDisabled,
                      ]}
                    >
                      {saving ? (
                        <ActivityIndicator color={colors.text.inverse} />
                      ) : (
                        <AppText
                          weight="semibold"
                          color={
                            photoInterpretation.trim().length
                              ? colors.text.inverse
                              : colors.text.secondary
                          }
                        >
                          Готово
                        </AppText>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Готово, сохранить фото и интерпретацию"
                        accessibilityState={{
                          disabled:
                            saving || !photoInterpretation.trim().length,
                        }}
                        disabled={saving || !photoInterpretation.trim().length}
                        onPress={() => void savePhotoInterpretation()}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          ) : null}
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
    backgroundColor: '#F9F9F9',
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
  navbarFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 8,
  },
  addButtonDisabled: {
    backgroundColor: colors.state.disabled,
  },
  heroWrap: {
    marginTop: 16,
    zIndex: 2,
  },
  summaryWrap: {
    alignSelf: 'stretch',
    marginTop: 20,
  },
  tabsWrap: {
    marginTop: 20,
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
  emptySettingsButtonSpacing: {
    paddingTop: 12,
  },
  emptySettingsButton: {
    minWidth: 220,
    borderRadius: 25,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 4,
  },
  emptySettingsButtonSurface: {
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
  },
  emptySettingsButtonLabel: {
    fontSize: 15,
    lineHeight: 19,
  },
  analysisModalRoot: {
    flex: 1,
  },
  analysisModalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(33,25,29,0.32)',
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
    paddingTop: 9,
    paddingHorizontal: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface.raised,
  },
  analysisModalHandle: {
    width: 36,
    height: 4,
    marginBottom: 22,
    borderRadius: 2,
    backgroundColor: '#D8D3D5',
    alignSelf: 'center',
  },
  analysisModalHero: {
    minHeight: 104,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
    paddingBottom: 20,
  },
  analysisModalImageWrap: {
    width: 80,
    height: 88,
    overflow: 'hidden',
    flexShrink: 0,
  },
  analysisModalNoImage: {
    width: 72,
    height: 72,
    flexShrink: 0,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.16)',
  },
  analysisModalNoImageText: {
    fontSize: 30,
    lineHeight: 34,
  },
  analysisModalImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.12 }],
  },
  analysisModalHeroCopy: {
    minWidth: 0,
    flex: 1,
  },
  analysisModalTitle: {
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.62,
  },
  analysisModalDescription: {
    marginTop: 7,
    fontSize: 15,
    lineHeight: 20,
  },
  analysisModalDates: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
  },
  analysisModalMetaLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  analysisModalMetaValue: {
    fontSize: 14,
    lineHeight: 18,
  },
  analysisModalSections: {
    paddingTop: 0,
  },
  analysisModalSection: {
    gap: 10,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
  },
  analysisModalSectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.22,
  },
  analysisModalInfoCard: {
    gap: 10,
  },
  analysisModalRequirement: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  analysisModalBullet: {
    width: 5,
    height: 5,
    marginTop: 8,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  analysisModalRequirementText: {
    flex: 1,
    fontSize: 15.5,
    lineHeight: 22,
  },
  analysisModalBodyText: {
    fontSize: 15.5,
    lineHeight: 22,
  },
  analysisModalPlanActions: {
    width: '100%',
    gap: 10,
  },
  analysisModalPlanPrimarySurface: {
    position: 'relative',
    width: '100%',
    height: 52,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
  },
  analysisModalPlanSecondaryGrid: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  analysisModalPlanSecondarySurface: {
    position: 'relative',
    minWidth: 0,
    flex: 1,
    height: 48,
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalPlanButtonContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  analysisModalControlDisabled: {
    opacity: 0.58,
  },
  analysisModalSchedulePicker: {
    width: '100%',
    gap: 10,
    marginVertical: 10,
    padding: 12,
    borderRadius: 12,
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
    borderRadius: 10,
  },
  analysisModalScheduleActionPrimary: {
    backgroundColor: colors.brand.primary,
  },
  analysisModalAttachmentHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  analysisModalUploadPanel: {
    width: '100%',
    padding: 8,
    borderRadius: 22,
    backgroundColor: '#EFEAEC',
  },
  analysisModalUploadBody: {
    width: '100%',
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderRadius: 17,
    backgroundColor: colors.surface.raised,
  },
  analysisModalUploadIconTile: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#FFF0F6',
  },
  analysisModalUploadCopy: {
    width: '100%',
    alignItems: 'center',
    gap: 5,
  },
  analysisModalUploadTitle: {
    maxWidth: 300,
    textAlign: 'center',
    fontSize: 15.5,
    lineHeight: 21,
  },
  analysisModalUploadDescription: {
    textAlign: 'center',
    fontSize: 13.5,
    lineHeight: 18,
  },
  analysisModalFileList: {
    width: '100%',
    gap: 10,
  },
  analysisModalAttachmentCard: {
    width: '100%',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.11)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalFileRow: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  analysisModalAttachmentOpenArea: {
    position: 'relative',
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  analysisModalPhotoPreview: {
    width: 58,
    height: 58,
    flexShrink: 0,
    borderRadius: 12,
    backgroundColor: '#EDE8EA',
  },
  analysisModalFilePreview: {
    width: 58,
    height: 58,
    flexShrink: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFF0F6',
  },
  analysisModalFileCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  analysisModalDeleteButton: {
    position: 'relative',
    width: 34,
    height: 34,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.11)',
    backgroundColor: colors.surface.raised,
  },
  analysisModalDeleteIcon: {
    marginTop: -2,
    fontSize: 25,
    lineHeight: 28,
  },
  analysisModalUploadActions: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  analysisModalUploadButton: {
    position: 'relative',
    minWidth: 0,
    flex: 1,
    height: 44,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.14)',
    backgroundColor: colors.surface.raised,
  },
  analysisModalUploadButtonPrimary: {
    borderColor: '#EA4087',
    backgroundColor: '#EA4087',
  },
  analysisModalUploadButtonContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  analysisModalSavedInterpretation: {
    gap: 9,
    paddingTop: 4,
  },
  analysisModalSavedInterpretationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  analysisModalSavedInterpretationLabel: {
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.12,
  },
  analysisModalInterpretationField: {
    minHeight: 88,
    justifyContent: 'flex-start',
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.14)',
    backgroundColor: '#F7F5F5',
  },
  analysisModalInterpretationEditor: {
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brand.primary,
    backgroundColor: '#F7F5F5',
  },
  analysisModalInterpretationInput: {
    minHeight: 112,
    paddingTop: 13,
    paddingHorizontal: 14,
    paddingBottom: 10,
    color: colors.text.primary,
    fontSize: 15.5,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  analysisModalInterpretationActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  analysisModalInterpretationAction: {
    minWidth: 94,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.12)',
    backgroundColor: colors.surface.raised,
  },
  analysisModalInterpretationActionPrimary: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  analysisModalSavedInterpretationText: {
    fontSize: 15.5,
    lineHeight: 22,
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
    paddingTop: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.surface.raised,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  analysisModalActions: {
    width: '100%',
    height: 50,
    flexDirection: 'row',
    gap: 10,
  },
  analysisModalActionSlot: {
    flex: 1,
    height: 50,
  },
  analysisModalActionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisModalCancel: {
    position: 'relative',
    height: 50,
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.12)',
    backgroundColor: colors.surface.raised,
  },
  analysisModalSave: {
    position: 'relative',
    height: 50,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
  },
  analysisModalSaveDisabled: {
    opacity: 0.38,
  },
  completionDialogLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  completionDialogScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(33,25,29,0.46)',
  },
  completionDialogCard: {
    zIndex: 1,
    width: '100%',
    maxWidth: 480,
    gap: 16,
    padding: 20,
    borderRadius: 22,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
  },
  completionDialogHeader: {
    gap: 7,
  },
  completionDialogTitle: {
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.4,
  },
  completionDialogDescription: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  completionDialogInputWrap: {
    minHeight: 154,
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.14)',
    backgroundColor: '#F7F5F5',
  },
  completionDialogInputError: {
    borderColor: colors.state.error,
  },
  completionDialogInput: {
    minHeight: 124,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 8,
    color: colors.text.primary,
    fontSize: 15.5,
    lineHeight: 22,
  },
  completionDialogCounter: {
    paddingRight: 12,
    paddingBottom: 10,
    textAlign: 'right',
    fontSize: 12,
    lineHeight: 14,
  },
  completionDialogError: {
    marginTop: -8,
    fontSize: 13,
    lineHeight: 17,
  },
  completionDialogActions: {
    flexDirection: 'row',
    gap: 10,
  },
  completionDialogButton: {
    minWidth: 0,
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.12)',
    backgroundColor: colors.surface.raised,
    paddingHorizontal: 12,
  },
  completionDialogButtonPrimary: {
    flex: 1.45,
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  completionDialogButtonDisabled: {
    opacity: 0.38,
  },
  photoInterpretationLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  photoInterpretationCard: {
    zIndex: 1,
    width: '100%',
    maxWidth: 480,
    gap: 14,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 80,
    borderRadius: 22,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
  },
  photoInterpretationHeader: {
    gap: 6,
  },
  photoInterpretationTitle: {
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.4,
  },
  photoInterpretationDescription: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  photoInterpretationPreview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: '#F4F1F2',
  },
  photoInterpretationInputWrap: {
    minHeight: 130,
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.14)',
    backgroundColor: '#F7F5F5',
  },
  photoInterpretationInput: {
    minHeight: 100,
    paddingTop: 13,
    paddingHorizontal: 14,
    paddingBottom: 7,
    color: colors.text.primary,
    fontSize: 15.5,
    lineHeight: 22,
  },
  photoInterpretationActions: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    zIndex: 3,
    height: 50,
    flexDirection: 'row',
    gap: 18,
  },
  photoInterpretationActionSlot: {
    minWidth: 0,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    height: 50,
  },
  photoInterpretationDoneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EA4087',
    backgroundColor: '#EA4087',
  },
  photoInterpretationDoneButtonDisabled: {
    borderColor: 'rgba(33,31,32,0.10)',
    backgroundColor: '#EEE9EB',
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
});
