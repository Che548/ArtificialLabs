import { ThemeStatusBar, useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { colors as defaultThemeColors } from '../design-system/tokens';
import { AppSheet, sheetStyles } from '../components/AppSheet';
import { TopChromeBackdrop } from '../components/TopChromeBackdrop';
import { AnalysisAttachmentThumbnail } from '../components/AnalysisAttachmentThumbnail';
import { analysisCountdown } from '../lib/analysis-countdown';
import {
  useProfileReducedMotion,
} from '../components/ProfileMotion';
import { analysisCategoryImage } from '../lib/analysis-category-images';
import { EmptyStateIcon, emptyStateColor } from '../components/EmptyStateIcon';
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
import Svg, { Circle, Path, Rect } from 'react-native-svg';

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
  mimeType?: string;
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
    image: analysisCategoryImage(catalog?.category ?? item.category),
    purpose: item.rationale || catalog?.purpose || item.description,
    requirements: [catalog?.specimen ?? item.description].filter(Boolean),
    statusLabel,
    tab: item.status === 'current' ? 'current' : 'upcoming',
    title: item.title,
    validityLabel: analysisCountdown(item.dueAt).label,
    validityValue: analysisCountdown(item.dueAt).value,
  };
}

export default function AnalysesScreen() {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
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
  const reduceMotion = useProfileReducedMotion();
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
        title: 'План выключен',
        description:
          'Включите рекомендации в профиле, чтобы получать предварительный план.',
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
          mimeType: asset.mimeType,
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
        mimeType: asset.mimeType,
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
  const selectedSavedDocument = selectedSavedResult
    ? documents.find(
        (document) =>
          !document.deletedAt &&
          document.hasLocalFile &&
          (document.localId === selectedSavedResult.sourceDocumentLocalId ||
            document.linkedLabResultLocalId === selectedSavedResult.localId),
      )
    : undefined;

  return (
    <View style={styles.root}>
      <ThemeStatusBar />
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
                  purpose={item.purpose}
                  readOnly={readOnly}
                  dueLabel={item.dueLabel}
                  dueValue={item.dueValue}
                  validityLabel={item.validityLabel}
                  validityValue={item.validityValue}
                  dueAt={item.carePlan.dueAt}
                  periodStartAt={item.carePlan.dueWindowStart ?? item.carePlan.updatedAt}
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
                ) : (
                  <EmptyStateIcon kind="plan" />
                )}
                <AppText
                  role="body"
                  weight="semibold"
                  style={styles.emptyPlanTitle}
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
                      Настройки
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
                  isCompleted
                  purpose={catalog?.purpose}
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
                  image={analysisCategoryImage(catalog?.category)}
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
                image={analysisCategoryImage(
                  'Экспресс-тесты и домашняя диагностика',
                )}
                isCompleted
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
                  isCompleted
                  purpose={catalog?.purpose}
                  description={catalog?.specimen ?? item.description}
                  dueLabel="Дата выполнения"
                  dueValue={new Date(
                    item.performedAt ?? item.updatedAt,
                  ).toLocaleDateString('ru-RU')}
                  validityLabel="Статус"
                  validityValue="Выполнено"
                  image={analysisCategoryImage(
                    catalog?.category ?? item.category,
                  )}
                  statusLabel="Отмечено выполненным"
                  resultActionLabel="Открыть запись"
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
            <EmptyStateIcon kind="analysis" />
            <AppText role="body" weight="regular" style={styles.emptyTitle}>
              Здесь появятся результаты
            </AppText>
          </View>
        )}
      </ScrollView>

      <TopChromeBackdrop headerTop={headerTop} />

      <View style={[styles.fixedHeader, { top: headerTop }]}>
        <AnalysisReferenceHeader
          onChart={() => setChartsVisible(true)}
          onDate={() => setActiveTab('current')}
        />
      </View>

      <AppSheet
        visible={Boolean(selectedAnalysis)}
        title="Анализ"
        onClose={closeAnalysis}
        dismissDisabled={saving || attachmentPicking}
        scroll={false}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.analysisModalPageScroll}
          contentContainerStyle={[
            styles.analysisModalPageContent,
            {
              paddingBottom: 20,
            },
          ]}
        >
          {selectedAnalysis ? (
            <View style={styles.analysisModalSheet}>
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
                    {analysisCountdown(selectedAnalysis.carePlan.dueAt).label}
                  </AppText>
                  <AppText
                    role="label"
                    weight="semibold"
                    style={styles.analysisModalMetaValue}
                  >
                    {analysisCountdown(selectedAnalysis.carePlan.dueAt).value}
                  </AppText>
                </View>
              </View>

              <View style={styles.analysisModalSections}>
                <View style={styles.analysisModalInfoCard}>
                  <AppText role="caption" color={colors.text.secondary}>
                    Материал и исследование
                  </AppText>
                  <AppText style={styles.analysisModalBodyText}>
                    {selectedAnalysis.description}
                  </AppText>
                  <View style={styles.analysisModalInfoDivider} />
                  <AppText role="caption" color={colors.text.secondary}>
                    Зачем это нужно
                  </AppText>
                  <AppText style={styles.analysisModalBodyText}>
                    {selectedAnalysis.purpose}
                  </AppText>
                </View>

                <View style={styles.analysisModalSection}>
                  <View style={styles.analysisModalAttachmentHeading}>
                    <AppText role="label" weight="semibold">
                      Результат
                    </AppText>
                  </View>

                  <View style={styles.analysisModalAttachmentCard}>
                    {pendingAttachment || selectedSavedResult ? (
                      <View style={styles.analysisModalAttachmentStatus}>
                        <AnalysisAttachmentThumbnail
                          uri={
                            pendingAttachment
                              ? pendingAttachment.uri
                              : selectedSavedDocument?.localFileUri
                          }
                          name={
                            pendingAttachment
                              ? pendingAttachment.name
                              : selectedSavedDocument?.title
                          }
                          mimeType={
                            pendingAttachment
                              ? pendingAttachment.mimeType
                              : selectedSavedDocument?.mimeType
                          }
                          photo={pendingAttachment?.kind === 'photo'}
                        />
                        <View style={styles.analysisModalAttachmentCopy}>
                          <AppText
                            role="label"
                            weight="semibold"
                            numberOfLines={1}
                          >
                            {pendingAttachment?.name ||
                              'Результат обследования'}
                          </AppText>
                          <AppText role="caption" color={colors.text.secondary}>
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
                          disabled={readOnly || attachmentPicking || saving}
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
                              <Svg
                                width={18}
                                height={18}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={colors.brand.primary}
                                strokeWidth={1.7}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                accessible={false}
                              >
                                {kind === 'file' ? (
                                  <>
                                    <Path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
                                    <Path d="M14 3v6h6M8 13h8M8 17h5" />
                                  </>
                                ) : (
                                  <>
                                    <Rect x={3} y={3} width={18} height={18} rx={4} />
                                    <Circle cx={8} cy={8} r={1.5} />
                                    <Path d="m3 17 5-5 4 4 4-6 5 7" />
                                  </>
                                )}
                              </Svg>
                              <AppText
                                role="label"
                                weight="semibold"
                                color={colors.brand.primary}
                                numberOfLines={1}
                                style={styles.analysisModalAttachmentButtonLabel}
                              >
                                {kind === 'file'
                                  ? 'Выбрать файл'
                                  : 'Выбрать фото'}
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
                <View style={styles.analysisModalSection}>
                  <AppText role="label" weight="semibold">
                    План
                  </AppText>
                  <View style={styles.analysisModalPlanActions}>
                    <Pressable
                      cssInterop={false}
                      accessibilityRole="button"
                      disabled={readOnly || saving || attachmentPicking}
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
                        disabled={readOnly || saving || attachmentPicking}
                        onPress={requestUserConfirmedSchedule}
                        style={({ pressed }) => [
                          styles.analysisModalPlanButton,
                          styles.analysisModalPlanButtonSecondary,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText weight="medium" color={colors.text.secondary}>
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
                          display="spinner"
                          themeVariant={colors.surface.canvas === "#161417" ? "dark" : "light"}
                          style={{ width: '100%', height: 216 }}
                          locale="ru-RU"
                          minimumDate={normalizePlanDate(new Date())}
                          maximumDate={latestUpcomingPlanDate()}
                          accentColor={colors.brand.primary}
                          onChange={(_event, date) => {
                            if (date) setScheduleDate(normalizePlanDate(date));
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
              </View>
            </View>
          ) : null}
        </ScrollView>

        {pendingAttachment ? (
          <View style={[styles.analysisModalFooter, { paddingBottom: 8 }]}>
            <Pressable
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Сохранить результат"
              testID="e2e-analysis-save"
              disabled={readOnly || saving || attachmentPicking}
              onPress={() => void saveAnalysisAttachment()}
              style={({ pressed }) => [
                styles.analysisModalPrimaryAction,
                pressed && styles.pressed,
                (readOnly || saving || attachmentPicking) && {
                  opacity: 0.5,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <AppText weight="medium" color={colors.text.inverse}>
                  Сохранить результат
                </AppText>
              )}
            </Pressable>
          </View>
        ) : null}
      </AppSheet>

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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  emptyTitle: {
    color: emptyStateColor,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
  },
  emptyPlanTitle: {
    color: emptyStateColor,
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 26,
  },
  emptyDescription: {
    color: emptyStateColor,
    marginTop: spacing.xs,
    maxWidth: 310,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 23,
  },
  emptySpinner: { marginBottom: spacing.sm },
  emptySettingsButton: {
    marginTop: spacing.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.rose : '#FBE7F0',
    paddingHorizontal: spacing.lg,
  },
  analysisModalPageScroll: { flexShrink: 1 },
  analysisModalPageContent: { paddingHorizontal: 20, paddingTop: 8 },
  analysisModalSheet: { width: '100%' },
  analysisModalHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 20,
    paddingRight: 4,
  },
  analysisModalImageWrap: { width: 60, height: 60, flexShrink: 0 },
  analysisModalNoImage: {
    width: 92,
    height: 92,
    flexShrink: 0,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.rose : '#FFF0F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(234,64,135,0.18)',
  },
  analysisModalNoImageText: {
    fontSize: 34,
    lineHeight: 38,
  },
  analysisModalImage: {
    width: '100%',
    height: '100%',
  },
  analysisModalHeroCopy: {
    minWidth: 0,
    flex: 1,
  },
  analysisModalTitle: {
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.55,
  },
  analysisModalDates: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 12,
    backgroundColor: colors.surface.raised,
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
  analysisModalSections: { paddingTop: 14, gap: 14 },
  analysisModalSection: { gap: 10 },
  analysisModalInfoCard: {
    gap: 6,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surface.raised,
  },
  analysisModalInfoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface.divider,
    marginVertical: 8,
  },
  analysisModalFooter: {
    paddingTop: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.surface.canvas,
  },
  analysisModalPrimaryAction: { ...sheetStyles.primary },
  analysisModalBodyText: {
    fontSize: 16,
    lineHeight: 22,
  },
  analysisModalPlanActions: { gap: 8 },
  analysisModalPlanButton: { ...sheetStyles.secondary, backgroundColor: colors.surface.divider },
  analysisModalPlanButtonSecondary: { backgroundColor: colors.surface.raised },
  analysisModalSchedulePicker: {
    width: '100%',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(33,31,32,0.10)',
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#F7F3F4',
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
  analysisModalAttachmentHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  analysisModalAttachmentCard: {
    gap: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surface.raised,
  },
  analysisModalAttachmentStatus: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
    height: 50,
    flexDirection: 'row',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    backgroundColor: colors.surface.canvas,
  },
  analysisModalAttachmentButtonLabel: {
    flexShrink: 1,
    fontSize: 14,
  },
  analysisModalError: {
    marginTop: -2,
    paddingHorizontal: 2,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
});

const styles = createStyles(defaultThemeColors);
