import { useFonts } from 'expo-font';
import { GlassContainer } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ArrowButton from '../assets/figma/arrow-button.svg';
import CalendarIcon from '../assets/figma/calendar-icon.svg';
import MonitoringIcon from '../assets/figma/monitoring-icon.svg';
import BuyIcon from '../assets/figma/scan-screen/buy.svg';
import HistoryIcon from '../assets/figma/scan-screen/history.svg';
import InfoIcon from '../assets/figma/scan-screen/info.svg';
import ScanIcon from '../assets/figma/scan-screen/scan.svg';
import { AuthScreen } from '../components/AuthScreen';
import {
  AnalysisCountsBlock,
  AnalysisKnowledgeCarousel,
  AnalysisPersonalBlock,
  type AnalysisPersonalBlockVariant,
  AnalysisReferenceBlock,
  type AnalysisReferenceBlockVariant,
  AnalysisMetricsBentoBlock,
  AnalysisCardAction,
  AnalysisPlanCard,
  AnalysisTabs,
  type AnalysisCardActionVariant,
  type AnalysisCardVariant,
  type AnalysisMetricsBentoVariant,
  type AnalysisTabKey,
  type AnalysisTabsVariant,
  AppCard,
  AppText,
  AuthFlowModal,
  CalendarPageBackupModal,
  CalendarSymptomStatusPreview,
  type CalendarSymptomStatusVariant,
  ChatKitPreview,
  ChatDeleteActionPreview,
  ChatMessageVariantsCatalog,
  ChatSendButtonVariantsCatalog,
  colors,
  fonts,
  GlassControl,
  HealthMetricsChartsCatalog,
  InstructionCarousel,
  type InstructionCardVariant,
  InstructionIntroCard,
  type InstructionIntroCardVariant,
  InstructionNavigation,
  type InstructionNavigationVariant,
  JournalAssessment,
  JournalFlowActionPreview,
  JournalFlowModal,
  JournalFlowOptionPreview,
  type JournalFlowActionVariant,
  type JournalFlowOptionVariant,
  type MetricActionButtonVariant,
  NavbarIconVariantsCatalog,
  PetalProgressStatesCatalog,
  PrimaryButton,
  DestructiveButtonPreview,
  ProfileActionRow,
  ProfileKitPreview,
  ProfileSettingsGroup,
  ProfileSettingsRow,
  profileTones,
  radii,
  shadows,
  sizes,
  spacing,
  ScanActionGroup,
  type ScanActionGroupVariant,
  ScanBackgroundMotion,
  type ScanBackgroundMotionVariant,
  ScanHistoryPreview,
  type ScanHistoryVariant,
  ScanTooltip,
  type ScanTooltipKind,
  type ScanTooltipVariant,
  SymptomPetalContrastCatalog,
  TokenLabel,
  typeScale,
} from '../design-system';

const analysisKnowledgePreviewItems = [
  {
    id: 'blood-preparation',
    category: 'Подготовка',
    duration: '4 минуты',
    image: require('../assets/analyses/blood-tubes.png'),
    summary:
      'Натощак, вода, нагрузки и лекарства — короткая памятка перед сдачей.',
    title: 'Как подготовиться к анализу крови',
    tone: '#FFF0F6',
  },
  {
    id: 'cycle-dependent',
    category: 'Цикл',
    duration: '5 минут',
    image: require('../assets/analyses/ultrasound.png'),
    summary:
      'Какие обследования важно планировать с учётом дня менструального цикла.',
    title: 'Какие анализы зависят от дня цикла',
    tone: '#F3F0F7',
  },
  {
    id: 'result-validity',
    category: 'Сроки',
    duration: '3 минуты',
    image: require('../assets/analyses/hysteroscope.png'),
    summary:
      'Почему срок актуальности зависит от цели обследования и рекомендации врача.',
    title: 'Сколько актуальны результаты обследований',
    tone: '#F0F5F2',
  },
];

const journalFlowActionVariants: JournalFlowActionVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const journalFlowOptionVariants: JournalFlowOptionVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const analysisTabsVariants: AnalysisTabsVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const analysisMetricsBentoVariants: AnalysisMetricsBentoVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const analysisPersonalBlockVariants: AnalysisPersonalBlockVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const analysisReferenceBlockVariants: AnalysisReferenceBlockVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const analysisCardVariants: Array<{
  variant: AnalysisCardVariant;
  label: string;
}> = [
  { variant: 1, label: '01 / Референс' },
  { variant: 2, label: '02 / Метрики-чипы' },
  { variant: 3, label: '03 / Дедлайн' },
  { variant: 4, label: '04 / Клиническая сетка' },
  { variant: 5, label: '05 / Точки времени' },
  { variant: 6, label: '06 / Чек-лист' },
  { variant: 7, label: '07 / Статусная полоса' },
  { variant: 8, label: '08 / Прогресс срока' },
  { variant: 9, label: '09 / Редакционная' },
  { variant: 10, label: '10 / Компактное действие' },
  { variant: 11, label: '11 / Календарная неделя' },
  { variant: 12, label: '12 / Окно актуальности' },
  { variant: 13, label: '13 / Сводка срока' },
  { variant: 14, label: '14 / Маршрут обследования' },
  { variant: 15, label: '15 / Приоритет' },
  { variant: 16, label: '16 / Обратный отсчёт' },
  { variant: 17, label: '17 / Календарная лента' },
  { variant: 18, label: '18 / Диапазон дат' },
  { variant: 19, label: '19 / Большая дата' },
  { variant: 20, label: '20 / Неделя до сдачи' },
  { variant: 21, label: '21 / Контрольные точки' },
  { variant: 22, label: '22 / Билет срока' },
  { variant: 23, label: '23 / Индикатор дедлайна' },
  { variant: 24, label: '24 / Сегодня — дедлайн' },
  { variant: 25, label: '25 / Повестка' },
];

const calendarAnalysisCardVariants: Array<{
  variant: AnalysisCardVariant;
  actionVariant: AnalysisCardActionVariant;
  label: string;
}> = [
  { variant: 26, actionVariant: 1, label: '01 / Диапазон' },
  { variant: 27, actionVariant: 2, label: '02 / Числовая лента' },
  { variant: 28, actionVariant: 3, label: '03 / Крупная дата' },
  { variant: 29, actionVariant: 4, label: '04 / Три события' },
  { variant: 30, actionVariant: 9, label: '05 / Срок и актуальность' },
];

const analysisCardActionVariants: AnalysisCardActionVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const colorTokens = [
  {
    name: 'Primary',
    value: colors.brand.primary,
    role: 'CTA / active',
  },
  {
    name: 'Burgundy',
    value: colors.brand.burgundy,
    role: 'Hero context',
  },
  {
    name: 'Success',
    value: colors.brand.success,
    role: 'Positive status',
  },
  {
    name: 'Text',
    value: colors.text.primary,
    role: 'Primary copy',
  },
  {
    name: 'Muted',
    value: colors.text.secondary,
    role: 'Secondary copy',
  },
  {
    name: 'Warm',
    value: colors.surface.warm,
    role: 'Supporting card',
  },
];

const typeSpecimens = [
  {
    label: 'Display / 36',
    role: 'display' as const,
    text: 'Женское здоровье',
  },
  {
    label: 'Title / 28',
    role: 'title' as const,
    text: 'Сегодня',
  },
  {
    label: 'Heading / 22',
    role: 'heading' as const,
    text: 'Оценка заполнения',
  },
  {
    label: 'Body / 17',
    role: 'body' as const,
    text: 'Мгновенный анализ тестов',
  },
  {
    label: 'Label / 15',
    role: 'label' as const,
    text: 'Заполнить журнал',
  },
];

const radiusTokens = [
  { name: '12', value: radii.sm },
  { name: '20', value: radii.md },
  { name: '30', value: radii.lg },
  { name: '40', value: radii.xl },
];

const spacingTokens = [
  spacing.xxs,
  spacing.xs,
  spacing.sm,
  spacing.md,
  spacing.lg,
  spacing.xl,
];

const journalVariants = [
  {
    label: '01 / Сегментная',
    variant: 'segments' as const,
  },
  {
    label: '02 / Линейная',
    variant: 'continuous' as const,
  },
  { label: '03 / Недельная', variant: 'week' as const },
  { label: '04 / Числовая', variant: 'score' as const },
  { label: '05 / Уровневая', variant: 'levels' as const },
  { label: '06 / Кольцевая', variant: 'ring' as const },
  {
    label: '07 / Сравнительная',
    variant: 'comparison' as const,
  },
];

const checkupVariants = [
  { label: '01 / Кольцевая', variant: 'ring' as const },
  {
    label: '02 / Линейная',
    variant: 'continuous' as const,
  },
  { label: '03 / Числовая', variant: 'score' as const },
  { label: '04 / Уровневая', variant: 'levels' as const },
  {
    label: '05 / Сравнительная',
    variant: 'comparison' as const,
  },
  {
    label: '06 / Сегментная',
    variant: 'segments' as const,
  },
  {
    label: '07 / Нумерованные точки',
    variant: 'dots' as const,
  },
  { label: '08 / Этапы', variant: 'milestones' as const },
  { label: '09 / Баланс', variant: 'balance' as const },
  { label: '10 / Матрица', variant: 'matrix' as const },
  { label: '11 / Gauge', variant: 'gauge' as const },
  { label: '12 / Дробная', variant: 'fraction' as const },
  { label: '13 / Heatmap', variant: 'heatmap' as const },
  { label: '14 / Ступени', variant: 'ladder' as const },
  {
    label: '15 / Checklist',
    variant: 'checklist' as const,
  },
];

const metricButtonVariants: Array<{
  label: string;
  variant: MetricActionButtonVariant;
  metric: 'journal' | 'checkups';
}> = [
  {
    label: '01 / Основная',
    variant: 'solid',
    metric: 'journal',
  },
  {
    label: '02 / Мягкая',
    variant: 'soft',
    metric: 'checkups',
  },
  {
    label: '03 / Контурная',
    variant: 'outline',
    metric: 'journal',
  },
  {
    label: '04 / Белая',
    variant: 'white',
    metric: 'checkups',
  },
  {
    label: '05 / Бордовая',
    variant: 'burgundy',
    metric: 'journal',
  },
  {
    label: '06 / Liquid Glass',
    variant: 'glass',
    metric: 'checkups',
  },
  {
    label: '07 / Split',
    variant: 'split',
    metric: 'journal',
  },
  {
    label: '08 / Ведущая иконка',
    variant: 'iconLeading',
    metric: 'checkups',
  },
  {
    label: '09 / Текстовая',
    variant: 'textOnly',
    metric: 'journal',
  },
  {
    label: '10 / Выполнено',
    variant: 'completed',
    metric: 'checkups',
  },
];

const scanActionVariants: Array<{
  label: string;
  variant: ScanActionGroupVariant;
}> = [
  { label: '01 / Основные pill', variant: 'solidPills' },
  { label: '02 / Мягкие pill', variant: 'softPills' },
  { label: '03 / Контурные', variant: 'outlinePills' },
  { label: '04 / Белые', variant: 'whitePills' },
  { label: '05 / Liquid Glass', variant: 'glassPills' },
  {
    label: '06 / Segmented accent',
    variant: 'segmentedSolid',
  },
  {
    label: '07 / Segmented soft',
    variant: 'segmentedSoft',
  },
  { label: '08 / Плитки', variant: 'tiles' },
  { label: '09 / Минимальные', variant: 'minimal' },
  { label: '10 / Плавающие', variant: 'floating' },
];

const scanActions = [
  {
    label: 'Инфо',
    icon: <InfoIcon width={19} height={19} />,
  },
  {
    label: 'Купить',
    icon: <BuyIcon width={19} height={19} />,
  },
  {
    label: 'История',
    icon: <HistoryIcon width={19} height={19} />,
  },
];

const instructionVariants: Array<{
  label: string;
  variant: InstructionCardVariant;
}> = [
  { label: '01 / Числовая рейка', variant: 'rail' },
  { label: '02 / Badge', variant: 'badge' },
  { label: '03 / Акцентная колонка', variant: 'accent' },
  { label: '04 / Editorial', variant: 'editorial' },
  { label: '05 / Progress', variant: 'progress' },
  { label: '06 / Liquid Glass', variant: 'glass' },
  { label: '07 / Номер сверху', variant: 'numberTop' },
  { label: '08 / Timeline', variant: 'timeline' },
  { label: '09 / Инвертированная', variant: 'inverse' },
  { label: '10 / Минимальная', variant: 'minimal' },
  { label: '11 / Мягкий заголовок', variant: 'softHeader' },
  { label: '12 / Номер в кольце', variant: 'ring' },
  { label: '13 / Угловой номер', variant: 'corner' },
  { label: '14 / Сегменты', variant: 'segments' },
  { label: '15 / Билет', variant: 'ticket' },
  { label: '16 / С иллюстрациями', variant: 'illustrated' },
];

const instructionSteps = [
  'Соберите мочу в чистую сухую емкость.',
  'Вскройте фольгированную упаковку и достаньте тест-полоску.',
  'Опустите тест-полоску в мочу до отметки ”MAX” на 3–5 секунд.',
  'Достаньте тест-полоску и положите её на ровную сухую поверхность.',
  'Спустя 3-7 минут отсканируйте результат в приложении.',
];

const instructionIllustrations = [
  require('../assets/instructions/step_1_cup.png'),
  require('../assets/instructions/step_2_package.png'),
  require('../assets/instructions/step_3_dip_test.png'),
  require('../assets/instructions/step_4_test_strip.png'),
  require('../assets/instructions/step_5_results.png'),
];

const instructionIntroCard = {
  title: 'Инструкция по использованию',
  illustration: require('../assets/instructions/step_4_test_strip.png'),
  variant: 'classic' as InstructionIntroCardVariant,
};

const instructionIntroVariants: Array<{
  label: string;
  variant: InstructionIntroCardVariant;
}> = [
  { label: '01 / Классическая', variant: 'classic' },
  { label: '02 / Брендовая', variant: 'brand' },
  { label: '03 / Мягкая', variant: 'soft' },
  { label: '04 / Контурная', variant: 'outline' },
  { label: '05 / Editorial', variant: 'editorial' },
  { label: '06 / Split', variant: 'split' },
  { label: '07 / Liquid Glass', variant: 'glass' },
  { label: '08 / Минимальная', variant: 'minimal' },
  { label: '09 / В рамке', variant: 'framed' },
  { label: '10 / Image hero', variant: 'imageHero' },
];

const scanBackgroundMotionVariants: Array<{
  label: string;
  variant: ScanBackgroundMotionVariant;
}> = [
  { label: '01 / Мягкий дрейф', variant: 'drift' },
  { label: '02 / Дыхание', variant: 'breathe' },
  { label: '03 / Диагональный поток', variant: 'diagonal' },
  { label: '04 / Покачивание', variant: 'sway' },
  { label: '05 / Вертикальный поток', variant: 'vertical' },
  {
    label: '06 / Горизонтальный поток',
    variant: 'activeOrbit',
  },
  {
    label: '07 / Диагональный проход',
    variant: 'activeSweep',
  },
  {
    label: '08 / Поток с глубиной',
    variant: 'activePulse',
  },
];

const instructionNavigationVariants: Array<{
  label: string;
  variant: InstructionNavigationVariant;
}> = [
  { label: '01 / Оригинальные', variant: 'original' },
  { label: '02 / Брендовые', variant: 'brand' },
  { label: '03 / Мягкие', variant: 'soft' },
  { label: '04 / Контурные', variant: 'outline' },
  { label: '05 / Белые', variant: 'white' },
  { label: '06 / Liquid Glass', variant: 'glass' },
  { label: '07 / Квадратные', variant: 'square' },
  { label: '08 / Бордовые', variant: 'burgundy' },
  { label: '09 / Минимальные', variant: 'minimal' },
  { label: '10 / Двойной контур', variant: 'double' },
];

const scanTooltipVariants: Array<{
  label: string;
  variant: ScanTooltipVariant;
}> = [
  { label: '01 / Clear Liquid Glass', variant: 'glass' },
  { label: '02 / Тёмная капсула', variant: 'dark' },
  { label: '03 / Светлая капсула', variant: 'light' },
  { label: '04 / Адаптивный акцент', variant: 'brand' },
  { label: '05 / Контурная', variant: 'outline' },
  { label: '06 / Split status', variant: 'split' },
  { label: '07 / Status rail', variant: 'status' },
  { label: '08 / Компактная', variant: 'compact' },
  { label: '09 / Плавающая иконка', variant: 'floating' },
  { label: '10 / Message bubble', variant: 'bubble' },
];

const scanTooltipKinds: Array<{
  label: string;
  kind: ScanTooltipKind;
}> = [
  { label: 'QR-код', kind: 'qr' },
  { label: 'Тест', kind: 'test' },
  { label: 'Недостаточный свет', kind: 'lowLight' },
  { label: 'Неоднородный фон', kind: 'background' },
  { label: 'Успешная фиксация', kind: 'locked' },
];

const scanHistoryVariants: Array<{
  label: string;
  variant: ScanHistoryVariant;
}> = [
  { label: '01 / Таймлайн', variant: 'timeline' },
  { label: '02 / Карточки результатов', variant: 'cards' },
  { label: '03 / Компактный журнал', variant: 'compact' },
  { label: '04 / Календарь', variant: 'calendar' },
  { label: '05 / Динамика', variant: 'insights' },
  { label: '06 / По дням', variant: 'grouped' },
  { label: '07 / По типу теста', variant: 'testTypes' },
  { label: '08 / Архив месяцев', variant: 'archive' },
  { label: '09 / Сравнение', variant: 'comparison' },
  { label: '10 / Лента снимков', variant: 'gallery' },
];

const calendarSymptomStatusVariants: Array<{
  label: string;
  variant: CalendarSymptomStatusVariant;
}> = [
  { label: '01 / Верхняя полоса', variant: 'banner' },
  { label: '02 / Над прогнозом', variant: 'inline' },
  { label: '03 / Компактная капсула', variant: 'compact' },
  { label: '04 / Под датой', variant: 'underDate' },
  { label: '05 / Боковой статус', variant: 'side' },
  { label: '06 / Нижняя строка', variant: 'footer' },
];

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <TokenLabel>{eyebrow}</TokenLabel>
        <AppText role="heading" weight="semibold">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

export default function DesignSystemScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [complete, setComplete] = useState(false);
  const [authFlowVisible, setAuthFlowVisible] = useState(false);
  const [calendarBackupVisible, setCalendarBackupVisible] = useState(false);
  const [journalFlowVisible, setJournalFlowVisible] = useState(false);
  const [analysisPreviewTab, setAnalysisPreviewTab] =
    useState<AnalysisTabKey>('current');
  const [fontsLoaded] = useFonts(
    Platform.OS === 'web'
      ? {
          [fonts.sfRegular]: require('../assets/fonts/SF-Pro-Display-Regular.otf'),
          [fonts.sfMedium]: require('../assets/fonts/SF-Pro-Display-Medium.otf'),
          [fonts.sfSemibold]: require('../assets/fonts/SF-Pro-Display-Semibold.otf'),
          [fonts.sfBold]: require('../assets/fonts/SF-Pro-Display-Bold.otf'),
          [fonts.yaroRegular]: require('../assets/fonts/Yaro-Rg-Regular.otf'),
        }
      : {},
  );

  if (!fontsLoaded) {
    return <View style={styles.loading} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" hidden={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 112,
          },
        ]}
      >
        <View
          style={[styles.hero, { paddingTop: Math.max(insets.top, 16) + 12 }]}
        >
          <Image
            source={require('../assets/figma/pregnancy_background.png')}
            resizeMode="cover"
            style={styles.heroImage}
          />
          <LinearGradient
            colors={[
              'rgba(93,26,41,0.24)',
              'rgba(130,53,55,0.88)',
              colors.brand.burgundy,
            ]}
            locations={[0, 0.66, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <GlassContainer spacing={12} style={styles.heroControls}>
            <GlassControl
              accessibilityLabel="Вернуться назад"
              onPress={onBack ?? (() => router.back())}
              style={styles.heroCircle}
            >
              <AppText
                role="heading"
                color={colors.text.primary}
                style={styles.backGlyph}
              >
                ‹
              </AppText>
            </GlassControl>

            <GlassControl
              accessibilityLabel="Версия дизайн-системы"
              style={styles.versionPill}
            >
              <AppText role="label" weight="medium" color={colors.text.primary}>
                Private · UI kit 01
              </AppText>
            </GlassControl>
          </GlassContainer>

          <View style={styles.heroCopy}>
            <AppText
              role="caption"
              weight="semibold"
              color="rgba(255,255,255,0.72)"
              style={styles.heroEyebrow}
            >
              DESIGN SYSTEM / IOS
            </AppText>
            <AppText
              role="display"
              weight="semibold"
              color={colors.text.inverse}
              style={styles.heroTitle}
            >
              Private
            </AppText>
            <AppText
              role="body"
              color="rgba(255,255,255,0.82)"
              style={styles.heroDescription}
            >
              Исполняемый каталог токенов и компонентов приложения.
            </AppText>
          </View>

          <View style={styles.heroMeta}>
            <View>
              <AppText numeric role="title" color={colors.text.inverse}>
                402
              </AppText>
              <AppText role="caption" color="rgba(255,255,255,0.62)">
                base width
              </AppText>
            </View>
            <View>
              <AppText numeric role="title" color={colors.text.inverse}>
                48
              </AppText>
              <AppText role="caption" color="rgba(255,255,255,0.62)">
                min touch
              </AppText>
            </View>
            <View>
              <AppText numeric role="title" color={colors.text.inverse}>
                16
              </AppText>
              <AppText role="caption" color="rgba(255,255,255,0.62)">
                gutter
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <View testID="delete-actions-catalog">
            <Section
              eyebrow="00 / Destructive styles"
              title="15 стилей кнопки удаления"
            >
              <AppText role="body" color={colors.text.secondary}>
                Пятнадцать самостоятельных destructive-паттернов: от тихой
                текстовой команды до удержания и явного подтверждения. Ниже
                сохранены текущие кнопки приложения для сравнения.
              </AppText>

              <View
                testID="destructive-style-variants"
                style={styles.destructiveVariantList}
              >
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>01 / SOFT SURFACE</TokenLabel>
                  <DestructiveButtonPreview variant="soft" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>02 / OUTLINE</TokenLabel>
                  <DestructiveButtonPreview variant="outline" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>03 / SOLID CRITICAL</TokenLabel>
                  <DestructiveButtonPreview variant="solid" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>04 / ICON TILE</TokenLabel>
                  <DestructiveButtonPreview variant="iconTile" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>05 / SPLIT ACTION</TokenLabel>
                  <DestructiveButtonPreview variant="split" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>06 / COMPACT CAPSULE</TokenLabel>
                  <DestructiveButtonPreview variant="compact" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>07 / QUIET SETTINGS ROW</TokenLabel>
                  <DestructiveButtonPreview variant="quietRow" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>08 / WARNING PANEL</TokenLabel>
                  <DestructiveButtonPreview variant="warning" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>09 / HOLD TO DELETE</TokenLabel>
                  <DestructiveButtonPreview variant="hold" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>10 / CONFIRMATION CHIP</TokenLabel>
                  <DestructiveButtonPreview variant="confirm" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>11 / ICON COMMAND</TokenLabel>
                  <DestructiveButtonPreview variant="iconOnly" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>12 / GLASS CRITICAL</TokenLabel>
                  <DestructiveButtonPreview variant="glass" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>13 / INSET CONTROL</TokenLabel>
                  <DestructiveButtonPreview variant="inset" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>14 / ELEVATED ACTION</TokenLabel>
                  <DestructiveButtonPreview variant="elevated" />
                </View>
                <View style={styles.destructiveVariantItem}>
                  <TokenLabel>15 / TEXT COMMAND</TokenLabel>
                  <DestructiveButtonPreview variant="textOnly" />
                </View>
              </View>

              <View style={styles.destructiveInternalRule} />

              <AppText role="heading" weight="semibold">
                Текущие кнопки приложения
              </AppText>

              <AppText role="body" color={colors.text.secondary}>
                Все кастомные destructive-контролы, которые используются в
                приложении. Кнопки финального подтверждения документа и чата
                остаются нативными действиями системного Alert.
              </AppText>

              <View style={styles.destructiveCatalog}>
                <View style={styles.destructiveGroup}>
                  <TokenLabel>PROFILE / NAVIGATION</TokenLabel>
                  <ProfileSettingsGroup>
                    <ProfileSettingsRow
                      icon="trash.fill"
                      fallback="×"
                      iconBackground={profileTones.destructive.tile}
                      iconColor={profileTones.destructive.glyph}
                      label="Удаление аккаунта"
                      destructive
                      isLast
                      onPress={() => undefined}
                    />
                  </ProfileSettingsGroup>
                </View>

                <View style={styles.destructiveGroup}>
                  <TokenLabel>PROFILE / ACTIONS</TokenLabel>
                  <View style={styles.destructiveActionStack}>
                    <ProfileActionRow
                      secondary
                      icon="trash"
                      label="Удалить данные Ассистента"
                      subtitle="План, правила и журнал изменений"
                      onPress={() => undefined}
                    />
                    <ProfileActionRow
                      destructive
                      icon="trash.fill"
                      label="Удалить запись"
                      onPress={() => undefined}
                    />
                    <ProfileActionRow
                      destructive
                      icon="trash.fill"
                      label="Подтвердить удаление записи"
                      onPress={() => undefined}
                    />
                    <ProfileActionRow
                      destructive
                      icon="trash.fill"
                      label="Удалить локальные данные"
                      onPress={() => undefined}
                    />
                    <ProfileActionRow
                      destructive
                      icon="trash.fill"
                      label="Удалить аккаунт и все данные"
                      onPress={() => undefined}
                    />
                  </View>
                </View>

                <View style={styles.destructiveGroup}>
                  <TokenLabel>CHAT / CONTEXT MENU</TokenLabel>
                  <View style={styles.destructiveChatPreview}>
                    <ChatDeleteActionPreview />
                  </View>
                </View>
              </View>
            </Section>
          </View>

          <View style={styles.rule} />

          <Section eyebrow="00 / Health data" title="Графики показателей">
            <View style={styles.analysisVariantHeading}>
              <TokenLabel>18 PRODUCTION CHARTS</TokenLabel>
              <AppText role="body" color={colors.text.secondary}>
                Восемнадцать способов показать данные, которые уже собираются в
                приложении: от базальной температуры, цикла и сна до
                гормонального окна, корреляций симптомов, динамики биомаркеров и
                сводного индекса внимания к здоровью.
              </AppText>
            </View>
            <HealthMetricsChartsCatalog />
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="00 / AI chat" title="Сообщения в диалоге">
            <AppText role="body" color={colors.text.secondary}>
              Двадцать вариантов пары «сообщение пользователя + ответ Сферки».
              Цвета и базовая композиция зафиксированы; меняются иконки,
              типографика, внутренние отступы и ритм действий. Варианты 11–20 —
              новая серия с пользовательским набором SVG-иконок.
            </AppText>
            <ChatMessageVariantsCatalog />
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="00 / AI chat" title="Кнопка отправки сообщения">
            <AppText role="body" color={colors.text.secondary}>
              Десять круглых вариантов состояния отправки, которое плавно
              заменяет голосовой ввод после появления текста в поле.
            </AppText>
            <ChatSendButtonVariantsCatalog />
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="00 / Navigation" title="Navbar · наборы иконок">
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов одного navbar. Геометрия, стекло, подписи,
              порядок табов и цветовые состояния зафиксированы; меняются только
              SF Symbols. Нажмите на таб, чтобы проверить selected-состояние.
            </AppText>
            <NavbarIconVariantsCatalog />
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="00 / Profile" title="iOS Settings · профиль">
            <AppText role="body" color={colors.text.secondary}>
              Production-компоненты личного кабинета: карточка аккаунта,
              внутренние табы и сгруппированные строки настроек в светлой теме
              приложения.
            </AppText>
            <ProfileKitPreview />
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="00 / Analyses overview"
            title="Верх страницы Анализы"
          >
            <View style={styles.analysisVariantHeading}>
              <TokenLabel>PRODUCTION OVERVIEW BLOCKS</TokenLabel>
              <AppText role="body" color={colors.text.secondary}>
                Крупный автоперелистывающийся блок материалов и единая сводка по
                ближайшим, пропущенным и сданным анализам.
              </AppText>
            </View>
            <View style={styles.analysisVariantList}>
              <AnalysisKnowledgeCarousel
                items={analysisKnowledgePreviewItems}
              />
              <AnalysisCountsBlock upcoming={3} missed={0} completed={2} />
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="00 / Personal insights" title="Персональный блок">
            <View style={styles.analysisVariantHeading}>
              <TokenLabel>10 PERSONAL BLOCK VARIANTS</TokenLabel>
              <AppText role="body" color={colors.text.secondary}>
                Десять production-вариантов персональной интерпретации
                результатов. Для каждого показано состояние с данными и
                состояние «Недостаточно данных».
              </AppText>
            </View>
            <View style={styles.analysisVariantList}>
              {analysisPersonalBlockVariants.map((variant) => (
                <View key={variant} style={styles.analysisVariantItem}>
                  <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
                  <View style={styles.analysisStatePreview}>
                    <AppText
                      role="caption"
                      weight="medium"
                      color={colors.text.secondary}
                    >
                      С ДАННЫМИ
                    </AppText>
                    <AnalysisPersonalBlock variant={variant} state="ready" />
                  </View>
                  <View style={styles.analysisStatePreview}>
                    <AppText
                      role="caption"
                      weight="medium"
                      color={colors.text.secondary}
                    >
                      НЕДОСТАТОЧНО ДАННЫХ
                    </AppText>
                    <AnalysisPersonalBlock
                      variant={variant}
                      state="insufficient"
                    />
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="00.1 / Reference materials"
            title="Справочные материалы"
          >
            <View style={styles.analysisVariantHeading}>
              <TokenLabel>10 REFERENCE BLOCK VARIANTS</TokenLabel>
              <AppText role="body" color={colors.text.secondary}>
                Десять способов показать подготовку к анализам, расшифровку
                показателей, сроки актуальности и ответы на частые вопросы.
              </AppText>
            </View>
            <View style={styles.analysisVariantList}>
              {analysisReferenceBlockVariants.map((variant) => (
                <View key={variant} style={styles.analysisVariantItem}>
                  <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
                  <AnalysisReferenceBlock variant={variant} />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="00.2 / AI chat" title="Стартовый экран чата">
            <AppText role="body" color={colors.text.secondary}>
              Переиспользуемые header, три предложенные темы, безопасное пустое
              состояние и многострочный composer над нижней навигацией.
            </AppText>
            <ChatKitPreview />
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="00 / Analyses cards" title="Карточки анализов">
            <View style={styles.analysisVariantHeading}>
              <TokenLabel>10 BENTO METRICS VARIANTS</TokenLabel>
              <AppText role="heading" weight="semibold">
                Метрики страницы «Анализы»
              </AppText>
              <AppText role="body" color={colors.text.secondary}>
                Десять вариантов production-блока: главная метрика 72% и две
                вторичные метрики 2 / 1.
              </AppText>
            </View>
            <View style={styles.analysisVariantList}>
              {analysisMetricsBentoVariants.map((variant) => (
                <View key={variant} style={styles.analysisVariantItem}>
                  <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
                  <AnalysisMetricsBentoBlock variant={variant} />
                </View>
              ))}
            </View>

            <View style={styles.rule} />

            <View style={styles.analysisVariantHeading}>
              <TokenLabel>10 VIEW ACTIONS</TokenLabel>
              <AppText role="heading" weight="semibold">
                Кнопки «Посмотреть»
              </AppText>
              <AppText role="body" color={colors.text.secondary}>
                Десять вариантов действия для карточек анализов.
              </AppText>
            </View>
            <View style={styles.analysisActionGrid}>
              {analysisCardActionVariants.map((variant) => (
                <View key={variant} style={styles.analysisActionItem}>
                  <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
                  <View style={styles.analysisActionStage}>
                    <AnalysisCardAction
                      variant={variant}
                      title="Общий анализ крови"
                      onPress={() => undefined}
                    />
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.rule} />

            <View style={styles.analysisVariantHeading}>
              <TokenLabel>5 MINIMAL VARIANTS</TokenLabel>
              <AppText role="heading" weight="semibold">
                Календарная лента
              </AppText>
              <AppText role="body" color={colors.text.secondary}>
                Пять спокойных вариантов без бейджей, декоративных подложек и
                теней. Только дата, смысл срока и одно действие. Сегодня — 8
                августа 2026 года, дедлайн — 14 августа 2026 года.
              </AppText>
            </View>
            <View style={styles.analysisVariantList}>
              {calendarAnalysisCardVariants.map((item) => (
                <View key={item.variant} style={styles.analysisVariantItem}>
                  <TokenLabel>{item.label}</TokenLabel>
                  <AnalysisPlanCard
                    title="Исследования крови"
                    description="Общий анализ крови, гематокрит, гемоглобин, тромбоциты"
                    category="Лаборатория"
                    dueLabel="Сдать до"
                    dueValue="14 Августа"
                    validityLabel="Обследование актуально"
                    validityValue="30 дней"
                    status="Осталось 6 Дней"
                    image={require('../assets/analyses/blood-tubes.png')}
                    tone="rose"
                    variant={item.variant}
                    actionVariant={item.actionVariant}
                    onView={() => undefined}
                  />
                </View>
              ))}
            </View>

            <View style={styles.rule} />

            <AppText role="body" color={colors.text.secondary}>
              Двадцать пять production-вариантов одной карточки. Фото, масштаб,
              blur и белый fade остаются неизменными.
            </AppText>
            <View style={styles.analysisVariantList}>
              {analysisCardVariants.map((item) => (
                <View key={item.variant} style={styles.analysisVariantItem}>
                  <TokenLabel>{item.label}</TokenLabel>
                  <AnalysisPlanCard
                    title="Исследования крови"
                    description="Общий анализ крови, гематокрит, гемоглобин, тромбоциты"
                    category="Лаборатория"
                    dueLabel="Сдать до"
                    dueValue="14 Августа"
                    validityLabel="Обследование актуально"
                    validityValue="30 дней"
                    status="Осталось 6 Дней"
                    image={require('../assets/analyses/blood-tubes.png')}
                    tone="rose"
                    variant={item.variant}
                    actionVariant={10}
                    onView={() => undefined}
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="01 / Foundations" title="Цветовые роли">
            <View style={styles.swatchGrid}>
              {colorTokens.map((token) => (
                <View key={token.name} style={styles.swatchItem}>
                  <View
                    style={[styles.swatch, { backgroundColor: token.value }]}
                  />
                  <AppText role="label" weight="medium">
                    {token.name}
                  </AppText>
                  <AppText numeric role="caption" color={colors.text.secondary}>
                    {token.value}
                  </AppText>
                  <AppText role="caption" color={colors.text.secondary}>
                    {token.role}
                  </AppText>
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="02 / Typography" title="Два шрифтовых голоса">
            <AppCard style={styles.typeCard}>
              {typeSpecimens.map((specimen, index) => (
                <View
                  key={specimen.label}
                  style={[styles.typeRow, index > 0 && styles.typeRowBorder]}
                >
                  <TokenLabel>{specimen.label}</TokenLabel>
                  <AppText role={specimen.role}>{specimen.text}</AppText>
                </View>
              ))}
            </AppCard>

            <View style={styles.numericCard}>
              <View style={styles.numericSample}>
                <AppText numeric role="display" color={colors.brand.primary}>
                  7”
                </AppText>
                <AppText numeric role="heading" color={colors.brand.primary}>
                  сфера.
                </AppText>
              </View>
              <View style={styles.numericCopy}>
                <TokenLabel>Yaro Rg</TokenLabel>
                <AppText role="label">Только слово «сфера.»</AppText>
              </View>
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="03 / Material" title="Liquid Glass">
            <View style={styles.glassStage}>
              <Image
                source={require('../assets/figma/scan-screen/background.png')}
                resizeMode="cover"
                style={styles.glassStageImage}
              />
              <GlassContainer spacing={12} style={styles.glassRow}>
                <GlassControl
                  accessibilityLabel="Мониторинг"
                  style={styles.glassCircle}
                >
                  <MonitoringIcon width={sizes.icon} height={sizes.icon} />
                </GlassControl>
                <GlassControl
                  accessibilityLabel="Дата"
                  style={styles.glassPill}
                >
                  <AppText role="body">
                    <AppText numeric role="body">
                      21
                    </AppText>{' '}
                    июля
                  </AppText>
                </GlassControl>
                <GlassControl
                  accessibilityLabel="Календарь"
                  onPress={() => setCalendarBackupVisible(true)}
                  style={styles.glassCircle}
                >
                  <CalendarIcon width={sizes.icon} height={sizes.icon} />
                </GlassControl>
              </GlassContainer>
              <AppText
                role="caption"
                color="rgba(33,33,35,0.64)"
                style={styles.glassNote}
              >
                clear · interactive · no tint
              </AppText>
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="03.1 / Backup"
            title="Страница календаря · карточная версия"
          >
            <AppText role="label" color={colors.text.secondary}>
              Зафиксированная версия страницы до перехода на вертикальную ленту
              месяцев. Используется только как backup и больше не меняется
              вместе с продуктовым экраном.
            </AppText>
            <PrimaryButton
              label="Открыть backup календаря"
              onPress={() => setCalendarBackupVisible(true)}
            />
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="03.2 / Calendar status"
            title="Отметка заполненных симптомов"
          >
            <AppText role="body" color={colors.text.secondary}>
              Шесть вариантов расположения статуса внутри production-плашки
              выбранного дня размером 370×196.
            </AppText>

            <View style={styles.journalVariants}>
              {calendarSymptomStatusVariants.map((item) => (
                <View key={item.variant} style={styles.journalVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      370×196
                    </AppText>
                  </View>
                  <CalendarSymptomStatusPreview variant={item.variant} />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="04 / Controls" title="Кнопки и состояния">
            <View style={styles.buttonStack}>
              <PrimaryButton
                label={complete ? 'Готово' : 'Заполнить'}
                onPress={() => setComplete((value) => !value)}
                icon={<ArrowButton width={18} height={18} />}
              />
              <View style={styles.inlineButtons}>
                <PrimaryButton compact label="Купить" />
                <PrimaryButton compact disabled label="Недоступно" />
              </View>
              <AppText role="caption" color={colors.text.secondary}>
                Нажмите «Заполнить», чтобы проверить интерактивное состояние.
              </AppText>
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="05 / Cards" title="Контентные поверхности">
            <View style={styles.cardRow}>
              <AppCard tone="accent" style={styles.demoCard}>
                <AppText numeric role="title" color={colors.text.inverse}>
                  72%
                </AppText>
                <AppText
                  role="label"
                  color={colors.text.inverse}
                  style={styles.demoCardTitle}
                >
                  Индекс внимания к здоровью
                </AppText>
              </AppCard>
              <AppCard tone="warm" style={styles.demoCard}>
                <View style={styles.cardArrow}>
                  <AppText role="body" color={colors.brand.primary}>
                    ↗
                  </AppText>
                </View>
                <AppText role="label" style={styles.demoCardTitle}>
                  Подбор питания в 1-м триместре
                </AppText>
              </AppCard>
            </View>

            <AppCard style={styles.instructionCard}>
              <AppText numeric style={styles.instructionNumber}>
                1”
              </AppText>
              <View style={styles.instructionCopy}>
                <AppText role="heading" weight="medium">
                  Ознакомление
                </AppText>
                <AppText role="body">
                  Вскройте коробку, внимательно изучите инструкции.
                </AppText>
              </View>
            </AppCard>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="06 / Status" title="Оценка заполнения журнала">
            <AppText role="body" color={colors.text.secondary}>
              Семь разных реализаций одной задачи. Размер каждого ряда — 370×58,
              как на странице «Сегодня».
            </AppText>

            <View style={styles.journalVariants}>
              {journalVariants.map((variant) => (
                <View key={variant.label} style={styles.journalVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{variant.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      370×58
                    </AppText>
                  </View>

                  <JournalAssessment
                    value={16}
                    variant={variant.variant}
                    actionLabel="Заполнить"
                    actionIcon={<ArrowButton width={18.3} height={18.3} />}
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="07 / Checkups" title="Прохождение чекапов">
            <AppText role="body" color={colors.text.secondary}>
              Пятнадцать production-вариантов одной метрики. Все реализации
              имеют размер 370×58 и кнопку «Пройти».
            </AppText>

            <View style={styles.journalVariants}>
              {checkupVariants.map((variant) => (
                <View key={variant.label} style={styles.journalVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{variant.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      370×58
                    </AppText>
                  </View>

                  <JournalAssessment
                    value={3}
                    total={6}
                    variant={variant.variant}
                    title={
                      variant.variant === 'comparison'
                        ? 'Динамика чекапов'
                        : 'Прохождение чекапов'
                    }
                    status="Средняя регулярность"
                    leftCaption="Пройдено 3"
                    rightCaption="Всего 6"
                    comparisonPrimaryLabel="Сейчас"
                    comparisonSecondaryLabel="Ранее"
                    previousResult="3"
                    bestResult="6"
                    actionLabel="Пройти"
                    actionIcon={<ArrowButton width={18.3} height={18.3} />}
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="08 / Metric actions" title="Кнопки метрик">
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов кнопки размером 116×48 в реальном контексте
              блоков «Заполнение» и «Прохождение».
            </AppText>

            <View style={styles.journalVariants}>
              {metricButtonVariants.map((item) => {
                const isCheckups = item.metric === 'checkups';
                const isCompleted = item.variant === 'completed';

                return (
                  <View key={item.label} style={styles.journalVariant}>
                    <View style={styles.variantHeader}>
                      <TokenLabel>{item.label}</TokenLabel>
                      <AppText role="caption" color={colors.text.secondary}>
                        116×48
                      </AppText>
                    </View>

                    <JournalAssessment
                      value={isCompleted ? 6 : isCheckups ? 3 : 16}
                      total={isCheckups ? 6 : 24}
                      variant={isCheckups ? 'continuous' : 'ring'}
                      title={
                        isCheckups
                          ? 'Прохождение чекапов'
                          : 'Заполнение журнала'
                      }
                      status="Средняя регулярность"
                      leftCaption="Пройдено 3"
                      rightCaption="Всего 6"
                      actionLabel={
                        isCompleted
                          ? 'Готово'
                          : isCheckups
                            ? 'Пройти'
                            : 'Заполнить'
                      }
                      actionVariant={item.variant}
                      actionIcon={<ArrowButton width={18.3} height={18.3} />}
                    />
                  </View>
                );
              })}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="09 / Scan actions" title="Инфо · Купить · История">
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов нижней панели страницы «Скан». Размер каждой
              реализации — 370×48.
            </AppText>

            <View style={styles.journalVariants}>
              {scanActionVariants.map((item) => (
                <View key={item.label} style={styles.scanActionVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      370×48
                    </AppText>
                  </View>
                  <ScanActionGroup
                    actions={scanActions}
                    variant={item.variant}
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="10 / Instructions" title="Карточки инструкции">
            <AppText role="body" color={colors.text.secondary}>
              Шестнадцать горизонтальных каруселей по пять шагов. Карточки имеют
              production-размер 360×150 и snap-прокрутку.
            </AppText>

            <View style={styles.instructionVariants}>
              {instructionVariants.map((item) => (
                <View key={item.label} style={styles.instructionVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      {item.variant === 'accent' ? '360×130' : '360×150'}
                    </AppText>
                  </View>
                  <InstructionCarousel
                    instructions={instructionSteps}
                    variant={item.variant}
                    illustrations={
                      item.variant === 'illustrated'
                        ? instructionIllustrations
                        : undefined
                    }
                    introCard={
                      item.variant === 'illustrated'
                        ? instructionIntroCard
                        : undefined
                    }
                    cardHeight={item.variant === 'accent' ? 130 : 150}
                  />
                </View>
              ))}
            </View>

            <AppText role="heading" style={styles.instructionIntroSectionTitle}>
              Анимации фона Scan
            </AppText>
            <AppText role="body" color={colors.text.secondary}>
              Восемь вариантов используют исходный PNG 853×1844 без изменения
              цветов и композиции.
            </AppText>

            <View style={styles.scanBackgroundMotionVariants}>
              {scanBackgroundMotionVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.scanBackgroundMotionVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      Original PNG
                    </AppText>
                  </View>
                  <ScanBackgroundMotion
                    source={require('../assets/figma/scan-screen/background.png')}
                    variant={item.variant}
                    width={164}
                    height={355}
                  />
                </View>
              ))}
            </View>

            <AppText role="heading" style={styles.instructionIntroSectionTitle}>
              Обложки инструкции
            </AppText>
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов стартовой карточки размером 360×150.
            </AppText>

            <View style={styles.instructionVariants}>
              {instructionIntroVariants.map((item) => (
                <View key={item.label} style={styles.instructionVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      360×150
                    </AppText>
                  </View>
                  <InstructionIntroCard
                    title={instructionIntroCard.title}
                    illustration={instructionIntroCard.illustration}
                    variant={item.variant}
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="11 / Instruction navigation"
            title="Кнопки влево и вправо"
          >
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов навигации карусели. Каждая кнопка имеет
              production-размер 40×40, общая ширина пары — 380 px.
            </AppText>

            <View style={styles.instructionNavigationVariants}>
              {instructionNavigationVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.instructionNavigationVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      40×40
                    </AppText>
                  </View>
                  <InstructionNavigation variant={item.variant} />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="12 / Scan tooltips"
            title="Подсказки во время сканирования"
          >
            <AppText role="body" color={colors.text.secondary}>
              Десять систем оформления. В каждой горизонтальной ленте доступны
              пять типов подсказок: QR-код, тест, освещение, фон и успешная
              фиксация.
            </AppText>

            <View style={styles.scanTooltipVariants}>
              {scanTooltipVariants.map((item) => (
                <View key={item.label} style={styles.scanTooltipVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      5 состояний
                    </AppText>
                  </View>

                  <View style={styles.scanTooltipStage}>
                    <Image
                      source={require('../assets/figma/scan-screen/background.png')}
                      resizeMode="cover"
                      style={styles.scanTooltipStageImage}
                    />
                    <View style={styles.scanTooltipStageScrim} />
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.scanTooltipScrollContent}
                    >
                      {scanTooltipKinds.map((tooltip) => (
                        <View key={tooltip.kind} style={styles.scanTooltipDemo}>
                          <AppText
                            role="caption"
                            weight="medium"
                            color="rgba(255,255,255,0.72)"
                            style={styles.scanTooltipKindLabel}
                          >
                            {tooltip.label}
                          </AppText>
                          <ScanTooltip
                            kind={tooltip.kind}
                            variant={item.variant}
                          />
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="13 / Scan history"
            title="История результатов сканирования"
          >
            <AppText role="body" color={colors.text.secondary}>
              Десять самостоятельных композиций страницы: от хронологии и
              календаря до сравнения результатов и ленты снимков.
            </AppText>

            <View style={styles.scanHistoryVariants}>
              {scanHistoryVariants.map((item) => (
                <View key={item.label} style={styles.scanHistoryVariant}>
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText role="caption" color={colors.text.secondary}>
                      370 pt
                    </AppText>
                  </View>
                  <ScanHistoryPreview variant={item.variant} />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="14 / Geometry" title="Радиусы и ритм">
            <View style={styles.radiusRow}>
              {radiusTokens.map((token) => (
                <View key={token.name} style={styles.geometryItem}>
                  <View
                    style={[styles.radiusShape, { borderRadius: token.value }]}
                  />
                  <AppText numeric role="caption">
                    {token.name}
                  </AppText>
                </View>
              ))}
            </View>

            <View style={styles.spacingCard}>
              {spacingTokens.map((value) => (
                <View key={value} style={styles.spacingRow}>
                  <AppText
                    numeric
                    role="caption"
                    color={colors.text.secondary}
                    style={styles.spacingValue}
                  >
                    {value}
                  </AppText>
                  <View style={[styles.spacingBar, { width: value * 3 }]} />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="15 / Registration" title="Регистрация">
            <AppText role="body" color={colors.text.secondary}>
              Интерактивный production-экран: переключатель e-mail и телефона,
              обязательные согласия и кнопка «Далее» с валидацией заполнения.
            </AppText>

            <View style={styles.authScreenStage}>
              <View style={styles.authScreenScaled}>
                <AuthScreen embedded preview />
              </View>
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="16 / Auth flow"
            title="Вход и восстановление доступа"
          >
            <AppText role="body" color={colors.text.secondary}>
              Интерактивный полноэкранный сценарий: согласие на обработку
              данных, вход по телефону или e-mail, восстановление через SMS или
              ссылку, установка нового пароля и возврат в приложение.
            </AppText>

            <AppCard style={styles.authFlowCard}>
              <View style={styles.authFlowHeader}>
                <View>
                  <TokenLabel>PRODUCTION SIZE</TokenLabel>
                  <AppText
                    role="heading"
                    weight="semibold"
                    style={styles.authFlowTitle}
                  >
                    Защищённый доступ
                  </AppText>
                </View>
                <AppText numeric role="title" color={colors.brand.primary}>
                  5
                </AppText>
              </View>

              <View style={styles.authFlowSteps}>
                {[
                  'Телефон или e-mail',
                  'Пароль и согласие',
                  'SMS-код или ссылка',
                  'Новый пароль',
                  'Возврат в приложение',
                ].map((label, index) => (
                  <View key={label} style={styles.authFlowStep}>
                    <View style={styles.authFlowStepNumber}>
                      <AppText
                        numeric
                        role="caption"
                        color={colors.brand.primary}
                      >
                        {index + 1}
                      </AppText>
                    </View>
                    <AppText role="label" style={styles.authFlowStepLabel}>
                      {label}
                    </AppText>
                  </View>
                ))}
              </View>

              <PrimaryButton
                label="Открыть флоу входа"
                onPress={() => setAuthFlowVisible(true)}
              />
            </AppCard>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="17 / Journal flow" title="Заполнение журнала">
            <AppText role="body" color={colors.text.secondary}>
              Полноэкранный production-компонент с семью Liquid
              Glass-категориями и контентом, который меняется внутри одной
              страницы.
            </AppText>
            <PrimaryButton
              label="Открыть флоу журнала"
              onPress={() => setJournalFlowVisible(true)}
            />

            <View style={styles.journalFlowKitGroup}>
              <View style={styles.journalFlowKitHeading}>
                <TokenLabel>10 VARIANTS · REAL BACKGROUND</TokenLabel>
                <AppText role="heading" weight="semibold">
                  Контраст текста на лепестках
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  Сравнение текста, поверхности и кромки на настоящем фоне
                  страницы «Симптомы». Вариант 1 оставлен как контрольный.
                </AppText>
              </View>
              <SymptomPetalContrastCatalog />
            </View>

            <View style={styles.journalFlowKitGroup}>
              <View style={styles.journalFlowKitHeading}>
                <TokenLabel>10 ACTIVE + COMPLETED PAIRS</TokenLabel>
                <AppText role="heading" weight="semibold">
                  Активный и пройденные лепестки
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  В каждом варианте «Симптомы» — активный лепесток, а «Цикл»,
                  «Настроение» и «Энергия» — пройденные. Остальные сохраняют
                  текущее неактивное состояние.
                </AppText>
              </View>
              <PetalProgressStatesCatalog />
            </View>

            <View style={styles.journalFlowKitGroup}>
              <View style={styles.journalFlowKitHeading}>
                <TokenLabel>10 PRODUCTION-SIZE VARIANTS</TokenLabel>
                <AppText role="heading" weight="semibold">
                  Кнопки «Назад / Далее»
                </AppText>
              </View>

              <View style={styles.journalFlowPreviewList}>
                {journalFlowActionVariants.map((variant) => (
                  <View key={variant} style={styles.journalFlowPreviewItem}>
                    <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
                    <JournalFlowActionPreview variant={variant} />
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.journalFlowKitGroup}>
              <View style={styles.journalFlowKitHeading}>
                <TokenLabel>DEFAULT + SELECTED</TokenLabel>
                <AppText role="heading" weight="semibold">
                  Плашки выбора
                </AppText>
              </View>

              <View style={styles.journalFlowStateLabels}>
                <AppText role="caption" color={colors.text.secondary}>
                  Обычное состояние
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  Выбранное состояние
                </AppText>
              </View>

              <View style={styles.journalFlowPreviewList}>
                {journalFlowOptionVariants.map((variant) => (
                  <View key={variant} style={styles.journalFlowPreviewItem}>
                    <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
                    <JournalFlowOptionPreview variant={variant} />
                  </View>
                ))}
              </View>
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="18 / Analyses" title="План обследований">
            <AppText role="body" color={colors.text.secondary}>
              Три группы production-компонентов страницы «Анализы». Все варианты
              используют те же токены, контент и обработчики, что и основной
              экран.
            </AppText>

            <View style={styles.analysisVariantGroup}>
              <View style={styles.analysisVariantHeading}>
                <TokenLabel>10 VARIANTS</TokenLabel>
                <AppText role="heading" weight="semibold">
                  Свитчер табов
                </AppText>
                <AppText role="caption" color={colors.text.secondary}>
                  Вариант 2 адаптирован из свитчера Email / Телефон во флоу
                  регистрации.
                </AppText>
              </View>
              <View style={styles.analysisVariantList}>
                {analysisTabsVariants.map((variant) => (
                  <View key={variant} style={styles.analysisVariantItem}>
                    <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
                    <AnalysisTabs
                      activeTab={analysisPreviewTab}
                      onChange={setAnalysisPreviewTab}
                      variant={variant}
                    />
                  </View>
                ))}
              </View>
            </View>
          </Section>

          <View style={styles.footer}>
            <ScanIcon width={22} height={22} />
            <View style={styles.footerCopy}>
              <AppText role="label" weight="medium">
                Private Design System
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                Expo 54 · React Native · native Liquid Glass
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
      <CalendarPageBackupModal
        visible={calendarBackupVisible}
        onClose={() => setCalendarBackupVisible(false)}
      />
      <AuthFlowModal
        visible={authFlowVisible}
        onClose={() => setAuthFlowVisible(false)}
      />
      <JournalFlowModal
        visible={journalFlowVisible}
        onClose={() => setJournalFlowVisible(false)}
        onComplete={() => setJournalFlowVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.burgundy,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  scrollContent: {
    backgroundColor: colors.surface.canvas,
  },
  hero: {
    minHeight: 430,
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: 34,
    overflow: 'hidden',
    backgroundColor: colors.brand.burgundy,
  },
  heroImage: {
    position: 'absolute',
    left: -220,
    top: -70,
    width: 820,
    height: 570,
    opacity: 0.82,
  },
  heroControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroCircle: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
  },
  versionPill: {
    width: 174,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
  },
  backGlyph: {
    marginTop: Platform.OS === 'ios' ? -3 : -1,
    fontSize: 36,
    lineHeight: 38,
  },
  heroCopy: {
    marginTop: 64,
  },
  heroEyebrow: {
    letterSpacing: 1.5,
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 50,
    lineHeight: 52,
    letterSpacing: -1.4,
  },
  heroDescription: {
    maxWidth: 300,
    marginTop: 12,
  },
  heroMeta: {
    marginTop: 42,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.28)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheet: {
    marginTop: -28,
    paddingTop: 38,
    paddingHorizontal: sizes.screenGutter,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.surface.canvas,
  },
  section: {
    gap: spacing.lg,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  rule: {
    height: 1,
    marginVertical: 38,
    backgroundColor: colors.surface.divider,
  },
  destructiveCatalog: {
    gap: spacing.lg,
  },
  destructiveVariantList: {
    gap: spacing.md,
  },
  destructiveVariantItem: {
    gap: spacing.sm,
  },
  destructiveInternalRule: {
    height: 1,
    backgroundColor: colors.surface.divider,
  },
  destructiveGroup: {
    gap: spacing.sm,
  },
  destructiveActionStack: {
    gap: spacing.sm,
  },
  destructiveChatPreview: {
    minHeight: 90,
    alignItems: 'flex-start',
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  swatchItem: {
    width: '46%',
    gap: 5,
  },
  swatch: {
    width: '100%',
    aspectRatio: 1.6,
    marginBottom: 4,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,33,35,0.08)',
  },
  typeCard: {
    paddingVertical: 0,
    ...shadows.card,
  },
  typeRow: {
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  typeRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  numericCard: {
    minHeight: 116,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.warm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  numericSample: {
    width: 100,
    alignItems: 'center',
  },
  numericCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  glassStage: {
    height: 190,
    overflow: 'hidden',
    borderRadius: radii.lg,
    justifyContent: 'center',
  },
  glassStageImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  glassRow: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassCircle: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
  },
  glassPill: {
    width: 156,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
  },
  glassNote: {
    position: 'absolute',
    right: 18,
    bottom: 14,
  },
  buttonStack: {
    gap: spacing.sm,
  },
  inlineButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  demoCard: {
    flex: 1,
    minHeight: 150,
    justifyContent: 'space-between',
  },
  demoCardTitle: {
    marginTop: spacing.lg,
  },
  cardArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  instructionCard: {
    minHeight: 120,
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    ...shadows.card,
  },
  instructionNumber: {
    width: 76,
    fontSize: 58,
    lineHeight: 64,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  instructionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  journalVariants: {
    gap: spacing.xl,
  },
  journalVariant: {
    width: 370,
    gap: spacing.sm,
  },
  journalFlowKitGroup: {
    width: 370,
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  journalFlowKitHeading: {
    gap: spacing.xs,
  },
  journalFlowPreviewList: {
    gap: spacing.xl,
  },
  journalFlowPreviewItem: {
    width: 358,
    gap: spacing.sm,
  },
  journalFlowStateLabels: {
    width: 358,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  analysisVariantGroup: {
    marginTop: spacing.xl,
    gap: spacing.lg,
  },
  analysisVariantHeading: {
    gap: spacing.xs,
  },
  analysisVariantList: {
    gap: spacing.xl,
  },
  analysisVariantItem: {
    width: 370,
    gap: spacing.sm,
  },
  analysisStatePreview: {
    gap: spacing.xs,
  },
  analysisActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  analysisActionItem: {
    width: 177,
    gap: spacing.xs,
  },
  analysisActionStage: {
    minHeight: 70,
    alignItems: 'flex-start',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    padding: spacing.sm,
  },
  variantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanActionVariant: {
    width: 370,
    gap: spacing.sm,
  },
  instructionVariants: {
    gap: spacing.xl,
  },
  instructionVariant: {
    width: 360,
    gap: spacing.sm,
  },
  instructionIntroSectionTitle: {
    marginTop: spacing.xxl,
  },
  scanBackgroundMotionVariants: {
    gap: spacing.xl,
  },
  scanBackgroundMotionVariant: {
    width: 360,
    gap: spacing.sm,
    alignItems: 'center',
  },
  instructionNavigationVariants: {
    gap: spacing.xl,
  },
  instructionNavigationVariant: {
    width: 380,
    marginLeft: -5,
    gap: spacing.sm,
  },
  scanTooltipVariants: {
    gap: spacing.xl,
  },
  scanTooltipVariant: {
    width: 370,
    gap: spacing.sm,
  },
  scanTooltipStage: {
    width: 370,
    height: 116,
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#251119',
  },
  scanTooltipStageImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  scanTooltipStageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  scanTooltipScrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 18,
  },
  scanTooltipDemo: {
    width: 320,
    gap: 7,
    alignItems: 'center',
  },
  scanTooltipKindLabel: {
    alignSelf: 'flex-start',
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  scanHistoryVariants: {
    gap: spacing.xl,
  },
  scanHistoryVariant: {
    width: 370,
    gap: spacing.sm,
  },
  radiusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  geometryItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  radiusShape: {
    width: 68,
    height: 68,
    backgroundColor: colors.surface.warm,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.16)',
  },
  spacingCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    gap: spacing.sm,
  },
  spacingRow: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  spacingValue: {
    width: 24,
    textAlign: 'right',
  },
  spacingBar: {
    maxWidth: 160,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  authFlowCard: {
    gap: spacing.lg,
    ...shadows.card,
  },
  authScreenStage: {
    width: 370,
    height: 804,
    overflow: 'hidden',
    borderRadius: 37,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  authScreenScaled: {
    width: 402,
    height: 874,
    transform: [{ scale: 370 / 402 }],
    transformOrigin: 'top left',
  },
  authFlowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  authFlowTitle: {
    marginTop: spacing.xs,
  },
  authFlowSteps: {
    gap: spacing.sm,
  },
  authFlowStep: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authFlowStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authFlowStepLabel: {
    flex: 1,
  },
  footer: {
    marginTop: 48,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.surface.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerCopy: {
    gap: 2,
  },
});
