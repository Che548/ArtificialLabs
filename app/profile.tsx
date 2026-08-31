import { useAuthActions } from '@convex-dev/auth/react';
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import * as DocumentPicker from 'expo-document-picker';
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

import ProfileIcon01 from '../assets/profile/settings-icons/1.svg';
import ProfileIcon02 from '../assets/profile/settings-icons/2.svg';
import ProfileIcon03 from '../assets/profile/settings-icons/3.svg';
import ProfileIcon04 from '../assets/profile/settings-icons/4.svg';
import ProfileIcon05 from '../assets/profile/settings-icons/5.svg';
import ProfileIcon06 from '../assets/profile/settings-icons/6.svg';
import ProfileIcon07 from '../assets/profile/settings-icons/7.svg';
import ProfileIcon08 from '../assets/profile/settings-icons/8.svg';
import ProfileIcon09 from '../assets/profile/settings-icons/9.svg';
import ProfileIcon10 from '../assets/profile/settings-icons/10.svg';
import ProfileIcon11 from '../assets/profile/settings-icons/11.svg';
import ProfileIcon12 from '../assets/profile/settings-icons/12.svg';
import ProfileIcon13 from '../assets/profile/settings-icons/13.svg';

import {
  PlanningTodayScreenCatalogPreview,
  TodayScreenCatalogPreview,
} from '../App';
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
  ScanConceptsLab,
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
import { useNotificationManager } from '../lib/notification-manager';
import {
  createEntityCsv,
  createJsonArchive,
  parseImportPayload,
} from '../lib/data-transfer';
import { persistLabDocument } from '../lib/local-files';
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
  MonitoringProgram,
} from '../lib/health-types';
import type { NotificationTone } from '../shared/notification-copy';
import { DiagnosticsScreen } from '../components/DiagnosticsScreen';
import { getAppVersionInfo } from '../lib/app-version';
import { registerDiagnosticsTap } from '../lib/diagnostics-access';
import { useUpdateManager } from '../lib/update-manager';

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
  | 'personal'
  | 'medical-history'
  | 'medications'
  | 'allergies'
  | 'documents'
  | 'programs'
  | 'language'
  | 'permissions'
  | 'imports'
  | 'exports'
  | 'security'
  | 'notification-settings'
  | 'delete-account'
  | 'onboarding'
  | 'planning-today-ui-kit'
  | 'scan-concepts'
  | 'today-ui-kit';

const SECTION_TITLES: Record<ProfileSection, string> = {
  account: 'Profile details',
  personal: 'Basic information',
  'medical-history': 'Medical history',
  medications: 'Medications',
  allergies: 'Allergies and risks',
  documents: 'Documents',
  programs: 'Programs',
  language: 'Language and region',
  permissions: 'Permissions and data',
  imports: 'Import data',
  exports: 'Export data',
  security: 'Account and security',
  'notification-settings': 'Notification settings',
  'delete-account': 'Delete account',
  onboarding: 'Onboarding',
  'planning-today-ui-kit': 'Today · Planning',
  'scan-concepts': 'Scan concepts',
  'today-ui-kit': 'Today · UI kit',
};

function formatDate(timestamp?: number) {
  if (!timestamp) return 'Not specified';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function goalLabel(goal?: HealthGoal) {
  if (goal === 'pregnancy') return 'Pro';
  if (goal === 'cycle') return 'Monitoring';
  return 'Planning';
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { panel, sourceId } = useLocalSearchParams<{
    panel?: string;
    sourceId?: string;
  }>();
  const { width: windowWidth } = useWindowDimensions();
  const { signOut } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const revokeAiChatConsent = useMutation(api.chat.revokeConsent);
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
    programs,
    readOnly,
    requestAccountDeletion,
    serviceIssue,
    saveAllergyRisk,
    saveDocument,
    saveMedicalCondition,
    saveMedication,
    savePreferences,
    setCloudSyncEnabled,
    setProgramStatus,
    syncNow,
    syncStatus,
    updateProfile,
    viewerEmail,
    viewerPhone,
  } = useHealthStore();
  const aiChatStatus = useQuery(
    api.chat.status,
    isAuthenticated && cloudProfileReady ? {} : 'skip',
  );
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
        'Could not sign out',
        'Secure storage is unavailable. Unlock the device and try again.',
      );
    } finally {
      signOutInFlight.current = false;
    }
  };

  useEffect(() => {
    if (panel && panel in SECTION_TITLES)
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
        duration: 420,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
        useNativeDriver: true,
      }).start();
    });

    return () => cancelAnimationFrame(frame);
  }, [activeSection, reducePageMotion, sectionProgress]);

  const visiblePrograms = programs.filter((program) => !program.deletedAt);
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
  const storedDisplayName = profile?.displayName?.trim();
  const displayName =
    storedDisplayName === 'Пользователь'
      ? 'User'
      : storedDisplayName || viewerEmail?.split('@')[0] || 'Profile';
  const hasViewerIdentity = Boolean(
    viewerEmail || viewerPhone || hasLocalAuthSession,
  );

  const synchronize = async () => {
    setSyncMessage(undefined);
    if (await syncNow()) {
      setSyncMessage('Data synchronized');
    } else {
      setSyncMessage('Could not synchronize data');
    }
  };

  const handleVersionPress = () => {
    const result = registerDiagnosticsTap(footerTaps.current, Date.now());
    footerTaps.current = result.taps;
    if (result.shouldOpen) {
      setDiagnosticsVisible(true);
    }
  };

  const confirmAiConsentRevocation = () => {
    if (!aiChatStatus?.consentAccepted) return;
    Alert.alert(
      'Revoke consent?',
      'Sferka will stop sending chat text to Yandex AI Studio. Consent will be requested again the next time you send a message.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            void revokeAiChatConsent({}).catch((error) => {
              console.error('Revoking AI chat consent failed', error);
              Alert.alert(
                'Could not revoke consent',
                'Check your connection and try again.',
              );
            });
          },
        },
      ],
    );
  };

  const confirmAgentConsentRevocation = () => {
    if (!aiAgentStatus?.consentAccepted) return;
    Alert.alert(
      'Disable Assistant?',
      'Access to health data will be revoked and automated checks will be paused. The local plan will remain visible.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
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
                  'Could not disable Assistant',
                  'Check your connection and try again.',
                );
              });
          },
        },
      ],
    );
  };

  const confirmAgentDataDeletion = () => {
    Alert.alert(
      'Delete Assistant data?',
      'The plan, automated rules, and their change history will be deleted. Journal entries, lab results, documents, and chats will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void clearRemoteAgentData({})
              .then(clearAgentData)
              .catch((error) => {
                console.error('Clearing AI agent data failed', error);
                Alert.alert(
                  'Could not delete Assistant data',
                  'Check your connection and try again.',
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
        'Could not update automated recommendations',
        'Check your connection and try again.',
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
          type: '*/*',
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
    await saveDocument({
      title: asset.name,
      category: 'medical',
      documentDate: Date.now(),
      hasLocalFile: true,
      localFileUri,
      mimeType: asset.mimeType ?? undefined,
      size: asset.size,
    });
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
      duration: 340,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setActiveSection(null);
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" hidden={false} />
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

          <ProfileOverview
            allergyCount={allergyRisks.filter((item) => !item.deletedAt).length}
            conditionCount={
              medicalConditions.filter((item) => !item.deletedAt).length
            }
            documentCount={documentCount}
            medicationCount={
              medications.filter((item) => !item.deletedAt).length
            }
            programCount={visiblePrograms.length}
            onOpen={openSection}
          />
          <ProfileVersionFooter
            onPress={handleVersionPress}
            updateCreatedAt={updateManager.currentUpdateCreatedAt}
            updateId={updateManager.currentUpdateId}
          />
        </ScrollView>
      </Animated.View>

      {activeSection &&
      activeSection !== 'onboarding' &&
      activeSection !== 'scan-concepts' ? (
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
          {activeSection === 'today-ui-kit' ? (
            <ProfileDetailScreen
              bottomInset={insets.bottom}
              title={SECTION_TITLES[activeSection]}
              topInset={insets.top}
              onBack={closeSection}
            >
              <TodayProfileKitPreview />
            </ProfileDetailScreen>
          ) : activeSection === 'planning-today-ui-kit' ? (
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
              {renderProfileSectionDirect({
                aiConsentAccepted: aiChatStatus?.consentAccepted === true,
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
                programs: visiblePrograms,
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
                setProgramStatus,
                setResultNotifications,
                sendTestNotification: notificationManager.sendTest,
                signOut: () => void signOutSafely(),
                requestAccountDeletion,
                serviceIssue,
                revokeAiConsent: confirmAiConsentRevocation,
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
              })}
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

      <Modal
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        visible={activeSection === 'scan-concepts'}
        onRequestClose={closeSection}
      >
        <ScanConceptsLab onClose={closeSection} />
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
  const version = getAppVersionInfo({ updateCreatedAt, updateId });
  return (
    <Pressable
      accessibilityHint="App version details"
      accessibilityLabel="App version"
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
  programCount,
  onOpen,
}: {
  allergyCount: number;
  conditionCount: number;
  documentCount: number;
  medicationCount: number;
  programCount: number;
  onOpen: (section: ProfileSection) => void;
}) {
  return (
    <View style={styles.overview}>
      <ProfileSettingsGroup title="Health profile">
        <ProfileSettingsRow
          icon="person.text.rectangle.fill"
          iconAsset={ProfileIcon01}
          fallback="ME"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Basic information"
          onPress={() => onOpen('personal')}
        />
        <ProfileSettingsRow
          icon="cross.case.fill"
          iconAsset={ProfileIcon02}
          fallback="H"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Medical history"
          value={conditionCount ? String(conditionCount) : 'Not completed'}
          onPress={() => onOpen('medical-history')}
        />
        <ProfileSettingsRow
          icon="pills.fill"
          iconAsset={ProfileIcon03}
          fallback="M"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Medications"
          value={medicationCount ? String(medicationCount) : 'No active items'}
          onPress={() => onOpen('medications')}
        />
        <ProfileSettingsRow
          icon="exclamationmark.shield.fill"
          iconAsset={ProfileIcon04}
          fallback="!"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Allergies and risks"
          value={allergyCount ? String(allergyCount) : 'Not completed'}
          onPress={() => onOpen('allergies')}
        />
        <ProfileSettingsRow
          icon="doc.text.fill"
          iconAsset={ProfileIcon05}
          fallback="D"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Documents"
          value={documentCount ? String(documentCount) : 'No documents'}
          onPress={() => onOpen('documents')}
        />
        <ProfileSettingsRow
          icon="heart.text.square.fill"
          iconAsset={ProfileIcon06}
          fallback="P"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Programs"
          value={programCount ? String(programCount) : 'No programs'}
          isLast
          onPress={() => onOpen('programs')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Settings">
        <ProfileSettingsRow
          icon="globe.europe.africa.fill"
          iconAsset={ProfileIcon07}
          fallback="RU"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Language and region"
          value="Russian"
          onPress={() => onOpen('language')}
        />
        <ProfileSettingsRow
          icon="hand.raised.fill"
          iconAsset={ProfileIcon08}
          fallback="P"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Permissions and data"
          onPress={() => onOpen('permissions')}
        />
        <ProfileSettingsRow
          icon="bell.fill"
          iconAsset={ProfileIcon09}
          fallback="N"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Notification settings"
          onPress={() => onOpen('notification-settings')}
        />
        <ProfileSettingsRow
          icon="square.and.arrow.down.fill"
          iconAsset={ProfileIcon10}
          fallback="I"
          iconBackground={profileTones.preferences.tile}
          iconColor={profileTones.preferences.glyph}
          label="Import data"
          value="Not connected"
          isLast
          onPress={() => onOpen('imports')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Account">
        <ProfileSettingsRow
          icon="square.and.arrow.up.fill"
          iconAsset={ProfileIcon11}
          fallback="E"
          iconBackground={profileTones.account.tile}
          iconColor={profileTones.account.glyph}
          label="Export data"
          onPress={() => onOpen('exports')}
        />
        <ProfileSettingsRow
          icon="lock.shield.fill"
          iconAsset={ProfileIcon12}
          fallback="S"
          iconBackground={profileTones.account.tile}
          iconColor={profileTones.account.glyph}
          label="Account and security"
          onPress={() => onOpen('security')}
        />
        <ProfileSettingsRow
          icon="trash.fill"
          iconAsset={ProfileIcon13}
          fallback="×"
          iconBackground={profileTones.destructive.tile}
          iconColor={profileTones.destructive.glyph}
          label="Delete account"
          destructive
          isLast
          onPress={() => onOpen('delete-account')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Development">
        <ProfileSettingsRow
          icon="sparkles.rectangle.stack.fill"
          fallback="ON"
          iconBackground="#F4E7EB"
          iconColor={colors.brand.primary}
          label="Onboarding"
          value="5 variants"
          onPress={() => onOpen('onboarding')}
        />
        <ProfileSettingsRow
          icon="viewfinder"
          fallback="SC"
          iconBackground="#E7EDF0"
          iconColor="#3E6472"
          label="Scan page concepts"
          value="5 concepts"
          isLast
          onPress={() => onOpen('scan-concepts')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Saved screens">
        <ProfileSettingsRow
          icon="heart.circle.fill"
          fallback="TD"
          iconBackground="#FBE7F0"
          iconColor={colors.brand.primary}
          label="Today screen"
          value="UI kit"
          onPress={() => onOpen('today-ui-kit')}
        />
        <ProfileSettingsRow
          icon="heart.circle"
          fallback="PL"
          iconBackground="#FFF0F4"
          iconColor={colors.brand.primary}
          label="Today · Planning"
          value="Variant"
          isLast
          onPress={() => onOpen('planning-today-ui-kit')}
        />
      </ProfileSettingsGroup>
    </View>
  );
}

function TodayProfileKitPreview() {
  const { width } = useWindowDimensions();
  const previewWidth = Math.min(370, width - sizes.screenGutter * 2);
  const previewScale = previewWidth / 402;

  return (
    <View style={styles.todayKitSection}>
      <View style={styles.todayKitCopy}>
        <AppText role="heading" weight="semibold">
          Current version
        </AppText>
        <AppText role="body" color={colors.text.secondary}>
          Saved full-screen reference of the Today page.
        </AppText>
      </View>
      <View
        pointerEvents="none"
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
          <TodayScreenCatalogPreview />
        </View>
      </View>
    </View>
  );
}

function PlanningTodayProfileKitPreview() {
  const { width } = useWindowDimensions();
  const previewWidth = Math.min(370, width - sizes.screenGutter * 2);
  const previewScale = previewWidth / 402;

  return (
    <View style={styles.todayKitSection}>
      <View style={styles.todayKitCopy}>
        <AppText role="heading" weight="semibold">
          Planning mode
        </AppText>
        <AppText role="body" color={colors.text.secondary}>
          Fertile-window forecast, the best days to conceive, and quick cycle
          tracking. Controls inside the preview are interactive.
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

const notificationCuteImage = require('../assets/profile/notification-tones/cute.png');
const notificationFormalImage = require('../assets/profile/notification-tones/formal.png');
const notificationCuteIcon = require('../assets/profile/notification-tones/cute-icon.png');
const notificationFormalIcon = require('../assets/profile/notification-tones/formal-icon.png');

const notificationTonePreviewCopy: Record<
  NotificationTone,
  { title: string; body: string }
> = {
  formal: {
    title: 'Good afternoon',
    body: 'I am your personal assistant, Sferka',
  },
  cute: {
    title: 'Hi!',
    body: 'I am your personal assistant, Sferka',
  },
};

function NotificationTonePreview({ tone }: { tone: NotificationTone }) {
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
      duration: 460,
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
  const formalScale = toneProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.01],
  });
  const cuteScale = toneProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.99, 1],
  });
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
        accessibilityLabel={
          tone === 'formal' ? 'Sferka in a formal outfit' : 'Cute Sferka'
        }
        style={styles.notificationToneImageFrame}
      >
        <Animated.Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={notificationFormalImage}
          style={[
            styles.notificationToneImage,
            { opacity: formalOpacity, transform: [{ scale: formalScale }] },
          ]}
        />
        <Animated.Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="contain"
          source={notificationCuteImage}
          style={[
            styles.notificationToneImage,
            { opacity: cuteOpacity, transform: [{ scale: cuteScale }] },
          ]}
        />
      </View>

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
            now
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
  return (
    <View style={styles.root}>
      <StatusBar style="dark" hidden={false} />
      <View style={[styles.detailHeader, { paddingTop: topInset + 8 }]}>
        <GlassControl
          accessibilityLabel="Back to Profile"
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
        label="Phone"
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
    if (busy || disabled) return;
    if (!validPhone) {
      setMessage('Enter a Russian phone number: +7 followed by 10 digits.');
      return;
    }
    Keyboard.dismiss();
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
          ? 'The SMS limit for today has been reached.'
          : raw.includes('SMS_COOLDOWN')
            ? 'Resending is not available yet.'
            : 'SMS is temporarily unavailable. Try again later.',
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (busy || !/^\d{6}$/.test(code)) return;
    Keyboard.dismiss();
    setBusy(true);
    setMessage(undefined);
    try {
      const form = new FormData();
      form.append('phone', verifiedValue);
      form.append('code', code);
      await signIn('phone', form);
      await onVerified(verifiedValue);
      setMessage('Phone verified.');
    } catch {
      setMessage('The code is incorrect or expired. Request a new code.');
    } finally {
      setBusy(false);
    }
  };

  const actionDisabled =
    busy || disabled || (step === 'code' && !/^\d{6}$/.test(code));
  const actionButton = (
    <Pressable
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
            ? 'Please wait…'
            : step === 'phone'
              ? 'Get code'
              : 'Confirm'}
        </AppText>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.phoneVerificationRow}>
      <AppText role="label" color={colors.text.secondary}>
        Phone
      </AppText>
      <View style={styles.phoneVerificationInputRow}>
        <TextInput
          accessibilityLabel="Russian phone number"
          editable={!disabled && !busy && step === 'phone'}
          inputMode="tel"
          keyboardType="phone-pad"
          onChangeText={(value) =>
            setInput(value.replace(/[^\d+]/g, '').slice(0, 12))
          }
          onSubmitEditing={() => void requestCode()}
          placeholder="+7 999 000-00-00"
          placeholderTextColor="#989395"
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
            accessibilityLabel="SMS code"
            {...otpAutofillProps(Platform.OS)}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={(value) =>
              setCode(value.replace(/\D/g, '').slice(0, 6))
            }
            onSubmitEditing={() => void verifyCode()}
            placeholder="000000"
            placeholderTextColor="#989395"
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
              ? `Resend in ${Math.ceil((retryAt - clock) / 1000)} sec.`
              : 'Resend code'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function renderProfileSectionDirect({
  aiConsentAccepted,
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
  programs,
  readOnly,
  resultNotifications,
  requestAccountDeletion,
  serviceIssue,
  revokeAiConsent,
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
  setProgramStatus,
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
  aiConsentAccepted: boolean;
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
  programs: MonitoringProgram[];
  readOnly: boolean;
  resultNotifications: boolean;
  requestAccountDeletion: () => Promise<boolean>;
  serviceIssue?: ServiceIssue;
  revokeAiConsent: () => void;
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
  setProgramStatus: (
    program: MonitoringProgram,
    status: MonitoringProgram['status'],
  ) => Promise<void>;
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
  const hasViewerIdentity = Boolean(viewerEmail || viewerPhone);

  switch (section) {
    case 'account':
      return (
        <>
          <ProfileSettingsGroup title="Contacts">
            <ProfileFieldRow
              label="E-mail"
              inputMode="email"
              defaultValue={viewerEmail}
              placeholder="Sign-in email"
              disabled
            />
            <PhoneVerificationRow
              disabled={readOnly}
              phone={viewerPhone}
              onVerified={(phone) => saveProfile({ phone })}
            />
          </ProfileSettingsGroup>

          <ProfileVerticalChoiceControl<HealthGoal>
            accessibilityLabel="Primary goal"
            defaultValue={profile?.goal ?? 'planning'}
            disabled={readOnly}
            grouped
            label="Primary goal"
            value={profile?.goal ?? 'planning'}
            options={[
              { value: 'planning', label: 'Planning' },
              { value: 'pregnancy', label: 'Pregnancy' },
              { value: 'cycle', label: 'Monitoring' },
            ]}
            onChange={(goal) => void saveProfile({ goal })}
          />

          <ProfileSettingsGroup title="Cycle">
            {profile?.goal !== 'pregnancy' ? (
              <ProfileFieldRow
                label="Average length"
                defaultValue={
                  profile?.cycleLengthDays
                    ? String(profile.cycleLengthDays)
                    : ''
                }
                inputMode="numeric"
                suffix="days"
                disabled={readOnly}
                onSubmit={(value) => {
                  const cycleLengthDays = Number(value);
                  if (
                    Number.isInteger(cycleLengthDays) &&
                    cycleLengthDays >= 20 &&
                    cycleLengthDays <= 45
                  ) {
                    void saveProfile({ cycleLengthDays });
                  }
                }}
              />
            ) : null}
            <ProfileDateRow
              label={
                profile?.goal === 'pregnancy'
                  ? 'Pregnancy start'
                  : 'Last period'
              }
              value={
                profile?.goal === 'pregnancy'
                  ? profile?.pregnancyStartAt
                  : profile?.lastPeriodStartAt
              }
              maximumDate={new Date()}
              disabled={readOnly}
              isLast
              onChange={(timestamp) => {
                if (profile?.goal === 'pregnancy') {
                  void saveProfile({ pregnancyStartAt: timestamp });
                } else {
                  void saveProfile({ lastPeriodStartAt: timestamp });
                }
              }}
            />
          </ProfileSettingsGroup>
        </>
      );

    case 'personal':
      return (
        <>
          <ProfileSettingsGroup title="Personal details">
            <ProfileFieldRow
              label="Name or nickname"
              defaultValue={profile?.displayName}
              disabled={readOnly}
              onSubmit={(displayName) => {
                if (displayName) void saveProfile({ displayName });
              }}
            />
            <ProfileDateRow
              label="Date of birth"
              value={profile?.birthDate}
              minimumDate={new Date(1900, 0, 1)}
              maximumDate={new Date()}
              disabled={readOnly}
              onChange={(birthDate) => void saveProfile({ birthDate })}
            />
            <ProfileFieldRow
              label="Height"
              defaultValue={profile?.heightCm ? String(profile.heightCm) : ''}
              inputMode="numeric"
              suffix="cm"
              disabled={readOnly}
              onSubmit={(value) => {
                const heightCm = Number(value);
                if (heightCm >= 80 && heightCm <= 250)
                  void saveProfile({ heightCm });
              }}
            />
            <ProfileFieldRow
              label="Weight"
              defaultValue={profile?.weightKg ? String(profile.weightKg) : ''}
              inputMode="numeric"
              suffix="kg"
              disabled={readOnly}
              isLast
              onSubmit={(value) => {
                const weightKg = Number(value.replace(',', '.'));
                if (weightKg >= 20 && weightKg <= 400)
                  void saveProfile({ weightKg });
              }}
            />
          </ProfileSettingsGroup>
        </>
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
        <View style={styles.medicalHistoryLayout}>
          <ProfileActionRow
            icon="doc.badge.plus"
            label="Add document"
            pill
            disabled={readOnly}
            onPress={() => void saveDocumentFromPicker()}
          />
          {documents.length ? (
            <ProfileSettingsGroup
              title={
                sourceDocumentId
                  ? 'Assistant response source'
                  : `Saved: ${documentCount}`
              }
            >
              {documents.map((item, index) => (
                <ProfileSettingsRow
                  key={item.localId}
                  icon="doc.text.fill"
                  fallback="D"
                  iconBackground={profileTones.health.tile}
                  label={item.title}
                  value={`${formatDate(item.documentDate)}${
                    item.localId === sourceDocumentId ? ' · source' : ''
                  }`}
                  isLast={index === documents.length - 1}
                  onPress={() =>
                    Alert.alert(
                      item.title,
                      `${formatDate(item.documentDate)} · file contents have not been read`,
                      [
                        { text: 'Close', style: 'cancel' },
                        {
                          text: 'Delete document',
                          style: 'destructive',
                          onPress: () => void deleteRecord('documents', item),
                        },
                      ],
                    )
                  }
                />
              ))}
            </ProfileSettingsGroup>
          ) : (
            <ProfileEmptyMessage title="No documents added yet" />
          )}
        </View>
      );

    case 'programs':
      return (
        <>
          {programs.length ? (
            <ProfileSettingsGroup title="Connected programs">
              {programs.map((program, index) => (
                <ProfileToggleRow
                  key={program.localId}
                  label={program.title}
                  subtitle={`Started: ${formatDate(program.startedAt)}`}
                  value={program.status === 'active'}
                  disabled={readOnly}
                  isLast={index === programs.length - 1}
                  onChange={(enabled) =>
                    void setProgramStatus(
                      program,
                      enabled ? 'active' : 'paused',
                    )
                  }
                />
              ))}
            </ProfileSettingsGroup>
          ) : (
            <ProfileEmptyState
              icon="heart.slash"
              title="No connected programs"
              description="Programs will appear after you select a monitoring scenario."
            />
          )}
        </>
      );

    case 'language':
      return <ProfileLanguageSelector />;

    case 'permissions':
      return (
        <>
          <ProfileSettingsGroup title="Data">
            <ProfileToggleRow
              label="Cloud sync"
              subtitle="Structured data only"
              testID="e2e-cloud-sync-toggle"
              value={cloudSyncEnabled}
              disabled={readOnly || !hasViewerIdentity}
              onChange={(enabled) => void setCloudSyncEnabled(enabled)}
            />
            <ProfileToggleRow
              label="Anonymous analytics"
              value={analyticsEnabled}
              disabled={readOnly}
              onChange={(value) => {
                setAnalyticsEnabled(value);
                void savePreferences({ anonymousAnalytics: value });
                if (!value) void clearPendingTelemetryEvents();
                void setAnalyticsConsent(value);
              }}
            />
            <ProfileToggleRow
              label="Autonomous recommendations"
              subtitle={
                !agentEnabled
                  ? 'Assistant is disabled by the administrator'
                  : !agentConsentAccepted
                    ? 'Enable Assistant in Chat first'
                    : !agentAutomationEnabled
                      ? 'Autonomous checks are temporarily disabled'
                      : !agentProviderConfigured
                        ? 'Plan service is not configured on the server'
                        : !agentAutomationAccepted && medicalRecommendations
                          ? 'Server configuration is not confirmed — enable it again'
                          : agentLastSuccessfulRunAt
                            ? `Last check: ${formatDate(agentLastSuccessfulRunAt)}. Background runs are not guaranteed`
                            : 'A check will run when the connection is stable; background timing is not guaranteed'
              }
              value={medicalRecommendations}
              disabled={
                readOnly ||
                (!medicalRecommendations &&
                  (!agentConsentAccepted ||
                    !agentAutomationEnabled ||
                    !agentProviderConfigured))
              }
              onChange={(value) => {
                void saveAgentAutomation(value);
              }}
            />
            <ProfileToggleRow
              label="Plan updates"
              subtitle="Neutral text only, without test names"
              value={agentNotifications}
              disabled={
                readOnly || !medicalRecommendations || !notificationsEnabled
              }
              onChange={(value) => {
                setAgentNotifications(value);
                void savePreferences({ agentNotifications: value });
              }}
              isLast
            />
          </ProfileSettingsGroup>
          <ProfileActionRow
            secondary
            icon="sparkles"
            label={
              aiConsentAccepted
                ? 'Revoke AI Chat consent'
                : 'AI Chat consent has not been granted'
            }
            subtitle="Only visible chat text is transmitted"
            disabled={!aiConsentAccepted}
            onPress={revokeAiConsent}
          />
          <ProfileActionRow
            secondary
            icon="shield.lefthalf.filled"
            label={
              agentConsentAccepted
                ? 'Disable Assistant access'
                : 'Assistant access has not been granted'
            }
            subtitle="Profile, journal, labs, plan, and chats"
            disabled={!agentConsentAccepted}
            onPress={revokeAgentConsent}
            singleLineLabel
            singleLineSubtitle
          />
          <ProfileActionRow
            secondary
            icon="list.bullet.rectangle"
            label="Assistant mode data"
            subtitle="View permitted data categories"
            onPress={() =>
              Alert.alert(
                'Assistant access',
                'After separate consent: health details from your profile, journal entries from the past 30 days, confirmed lab results and home tests, and your active plan. Only when requested: older journal entries, your other chats, and document metadata. When automated recommendations are enabled, plan checks may use new user messages from Assistant mode and only the category and date of a new document. Regular chats, AI responses, file names, and file contents are never sent automatically. Your name, contacts, identifiers, and file paths are unavailable.',
              )
            }
          />
          <ProfileActionRow
            secondary
            icon="trash"
            label="Delete Assistant data"
            subtitle="Plan, rules, and change log"
            onPress={clearAgentData}
          />
          <ProfileActionRow
            secondary
            icon="gearshape.fill"
            label={
              Platform.OS === 'ios'
                ? 'iPhone permissions'
                : 'Device permissions'
            }
            onPress={openSystemSettings}
          />
          <ProfileActionRow
            testID="e2e-sync-now"
            icon="arrow.triangle.2.circlepath"
            label={
              syncStatus === 'syncing'
                ? 'Syncing…'
                : syncStatus === 'offline'
                  ? 'Waiting for connection'
                  : 'Sync now'
            }
            subtitle={serviceIssue?.message ?? syncMessage}
            disabled={
              syncDisabled ||
              syncStatus === 'syncing' ||
              syncStatus === 'offline' ||
              readOnly
            }
            onPress={syncNow}
          />
        </>
      );

    case 'imports':
      return <DataTransferSection mode="import" />;

    case 'exports':
      return <DataTransferSection mode="export" />;

    case 'security':
      return (
        <>
          <ConfirmedAction
            label="Delete local data"
            confirmation="Tap again: device data will be deleted"
            onConfirm={clearAllLocalData}
          />
          <ProfileActionRow
            destructive
            icon="rectangle.portrait.and.arrow.right"
            label="Sign out"
            disabled={readOnly || !hasViewerIdentity}
            onPress={signOut}
          />
        </>
      );

    case 'notification-settings':
      return (
        <>
          <ProfileSettingsGroup title="Notifications">
            <ProfileToggleRow
              label="Allow notifications"
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
            <ProfileToggleRow
              label="System"
              value={notificationsEnabled && journalNotifications}
              disabled={!notificationsEnabled}
              onChange={(value) => {
                setJournalNotifications(value);
                void savePreferences({ journalNotifications: value });
              }}
            />
            <ProfileToggleRow
              label="Results and labs"
              value={notificationsEnabled && resultNotifications}
              disabled={!notificationsEnabled}
              onChange={(value) => {
                setResultNotifications(value);
                void savePreferences({ resultNotifications: value });
              }}
              isLast
            />
          </ProfileSettingsGroup>
          <ProfileSettingsGroup title="Notification style">
            <View style={styles.notificationToneBlock}>
              <ProfileChoiceControl
                accessibilityLabel="Notification style"
                defaultValue="formal"
                value={notificationTone}
                options={[
                  { label: 'Formal', value: 'formal' },
                  { label: 'Friendly', value: 'cute' },
                ]}
                onChange={(value) => {
                  setNotificationTone(value);
                  void savePreferences({ notificationTone: value });
                }}
              />
              <NotificationTonePreview tone={notificationTone} />
            </View>
          </ProfileSettingsGroup>
          <ProfileActionRow
            secondary
            icon="bell.badge.fill"
            label="Send test notification"
            testID="e2e-notification-test"
            disabled={notificationBusy || !notificationsEnabled}
            onPress={() => void sendTestNotification(notificationTone)}
          />
          {notificationMessage ? (
            <ProfileEmptyMessage title={notificationMessage} />
          ) : null}
          <ProfileActionRow
            secondary
            icon="gearshape.fill"
            label={
              Platform.OS === 'ios'
                ? 'Open iPhone Settings'
                : 'Open device settings'
            }
            onPress={openSystemSettings}
          />
        </>
      );

    case 'delete-account':
      return (
        <>
          <ProfileActionRow
            destructive
            icon="trash.fill"
            label="Delete account and all data"
            disabled={readOnly || !hasViewerIdentity}
            onPress={() =>
              Alert.alert(
                'Delete account?',
                'Your data can be recovered for 30 days.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => void requestAccountDeletion(),
                  },
                ],
              )
            }
          />
          {serviceIssue ? (
            <ProfileEmptyMessage title={serviceIssue.message} />
          ) : null}
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
  { value: 'mcg', label: 'mcg' },
  { value: 'mg', label: 'mg' },
  { value: 'g', label: 'g' },
  { value: 'ml', label: 'ml' },
  { value: 'iu', label: 'IU' },
] as const;

type MedicationDoseUnit = (typeof medicationDoseUnits)[number]['value'];

const medicationFrequencyOptions = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
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
  const cleaned = value.replace(/[^\d.,]/g, '');
  const separatorIndex = cleaned.search(/[.,]/);
  if (separatorIndex < 0) return cleaned;
  return `${cleaned.slice(0, separatorIndex + 1)}${cleaned
    .slice(separatorIndex + 1)
    .replace(/[.,]/g, '')}`;
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
  const insets = useSafeAreaInsets();
  const [editorVisible, setEditorVisible] = useState(false);
  const [reduceEditorMotion, setReduceEditorMotion] = useState(false);
  const editorProgress = useRef(new Animated.Value(0)).current;
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
      ? 'Condition or diagnosis'
      : props.kind === 'medication'
        ? 'Medication name'
        : 'Allergen';
  const secondaryLabel =
    props.kind === 'condition'
      ? 'Note'
      : props.kind === 'medication'
        ? 'Dosage'
        : 'Reaction';
  const addLabel =
    props.kind === 'condition'
      ? 'Add record'
      : props.kind === 'medication'
        ? 'Add medication'
        : 'Add allergy';

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceEditorMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceEditorMotion,
    );
    return () => subscription.remove();
  }, []);

  const clearEditor = () => {
    setEditorVisible(false);
    setSelectedId(undefined);
    setPrimary('');
    setSecondary('');
    setMedicationDoseUnit('mg');
    setMedicationFrequency('day');
  };

  const openEditor = () => {
    editorProgress.stopAnimation();
    setEditorVisible(true);

    if (reduceEditorMotion) {
      editorProgress.setValue(1);
      return;
    }

    editorProgress.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(editorProgress, {
        toValue: 1,
        stiffness: 270,
        damping: 30,
        mass: 1,
        overshootClamping: false,
        restDisplacementThreshold: 0.5,
        restSpeedThreshold: 0.5,
        useNativeDriver: true,
      }).start();
    });
  };

  const reset = () => {
    editorProgress.stopAnimation();

    if (reduceEditorMotion) {
      editorProgress.setValue(0);
      clearEditor();
      return;
    }

    Animated.timing(editorProgress, {
      toValue: 0,
      duration: 220,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) clearEditor();
    });
  };

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
          <ProfileSettingsGroup title="Saved records">
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
                    ? 'Active'
                    : 'Completed'
                  : 'active' in item
                    ? item.active
                      ? 'Taking'
                      : 'Completed'
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
        <ProfileEmptyMessage title="No records yet" />
      )}
      <Modal
        animationType="none"
        transparent
        statusBarTranslucent
        visible={editorVisible}
        onRequestClose={reset}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.medicalEditorModalRoot}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.medicalEditorBackdropVisual,
              {
                opacity: editorProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.28],
                }),
              },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close form"
            onPress={reset}
            style={styles.medicalEditorBackdrop}
          />
          <Animated.View
            style={[
              styles.inlineEditor,
              styles.medicalEditorSheet,
              { paddingBottom: Math.max(insets.bottom, spacing.md) },
              {
                transform: [
                  {
                    translateY: editorProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [520, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.medicalEditorHeader}>
              <AppText
                role="heading"
                weight="semibold"
                style={styles.medicalEditorTitle}
              >
                {selected ? 'Edit record' : addLabel}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close form"
                hitSlop={12}
                onPress={reset}
                style={styles.medicalEditorClose}
              >
                <AppText role="heading" color={colors.text.secondary}>
                  ×
                </AppText>
              </Pressable>
            </View>
            <TextInput
              editable={!props.readOnly}
              testID="e2e-medical-primary"
              value={primary}
              onChangeText={setPrimary}
              placeholder={primaryLabel}
              placeholderTextColor="#989395"
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
                    placeholder="Amount"
                    placeholderTextColor="#989395"
                    style={[styles.inlineInput, styles.medicationDoseInput]}
                  />
                  <SegmentedSwitcher
                    accessibilityLabel="Dosage unit"
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
                    Frequency
                  </AppText>
                  <SegmentedSwitcher
                    accessibilityLabel="Medication frequency"
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
                placeholderTextColor="#989395"
                style={styles.inlineInput}
              />
            )}
            <View style={styles.medicalEditorActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={reset}
                style={styles.medicalEditorSecondaryAction}
              >
                <AppText role="body" weight="semibold">
                  Back
                </AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save"
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
                <AppText role="body" weight="semibold" color="#FFFFFF">
                  Save
                </AppText>
              </Pressable>
            </View>
            {selected ? (
              <ConfirmedAction
                compact
                label="Delete record"
                confirmation="Confirm record deletion"
                onConfirm={remove}
              />
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const csvCategories: Array<{
  value: HealthEntityName;
  label: string;
}> = [
  { value: 'journalEntries', label: 'Journal' },
  { value: 'labResults', label: 'Labs' },
  { value: 'scanResults', label: 'Scans' },
  { value: 'medicalConditions', label: 'History' },
  { value: 'medications', label: 'Medications' },
  { value: 'allergyRisks', label: 'Allergies' },
];

function DataTransferSection({ mode }: { mode: 'import' | 'export' }) {
  const store = useHealthStore();
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [category, setCategory] = useState<HealthEntityName>('journalEntries');
  const [preview, setPreview] =
    useState<ReturnType<typeof parseImportPayload>>();
  const [message, setMessage] = useState<string>();
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
    setMessage(undefined);
    const picked = e2eImportFixtureUri
      ? undefined
      : await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
          multiple: false,
          type: ['application/json', 'text/csv', 'text/comma-separated-values'],
        });
    const asset = e2eImportFixtureUri
      ? { uri: e2eImportFixtureUri }
      : picked?.canceled
        ? undefined
        : picked?.assets[0];
    if (!asset) return;
    try {
      const parsed = parseImportPayload(await readAsStringAsync(asset.uri));
      setPreview(parsed);
      setMessage(`Records checked: ${parsed.total}`);
    } catch (error) {
      console.error('Import validation failed', error);
      setPreview(undefined);
      setMessage('The file does not match the ArtificialLabs JSON/CSV format.');
    }
  };

  const applyImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await store.importData(preview);
      setMessage(`Records imported: ${preview.total}`);
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    if (!cacheDirectory) {
      setMessage('File export is unavailable on this platform.');
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
        setMessage('The file is ready to export.');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        setMessage(`File prepared: ${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Export ArtificialLabs',
        mimeType: format === 'json' ? 'application/json' : 'text/csv',
      });
      setMessage('The file is ready to export.');
    } catch (error) {
      console.error('Export failed', error);
      setMessage('Could not prepare the export file.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'import') {
    return (
      <View style={styles.medicalHistoryLayout}>
        <ProfileEmptyMessage title="ArtificialLabs JSON and CSV are supported" />
        <ProfileActionRow
          icon="square.and.arrow.down"
          label="Choose file"
          disabled={store.readOnly || busy}
          onPress={() => void pickImport()}
        />
        {preview ? (
          <ProfileActionRow
            icon="checkmark"
            label={`Import ${preview.total} records`}
            disabled={busy}
            onPress={() => void applyImport()}
          />
        ) : null}
        {message ? (
          <AppText role="label" color={colors.text.secondary}>
            {message}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.medicalHistoryLayout}>
      <ProfileChoiceControl
        accessibilityLabel="Export format"
        defaultValue="json"
        label="Format"
        value={format}
        options={[
          { value: 'json', label: 'JSON' },
          { value: 'csv', label: 'CSV' },
        ]}
        onChange={setFormat}
      />
      {format === 'csv' ? (
        <ProfileVerticalChoiceControl
          accessibilityLabel="CSV category"
          defaultValue="journalEntries"
          label="Category"
          value={category}
          options={csvCategories}
          onChange={setCategory}
        />
      ) : null}
      <ProfileEmptyMessage title="Source files and local URIs are not included in exports" />
      <ProfileActionRow
        icon="square.and.arrow.up"
        label="Prepare export"
        disabled={store.readOnly || busy}
        onPress={() => void exportData()}
      />
      {message ? (
        <AppText role="label" color={colors.text.secondary}>
          {message}
        </AppText>
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  phoneVerificationRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  phoneVerificationInput: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: '#F0EEF0',
    color: colors.text.primary,
    paddingHorizontal: spacing.md,
    fontFamily: 'SFProDisplay-Regular',
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
    backgroundColor: '#F3F1F2',
  },
  profilePage: {
    flex: 1,
  },
  detailPage: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: '#F3F1F2',
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
    backgroundColor: 'rgba(245,243,243,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    backgroundColor: '#FDECE5',
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
    padding: spacing.md,
  },
  notificationTonePreview: {
    gap: spacing.md,
  },
  notificationToneImageFrame: {
    width: '100%',
    aspectRatio: 1.75,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#FDECE5',
  },
  notificationToneImage: {
    position: 'absolute',
    top: '2.5%',
    left: '2.5%',
    width: '95%',
    height: '95%',
  },
  notificationExampleCard: {
    borderWidth: 1,
    borderColor: '#EEE7E9',
    borderRadius: radii.lg,
    backgroundColor: '#FFFEFE',
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
    backgroundColor: '#FDECE5',
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
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
  },
  medicalEditorModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  medicalEditorBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  medicalEditorBackdropVisual: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1C181A',
  },
  medicalEditorSheet: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 10,
    shadowColor: '#2B2025',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 12,
  },
  medicalEditorHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medicalEditorTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 25,
  },
  medicalEditorClose: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicalEditorActions: {
    width: '100%',
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  medicalEditorSecondaryAction: {
    height: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#EEE3E7',
    backgroundColor: '#F7F1F3',
  },
  medicalEditorPrimaryAction: {
    height: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: colors.brand.primary,
  },
  medicalEditorPrimaryActionDisabled: {
    opacity: 0.55,
  },
  compactConfirmedAction: {
    height: 46,
    borderRadius: 23,
  },
  inlineInput: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: '#F6F3F4',
    paddingHorizontal: spacing.md,
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
    backgroundColor: '#FDEAEA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217,56,56,0.24)',
  },
  dangerDescription: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});
