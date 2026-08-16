import { useAuthActions } from '@convex-dev/auth/react';
import * as DocumentPicker from 'expo-document-picker';
import {
  cacheDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
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
  profileTones,
  radii,
  sizes,
  spacing,
} from '../design-system';
import { useHealthStore } from '../lib/health-store';
import {
  createEntityCsv,
  createJsonArchive,
  parseImportPayload,
} from '../lib/data-transfer';
import { persistLabDocument } from '../lib/local-files';
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
import DesignSystemScreen from './design-system';

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
  | 'today-ui-kit'
  | 'ui-kit';

const SECTION_TITLES: Record<ProfileSection, string> = {
  account: 'Данные профиля',
  personal: 'Основная информация',
  'medical-history': 'Медицинская история',
  medications: 'Препараты',
  allergies: 'Аллергии и риски',
  documents: 'Документы',
  programs: 'Программы',
  language: 'Язык и регион',
  permissions: 'Разрешения и данные',
  imports: 'Импорт данных',
  exports: 'Экспорт данных',
  security: 'Аккаунт и безопасность',
  'notification-settings': 'Настройки уведомлений',
  'delete-account': 'Удаление аккаунта',
  onboarding: 'Онбординг',
  'planning-today-ui-kit': 'Сегодня · Планирование',
  'scan-concepts': 'Варианты сканирования',
  'today-ui-kit': 'Сегодня · UI kit',
  'ui-kit': 'UI kit',
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
  const insets = useSafeAreaInsets();
  const { panel } = useLocalSearchParams<{ panel?: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const { signOut } = useAuthActions();
  const {
    accountDeletion,
    allergyRisks,
    cloudSyncEnabled,
    clearAllLocalData,
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
  } = useHealthStore();
  const [activeSection, setActiveSection] = useState<ProfileSection | null>(
    null,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [journalNotifications, setJournalNotifications] = useState(true);
  const [resultNotifications, setResultNotifications] = useState(true);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [medicalRecommendations, setMedicalRecommendations] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>();
  const [reducePageMotion, setReducePageMotion] = useState(false);
  const sectionProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (panel === 'ui-kit') {
      setActiveSection('ui-kit');
    } else if (panel === 'onboarding') {
      setActiveSection('onboarding');
    } else if (panel === 'scan-concepts') {
      setActiveSection('scan-concepts');
    } else if (panel === 'today-ui-kit') {
      setActiveSection('today-ui-kit');
    } else if (panel === 'planning-today-ui-kit') {
      setActiveSection('planning-today-ui-kit');
    }
  }, [panel]);

  useEffect(() => {
    const stored = preferences.find((item) => !item.deletedAt);
    if (!stored) return;
    setNotificationsEnabled(stored.notificationsEnabled);
    setJournalNotifications(stored.journalNotifications);
    setResultNotifications(stored.resultNotifications);
    setAnalyticsEnabled(stored.anonymousAnalytics);
    setMedicalRecommendations(stored.medicalRecommendations);
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
  const visibleDocuments = documents.filter((item) => !item.deletedAt);
  const documentCount = Math.max(
    visibleDocuments.length,
    labResults.filter(
      (result) => !result.deletedAt && result.hasLocalSourceDocument,
    ).length,
  );
  const displayName = profile?.displayName?.trim() || 'Демо-профиль';

  const synchronize = async () => {
    setSyncMessage(undefined);
    if (await syncNow()) {
      setSyncMessage('Данные синхронизированы');
    } else {
      setSyncMessage('Не удалось синхронизировать данные');
    }
  };

  const openSection = (section: ProfileSection) => {
    setActiveSection(section);
  };

  const addDocumentFromPicker = async () => {
    if (readOnly) return;
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
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
            medicationCount={medications.filter((item) => !item.deletedAt).length}
            onOpen={openSection}
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
          {activeSection === 'ui-kit' ? (
            <DesignSystemScreen onBack={closeSection} />
          ) : activeSection === 'today-ui-kit' ? (
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
              title={SECTION_TITLES[activeSection]}
              topInset={insets.top}
              onBack={closeSection}
            >
              {renderProfileSectionDirect({
                analyticsEnabled,
                documentCount,
                documents: visibleDocuments,
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
                setCloudSyncEnabled,
                setAnalyticsEnabled,
                setJournalNotifications,
                setMedicalRecommendations,
                setNotificationsEnabled,
                setProgramStatus,
                setResultNotifications,
                signOut: () => void signOut(),
                requestAccountDeletion,
                syncMessage,
                syncNow: () => void synchronize(),
                syncDisabled:
                  !viewerEmail ||
                  !cloudSyncEnabled ||
                  accountDeletion.pendingDeletion,
                syncStatus,
                viewerEmail,
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
    </View>
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
  return (
    <View style={styles.overview}>
      <ProfileSettingsGroup title="Профиль здоровья">
        <ProfileSettingsRow
          icon="person.text.rectangle.fill"
          iconAsset={ProfileIcon01}
          fallback="Я"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Основная информация"
          onPress={() => onOpen('personal')}
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
          label="Импорт данных"
          value="Не подключён"
          isLast
          onPress={() => onOpen('imports')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Аккаунт">
        <ProfileSettingsRow
          icon="square.and.arrow.up.fill"
          iconAsset={ProfileIcon11}
          fallback="Э"
          iconBackground={profileTones.account.tile}
          iconColor={profileTones.account.glyph}
          label="Экспорт данных"
          onPress={() => onOpen('exports')}
        />
        <ProfileSettingsRow
          icon="lock.shield.fill"
          iconAsset={ProfileIcon12}
          fallback="Б"
          iconBackground={profileTones.account.tile}
          iconColor={profileTones.account.glyph}
          label="Аккаунт и безопасность"
          onPress={() => onOpen('security')}
        />
        <ProfileSettingsRow
          icon="trash.fill"
          iconAsset={ProfileIcon13}
          fallback="×"
          iconBackground={profileTones.destructive.tile}
          iconColor={profileTones.destructive.glyph}
          label="Удаление аккаунта"
          destructive
          isLast
          onPress={() => onOpen('delete-account')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Разработка">
        <ProfileSettingsRow
          icon="square.grid.2x2.fill"
          fallback="UI"
          iconBackground={profileTones.account.tile}
          iconColor={colors.brand.primary}
          label="UI kit"
          value="Компоненты"
          onPress={() => onOpen('ui-kit')}
        />
        <ProfileSettingsRow
          icon="sparkles.rectangle.stack.fill"
          fallback="ОБ"
          iconBackground="#F4E7EB"
          iconColor={colors.brand.primary}
          label="Онбординг"
          value="5 вариантов"
          onPress={() => onOpen('onboarding')}
        />
        <ProfileSettingsRow
          icon="viewfinder"
          fallback="СК"
          iconBackground="#E7EDF0"
          iconColor="#3E6472"
          label="Варианты страницы Скан"
          value="5 концептов"
          isLast
          onPress={() => onOpen('scan-concepts')}
        />
      </ProfileSettingsGroup>

      <ProfileSettingsGroup title="Сохранённые экраны">
        <ProfileSettingsRow
          icon="heart.circle.fill"
          fallback="СГ"
          iconBackground="#FBE7F0"
          iconColor={colors.brand.primary}
          label="Страница «Сегодня»"
          value="UI kit"
          onPress={() => onOpen('today-ui-kit')}
        />
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

function TodayProfileKitPreview() {
  const { width } = useWindowDimensions();
  const previewWidth = Math.min(370, width - sizes.screenGutter * 2);
  const previewScale = previewWidth / 402;

  return (
    <View style={styles.todayKitSection}>
      <View style={styles.todayKitCopy}>
        <AppText role="heading" weight="semibold">
          Текущая версия
        </AppText>
        <AppText role="body" color={colors.text.secondary}>
          Сохранённый полноэкранный образец страницы «Сегодня».
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

function ProfileDetailScreen({
  bottomInset,
  children,
  onBack,
  title,
  topInset,
}: {
  bottomInset: number;
  children: ReactNode;
  onBack: () => void;
  title: string;
  topInset: number;
}) {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" hidden={false} />
      <View style={[styles.detailHeader, { paddingTop: topInset + 8 }]}>
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
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.detailContent,
          {
            paddingTop: topInset + 84,
            paddingBottom: Math.max(bottomInset + 112, 128),
          },
        ]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

function renderProfileSectionDirect({
  analyticsEnabled,
  allergyRisks,
  cloudSyncEnabled,
  clearAllLocalData,
  deleteRecord,
  documentCount,
  documents,
  journalNotifications,
  medicalConditions,
  medications,
  medicalRecommendations,
  notificationsEnabled,
  openSystemSettings,
  profile,
  programs,
  readOnly,
  resultNotifications,
  requestAccountDeletion,
  saveAllergyRisk,
  saveDocumentFromPicker,
  saveMedicalCondition,
  saveMedication,
  savePreferences,
  saveProfile,
  section,
  setCloudSyncEnabled,
  setAnalyticsEnabled,
  setJournalNotifications,
  setMedicalRecommendations,
  setNotificationsEnabled,
  setProgramStatus,
  setResultNotifications,
  signOut,
  syncMessage,
  syncNow,
  syncDisabled,
  syncStatus,
  viewerEmail,
}: {
  analyticsEnabled: boolean;
  allergyRisks: AllergyRisk[];
  cloudSyncEnabled: boolean;
  clearAllLocalData: () => Promise<void>;
  deleteRecord: <K extends HealthEntityName>(
    entity: K,
    item: HealthEntityMap[K],
  ) => Promise<void>;
  documentCount: number;
  documents: HealthDocument[];
  journalNotifications: boolean;
  medicalConditions: MedicalCondition[];
  medications: Medication[];
  medicalRecommendations: boolean;
  notificationsEnabled: boolean;
  openSystemSettings: () => void;
  profile: LocalProfile | null;
  programs: MonitoringProgram[];
  readOnly: boolean;
  resultNotifications: boolean;
  requestAccountDeletion: () => Promise<void>;
  saveAllergyRisk: (
    input: Omit<AllergyRisk, 'localId' | 'updatedAt'> & { localId?: string },
  ) => Promise<void>;
  saveDocumentFromPicker: () => Promise<void>;
  saveMedicalCondition: (
    input: Omit<MedicalCondition, 'localId' | 'updatedAt'> & { localId?: string },
  ) => Promise<void>;
  saveMedication: (
    input: Omit<Medication, 'localId' | 'updatedAt'> & { localId?: string },
  ) => Promise<void>;
  savePreferences: (input: {
    anonymousAnalytics?: boolean;
    medicalRecommendations?: boolean;
    notificationsEnabled?: boolean;
    journalNotifications?: boolean;
    resultNotifications?: boolean;
  }) => Promise<void>;
  saveProfile: (input: Partial<Omit<LocalProfile, 'updatedAt'>>) => Promise<void>;
  section: ProfileSection;
  setCloudSyncEnabled: (enabled: boolean) => Promise<void>;
  setAnalyticsEnabled: (value: boolean) => void;
  setJournalNotifications: (value: boolean) => void;
  setMedicalRecommendations: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setProgramStatus: (
    program: MonitoringProgram,
    status: MonitoringProgram['status'],
  ) => Promise<void>;
  setResultNotifications: (value: boolean) => void;
  signOut: () => void;
  syncMessage?: string;
  syncNow: () => void;
  syncDisabled: boolean;
  syncStatus: 'idle' | 'syncing' | 'offline' | 'error';
  viewerEmail?: string;
}) {
  switch (section) {
    case 'account':
      return (
        <>
          <ProfileSettingsGroup title="Контакты">
            <ProfileFieldRow
              label="E-mail"
              inputMode="email"
              defaultValue={viewerEmail}
              placeholder="E-mail входа"
              disabled
            />
            <ProfileFieldRow
              label="Телефон"
              inputMode="tel"
              defaultValue={profile?.phone}
              placeholder="Добавить"
              disabled={readOnly}
              onSubmit={(phone) => void saveProfile({ phone: phone || undefined })}
              isLast
            />
          </ProfileSettingsGroup>

          <ProfileVerticalChoiceControl<HealthGoal>
            accessibilityLabel="Цель использования"
            defaultValue={
              profile?.goal === 'pregnancy' ? 'pregnancy' : 'planning'
            }
            disabled={readOnly}
            grouped
            label="Цель использования"
            value={profile?.goal === 'pregnancy' ? 'pregnancy' : 'planning'}
            options={[
              { value: 'planning', label: 'Планирование' },
              { value: 'pregnancy', label: 'Беременность' },
            ]}
            onChange={(goal) => void saveProfile({ goal })}
          />

          <ProfileSettingsGroup title="Цикл">
            {profile?.goal !== 'pregnancy' ? (
              <ProfileFieldRow
                label="Средняя длина"
                defaultValue={
                  profile?.cycleLengthDays
                    ? String(profile.cycleLengthDays)
                    : ''
                }
                inputMode="numeric"
                suffix="дней"
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
                  ? 'Начало беременности'
                  : 'Последняя менструация'
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
          <ProfileSettingsGroup title="Личные данные">
            <ProfileFieldRow
              label="Имя или псевдоним"
              defaultValue={profile?.displayName}
              disabled={readOnly}
              onSubmit={(displayName) => {
                if (displayName) void saveProfile({ displayName });
              }}
            />
            <ProfileDateRow
              label="Дата рождения"
              value={profile?.birthDate}
              minimumDate={new Date(1900, 0, 1)}
              maximumDate={new Date()}
              disabled={readOnly}
              onChange={(birthDate) => void saveProfile({ birthDate })}
            />
            <ProfileFieldRow
              label="Рост"
              defaultValue={profile?.heightCm ? String(profile.heightCm) : ''}
              inputMode="numeric"
              suffix="см"
              disabled={readOnly}
              onSubmit={(value) => {
                const heightCm = Number(value);
                if (heightCm >= 80 && heightCm <= 250)
                  void saveProfile({ heightCm });
              }}
            />
            <ProfileFieldRow
              label="Вес"
              defaultValue={profile?.weightKg ? String(profile.weightKg) : ''}
              inputMode="numeric"
              suffix="кг"
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
            label="Добавить документ"
            pill
            disabled={readOnly}
            onPress={() => void saveDocumentFromPicker()}
          />
          {documents.length ? (
            <ProfileSettingsGroup title={`Сохранено: ${documentCount}`}>
              {documents.map((item, index) => (
                <ProfileSettingsRow
                  key={item.localId}
                  icon="doc.text.fill"
                  fallback="Д"
                  iconBackground={profileTones.health.tile}
                  label={item.title}
                  value={formatDate(item.documentDate)}
                  isLast={index === documents.length - 1}
                  onPress={() => void deleteRecord('documents', item)}
                />
              ))}
            </ProfileSettingsGroup>
          ) : (
            <ProfileEmptyMessage title="Документы пока не добавлены" />
          )}
        </View>
      );

    case 'programs':
      return (
        <>
          {programs.length ? (
            <ProfileSettingsGroup title="Подключённые программы">
              {programs.map((program, index) => (
                <ProfileToggleRow
                  key={program.localId}
                  label={program.title}
                  subtitle={`Начало: ${formatDate(program.startedAt)}`}
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
              title="Нет подключённых программ"
              description="Программы появятся после выбора сценария наблюдения."
            />
          )}
        </>
      );

    case 'language':
      return <ProfileLanguageSelector />;

    case 'permissions':
      return (
        <>
          <ProfileSettingsGroup title="Данные">
            <ProfileToggleRow
              label="Облачная синхронизация"
              subtitle="Только структурированные данные"
              testID="e2e-cloud-sync-toggle"
              value={cloudSyncEnabled}
              disabled={readOnly || !viewerEmail}
              onChange={(enabled) => void setCloudSyncEnabled(enabled)}
            />
            <ProfileToggleRow
              label="Анонимная аналитика"
              value={analyticsEnabled}
              disabled={readOnly}
              onChange={(value) => {
                setAnalyticsEnabled(value);
                void savePreferences({ anonymousAnalytics: value });
              }}
            />
            <ProfileToggleRow
              label="Медицинские данные"
              subtitle="Использовать для персональных рекомендаций"
              value={medicalRecommendations}
              disabled={readOnly}
              onChange={(value) => {
                setMedicalRecommendations(value);
                void savePreferences({ medicalRecommendations: value });
              }}
              isLast
            />
          </ProfileSettingsGroup>
          <ProfileActionRow
            secondary
            icon="gearshape.fill"
            label="Разрешения iPhone"
            onPress={openSystemSettings}
          />
          <ProfileActionRow
            icon="arrow.triangle.2.circlepath"
            label={
              syncStatus === 'syncing'
                ? 'Синхронизация…'
                : 'Синхронизировать сейчас'
            }
            subtitle={syncStatus === 'error' ? 'Произошла ошибка' : syncMessage}
            disabled={syncDisabled || syncStatus === 'syncing' || readOnly}
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
            label="Удалить локальные данные"
            confirmation="Нажмите ещё раз: данные устройства будут удалены"
            onConfirm={clearAllLocalData}
          />
          <ProfileActionRow
            destructive
            icon="rectangle.portrait.and.arrow.right"
            label="Выйти из аккаунта"
            disabled={readOnly || !viewerEmail}
            onPress={signOut}
          />
        </>
      );

    case 'notification-settings':
      return (
        <>
          <ProfileSettingsGroup title="Уведомления">
            <ProfileToggleRow
              label="Разрешить уведомления"
              value={notificationsEnabled}
              onChange={(value) => {
                setNotificationsEnabled(value);
                void savePreferences({ notificationsEnabled: value });
              }}
            />
            <ProfileToggleRow
              label="Системные"
              value={notificationsEnabled && journalNotifications}
              disabled={!notificationsEnabled}
              onChange={(value) => {
                setJournalNotifications(value);
                void savePreferences({ journalNotifications: value });
              }}
            />
            <ProfileToggleRow
              label="Результаты и анализы"
              value={notificationsEnabled && resultNotifications}
              disabled={!notificationsEnabled}
              onChange={(value) => {
                setResultNotifications(value);
                void savePreferences({ resultNotifications: value });
              }}
              isLast
            />
          </ProfileSettingsGroup>
          <ProfileActionRow
            secondary
            icon="gearshape.fill"
            label="Открыть настройки iPhone"
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
            label="Удалить аккаунт и все данные"
            disabled={readOnly || !viewerEmail}
            onPress={() =>
              Alert.alert(
                'Удалить аккаунт?',
                'Данные можно будет восстановить в течение 30 дней.',
                [
                { text: 'Отмена', style: 'cancel' },
                  {
                    text: 'Удалить',
                    style: 'destructive',
                    onPress: () =>
                      void requestAccountDeletion().catch((error) => {
                        console.error('Account deletion request failed', error);
                        Alert.alert(
                          'Не удалось удалить аккаунт',
                          'Проверьте подключение и попробуйте ещё раз.',
                        );
                      }),
                  },
                ],
              )
            }
          />
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

function MedicalCrudSection(props: MedicalCrudProps) {
  const [selectedId, setSelectedId] = useState<string>();
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const records = props.records;
  const selected = records.find((item) => item.localId === selectedId);
  const primaryLabel =
    props.kind === 'condition'
      ? 'Состояние или диагноз'
      : props.kind === 'medication'
        ? 'Название препарата'
        : 'Аллерген или риск';
  const secondaryLabel =
    props.kind === 'condition'
      ? 'Заметка'
      : props.kind === 'medication'
        ? 'Дозировка'
        : 'Реакция';

  const reset = () => {
    setSelectedId(undefined);
    setPrimary('');
    setSecondary('');
  };

  const select = (item: MedicalCondition | Medication | AllergyRisk) => {
    setSelectedId(item.localId);
    if ('title' in item) {
      setPrimary(item.title);
      setSecondary(item.notes ?? '');
    } else if ('name' in item) {
      setPrimary(item.name);
      setSecondary(item.dosage ?? '');
    } else {
      setPrimary(item.allergen);
      setSecondary(item.reaction ?? '');
    }
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
      await props.onSave({
        ...current,
        localId: current?.localId,
        name: normalized,
        dosage: secondary.trim() || undefined,
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

  return (
    <View style={styles.medicalHistoryLayout}>
      {records.length ? (
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
      ) : (
        <ProfileEmptyMessage title="Записей пока нет" />
      )}
      <View style={styles.inlineEditor}>
        <AppText role="label" weight="semibold">
          {selected ? 'Изменить запись' : 'Добавить запись'}
        </AppText>
        <TextInput
          editable={!props.readOnly}
          value={primary}
          onChangeText={setPrimary}
          placeholder={primaryLabel}
          placeholderTextColor="#989395"
          style={styles.inlineInput}
        />
        <TextInput
          editable={!props.readOnly}
          value={secondary}
          onChangeText={setSecondary}
          placeholder={secondaryLabel}
          placeholderTextColor="#989395"
          style={styles.inlineInput}
        />
        <ProfileActionRow
          icon="checkmark"
          label="Сохранить"
          disabled={props.readOnly || !primary.trim()}
          onPress={() => void save()}
        />
        {selected ? (
          <ConfirmedAction
            label="Удалить запись"
            confirmation="Подтвердить удаление записи"
            onConfirm={remove}
          />
        ) : null}
      </View>
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

function DataTransferSection({ mode }: { mode: 'import' | 'export' }) {
  const store = useHealthStore();
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [category, setCategory] = useState<HealthEntityName>('journalEntries');
  const [preview, setPreview] = useState<ReturnType<typeof parseImportPayload>>();
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
    preferences: store.preferences,
  };

  const pickImport = async () => {
    setMessage(undefined);
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/json', 'text/csv', 'text/comma-separated-values'],
    });
    const asset = picked.canceled ? undefined : picked.assets[0];
    if (!asset) return;
    try {
      const parsed = parseImportPayload(await readAsStringAsync(asset.uri));
      setPreview(parsed);
      setMessage(`Проверено записей: ${parsed.total}`);
    } catch (error) {
      console.error('Import validation failed', error);
      setPreview(undefined);
      setMessage('Файл не соответствует формату ArtificialLabs JSON/CSV.');
    }
  };

  const applyImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await store.importData(preview);
      setMessage(`Импортировано записей: ${preview.total}`);
      setPreview(undefined);
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    if (!cacheDirectory) {
      setMessage('Экспорт файлов недоступен на этой платформе.');
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
      if (!(await Sharing.isAvailableAsync())) {
        setMessage(`Файл подготовлен: ${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Экспорт ArtificialLabs',
        mimeType: format === 'json' ? 'application/json' : 'text/csv',
      });
      setMessage('Файл подготовлен для экспорта.');
    } catch (error) {
      console.error('Export failed', error);
      setMessage('Не удалось подготовить файл экспорта.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'import') {
    return (
      <View style={styles.medicalHistoryLayout}>
        <ProfileEmptyMessage title="Поддерживаются ArtificialLabs JSON и CSV" />
        <ProfileActionRow
          icon="square.and.arrow.down"
          label="Выбрать файл"
          disabled={store.readOnly || busy}
          onPress={() => void pickImport()}
        />
        {preview ? (
          <ProfileActionRow
            icon="checkmark"
            label={`Импортировать ${preview.total} записей`}
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
        accessibilityLabel="Формат экспорта"
        defaultValue="json"
        label="Формат"
        value={format}
        options={[
          { value: 'json', label: 'JSON' },
          { value: 'csv', label: 'CSV' },
        ]}
        onChange={setFormat}
      />
      {format === 'csv' ? (
        <ProfileVerticalChoiceControl
          accessibilityLabel="Категория CSV"
          defaultValue="journalEntries"
          label="Категория"
          value={category}
          options={csvCategories}
          onChange={setCategory}
        />
      ) : null}
      <ProfileEmptyMessage title="Исходные файлы и локальные URI в экспорт не включаются" />
      <ProfileActionRow
        icon="square.and.arrow.up"
        label="Подготовить экспорт"
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
  confirmation,
  label,
  onConfirm,
}: {
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
  medicalHistoryLayout: {
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
  inlineInput: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: '#F6F3F4',
    paddingHorizontal: spacing.md,
    color: colors.text.primary,
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
