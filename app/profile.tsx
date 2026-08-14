import { useAuthActions } from '@convex-dev/auth/react';
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Linking,
  ScrollView,
  StyleSheet,
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
import type {
  HealthGoal,
  LocalProfile,
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
  if (goal === 'planning') return 'Планирование';
  return 'Отслеживание цикла';
}

function ProfileHistoryBackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Path
        d="M13.5 5.5 8 11l5.5 5.5"
        fill="none"
        stroke="#D31471"
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
    labResults,
    profile,
    programs,
    readOnly,
    setProgramStatus,
    syncNow,
    syncStatus,
    updateProfile,
  } = useHealthStore();
  const [activeSection, setActiveSection] = useState<ProfileSection | null>(
    null,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [journalNotifications, setJournalNotifications] = useState(true);
  const [resultNotifications, setResultNotifications] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string>();
  const [reducePageMotion, setReducePageMotion] = useState(false);
  const sectionProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (panel === 'ui-kit') {
      setActiveSection('ui-kit');
    }
  }, [panel]);

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
  const documentCount = labResults.filter(
    (result) => !result.deletedAt && result.hasLocalSourceDocument,
  ).length;
  const displayName = profile?.displayName?.trim() || 'Демо-профиль';

  const synchronize = async () => {
    setSyncMessage(undefined);
    await syncNow();
    setSyncMessage('Данные синхронизированы');
  };

  const openSection = (section: ProfileSection) => {
    setActiveSection(section);
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
            documentCount={documentCount}
            programCount={visiblePrograms.length}
            onOpen={openSection}
          />
        </ScrollView>
      </Animated.View>

      {activeSection ? (
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
          ) : (
            <ProfileDetailScreen
              bottomInset={insets.bottom}
              title={SECTION_TITLES[activeSection]}
              topInset={insets.top}
              onBack={closeSection}
            >
              {renderProfileSectionDirect({
                documentCount,
                journalNotifications,
                notificationsEnabled,
                openSystemSettings: () => void Linking.openSettings(),
                profile,
                programs: visiblePrograms,
                readOnly,
                resultNotifications,
                section: activeSection,
                saveProfile: updateProfile,
                setJournalNotifications,
                setNotificationsEnabled,
                setProgramStatus,
                setResultNotifications,
                signOut: () => void signOut(),
                syncMessage,
                syncNow: () => void synchronize(),
                syncStatus,
              })}
            </ProfileDetailScreen>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

function ProfileOverview({
  documentCount,
  onOpen,
  programCount,
}: {
  documentCount: number;
  onOpen: (section: ProfileSection) => void;
  programCount: number;
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
          value="Не заполнено"
          onPress={() => onOpen('medical-history')}
        />
        <ProfileSettingsRow
          icon="pills.fill"
          iconAsset={ProfileIcon03}
          fallback="П"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Препараты"
          value="Нет активных"
          onPress={() => onOpen('medications')}
        />
        <ProfileSettingsRow
          icon="exclamationmark.shield.fill"
          iconAsset={ProfileIcon04}
          fallback="!"
          iconBackground={profileTones.health.tile}
          iconColor={profileTones.health.glyph}
          label="Аллергии и риски"
          value="Не заполнено"
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

      <ProfileSettingsGroup title="Наблюдение">
        <ProfileSettingsRow
          icon="heart.text.square.fill"
          iconAsset={ProfileIcon06}
          fallback="Н"
          iconBackground={profileTones.monitoring.tile}
          iconColor={profileTones.monitoring.glyph}
          label="Подключённые программы"
          value={programCount ? String(programCount) : 'Нет программ'}
          isLast
          onPress={() => onOpen('programs')}
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
          isLast
          onPress={() => onOpen('ui-kit')}
        />
      </ProfileSettingsGroup>
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
  documentCount,
  journalNotifications,
  notificationsEnabled,
  openSystemSettings,
  profile,
  programs,
  readOnly,
  resultNotifications,
  saveProfile,
  section,
  setJournalNotifications,
  setNotificationsEnabled,
  setProgramStatus,
  setResultNotifications,
  signOut,
  syncMessage,
  syncNow,
  syncStatus,
}: {
  documentCount: number;
  journalNotifications: boolean;
  notificationsEnabled: boolean;
  openSystemSettings: () => void;
  profile: LocalProfile | null;
  programs: MonitoringProgram[];
  readOnly: boolean;
  resultNotifications: boolean;
  saveProfile: (
    input: Partial<
      Pick<
        LocalProfile,
        | 'displayName'
        | 'goal'
        | 'pregnancyStartAt'
        | 'lastPeriodStartAt'
        | 'cycleLengthDays'
      >
    >,
  ) => Promise<void>;
  section: ProfileSection;
  setJournalNotifications: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setProgramStatus: (
    program: MonitoringProgram,
    status: MonitoringProgram['status'],
  ) => Promise<void>;
  setResultNotifications: (value: boolean) => void;
  signOut: () => void;
  syncMessage?: string;
  syncNow: () => void;
  syncStatus: 'idle' | 'syncing' | 'offline' | 'error';
}) {
  const action = (title: string, message: string) =>
    Alert.alert(title, message, [{ text: 'Понятно' }]);

  switch (section) {
    case 'account':
      return (
        <>
          <ProfileSettingsGroup title="Контакты">
            <ProfileFieldRow
              label="E-mail"
              inputMode="email"
              placeholder="Добавить"
              disabled={readOnly}
            />
            <ProfileFieldRow
              label="Телефон"
              inputMode="tel"
              placeholder="Добавить"
              disabled={readOnly}
              isLast
            />
          </ProfileSettingsGroup>

          <ProfileVerticalChoiceControl<HealthGoal>
            accessibilityLabel="Цель использования"
            defaultValue={profile?.goal ?? 'cycle'}
            disabled={readOnly}
            grouped
            label="Цель использования"
            value={profile?.goal ?? 'cycle'}
            options={[
              { value: 'cycle', label: 'Отслеживание цикла' },
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

          <ProfileSettingsGroup title="Состояния">
            <ProfileToggleRow label="Послеродовый период" disabled={readOnly} />
            <ProfileToggleRow
              label="После отмены контрацепции"
              disabled={readOnly}
              isLast
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
              minimumDate={new Date(1900, 0, 1)}
              maximumDate={new Date()}
              disabled={readOnly}
            />
            <ProfileFieldRow
              label="Рост"
              inputMode="numeric"
              suffix="см"
              disabled={readOnly}
            />
            <ProfileFieldRow
              label="Вес"
              inputMode="numeric"
              suffix="кг"
              disabled={readOnly}
              isLast
            />
          </ProfileSettingsGroup>
        </>
      );

    case 'medical-history':
      return (
        <View style={styles.medicalHistoryLayout}>
          <ProfileActionRow
            icon="plus"
            label="Добавить запись"
            pill
            onPress={() =>
              action(
                'Новая запись',
                'Форма медицинской записи будет открыта здесь.',
              )
            }
          />
          <ProfileEmptyMessage title="История пока не заполнена" />
        </View>
      );

    case 'medications':
      return (
        <View style={styles.medicalHistoryLayout}>
          <ProfileActionRow
            icon="plus"
            label="Добавить препарат"
            pill
            onPress={() =>
              action('Новый препарат', 'Форма препарата будет открыта здесь.')
            }
          />
          <ProfileEmptyMessage title="Препараты пока не добавлены" />
        </View>
      );

    case 'allergies':
      return (
        <View style={styles.medicalHistoryLayout}>
          <ProfileActionRow
            icon="plus"
            label="Добавить аллергию или риск"
            pill
            onPress={() =>
              action(
                'Новая запись',
                'Форма аллергии или риска будет открыта здесь.',
              )
            }
          />
          <ProfileEmptyMessage title="Аллергии и риски пока не добавлены" />
        </View>
      );

    case 'documents':
      return (
        <View style={styles.medicalHistoryLayout}>
          <ProfileActionRow
            icon="doc.badge.plus"
            label="Добавить документ"
            pill
            onPress={() =>
              action('Добавить документ', 'Выберите камеру, фото или файл.')
            }
          />
          <ProfileEmptyMessage
            title={
              documentCount
                ? `Сохранено документов: ${documentCount}`
                : 'Документы пока не добавлены'
            }
          />
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
              defaultValue={Boolean(profile?.consentToCloudSyncAt)}
              disabled={readOnly}
            />
            <ProfileToggleRow
              label="Анонимная аналитика"
              defaultValue
              disabled={readOnly}
            />
            <ProfileToggleRow
              label="Медицинские данные"
              subtitle="Использовать для персональных рекомендаций"
              defaultValue
              disabled={readOnly}
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
            disabled={syncStatus === 'syncing' || readOnly}
            onPress={syncNow}
          />
        </>
      );

    case 'imports':
      return (
        <>
          <ProfileChoiceControl
            accessibilityLabel="Источник импорта"
            defaultValue="health"
            label="Источник"
            options={[
              { value: 'health', label: 'Apple Health' },
              { value: 'file', label: 'Файл' },
            ]}
          />
          <ProfileActionRow
            icon="square.and.arrow.down"
            label="Начать импорт"
            onPress={() =>
              action(
                'Импорт данных',
                'Выбор данных для импорта будет открыт здесь.',
              )
            }
          />
        </>
      );

    case 'exports':
      return (
        <>
          <ProfileChoiceControl
            accessibilityLabel="Формат экспорта"
            defaultValue="pdf"
            label="Формат"
            options={[
              { value: 'pdf', label: 'PDF' },
              { value: 'csv', label: 'CSV' },
            ]}
          />
          <ProfileSettingsGroup title="Включить в экспорт">
            <ProfileToggleRow label="Профиль и программы" defaultValue />
            <ProfileToggleRow label="Графики и отчеты" defaultValue />
            <ProfileToggleRow label="Исходные документы" isLast />
          </ProfileSettingsGroup>
          <ProfileActionRow
            icon="square.and.arrow.up"
            label="Подготовить экспорт"
            onPress={() =>
              action(
                'Экспорт данных',
                'Файл будет подготовлен после подтверждения состава данных.',
              )
            }
          />
        </>
      );

    case 'security':
      return (
        <>
          <ProfileActionRow
            destructive
            icon="trash.fill"
            label="Удалить все данные"
            onPress={() =>
              Alert.alert(
                'Удалить все данные?',
                'Это действие нельзя отменить.',
                [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Удалить', style: 'destructive' },
                ],
              )
            }
          />
          <ProfileActionRow
            destructive
            icon="rectangle.portrait.and.arrow.right"
            label="Выйти из аккаунта"
            disabled={readOnly}
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
              onChange={setNotificationsEnabled}
            />
            <ProfileToggleRow
              label="Системные"
              value={notificationsEnabled && journalNotifications}
              disabled={!notificationsEnabled}
              onChange={setJournalNotifications}
            />
            <ProfileToggleRow
              label="Результаты и анализы"
              value={notificationsEnabled && resultNotifications}
              disabled={!notificationsEnabled}
              onChange={setResultNotifications}
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
          <View style={styles.dangerIntro}>
            <AppText
              role="heading"
              weight="semibold"
              color={colors.state.error}
            >
              Необратимое действие
            </AppText>
            <AppText
              role="label"
              color={colors.text.secondary}
              style={styles.dangerDescription}
            >
              Будут удалены профиль, Journal, программы, результаты, документы и
              история чата.
            </AppText>
          </View>
          <ProfileActionRow
            destructive
            icon="trash.fill"
            label="Удалить аккаунт и все данные"
            onPress={() =>
              Alert.alert('Удалить аккаунт?', 'Это действие нельзя отменить.', [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive' },
              ])
            }
          />
        </>
      );
  }
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
  medicalHistoryLayout: {
    minHeight: 0,
    flex: 1,
    gap: spacing.lg,
  },
  dangerIntro: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#FDEAEA',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217,56,56,0.24)',
  },
  dangerDescription: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});
