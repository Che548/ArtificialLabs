import { useDailySymptomsPrompt } from '../lib/daily-symptoms-prompt-context';
import SymptomsIcon from '../assets/today/planning-symptoms.svg';
import { ProfileAppearanceScope } from '../lib/profile-appearance';
import { LegalDocumentsButton } from '../components/LegalDocumentsModal';
import { ThemeStatusBar, useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { colors as defaultThemeColors } from '../design-system/tokens';
import { filterInput } from '../lib/input-format';
import { AppSheet, sheetStyles, useSheetStyles } from '../components/AppSheet';
import { ProfileCollapse } from '../components/ProfileMotion';
import { fontStyle } from '../lib/font-style';
import { FontLicenses } from '../components/FontLicenses';
import { useAuthActions } from '@convex-dev/auth/react';
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import {
  cacheDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import ProfileIcon02 from '../assets/profile/settings-icons/2.svg';
import ProfileIcon03 from '../assets/profile/settings-icons/3.svg';
import ProfileIcon04 from '../assets/profile/settings-icons/4.svg';
import ProfileIcon05 from '../assets/profile/settings-icons/5.svg';
import ProfileInterfaceIcon from '../assets/profile/settings-icons/interface.svg';
import ProfileIcon07 from '../assets/profile/settings-icons/7.svg';
import ProfileIcon08 from '../assets/profile/settings-icons/8.svg';
import ProfileIcon09 from '../assets/profile/settings-icons/9.svg';
import ProfileIcon10 from '../assets/profile/settings-icons/10.svg';
import ProfileIcon12 from '../assets/profile/settings-icons/12.svg';

import { PlanningTodayScreenCatalogPreview } from '../App';
import {
  AppText,
  colors,
  GlassControl,
  ProfileActionRow,
  ProfileAccountCard,
  ProfileChoiceControl,
  ProfileDateRow,
  ProfileEmptyMessage,
  ProfileEmptyState,
  ProfileFieldRow,
  ProfileLanguageSelector,
  OnboardingPreviewFlow,
  ProfileSettingsGroup,
  ProfileSettingsRow,
  ProfileToggleRow,
  ProfileVerticalChoiceControl,
  SegmentedSwitcher,
  profileTones,
  radii,
  sizes,
  spacing,
} from '../design-system';
import { api } from '../convex/_generated/api';
import { useHealthStore } from '../lib/health-store';
import { SyncConflictResolver } from '../components/SyncConflictResolver';
import { useNotificationManager } from '../lib/notification-manager';
import {
  createEntityCsv,
  createJsonArchive,
  parseImportPayload,
} from '../lib/data-transfer';
import {
  discardUnreferencedLabDocument,
  persistLabDocument,
} from '../lib/local-files';
import { ProfileDocumentsSection } from '../components/ProfileDocumentsSection';
import { clearPendingTelemetryEvents } from '../lib/local-database';
import { otpAutofillProps } from '../lib/otp-autofill';
import type { ServiceIssue } from '../lib/service-errors';
import { listenForSmsOtp, startSmsRetriever } from '../lib/sms-otp-retriever';
import type {
  AllergyRisk,
  HealthDocument,
  HealthEntityMap,
  HealthEntityName,
  HealthGoal,
  LocalProfile,
  MedicalCondition,
  Medication,
} from '../lib/health-types';
import type { NotificationTone } from '../shared/notification-copy';
import { DiagnosticsScreen } from '../components/DiagnosticsScreen';
import {
  AssistantDataDetails,
  PermissionAction,
  PermissionToggle,
  PermissionPrivacyDetails,
} from '../components/ProfilePermissionDetails';
import {
  ProfileAccountDetails,
  ProfileGoalSettings,
} from '../components/ProfileAccountDetails';
import { ProfileContacts } from '../components/ProfileContacts';
import { getAppVersionInfo } from '../lib/app-version';
import { registerDiagnosticsTap } from '../lib/diagnostics-access';
import { useUpdateManager } from '../lib/update-manager';
import { UpdateRequiredNotice } from '../components/UpdateRequiredNotice';

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

const e2eImportFixtureUri =
  __DEV__ && process.env.EXPO_PUBLIC_E2E_MODE === '1'
    ? Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_E2E_IMPORT_FIXTURE_IOS_URI
      : Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_E2E_IMPORT_FIXTURE_ANDROID_URI
        : undefined
    : undefined;

type ProfileSection =
  | 'account'
  | 'medical-history'
  | 'medications'
  | 'allergies'
  | 'documents'
  | 'language'
  | 'permissions'
  | 'data-transfer'
  | 'security'
  | 'interface'
  | 'notification-settings'
  | 'onboarding'
  | 'planning-today-ui-kit';

const SECTION_TITLES: Record<ProfileSection, string> = {
  account: 'Данные профиля',
  'medical-history': 'Медицинская история',
  medications: 'Препараты',
  allergies: 'Аллергии и риски',
  documents: 'Документы',
  language: 'Язык и регион',
  permissions: 'Разрешения и данные',
  'data-transfer': 'Импорт и экспорт',
  security: 'Аккаунт и безопасность',
  'notification-settings': 'Настройки уведомлений',
  interface: 'Интерфейс',
  onboarding: 'Онбординг',
  'planning-today-ui-kit': 'Сегодня · Планирование',
};

function formatDate(timestamp?: number) {
  if (!timestamp) return 'Не указано';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function goalLabel(goal?: HealthGoal) {
  if (goal === 'pregnancy') return 'Беременность';
  if (goal === 'cycle') return 'Мониторинг';
  return 'Планирование';
}

function ProfileHistoryBackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Path
        d="M13.5 5.5 8 11l5.5 5.5"
        fill="none"
        stroke="#EA4087"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ProfileScreen() {
  return <ProfileAppearanceScope><ProfileContent /></ProfileAppearanceScope>;
}

function ProfileContent() {
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { panel, sourceId } = useLocalSearchParams<{
    panel?: string;
    sourceId?: string;
  }>();
  const { width: windowWidth } = useWindowDimensions();
  const { signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const setAiChatEnabled = useMutation(api.chat.setEnabled);
  const [aiChatSaving, setAiChatSaving] = useState(false);
  const revokeAiAgentConsent = useMutation(api.chat.revokeAgentConsent);
  const setRemoteAgentAutomation = useMutation(api.agent.setAutomation);
  const clearRemoteAgentData = useMutation(api.agent.clearMyData);
  const setAnalyticsConsent = useMutation(api.telemetry.setConsent);
  const notificationManager = useNotificationManager();
  const updateManager = useUpdateManager();
  const {
    accountDeletion,
    allergyRisks,
    cloudSyncEnabled,
    cloudProfileReady,
    hasLocalAuthSession,
    clearAllLocalData,
    clearAgentData,
    deleteRecord,
    documents,
    labResults,
    medicalConditions,
    medications,
    preferences,
    profile,
    readOnly,
    requestAccountDeletion,
    serviceIssue,
    saveAllergyRisk,
    saveDocument,
    saveMedicalCondition,
    saveMedication,
    savePreferences,
    setCloudSyncEnabled,
    syncNow,
    syncStatus,
    updateProfile,
    viewerEmail,
    viewerPhone,
  } = useHealthStore();
  const aiChatStatus = useQuery(api.chat.status, isAuthenticated ? {} : 'skip');
  const aiAgentStatus = useQuery(
    api.agent.status,
    isAuthenticated && cloudProfileReady ? {} : 'skip',
  );
  const [activeSection, setActiveSection] = useState<ProfileSection | null>(
    null,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [journalNotifications, setJournalNotifications] = useState(true);
  const [resultNotifications, setResultNotifications] = useState(true);
  const [notificationTone, setNotificationTone] = useState<'formal' | 'cute'>(
    'formal',
  );
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [medicalRecommendations, setMedicalRecommendations] = useState(false);
  const [agentNotifications, setAgentNotifications] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>();
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const footerTaps = useRef<number[]>([]);
  const [reducePageMotion, setReducePageMotion] = useState(false);
  const sectionProgress = useRef(new Animated.Value(0)).current;
  const signOutInFlight = useRef(false);

  const signOutSafely = async () => {
    if (signOutInFlight.current) return;
    signOutInFlight.current = true;
    try {
      // Leave the native profile tab before auth removes the entire tab tree.
      // Await token deletion so a native SecureStore failure is handled instead
      // of becoming an unhandled rejection on the next activation.
      router.replace('/');
      await signOut();
    } catch (error) {
      console.error('Signing out failed', error);
      Alert.alert(
        'Не удалось выйти',
        'Защищённое хранилище недоступно. Разблокируйте устройство и попробуйте ещё раз.',
      );
    } finally {
      signOutInFlight.current = false;
    }
  };

  useEffect(() => {
    if (panel === 'interface') setActiveSection('interface');
    else if (panel === 'delete-account') setActiveSection('security');
    else if (panel === 'imports' || panel === 'exports')
      setActiveSection('data-transfer');
    else if (panel === 'personal') setActiveSection('account');
    else if (panel && panel in SECTION_TITLES)
      setActiveSection(panel as ProfileSection);
  }, [panel]);

  useEffect(() => {
    const stored = preferences.find((item) => !item.deletedAt);
    if (!stored) return;
    setNotificationsEnabled(stored.notificationsEnabled);
    setJournalNotifications(stored.journalNotifications);
    setResultNotifications(stored.resultNotifications);
    setNotificationTone(stored.notificationTone ?? 'formal');
    setAnalyticsEnabled(stored.anonymousAnalytics);
    setMedicalRecommendations(stored.medicalRecommendations);
    setAgentNotifications(stored.agentNotifications ?? false);
  }, [preferences]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducePageMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducePageMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!activeSection) return undefined;

    sectionProgress.stopAnimation();
    if (reducePageMotion) {
      sectionProgress.setValue(1);
      return undefined;
    }

    sectionProgress.setValue(0);
    const frame = requestAnimationFrame(() => {
      Animated.timing(sectionProgress, {
        toValue: 1,
        duration: 280,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
        useNativeDriver: true,
      }).start();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeSection, reducePageMotion, sectionProgress]);

  const visibleDocuments = documents
    .filter((item) => !item.deletedAt)
    .sort((left, right) =>
      left.localId === sourceId ? -1 : right.localId === sourceId ? 1 : 0,
    );
  const documentCount = Math.max(
    visibleDocuments.length,
    labResults.filter(
      (result) => !result.deletedAt && result.hasLocalSourceDocument,
    ).length,
  );
  const displayName =
    profile?.displayName?.trim() || viewerEmail?.split('@')[0] || 'Профиль';
  const hasViewerIdentity = Boolean(
    viewerEmail || viewerPhone || hasLocalAuthSession,
  );

  const synchronize = async () => {
    setSyncMessage(undefined);
    if (await syncNow()) {
      setSyncMessage('Данные синхронизированы');
    } else {
      setSyncMessage('Не удалось синхронизировать данные');
    }
  };

  const handleVersionPress = () => {
    const result = registerDiagnosticsTap(footerTaps.current, Date.now());
    footerTaps.current = result.taps;
    if (result.shouldOpen) {
      setDiagnosticsVisible(true);
    }
  };

  const changeAiChatEnabled = async (enabled: boolean) => {
    if (aiChatSaving) return;
    setAiChatSaving(true);
    try {
      await setAiChatEnabled({ enabled });
    } catch {
      Alert.alert(
        'Не удалось изменить настройку ИИ-чата',
        'Проверьте подключение и попробуйте ещё раз.',
      );
    } finally {
      setAiChatSaving(false);
    }
  };

  const confirmAgentConsentRevocation = () => {
    if (!aiAgentStatus?.consentAccepted) return;
    Alert.alert(
      'Отключить Ассистента?',
      'Доступ к данным здоровья будет отозван, а автономные проверки приостановлены. Локальный план останется видимым.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отключить',
          style: 'destructive',
          onPress: () => {
            void savePreferences({
              medicalRecommendations: false,
              agentNotifications: false,
              agentLastSuccessfulRunAt: undefined,
            })
              .then(() => revokeAiAgentConsent({}))
              .catch((error) => {
                console.error('Revoking AI agent consent failed', error);
                Alert.alert(
                  'Не удалось отключить Ассистента',
                  'Проверьте подключение и попробуйте ещё раз.',
                );
              });
          },
        },
      ],
    );
  };

  const confirmAgentDataDeletion = () => {
    Alert.alert(
      'Удалить данные Ассистента?',
      'План, автономные правила и история их изменений будут удалены. Дневник, анализы, документы и чаты останутся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            void clearRemoteAgentData({})
              .then(clearAgentData)
              .catch((error) => {
                console.error('Clearing AI agent data failed', error);
                Alert.alert(
                  'Не удалось удалить данные Ассистента',
                  'Проверьте подключение и попробуйте ещё раз.',
                );
              });
          },
        },
      ],
    );
  };

  const updateAgentAutomation = async (enabled: boolean) => {
    try {
      if (enabled) {
        await setRemoteAgentAutomation({ enabled: true });
        await savePreferences({ medicalRecommendations: true });
      } else {
        await savePreferences({
          medicalRecommendations: false,
          agentNotifications: false,
        });
        await setRemoteAgentAutomation({ enabled: false });
        setAgentNotifications(false);
      }
      setMedicalRecommendations(enabled);
    } catch (error) {
      console.error('Updating AI agent automation failed', error);
      Alert.alert(
        'Не удалось изменить автономные рекомендации',
        'Проверьте подключение и попробуйте ещё раз.',
      );
    }
  };

  const openSection = (section: ProfileSection) => {
    setActiveSection(section);
  };

  const addDocumentFromPicker = async () => {
    if (readOnly) return;
    const picked = e2eDocumentFixtureUri
      ? undefined
      : await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
          type: ['application/pdf', 'image/jpeg', 'image/png'],
        });
    const asset = e2eDocumentFixtureUri
      ? {
          uri: e2eDocumentFixtureUri,
          name: 'e2e-medical-document.jpg',
          mimeType: 'image/jpeg',
          size: undefined,
        }
      : picked?.canceled
        ? undefined
        : picked?.assets[0];
    if (!asset) return;
    const localFileUri = await persistLabDocument(asset.uri);
    try {
      await saveDocument({
        title: asset.name,
        category: 'medical',
        documentDate: Date.now(),
        hasLocalFile: true,
        localFileUri,
        mimeType: asset.mimeType ?? undefined,
        size: asset.size,
      });
    } catch (cause) {
      await discardUnreferencedLabDocument(localFileUri);
      throw cause;
    }
  };

  const closeSection = () => {
    sectionProgress.stopAnimation();

    if (reducePageMotion) {
      sectionProgress.setValue(0);
      setActiveSection(null);
      return;
    }

    Animated.timing(sectionProgress, {
      toValue: 0,
      duration: 240,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setActiveSection(null);
    });
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar hidden={false} />
      <Animated.View
        pointerEvents={activeSection ? 'none' : 'auto'}
        style={[
          styles.profilePage,
          {
            opacity: sectionProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.94],
            }),
            transform: [
              {
                translateX: sectionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -windowWidth * 0.22],
                }),
              },
            ],
          },
        ]}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 20,
              paddingBottom: Math.max(insets.bottom + 112, 128),
            },
          ]}
        >
          <ProfileAccountCard
            name={displayName}
            subtitle={goalLabel(profile?.goal)}
            onPress={() => openSection('account')}
          />

          {profile ? (
            <ProfileGoalSettings
              profile={profile}
              readOnly={readOnly}
              saveProfile={updateProfile}
            />
          ) : null}
          <ProfileOverview
            allergyCount={allergyRisks.filter((item) => !item.deletedAt).length}
            conditionCount={
              medicalConditions.filter((item) => !item.deletedAt).length
            }
            documentCount={documentCount}
            medicationCount={
              medications.filter((item) => !item.deletedAt).length
            }
            onOpen={openSection}
          />
          <LegalDocumentsButton />
          <ProfileVersionFooter
            onPress={handleVersionPress}
            updateCreatedAt={updateManager.currentUpdateCreatedAt}
            updateId={updateManager.currentUpdateId}
          />
          <FontLicenses />
        </ScrollView>
      </Animated.View>

      {activeSection && activeSection !== 'onboarding' ? (
        <Animated.View
          style={[
            styles.detailPage,
            {
              transform: [
                {
                  translateX: sectionProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [windowWidth, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {activeSection === 'planning-today-ui-kit' ? (
            <ProfileDetailScreen
              bottomInset={insets.bottom}
              title={SECTION_TITLES[activeSection]}
              topInset={insets.top}
              onBack={closeSection}
            >
              <PlanningTodayProfileKitPreview />
            </ProfileDetailScreen>
          ) : (
            <ProfileDetailScreen
              bottomInset={insets.bottom}
              compactBottom={
                activeSection === 'medical-history' ||
                activeSection === 'medications' ||
                activeSection === 'allergies'
              }
              title={SECTION_TITLES[activeSection]}
              topInset={insets.top}
              onBack={closeSection}
            >
              {<ProfileSectionContent {...{
                aiChatEnabled: aiChatStatus?.userEnabled === true,
                aiChatUnavailable: !aiChatStatus || aiChatSaving,
                agentConsentAccepted: aiAgentStatus?.consentAccepted === true,
                agentEnabled: aiAgentStatus?.enabled === true,
                agentAutomationEnabled:
                  aiAgentStatus?.automationEnabled === true,
                agentProviderConfigured:
                  aiAgentStatus?.providerConfigured === true,
                agentAutomationAccepted:
                  aiAgentStatus?.automationAccepted === true,
                agentLastSuccessfulRunAt: preferences.find(
                  (item) => !item.deletedAt,
                )?.agentLastSuccessfulRunAt,
                agentNotifications,
                analyticsEnabled,
                setAnalyticsConsent: async (enabled) => {
                  if (!isAuthenticated) return;
                  await setAnalyticsConsent({ enabled });
                },
                documentCount,
                documents: visibleDocuments,
                sourceDocumentId: sourceId,
                allergyRisks: allergyRisks.filter((item) => !item.deletedAt),
                cloudSyncEnabled,
                clearAllLocalData,
                deleteRecord,
                medicalConditions: medicalConditions.filter(
                  (item) => !item.deletedAt,
                ),
                medications: medications.filter((item) => !item.deletedAt),
                medicalRecommendations,
                journalNotifications,
                notificationsEnabled,
                notificationBusy: notificationManager.busy,
                notificationMessage: notificationManager.message,
                notificationTone,
                openSystemSettings: () => void Linking.openSettings(),
                profile,
                readOnly,
                resultNotifications,
                section: activeSection,
                saveProfile: updateProfile,
                saveAllergyRisk,
                saveDocumentFromPicker: addDocumentFromPicker,
                saveMedicalCondition,
                saveMedication,
                savePreferences,
                saveAgentAutomation: updateAgentAutomation,
                setCloudSyncEnabled,
                setAnalyticsEnabled,
                setJournalNotifications,
                setMedicalRecommendations,
                setAgentNotifications,
                setNotificationsEnabled,
                setNotificationPermission: notificationManager.setEnabled,
                setNotificationTone,
                setResultNotifications,
                sendTestNotification: notificationManager.sendTest,
                signOut: () => void signOutSafely(),
                requestAccountDeletion,
                serviceIssue,
                changeAiChatEnabled,
                revokeAgentConsent: confirmAgentConsentRevocation,
                clearAgentData: confirmAgentDataDeletion,
                syncMessage,
                syncNow: () => void synchronize(),
                syncDisabled:
                  !hasViewerIdentity ||
                  !cloudSyncEnabled ||
                  accountDeletion.pendingDeletion,
                syncStatus,
                viewerEmail,
                viewerPhone,
              }} />}
            </ProfileDetailScreen>
          )}
        </Animated.View>
      ) : null}

      <Modal
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        visible={activeSection === 'onboarding'}
        onRequestClose={closeSection}
      >
        <OnboardingPreviewFlow onClose={closeSection} />
      </Modal>

      <DiagnosticsScreen
        visible={diagnosticsVisible}
        onClose={() => setDiagnosticsVisible(false)}
      />
    </View>
  );
}

function ProfileVersionFooter({
  onPress,
  updateCreatedAt,
  updateId,
}: {
  onPress: () => void;
  updateCreatedAt?: number;
  updateId?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const version = getAppVersionInfo({ updateCreatedAt, updateId });
  return (
    <Pressable
      accessibilityHint="Сведения о версии приложения"
      accessibilityLabel="Версия приложения"
      accessibilityRole="button"
      onPress={onPress}
      style={styles.versionFooter}
      testID="app-version-footer"
    >
      <AppText role="caption" color={colors.text.secondary}>
        {`v${version.appVersion} (${version.buildNumber}) · ${version.gitCommit} · ${version.updateId}`}
      </AppText>
    </Pressable>
  );
}

function ProfileOverview({
  allergyCount,
  conditionCount,
  documentCount,
  medicationCount,
  onOpen,
}: {
  allergyCount: number;
  conditionCount: number;
  documentCount: number;
  medicationCount: number;
  onOpen: (section: ProfileSection) => void;
}) {
  const openSymptomsPrompt = useDailySymptomsPrompt();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.overview}>
      <ProfileSettingsGroup title="Профиль здоровья">
        <ProfileSettingsRow
          icon="heart.fill"
          iconAsset={SymptomsIcon}
          fallback="С"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Отметить симптомы"
          onPress={openSymptomsPrompt}
        />
        <ProfileSettingsRow
          icon="cross.case.fill"
          iconAsset={ProfileIcon02}
          fallback="М"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Медицинская история"
          value={conditionCount ? String(conditionCount) : 'Не заполнено'}
          onPress={() => onOpen('medical-history')}
        />
        <ProfileSettingsRow
          icon="pills.fill"
          iconAsset={ProfileIcon03}
          fallback="П"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Препараты"
          value={medicationCount ? String(medicationCount) : 'Нет активных'}
          onPress={() => onOpen('medications')}
        />
        <ProfileSettingsRow
          icon="exclamationmark.shield.fill"
          iconAsset={ProfileIcon04}
          fallback="!"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Аллергии и риски"
          value={allergyCount ? String(allergyCount) : 'Не заполнено'}
          onPress={() => onOpen('allergies')}
        />
        <ProfileSettingsRow
          icon="doc.text.fill"
          iconAsset={ProfileIcon05}
          fallback="Д"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Документы"
          value={documentCount ? String(documentCount) : 'Нет документов'}
          isLast
          onPress={() => onOpen('documents')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Настройки">
        <ProfileSettingsRow
          icon="circle.lefthalf.filled"
          iconAsset={ProfileInterfaceIcon}
          fallback="◐"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Интерфейс"
          onPress={() => onOpen('interface')}
        />
        <ProfileSettingsRow
          icon="globe.europe.africa.fill"
          iconAsset={ProfileIcon07}
          fallback="RU"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Язык и регион"
          value="Русский"
          onPress={() => onOpen('language')}
        />
        <ProfileSettingsRow
          icon="hand.raised.fill"
          iconAsset={ProfileIcon08}
          fallback="Д"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Разрешения и данные"
          onPress={() => onOpen('permissions')}
        />
        <ProfileSettingsRow
          icon="bell.fill"
          iconAsset={ProfileIcon09}
          fallback="У"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Настройки уведомлений"
          onPress={() => onOpen('notification-settings')}
        />
        <ProfileSettingsRow
          icon="square.and.arrow.down.fill"
          iconAsset={ProfileIcon10}
          fallback="И"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Импорт и экспорт"
          isLast
          onPress={() => onOpen('data-transfer')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Аккаунт">
        <ProfileSettingsRow
          icon="lock.shield.fill"
          iconAsset={ProfileIcon12}
          fallback="Б"
          iconBackground={profileTones.account.tile}
          iconColor={profileTones.account.glyph}
          label="Аккаунт и безопасность"
          isLast
          onPress={() => onOpen('security')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Разработка">
        <ProfileSettingsRow
          icon="sparkles.rectangle.stack.fill"
          fallback="ОБ"
          iconBackground="#F4E7EB"
          iconColor={colors.brand.primary}
          label="Онбординг"
          value="5 вариантов"
          isLast
          onPress={() => onOpen('onboarding')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Сохранённые экраны">
        <ProfileSettingsRow
          icon="heart.circle"
          fallback="ПЛ"
          iconBackground="#FFF0F4"
          iconColor={colors.brand.primary}
          label="Сегодня · Планирование"
          value="Вариант"
          isLast
          onPress={() => onOpen('planning-today-ui-kit')}
        />
      </ProfileSettingsGroup>
    </View>
  );
}

function PlanningTodayProfileKitPreview() {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { width } = useWindowDimensions();
  const previewWidth = Math.min(370, width - sizes.screenGutter * 2);
  const previewScale = previewWidth / 402;

  return (
    <View style={styles.todayKitSection}>
      <View style={styles.todayKitCopy}>
        <AppText role="heading" weight="semibold">
          Режим «Планирование»
        </AppText>
        <AppText role="body" color={colors.text.secondary}>
          Прогноз фертильного окна, лучшие дни для зачатия и быстрые отметки
          цикла. Кнопки внутри образца работают.
        </AppText>
      </View>
      <View
        style={[
          styles.todayKitStage,
          { width: previewWidth, height: 874 * previewScale },
        ]}
      >
        <View
          style={[
            styles.todayKitCanvas,
            { transform: [{ scale: previewScale }] },
          ]}
        >
          <PlanningTodayScreenCatalogPreview />
        </View>
      </View>
    </View>
  );
}

const notificationCuteIcon = require('../assets/profile/notification-tones/cute-icon.png');
const notificationFormalIcon = require('../assets/profile/notification-tones/formal-icon.png');

const notificationTonePreviewCopy: Record<
  NotificationTone,
  { title: string; body: string }
> = {
  formal: {
    title: 'Добрый день',
    body: 'Как вы сегодня?',
  },
  cute: {
    title: 'Привет!',
    body: 'Как ты сегодня? 🌸',
  },
};

function NotificationTonePreview({ tone }: { tone: NotificationTone }) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const toneProgress = useRef(
    new Animated.Value(tone === 'cute' ? 1 : 0),
  ).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    toneProgress.stopAnimation();
    const nextValue = tone === 'cute' ? 1 : 0;

    if (reduceMotion) {
      toneProgress.setValue(nextValue);
      return undefined;
    }

    const animation = Animated.timing(toneProgress, {
      toValue: nextValue,
      duration: 260,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, tone, toneProgress]);

  const formalOpacity = toneProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const cuteOpacity = toneProgress;
  const formalTranslateY = toneProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  });
  const cuteTranslateY = toneProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 0],
  });

  return (
    <View style={styles.notificationTonePreview}>
      <View
        accessible
        accessibilityLabel={`${notificationTonePreviewCopy[tone].title}. ${notificationTonePreviewCopy[tone].body}`}
        style={styles.notificationExampleCard}
      >
        <View style={styles.notificationExampleBody}>
          <View style={styles.notificationExampleIconFrame}>
            <Animated.Image
              accessible={false}
              resizeMode="contain"
              source={notificationFormalIcon}
              style={[
                styles.notificationExampleIconImage,
                { opacity: formalOpacity },
              ]}
            />
            <Animated.Image
              accessible={false}
              resizeMode="contain"
              source={notificationCuteIcon}
              style={[
                styles.notificationExampleIconImage,
                { opacity: cuteOpacity },
              ]}
            />
          </View>
          <View style={styles.notificationExampleTextStack}>
            <Animated.View
              aria-hidden={tone !== 'formal'}
              accessibilityElementsHidden={tone !== 'formal'}
              importantForAccessibility={
                tone === 'formal' ? 'auto' : 'no-hide-descendants'
              }
              pointerEvents="none"
              style={[
                styles.notificationExampleCopy,
                {
                  opacity: formalOpacity,
                  transform: [{ translateY: formalTranslateY }],
                },
              ]}
            >
              <AppText role="label" weight="semibold">
                {notificationTonePreviewCopy.formal.title}
              </AppText>
              <AppText
                numberOfLines={1}
                role="body"
                color={colors.text.secondary}
                style={styles.notificationExampleDescription}
              >
                {notificationTonePreviewCopy.formal.body}
              </AppText>
            </Animated.View>
            <Animated.View
              aria-hidden={tone !== 'cute'}
              accessibilityElementsHidden={tone !== 'cute'}
              importantForAccessibility={
                tone === 'cute' ? 'auto' : 'no-hide-descendants'
              }
              pointerEvents="none"
              style={[
                styles.notificationExampleCopyOverlay,
                {
                  opacity: cuteOpacity,
                  transform: [{ translateY: cuteTranslateY }],
                },
              ]}
            >
              <AppText role="label" weight="semibold">
                {notificationTonePreviewCopy.cute.title}
              </AppText>
              <AppText
                numberOfLines={1}
                role="body"
                color={colors.text.secondary}
                style={styles.notificationExampleDescription}
              >
                {notificationTonePreviewCopy.cute.body}
              </AppText>
            </Animated.View>
          </View>
          <AppText
            role="caption"
            color={colors.text.secondary}
            style={styles.notificationExampleTime}
          >
            сейчас
          </AppText>
        </View>
      </View>
    </View>
  );
}

function ProfileDetailScreen({
  bottomInset,
  children,
  compactBottom = false,
  onBack,
  title,
  topInset,
}: {
  bottomInset: number;
  children: ReactNode;
  compactBottom?: boolean;
  onBack: () => void;
  title: string;
  topInset: number;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { mode } = useAppTheme();
  return (
    <View style={styles.root}>
      <ThemeStatusBar hidden={false} />
      <View
        style={[
          styles.detailHeader,
          { paddingTop: topInset + 8 },
          styles.detailHeaderWithFade,
        ]}
      >
        <View pointerEvents="none" style={styles.detailHeaderOpaque} />
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},1)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.972)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.896)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.784)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.648)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.5)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.352)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.216)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.104)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0.028)`,
            `rgba(${mode === 'dark' ? '22,20,23' : '245,243,243'},0)`,
          ]}
          locations={[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]}
          style={styles.detailHeaderFade}
        />
        <GlassControl
          accessibilityLabel="Вернуться в профиль"
          onPress={onBack}
          style={styles.backButton}
        >
          <ProfileHistoryBackIcon />
        </GlassControl>
        <AppText
          role="heading"
          weight="semibold"
          numberOfLines={1}
          style={styles.detailHeaderTitle}
        >
          {title}
        </AppText>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.detailContent,
          {
            paddingTop: topInset + 84,
            paddingBottom: compactBottom
              ? Math.max(bottomInset + 64, 80)
              : Math.max(bottomInset + 112, 128),
          },
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function PhoneVerificationRow({
  disabled,
  onVerified,
  phone,
}: {
  disabled: boolean;
  onVerified: (phone: string) => Promise<void>;
  phone?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { signIn } = useAuthActions();
  const getSmsStatus = useAction(api.smsAuth.status);
  const prepareSmsDelivery = useAction(api.smsAuth.prepareDelivery);
  const [input, setInput] = useState('+7');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [retryAt, setRetryAt] = useState<number>();
  const [clock, setClock] = useState(Date.now());
  const codeInputRef = useRef<TextInput>(null);
  const phoneRequestLock = useRef(false);

  useEffect(() => {
    if (!retryAt || retryAt <= Date.now()) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    if (step !== 'code' || busy) return undefined;
    const frame = requestAnimationFrame(() => codeInputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [busy, step]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = listenForSmsOtp((nextCode) => {
      setCode(nextCode);
      setStep('code');
    });
    return () => subscription?.remove();
  }, []);

  if (phone) {
    return (
      <ProfileFieldRow
        label="Телефон"
        inputMode="tel"
        defaultValue={phone}
        disabled
        isLast
      />
    );
  }

  const normalized = input.replace(/[^\d+]/g, '').slice(0, 12);
  const verifiedValue = (() => {
    const digits = normalized.replace(/\D/g, '');
    if (digits.length === 10 && digits[0] === '9') return `+7${digits}`;
    return digits.length === 11 && (digits[0] === '7' || digits[0] === '8')
      ? `+7${digits.slice(1)}`
      : normalized;
  })();
  const validPhone = /^\+79\d{9}$/.test(verifiedValue);
  const requestCode = async () => {
    if (phoneRequestLock.current || busy || disabled) return;
    if (!validPhone) {
      setMessage('Введите российский номер: +7 и ещё 10 цифр.');
      return;
    }
    Keyboard.dismiss();
    phoneRequestLock.current = true;
    setBusy(true);
    setMessage(undefined);
    setCode('');
    try {
      await startSmsRetriever();
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        await prepareSmsDelivery({
          phone: verifiedValue,
          platform: Platform.OS,
        });
      }
      const form = new FormData();
      form.append('phone', verifiedValue);
      await signIn('phone', form);
      const status = await getSmsStatus({ phone: verifiedValue });
      setRetryAt(status.retryAt ?? Date.now() + 5 * 60 * 1000);
      setStep('code');
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      setMessage(
        raw.includes('SMS_RATE_LIMITED')
          ? 'Лимит SMS на сегодня исчерпан.'
          : raw.includes('SMS_COOLDOWN')
            ? 'Повторная отправка пока недоступна.'
            : 'SMS временно недоступны. Попробуйте позже.',
      );
    } finally {
      phoneRequestLock.current = false;
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (phoneRequestLock.current || busy || !/^\d{6}$/.test(code)) return;
    phoneRequestLock.current = true;
    Keyboard.dismiss();
    setBusy(true);
    setMessage(undefined);
    try {
      const form = new FormData();
      form.append('phone', verifiedValue);
      form.append('code', code);
      await signIn('phone', form);
      await onVerified(verifiedValue);
      setMessage('Телефон подтверждён.');
    } catch {
      setMessage('Код неверный или истёк. Запросите новый код.');
    } finally {
      phoneRequestLock.current = false;
      setBusy(false);
    }
  };

  const actionDisabled =
    busy || disabled || (step === 'code' && !/^\d{6}$/.test(code));
  const actionButton = (
    <Pressable
      cssInterop={false}
      accessibilityRole="button"
      disabled={actionDisabled}
      onPress={() => void (step === 'phone' ? requestCode() : verifyCode())}
      style={({ pressed }) => [
        actionDisabled && styles.phoneVerificationButtonDisabled,
        pressed && !actionDisabled && styles.controlPressed,
      ]}
    >
      <View style={styles.phoneVerificationButton} pointerEvents="none">
        <AppText
          numberOfLines={1}
          role="label"
          color={colors.text.inverse}
          weight="semibold"
          style={
            Platform.OS === 'android'
              ? styles.phoneVerificationButtonText
              : undefined
          }
        >
          {busy
            ? 'Подождите…'
            : step === 'phone'
              ? 'Получить код'
              : 'Подтвердить'}
        </AppText>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.phoneVerificationRow}>
      <View style={styles.phoneVerificationInputRow}>
        <TextInput
          accessibilityLabel="Российский номер телефона"
          testID="contact-phone-input"
          editable={!disabled && !busy && step === 'phone'}
          inputMode="tel"
          keyboardType="phone-pad"
          onChangeText={(value) =>
            setInput(filterInput(value, 'phone').slice(0, 12))
          }
          onSubmitEditing={() => void requestCode()}
          placeholder="+7 999 000-00-00"
          placeholderTextColor={colors.text.secondary}
          returnKeyType="send"
          style={[
            styles.phoneVerificationInput,
            styles.phoneVerificationInputFlex,
          ]}
          value={input}
        />
      </View>
      {step === 'code' ? (
        <View style={styles.phoneVerificationInputRow}>
          <TextInput
            ref={codeInputRef}
            accessibilityLabel="Код из SMS"
            testID="contact-phone-code"
            {...otpAutofillProps(Platform.OS)}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) =>
              setCode(value.replace(/\D/g, '').slice(0, 6))
            }
            onSubmitEditing={() => void verifyCode()}
            placeholder="000000"
            placeholderTextColor={colors.text.secondary}
            returnKeyType="done"
            style={[
              styles.phoneVerificationInput,
              styles.phoneVerificationInputFlex,
            ]}
            value={code}
          />
        </View>
      ) : null}
      {message ? (
        <AppText role="caption" color={colors.text.secondary}>
          {message}
        </AppText>
      ) : null}
      {actionButton}
      {step === 'code' ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy || Boolean(retryAt && retryAt > clock)}
          onPress={() => void requestCode()}
        >
          <AppText role="caption" color={colors.text.secondary}>
            {retryAt && retryAt > clock
              ? `Повторно через ${Math.ceil((retryAt - clock) / 1000)} сек.`
              : 'Запросить снова'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ProfileSectionContent({
  aiChatEnabled,
  aiChatUnavailable,
  agentAutomationAccepted,
  agentAutomationEnabled,
  agentProviderConfigured,
  agentConsentAccepted,
  agentEnabled,
  agentLastSuccessfulRunAt,
  agentNotifications,
  analyticsEnabled,
  allergyRisks,
  cloudSyncEnabled,
  clearAgentData,
  clearAllLocalData,
  deleteRecord,
  documentCount,
  documents,
  sourceDocumentId,
  journalNotifications,
  medicalConditions,
  medications,
  medicalRecommendations,
  notificationsEnabled,
  notificationBusy,
  notificationMessage,
  notificationTone,
  openSystemSettings,
  profile,
  readOnly,
  resultNotifications,
  requestAccountDeletion,
  serviceIssue,
  changeAiChatEnabled,
  revokeAgentConsent,
  saveAllergyRisk,
  saveDocumentFromPicker,
  saveMedicalCondition,
  saveMedication,
  savePreferences,
  setAnalyticsConsent,
  saveAgentAutomation,
  saveProfile,
  section,
  setCloudSyncEnabled,
  setAnalyticsEnabled,
  setJournalNotifications,
  setMedicalRecommendations,
  setAgentNotifications,
  setNotificationsEnabled,
  setNotificationPermission,
  setNotificationTone,
  setResultNotifications,
  sendTestNotification,
  signOut,
  syncMessage,
  syncNow,
  syncDisabled,
  syncStatus,
  viewerEmail,
  viewerPhone,
}: {
  aiChatEnabled: boolean;
  aiChatUnavailable: boolean;
  agentAutomationAccepted: boolean;
  agentAutomationEnabled: boolean;
  agentProviderConfigured: boolean;
  agentConsentAccepted: boolean;
  agentEnabled: boolean;
  agentLastSuccessfulRunAt?: number;
  agentNotifications: boolean;
  analyticsEnabled: boolean;
  allergyRisks: AllergyRisk[];
  cloudSyncEnabled: boolean;
  clearAgentData: () => void;
  clearAllLocalData: () => Promise<void>;
  deleteRecord: <K extends HealthEntityName>(
    entity: K,
    item: HealthEntityMap[K],
  ) => Promise<void>;
  documentCount: number;
  documents: HealthDocument[];
  sourceDocumentId?: string;
  journalNotifications: boolean;
  medicalConditions: MedicalCondition[];
  medications: Medication[];
  medicalRecommendations: boolean;
  notificationsEnabled: boolean;
  notificationBusy: boolean;
  notificationMessage?: string;
  notificationTone: 'formal' | 'cute';
  openSystemSettings: () => void;
  profile: LocalProfile | null;
  readOnly: boolean;
  resultNotifications: boolean;
  requestAccountDeletion: () => Promise<boolean>;
  serviceIssue?: ServiceIssue;
  changeAiChatEnabled: (enabled: boolean) => Promise<void>;
  revokeAgentConsent: () => void;
  saveAllergyRisk: (
    input: Omit<AllergyRisk, 'localId' | 'updatedAt'> & { localId?: string },
  ) => Promise<void>;
  saveDocumentFromPicker: () => Promise<void>;
  saveMedicalCondition: (
    input: Omit<MedicalCondition, 'localId' | 'updatedAt'> & {
      localId?: string;
    },
  ) => Promise<void>;
  saveMedication: (
    input: Omit<Medication, 'localId' | 'updatedAt'> & { localId?: string },
  ) => Promise<void>;
  savePreferences: (input: {
    anonymousAnalytics?: boolean;
    medicalRecommendations?: boolean;
    agentNotifications?: boolean;
    agentLastSuccessfulRunAt?: number;
    notificationsEnabled?: boolean;
    journalNotifications?: boolean;
    resultNotifications?: boolean;
    notificationTone?: 'formal' | 'cute';
  }) => Promise<void>;
  setAnalyticsConsent: (enabled: boolean) => Promise<void>;
  saveAgentAutomation: (enabled: boolean) => Promise<void>;
  saveProfile: (
    input: Partial<Omit<LocalProfile, 'updatedAt'>>,
  ) => Promise<void>;
  section: ProfileSection;
  setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  setAnalyticsEnabled: (value: boolean) => void;
  setJournalNotifications: (value: boolean) => void;
  setMedicalRecommendations: (value: boolean) => void;
  setAgentNotifications: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setNotificationPermission: (
    enabled: boolean,
  ) => Promise<'enabled' | 'local-only' | 'denied' | 'disabled'>;
  setNotificationTone: (value: 'formal' | 'cute') => void;
  setResultNotifications: (value: boolean) => void;
  sendTestNotification: (tone: 'formal' | 'cute') => Promise<boolean>;
  signOut: () => void;
  syncMessage?: string;
  syncNow: () => void;
  syncDisabled: boolean;
  syncStatus: 'idle' | 'syncing' | 'offline' | 'error';
  viewerEmail?: string;
  viewerPhone?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const hasViewerIdentity = Boolean(viewerEmail || viewerPhone);

  switch (section) {
    case 'account':
      return (
        <ProfileAccountDetails
          profile={profile}
          readOnly={readOnly}
          saveProfile={saveProfile}
        />
      );

    case 'medical-history':
      return (
        <MedicalCrudSection
          kind="condition"
          readOnly={readOnly}
          records={medicalConditions}
          onDelete={(item) => deleteRecord('medicalConditions', item)}
          onSave={saveMedicalCondition}
        />
      );

    case 'medications':
      return (
        <MedicalCrudSection
          kind="medication"
          readOnly={readOnly}
          records={medications}
          onDelete={(item) => deleteRecord('medications', item)}
          onSave={saveMedication}
        />
      );

    case 'allergies':
      return (
        <MedicalCrudSection
          kind="allergy"
          readOnly={readOnly}
          records={allergyRisks}
          onDelete={(item) => deleteRecord('allergyRisks', item)}
          onSave={saveAllergyRisk}
        />
      );

    case 'documents':
      return (
        <ProfileDocumentsSection
          documents={documents}
          sourceDocumentId={sourceDocumentId}
          readOnly={readOnly}
          onAdd={saveDocumentFromPicker}
          onDelete={(item) => deleteRecord('documents', item)}
        />
      );

    case 'language':
      return <ProfileLanguageSelector />;

    case 'permissions':
      return (
        <>
          <ProfileSettingsGroup title="Данные">
            <PermissionToggle
              label="Облачная синхронизация"
              subtitle={!hasViewerIdentity ? 'Войдите в аккаунт' : undefined}
              testID="e2e-cloud-sync-toggle"
              value={cloudSyncEnabled}
              disabled={readOnly || !hasViewerIdentity}
              onChange={(enabled) => void setCloudSyncEnabled(enabled)}
            />
            <PermissionToggle
              label="Анонимная аналитика"
              value={analyticsEnabled}
              disabled={readOnly}
              onChange={(value) => {
                setAnalyticsEnabled(value);
                void savePreferences({ anonymousAnalytics: value });
                if (!value) void clearPendingTelemetryEvents();
                void setAnalyticsConsent(value);
              }}
              isLast={!cloudSyncEnabled}
            />
            <ProfileCollapse open={cloudSyncEnabled}>
              <PermissionAction
                label={
                  syncStatus === 'syncing'
                    ? 'Синхронизация…'
                    : 'Синхронизировать сейчас'
                }
                subtitle={
                  syncStatus === 'offline'
                    ? 'Нет подключения'
                    : syncStatus === 'error'
                      ? 'Не удалось синхронизировать'
                      : undefined
                }
                testID="e2e-sync-now"
                disabled={
                  syncDisabled ||
                  syncStatus === 'syncing' ||
                  syncStatus === 'offline' ||
                  readOnly
                }
                onPress={syncNow}
                isLast
              />
              {serviceIssue?.kind === 'update-required' ? <UpdateRequiredNotice localChangesSaved /> : serviceIssue ? (
                <View accessibilityRole="alert">
                  <AppText style={styles.transferCaption} color={colors.text.secondary}>
                    {serviceIssue.message}
                  </AppText>
                </View>
              ) : null}
              <SyncConflictResolver />
            </ProfileCollapse>
          </ProfileSettingsGroup>

          <ProfileSettingsGroup title="Сферка и Ассистент">
            <PermissionToggle
              label="Ответы Сферки"
              subtitle={aiChatUnavailable ? 'Временно недоступно' : undefined}
              value={aiChatEnabled}
              disabled={readOnly || aiChatUnavailable}
              onChange={(enabled) => void changeAiChatEnabled(enabled)}
            />
            <PermissionToggle
              label="Проверки плана"
              subtitle={
                !agentEnabled
                  ? 'Ассистент временно недоступен'
                  : !agentConsentAccepted
                    ? 'Разрешите доступ в чате Ассистента'
                    : !agentAutomationEnabled || !agentProviderConfigured
                      ? 'Сервис временно недоступен'
                      : !agentAutomationAccepted && medicalRecommendations
                        ? 'Выключите и включите заново'
                        : undefined
              }
              value={medicalRecommendations}
              disabled={
                readOnly ||
                (!medicalRecommendations &&
                  (!agentEnabled ||
                    !agentConsentAccepted ||
                    !agentAutomationEnabled ||
                    !agentProviderConfigured))
              }
              onChange={(enabled) => void saveAgentAutomation(enabled)}
            />
            <ProfileCollapse open={medicalRecommendations}>
              <PermissionToggle
                label="Обновления плана"
                subtitle={
                  !notificationsEnabled
                    ? 'Разрешите уведомления в профиле'
                    : undefined
                }
                value={agentNotifications}
                disabled={readOnly || !notificationsEnabled}
                onChange={(value) => {
                  setAgentNotifications(value);
                  void savePreferences({ agentNotifications: value });
                }}
              />
            </ProfileCollapse>
            <AssistantDataDetails
              accepted={agentConsentAccepted}
              disabled={readOnly}
              onRevoke={revokeAgentConsent}
              onDelete={clearAgentData}
            />
          </ProfileSettingsGroup>

          <ProfileSettingsGroup title="Устройство и приватность">
            <PermissionAction
              label={
                Platform.OS === 'ios'
                  ? 'Разрешения iPhone'
                  : 'Разрешения устройства'
              }
              onPress={openSystemSettings}
            />
            <PermissionPrivacyDetails />
          </ProfileSettingsGroup>
        </>
      );

    case 'data-transfer':
      return <DataTransferSection />;

    case 'security':
      return (
        <>
          <ProfileContacts
            email={viewerEmail}
            phone={viewerPhone}
            disabled={readOnly}
            onPhoneChanged={async (phone) => {
              await saveProfile({ phone });
            }}
            renderPhone={(onDone) => (
              <PhoneVerificationRow
                disabled={readOnly}
                phone={viewerPhone}
                onVerified={async (phone) => {
                  await saveProfile({ phone });
                  onDone();
                }}
              />
            )}
          />
          <ProfileSettingsGroup title="Аккаунт">
            <PermissionAction
              label="Выйти из аккаунта"
              disabled={readOnly || !hasViewerIdentity}
              onPress={signOut}
              isLast
            />
          </ProfileSettingsGroup>
          <AccountDataActions
            readOnly={readOnly}
            hasViewerIdentity={hasViewerIdentity}
            clearLocalData={clearAllLocalData}
            deleteAccount={requestAccountDeletion}
          />
        </>
      );

    case 'interface':
      return <InterfaceSettings />;

    case 'notification-settings':
      return (
        <>
          <ProfileSettingsGroup title="Уведомления">
            <PermissionToggle
              label="Уведомления"
              subtitle={notificationMessage}
              value={notificationsEnabled}
              disabled={notificationBusy || readOnly}
              testID="notification-master-toggle"
              onChange={(value) =>
                void (async () => {
                  const result = await setNotificationPermission(value);
                  setNotificationsEnabled(
                    result === 'enabled' || result === 'local-only',
                  );
                })()
              }
            />
            <PermissionToggle
              label="Напоминать о дневнике"
              value={notificationsEnabled && journalNotifications}
              disabled={readOnly || notificationBusy || !notificationsEnabled}
              onChange={(value) => {
                setJournalNotifications(value);
                void savePreferences({ journalNotifications: value });
              }}
            />
            <PermissionToggle
              label="Результаты и анализы"
              value={notificationsEnabled && resultNotifications}
              disabled={readOnly || notificationBusy || !notificationsEnabled}
              onChange={(value) => {
                setResultNotifications(value);
                void savePreferences({ resultNotifications: value });
              }}
            />
            <PermissionAction
              label={
                Platform.OS === 'ios'
                  ? 'Настройки уведомлений iPhone'
                  : 'Настройки устройства'
              }
              onPress={openSystemSettings}
              isLast
            />
          </ProfileSettingsGroup>
          <ProfileSettingsGroup title="Стиль уведомлений">
            <View style={styles.notificationToneBlock}>
              <ProfileChoiceControl
                accessibilityLabel="Стиль уведомлений"
                defaultValue="formal"
                value={notificationTone}
                options={[
                  { label: 'Формальный', value: 'formal' },
                  { label: 'Милый', value: 'cute' },
                ]}
                onChange={(value) => {
                  if (readOnly) return;
                  setNotificationTone(value);
                  void savePreferences({ notificationTone: value });
                }}
              />
              <NotificationTonePreview tone={notificationTone} />
            </View>
          </ProfileSettingsGroup>
        </>
      );
  }
}

type MedicalCrudProps =
  | {
      kind: 'condition';
      readOnly: boolean;
      records: MedicalCondition[];
      onSave: (
        input: Omit<MedicalCondition, 'localId' | 'updatedAt'> & {
          localId?: string;
        },
      ) => Promise<void>;
      onDelete: (item: MedicalCondition) => Promise<void>;
    }
  | {
      kind: 'medication';
      readOnly: boolean;
      records: Medication[];
      onSave: (
        input: Omit<Medication, 'localId' | 'updatedAt'> & {
          localId?: string;
        },
      ) => Promise<void>;
      onDelete: (item: Medication) => Promise<void>;
    }
  | {
      kind: 'allergy';
      readOnly: boolean;
      records: AllergyRisk[];
      onSave: (
        input: Omit<AllergyRisk, 'localId' | 'updatedAt'> & {
          localId?: string;
        },
      ) => Promise<void>;
      onDelete: (item: AllergyRisk) => Promise<void>;
    };

const medicationDoseUnits = [
  { value: 'mcg', label: 'мкг' },
  { value: 'mg', label: 'мг' },
  { value: 'g', label: 'г' },
  { value: 'ml', label: 'мл' },
  { value: 'iu', label: 'МЕ' },
] as const;

type MedicationDoseUnit = (typeof medicationDoseUnits)[number]['value'];

const medicationFrequencyOptions = [
  { value: 'hour', label: 'час' },
  { value: 'day', label: 'день' },
  { value: 'week', label: 'неделя' },
  { value: 'month', label: 'месяц' },
] as const;

type MedicationFrequency = (typeof medicationFrequencyOptions)[number]['value'];

const medicationDoseUnitAliases: Record<string, MedicationDoseUnit> = {
  mcg: 'mcg',
  ug: 'mcg',
  μg: 'mcg',
  мкг: 'mcg',
  mg: 'mg',
  мг: 'mg',
  g: 'g',
  г: 'g',
  ml: 'ml',
  мл: 'ml',
  iu: 'iu',
  ме: 'iu',
};

function parseMedicationDosage(value?: string) {
  const match = value
    ?.trim()
    .match(/^(\d+(?:[.,]\d+)?)\s*(mcg|ug|μg|мкг|mg|мг|g|г|ml|мл|iu|ме)\.?$/i);
  if (!match) return undefined;
  const unit = medicationDoseUnitAliases[match[2].toLocaleLowerCase('ru-RU')];
  if (!unit) return undefined;
  return { amount: match[1], unit };
}

function sanitizeMedicationDoseAmount(value: string) {
  return filterInput(value, 'decimal');
}

function parseMedicationFrequency(value?: string): MedicationFrequency {
  const normalized = value?.trim().toLocaleLowerCase('ru-RU');
  if (
    normalized === 'час' ||
    normalized === 'hour' ||
    normalized === 'hourly' ||
    normalized === 'каждый час'
  )
    return 'hour';
  if (
    normalized === 'неделя' ||
    normalized === 'week' ||
    normalized === 'weekly' ||
    normalized === 'раз в неделю'
  )
    return 'week';
  if (
    normalized === 'месяц' ||
    normalized === 'month' ||
    normalized === 'monthly' ||
    normalized === 'раз в месяц'
  )
    return 'month';
  return 'day';
}

function MedicalCrudSection(props: MedicalCrudProps) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [medicationDoseUnit, setMedicationDoseUnit] =
    useState<MedicationDoseUnit>('mg');
  const [medicationFrequency, setMedicationFrequency] =
    useState<MedicationFrequency>('day');
  const records = props.records;
  const selected = records.find((item) => item.localId === selectedId);
  const primaryLabel =
    props.kind === 'condition'
      ? 'Состояние или диагноз'
      : props.kind === 'medication'
        ? 'Название препарата'
        : 'Аллерген';
  const secondaryLabel =
    props.kind === 'condition'
      ? 'Заметка'
      : props.kind === 'medication'
        ? 'Дозировка'
        : 'Реакция';
  const addLabel =
    props.kind === 'condition'
      ? 'Добавить запись'
      : props.kind === 'medication'
        ? 'Добавить препарат'
        : 'Добавить аллергию';

  const clearEditor = () => {
    setEditorVisible(false);
    setSelectedId(undefined);
    setPrimary('');
    setSecondary('');
    setMedicationDoseUnit('mg');
    setMedicationFrequency('day');
  };

  const openEditor = () => setEditorVisible(true);
  const reset = clearEditor;

  const select = (item: MedicalCondition | Medication | AllergyRisk) => {
    setSelectedId(item.localId);
    if ('title' in item) {
      setPrimary(item.title);
      setSecondary(item.notes ?? '');
    } else if ('name' in item) {
      setPrimary(item.name);
      const parsedDosage = parseMedicationDosage(item.dosage);
      setSecondary(parsedDosage?.amount ?? '');
      setMedicationDoseUnit(parsedDosage?.unit ?? 'mg');
      setMedicationFrequency(parseMedicationFrequency(item.frequency));
    } else {
      setPrimary(item.allergen);
      setSecondary(item.reaction ?? '');
    }
    openEditor();
  };

  const startAdding = () => {
    setSelectedId(undefined);
    setPrimary('');
    setSecondary('');
    setMedicationDoseUnit('mg');
    setMedicationFrequency('day');
    openEditor();
  };

  const save = async () => {
    const normalized = primary.trim();
    if (!normalized || props.readOnly) return;
    if (props.kind === 'condition') {
      const current = selected as MedicalCondition | undefined;
      await props.onSave({
        ...current,
        localId: current?.localId,
        title: normalized,
        status: current?.status ?? 'active',
        notes: secondary.trim() || undefined,
      });
    } else if (props.kind === 'medication') {
      const current = selected as Medication | undefined;
      const doseAmount = secondary.trim().replace(',', '.');
      const doseUnit = medicationDoseUnits.find(
        (option) => option.value === medicationDoseUnit,
      )?.label;
      const frequency = medicationFrequencyOptions.find(
        (option) => option.value === medicationFrequency,
      )?.label;
      await props.onSave({
        ...current,
        localId: current?.localId,
        name: normalized,
        dosage:
          doseAmount && doseUnit
            ? `${Number(doseAmount)} ${doseUnit}`
            : current?.dosage,
        frequency: frequency ?? 'день',
        active: current?.active ?? true,
      });
    } else {
      const current = selected as AllergyRisk | undefined;
      await props.onSave({
        ...current,
        localId: current?.localId,
        allergen: normalized,
        reaction: secondary.trim() || undefined,
        severity: current?.severity ?? 'unknown',
      });
    }
    reset();
  };

  const remove = async () => {
    if (!selected) return;
    if (props.kind === 'condition')
      await props.onDelete(selected as MedicalCondition);
    else if (props.kind === 'medication')
      await props.onDelete(selected as Medication);
    else await props.onDelete(selected as AllergyRisk);
    reset();
  };

  const medicationDoseValid =
    props.kind !== 'medication' ||
    !secondary.trim() ||
    Number(secondary.trim().replace(',', '.')) > 0;

  return (
    <View style={styles.medicalHistoryLayout}>
      <ProfileActionRow
        icon="plus"
        label={addLabel}
        pill
        disabled={props.readOnly}
        onPress={startAdding}
      />
      {records.length ? (
        <View>
          <ProfileSettingsGroup title="Сохранённые записи">
            {records.map((item, index) => {
              const label =
                'title' in item
                  ? item.title
                  : 'name' in item
                    ? item.name
                    : item.allergen;
              const value =
                'status' in item
                  ? item.status === 'active'
                    ? 'Активно'
                    : 'Завершено'
                  : 'active' in item
                    ? item.active
                      ? 'Принимается'
                      : 'Завершён'
                    : item.severity === 'unknown'
                      ? undefined
                      : item.severity;
              return (
                <ProfileSettingsRow
                  key={item.localId}
                  icon="cross.case.fill"
                  fallback="+"
                  hideIcon
                  iconBackground={profileTones.health.tile}
                  iconColor={profileTones.health.glyph}
                  label={label}
                  value={value}
                  isLast={index === records.length - 1}
                  onPress={() => select(item)}
                />
              );
            })}
          </ProfileSettingsGroup>
        </View>
      ) : (
        <ProfileEmptyMessage
          icon={
            props.kind === 'medication'
              ? 'medication'
              : props.kind === 'allergy'
                ? 'allergy'
                : 'history'
          }
          title="Записей пока нет"
        />
      )}
      <AppSheet
        visible={editorVisible}
        surface="white"
        title={selected ? 'Изменить запись' : addLabel}
        onClose={reset}
        footer={
          <>
            <View style={styles.medicalEditorActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Отмена"
                onPress={reset}
                style={styles.medicalEditorSecondaryAction}
              >
                <AppText role="body" weight="semibold">
                  Отмена
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Сохранить"
                testID="e2e-medical-save"
                accessibilityState={{
                  disabled:
                    props.readOnly || !primary.trim() || !medicationDoseValid,
                }}
                disabled={
                  props.readOnly || !primary.trim() || !medicationDoseValid
                }
                onPress={() => void save()}
                style={[
                  styles.medicalEditorPrimaryAction,
                  (props.readOnly || !primary.trim() || !medicationDoseValid) &&
                    styles.medicalEditorPrimaryActionDisabled,
                ]}
              >
                <AppText
                  role="body"
                  weight="semibold"
                  color={
                    props.readOnly || !primary.trim() || !medicationDoseValid
                      ? colors.text.secondary
                      : '#FFFFFF'
                  }
                >
                  Сохранить
                </AppText>
              </Pressable>
            </View>
            {selected ? (
              <ConfirmedAction
                compact
                label="Удалить запись"
                confirmation="Подтвердить удаление записи"
                onConfirm={remove}
              />
            ) : null}
          </>
        }
      >
        <TextInput
          editable={!props.readOnly}
          testID="e2e-medical-primary"
          value={primary}
          onChangeText={setPrimary}
          placeholder={primaryLabel}
          placeholderTextColor={colors.text.secondary}
          style={styles.inlineInput}
        />
        {props.kind === 'medication' ? (
          <>
            <View style={styles.medicationDoseRow}>
              <TextInput
                editable={!props.readOnly}
                inputMode="decimal"
                keyboardType="decimal-pad"
                testID="e2e-medical-secondary"
                value={secondary}
                onChangeText={(value) =>
                  setSecondary(sanitizeMedicationDoseAmount(value))
                }
                placeholder="Количество"
                placeholderTextColor={colors.text.secondary}
                style={[styles.inlineInput, styles.medicationDoseInput]}
              />
              <SegmentedSwitcher
                accessibilityLabel="Единица измерения дозировки"
                options={medicationDoseUnits}
                value={medicationDoseUnit}
                onChange={setMedicationDoseUnit}
                style={styles.medicationDoseUnits}
              />
            </View>
            <View style={styles.medicationFrequencyBlock}>
              <AppText
                role="caption"
                color={colors.text.secondary}
                style={styles.medicationFrequencyLabel}
              >
                Периодичность
              </AppText>
              <SegmentedSwitcher
                accessibilityLabel="Периодичность приёма препарата"
                options={medicationFrequencyOptions}
                value={medicationFrequency}
                onChange={setMedicationFrequency}
              />
            </View>
          </>
        ) : (
          <TextInput
            editable={!props.readOnly}
            testID="e2e-medical-secondary"
            value={secondary}
            onChangeText={setSecondary}
            placeholder={secondaryLabel}
            placeholderTextColor={colors.text.secondary}
            style={styles.inlineInput}
          />
        )}
      </AppSheet>
    </View>
  );
}

const csvCategories: Array<{
  value: HealthEntityName;
  label: string;
}> = [
  { value: 'journalEntries', label: 'Дневник' },
  { value: 'labResults', label: 'Анализы' },
  { value: 'scanResults', label: 'Сканы' },
  { value: 'medicalConditions', label: 'История' },
  { value: 'medications', label: 'Препараты' },
  { value: 'allergyRisks', label: 'Аллергии' },
];

function DataTransferSection() {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const store = useHealthStore();
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [category, setCategory] = useState<HealthEntityName>('journalEntries');
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [preview, setPreview] =
    useState<ReturnType<typeof parseImportPayload>>();
  const [importMessage, setImportMessage] = useState<string>();
  const [exportMessage, setExportMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  const snapshot = {
    profile: store.profile,
    programs: store.programs,
    journalEntries: store.journalEntries,
    labResults: store.labResults,
    scanResults: store.scanResults,
    reminders: store.reminders,
    medicalConditions: store.medicalConditions,
    medications: store.medications,
    allergyRisks: store.allergyRisks,
    documents: store.documents,
    chatConversations: store.chatConversations,
    chatMessages: store.chatMessages,
    carePlanItems: store.carePlanItems,
    agentTriggers: store.agentTriggers,
    recommendationEvents: store.recommendationEvents,
    preferences: store.preferences,
  };

  const pickImport = async () => {
    if (busy || store.readOnly) return;
    setBusy(true);
    setImportMessage(undefined);
    setPreview(undefined);
    try {
      const picked = e2eImportFixtureUri
        ? undefined
        : await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
            type: [
              'application/json',
              'text/csv',
              'text/comma-separated-values',
            ],
          });
      const asset = e2eImportFixtureUri
        ? { uri: e2eImportFixtureUri }
        : picked?.canceled
          ? undefined
          : picked?.assets[0];
      if (!asset) return;
      const parsed = parseImportPayload(await readAsStringAsync(asset.uri));
      if (!parsed.total) {
        setImportMessage('В файле нет записей для импорта.');
        return;
      }
      setPreview(parsed);
    } catch {
      setImportMessage(
        'Не удалось прочитать файл. Выберите JSON или CSV, экспортированный из Сферы.',
      );
    } finally {
      setBusy(false);
    }
  };

  const applyImport = async () => {
    if (!preview || busy || store.readOnly) return;
    setBusy(true);
    setImportMessage(undefined);
    try {
      await store.importData(preview);
      setImportMessage(`Импортировано записей: ${preview.total}`);
      setPreview(undefined);
    } catch {
      setImportMessage(
        'Импорт не завершён. Часть записей могла сохраниться — повторите попытку.',
      );
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    if (busy || store.readOnly) return;
    setExportMessage(undefined);
    if (!cacheDirectory) {
      setExportMessage('Экспорт файлов недоступен на этой платформе.');
      return;
    }
    setBusy(true);
    try {
      const content =
        format === 'json'
          ? createJsonArchive(snapshot)
          : createEntityCsv(category, snapshot[category] as never);
      const extension = format === 'json' ? 'json' : 'csv';
      const uri = `${cacheDirectory}artificiallabs-export-${Date.now()}.${extension}`;
      await writeAsStringAsync(uri, content);
      if (__DEV__ && process.env.EXPO_PUBLIC_E2E_MODE === '1') {
        setExportMessage('Файл подготовлен для экспорта.');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        setExportMessage(
          'На этом устройстве недоступно сохранение через меню «Поделиться».',
        );
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Экспорт данных Сферы',
        mimeType: format === 'json' ? 'application/json' : 'text/csv',
      });
      setExportMessage('Файл подготовлен для экспорта.');
    } catch (error) {
      console.error('Export failed', error);
      setExportMessage('Не удалось подготовить файл экспорта.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ProfileSettingsGroup title="Импорт">
        <PermissionAction
          label={preview ? 'Выбрать другой файл' : 'Выбрать файл'}
          subtitle="JSON или CSV из Сферы"
          disabled={store.readOnly || busy}
          onPress={() => void pickImport()}
          isLast
        />
        {preview ? (
          <>
            <View style={styles.transferDetails}>
              <AppText style={styles.transferCaption}>
                {`Готово к импорту: ${preview.total}`}
              </AppText>
              <AppText
                style={styles.transferCaption}
                color={colors.text.secondary}
              >
                Записи будут добавлены или обновлены. Профиль из файла может
                заменить текущий.
              </AppText>
            </View>
            <PermissionAction
              label="Импортировать данные"
              disabled={store.readOnly || busy}
              onPress={() => void applyImport()}
            />
            <PermissionAction
              label="Отменить выбор"
              disabled={busy}
              onPress={() => {
                setPreview(undefined);
                setImportMessage(undefined);
              }}
              isLast
            />
          </>
        ) : null}
        {importMessage ? (
          <View style={styles.transferDetails}>
            <AppText
              style={styles.transferCaption}
              color={colors.text.secondary}
            >
              {importMessage}
            </AppText>
          </View>
        ) : null}
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Экспорт">
        <View style={styles.transferControls}>
          <ProfileChoiceControl
            accessibilityLabel="Формат экспорта"
            defaultValue="json"
            value={format}
            options={[
              { value: 'json', label: 'JSON' },
              { value: 'csv', label: 'CSV' },
            ]}
            onChange={(value) => {
              if (!busy) {
                setFormat(value);
                setExportMessage(undefined);
              }
            }}
          />
          <AppText style={styles.transferCaption} color={colors.text.secondary}>
            {format === 'json'
              ? 'Все разделы и профиль в одном файле.'
              : 'Один раздел в формате таблицы Сферы.'}
          </AppText>
          <AppText style={styles.transferCaption} color={colors.text.secondary}>
            Фото и исходные файлы документов не включаются.
          </AppText>
        </View>
        {format === 'csv' ? (
          <>
            <PermissionAction
              label={
                csvCategories.find((item) => item.value === category)?.label ??
                'Дневник'
              }
              subtitle="Раздел для экспорта"
              isLast
              expanded={categoryExpanded}
              disabled={busy || store.readOnly}
              onPress={() => setCategoryExpanded(!categoryExpanded)}
            />
            <ProfileCollapse open={categoryExpanded}>
              <View style={styles.transferDetails}>
                <ProfileVerticalChoiceControl
                  accessibilityLabel="Раздел для экспорта"
                  defaultValue="journalEntries"
                  value={category}
                  options={csvCategories}
                  grouped
                  disabled={busy || store.readOnly}
                  onChange={(value) => {
                    setCategory(value);
                    setCategoryExpanded(false);
                  }}
                />
              </View>
            </ProfileCollapse>
          </>
        ) : null}
        <PermissionAction
          label="Экспортировать файл"
          disabled={store.readOnly || busy}
          onPress={() => void exportData()}
          isLast
        />
        {exportMessage ? (
          <View style={styles.transferDetails}>
            <AppText
              style={styles.transferCaption}
              color={colors.text.secondary}
            >
              {exportMessage}
            </AppText>
          </View>
        ) : null}
      </ProfileSettingsGroup>
    </>
  );
}

function AccountDataActions({
  readOnly,
  hasViewerIdentity,
  clearLocalData,
  deleteAccount,
}: {
  readOnly: boolean;
  hasViewerIdentity: boolean;
  clearLocalData: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const running = useRef(false);
  const perform = async (kind: 'local' | 'account') => {
    if (
      running.current ||
      readOnly ||
      (kind === 'account' && !hasViewerIdentity)
    )
      return;
    running.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      if (kind === 'local') {
        await clearLocalData();
        setMessage('Данные на устройстве удалены.');
      } else if (!(await deleteAccount())) {
        setMessage('Не удалось удалить аккаунт. Попробуйте позже.');
      }
    } catch {
      setMessage('Не удалось завершить удаление. Попробуйте позже.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <ProfileSettingsGroup title="Удаление данных">
      <PermissionAction
        label="Удалить данные с устройства"
        subtitle="Только локальные записи и файлы"
        destructive
        disabled={readOnly || busy}
        onPress={() =>
          Alert.alert(
            'Удалить данные с устройства?',
            'Локальные записи, фото и файлы будут удалены. Данные, не сохранённые в облаке или экспорте, восстановить не получится.',
            [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Удалить',
                style: 'destructive',
                onPress: () => void perform('local'),
              },
            ],
          )
        }
      />
      <PermissionAction
        label="Удалить аккаунт"
        subtitle="Аккаунт и все его данные"
        destructive
        disabled={readOnly || busy || !hasViewerIdentity}
        onPress={() =>
          Alert.alert(
            'Удалить аккаунт?',
            'Аккаунт и его данные будут удалены. Восстановление доступно в течение 30 дней.',
            [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Удалить',
                style: 'destructive',
                onPress: () => void perform('account'),
              },
            ],
          )
        }
        isLast
      />
      {message ? (
        <View style={styles.transferDetails}>
          <AppText style={styles.transferCaption} color={colors.text.secondary}>
            {message}
          </AppText>
        </View>
      ) : null}
    </ProfileSettingsGroup>
  );
}

function ConfirmedAction({
  compact = false,
  confirmation,
  label,
  onConfirm,
}: {
  compact?: boolean;
  confirmation: string;
  label: string;
  onConfirm: () => Promise<void>;
}) {
  const styles = useThemeStyles(createStyles);
  const [armed, setArmed] = useState(false);
  return (
    <ProfileActionRow
      destructive
      icon="trash.fill"
      label={armed ? confirmation : label}
      style={compact ? styles.compactConfirmedAction : undefined}
      onPress={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        void onConfirm();
      }}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  transferControls: {
    paddingHorizontal: 14,
    paddingTop: 16,
    gap: 12,
  },
  transferDetails: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 6,
  },
  transferCaption: {
    fontSize: 14,
    lineHeight: 20,
  },
  phoneVerificationRow: {
    gap: 12,
    paddingLeft: 14,
    paddingRight: 18,
    paddingBottom: 16,
  },
  phoneVerificationInput: {
    height: 48,
    paddingVertical: 0,
    paddingBottom: Platform.OS === 'ios' ? 6 : 0,
    textAlignVertical: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface.canvas,
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 15,
    includeFontPadding: false,
  },
  phoneVerificationInputRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  phoneVerificationInputFlex: {
    minWidth: 0,
    flex: 1,
  },
  phoneVerificationButton: {
    width: '100%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: spacing.md,
  },
  phoneVerificationButtonText: {
    fontSize: 13,
  },
  phoneVerificationButtonDisabled: {
    opacity: 0.5,
  },
  controlPressed: {
    opacity: 0.72,
  },
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  profilePage: {
    flex: 1,
  },
  detailPage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: colors.surface.canvas,
    shadowColor: '#2F151B',
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 18,
  },
  scrollContent: {
    paddingHorizontal: sizes.screenGutter,
    gap: spacing.lg,
  },
  overview: {
    gap: spacing.lg,
  },
  versionFooter: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    opacity: 0.72,
  },
  detailHeader: {
    position: 'absolute',
    zIndex: 10,
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: 10,
    backgroundColor: `${colors.surface.canvas}f0`,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailHeaderWithFade: {
    backgroundColor: 'transparent',
    paddingBottom: 32,
  },
  detailHeaderOpaque: {
    position: 'absolute',
    top: 0,
    bottom: 80,
    left: 0,
    right: 0,
    backgroundColor: colors.surface.canvas,
  },
  detailHeaderFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeaderTitle: {
    minWidth: 0,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 48,
    height: 48,
  },
  detailContent: {
    flexGrow: 1,
    paddingHorizontal: sizes.screenGutter,
    gap: spacing.lg,
  },
  todayKitSection: {
    gap: spacing.lg,
  },
  todayKitCopy: {
    gap: spacing.xs,
  },
  todayKitStage: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 37,
    backgroundColor: colors.surface.warm,
    shadowColor: '#2F151B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 10,
  },
  todayKitCanvas: {
    width: 402,
    height: 874,
    transformOrigin: 'top left',
  },
  notificationToneBlock: {
    gap: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  notificationTonePreview: {
    gap: spacing.md,
  },
  notificationExampleCard: {
    borderWidth: 1,
    borderColor: colors.surface.divider,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    padding: spacing.md,
  },
  notificationExampleBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  notificationExampleIconFrame: {
    width: 48,
    height: 48,
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: colors.surface.warm,
  },
  notificationExampleIconImage: {
    position: 'absolute',
    top: 3,
    right: 3,
    bottom: 3,
    left: 3,
    width: 42,
    height: 42,
  },
  notificationExampleTextStack: {
    minWidth: 0,
    flex: 1,
    position: 'relative',
    paddingTop: 1,
  },
  notificationExampleTime: {
    flexShrink: 0,
    paddingTop: 3,
  },
  notificationExampleDescription: {
    marginTop: -2,
  },
  notificationExampleCopy: {
    gap: 0,
  },
  notificationExampleCopyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    gap: 0,
  },
  medicalHistoryLayout: {
    position: 'relative',
    minHeight: 0,
    flex: 1,
    gap: spacing.lg,
  },
  inlineEditor: {
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    padding: spacing.md,
  },
  medicalEditorActions: {
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  medicalEditorSecondaryAction: { ...sheetStyles.secondary, backgroundColor: colors.surface.divider, flex: 1 },
  medicalEditorPrimaryAction: { ...sheetStyles.primary, flex: 1 },
  medicalEditorPrimaryActionDisabled: { backgroundColor: colors.surface.divider },
  compactConfirmedAction: {
    minHeight: 50,
    borderRadius: 23,
  },
  inlineInput: {
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface.canvas,
    paddingHorizontal: spacing.md,
    paddingVertical: 0,
    // UITextField centers its line box, whose glyphs sit below the visual
    // midpoint. Balance that baseline inset without moving the field itself.
    paddingBottom: Platform.OS === 'ios' ? 6 : 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
    fontSize: 16,
    color: colors.text.primary,
  },
  medicationDoseRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  medicationDoseInput: {
    width: 112,
    flexShrink: 0,
  },
  medicationDoseUnits: {
    minWidth: 0,
    flex: 1,
  },
  medicationFrequencyBlock: {
    width: '100%',
    gap: 6,
  },
  medicationFrequencyLabel: {
    paddingHorizontal: 2,
  },
  dangerIntro: {
    borderRadius: radii.lg,
    padding: spacing.md,
    backgroundColor: colors.surface.canvas === defaultThemeColors.surface.canvas ? '#FDEAEA' : colors.surface.rose,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217,56,56,0.24)',
  },
  dangerDescription: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});

const styles = createStyles(defaultThemeColors);

function InterfaceSettings() {
  const { preference, setMode, saveError } = useAppTheme();
  return (
    <ProfileSettingsGroup title="Оформление" footer={saveError ?? 'По умолчанию тема меняется вместе с темой устройства. Ручной выбор сохраняется только на этом устройстве.'}>
      <ProfileVerticalChoiceControl
        accessibilityLabel="Тема приложения"
        defaultValue="system"
        value={preference}
        grouped
        options={[
          { label: 'Как на устройстве', value: 'system' },
          { label: 'Светлая тема', value: 'light' },
          { label: 'Тёмная тема', value: 'dark' },
        ]}
        onChange={setMode}
      />
    </ProfileSettingsGroup>
  );
}
