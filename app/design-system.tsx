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
import {
  AppCard,
  AppText,
  colors,
  fonts,
  GlassControl,
  InstructionCarousel,
  type InstructionCardVariant,
  InstructionIntroCard,
  type InstructionIntroCardVariant,
  InstructionNavigation,
  type InstructionNavigationVariant,
  JournalAssessment,
  type MetricActionButtonVariant,
  PrimaryButton,
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
  TokenLabel,
  typeScale,
} from '../design-system';

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
  { label: '01 / Сегментная', variant: 'segments' as const },
  { label: '02 / Линейная', variant: 'continuous' as const },
  { label: '03 / Недельная', variant: 'week' as const },
  { label: '04 / Числовая', variant: 'score' as const },
  { label: '05 / Уровневая', variant: 'levels' as const },
  { label: '06 / Кольцевая', variant: 'ring' as const },
  { label: '07 / Сравнительная', variant: 'comparison' as const },
];

const checkupVariants = [
  { label: '01 / Кольцевая', variant: 'ring' as const },
  { label: '02 / Линейная', variant: 'continuous' as const },
  { label: '03 / Числовая', variant: 'score' as const },
  { label: '04 / Уровневая', variant: 'levels' as const },
  { label: '05 / Сравнительная', variant: 'comparison' as const },
  { label: '06 / Сегментная', variant: 'segments' as const },
  { label: '07 / Нумерованные точки', variant: 'dots' as const },
  { label: '08 / Этапы', variant: 'milestones' as const },
  { label: '09 / Баланс', variant: 'balance' as const },
  { label: '10 / Матрица', variant: 'matrix' as const },
  { label: '11 / Gauge', variant: 'gauge' as const },
  { label: '12 / Дробная', variant: 'fraction' as const },
  { label: '13 / Heatmap', variant: 'heatmap' as const },
  { label: '14 / Ступени', variant: 'ladder' as const },
  { label: '15 / Checklist', variant: 'checklist' as const },
];

const metricButtonVariants: Array<{
  label: string;
  variant: MetricActionButtonVariant;
  metric: 'journal' | 'checkups';
}> = [
  { label: '01 / Основная', variant: 'solid', metric: 'journal' },
  { label: '02 / Мягкая', variant: 'soft', metric: 'checkups' },
  { label: '03 / Контурная', variant: 'outline', metric: 'journal' },
  { label: '04 / Белая', variant: 'white', metric: 'checkups' },
  { label: '05 / Бордовая', variant: 'burgundy', metric: 'journal' },
  { label: '06 / Liquid Glass', variant: 'glass', metric: 'checkups' },
  { label: '07 / Split', variant: 'split', metric: 'journal' },
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
  { label: '06 / Segmented accent', variant: 'segmentedSolid' },
  { label: '07 / Segmented soft', variant: 'segmentedSoft' },
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
  require('../assets/instructions/step-1-cup.png'),
  require('../assets/instructions/step-2-package.png'),
  require('../assets/instructions/step-3-dip-test.png'),
  require('../assets/instructions/step-4-test-strip.png'),
  require('../assets/instructions/step-5-results.png'),
];

const instructionIntroCard = {
  title: 'Инструкция по использованию',
  illustration: require('../assets/instructions/step-4-test-strip.png'),
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
  { label: '06 / Горизонтальный поток', variant: 'activeOrbit' },
  { label: '07 / Диагональный проход', variant: 'activeSweep' },
  { label: '08 / Поток с глубиной', variant: 'activePulse' },
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

export default function DesignSystemScreen() {
  const insets = useSafeAreaInsets();
  const [complete, setComplete] = useState(false);
  const [fontsLoaded] = useFonts({
    [fonts.sfRegular]: require('../assets/fonts/SF-Pro-Display-Regular.otf'),
    [fonts.sfMedium]: require('../assets/fonts/SF-Pro-Display-Medium.otf'),
    [fonts.sfSemibold]: require('../assets/fonts/SF-Pro-Display-Semibold.otf'),
    [fonts.sfBold]: require('../assets/fonts/SF-Pro-Display-Bold.otf'),
    [fonts.yaroRegular]: require('../assets/fonts/Yaro-Rg-Regular.otf'),
  });

  if (!fontsLoaded) {
    return <View style={styles.loading} />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 112 },
        ]}
      >
        <View
          style={[
            styles.hero,
            { paddingTop: Math.max(insets.top, 16) + 12 },
          ]}
        >
          <Image
            source={require('../assets/figma/pregnancy-background.png')}
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
            style={StyleSheet.absoluteFill}
          />

          <GlassContainer spacing={12} style={styles.heroControls}>
            <GlassControl
              accessibilityLabel="Вернуться назад"
              onPress={() => router.back()}
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
              <AppText
                role="label"
                weight="medium"
                color={colors.text.primary}
              >
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
              <AppText
                numeric
                role="title"
                color={colors.text.inverse}
              >
                402
              </AppText>
              <AppText
                role="caption"
                color="rgba(255,255,255,0.62)"
              >
                base width
              </AppText>
            </View>
            <View>
              <AppText
                numeric
                role="title"
                color={colors.text.inverse}
              >
                48
              </AppText>
              <AppText
                role="caption"
                color="rgba(255,255,255,0.62)"
              >
                min touch
              </AppText>
            </View>
            <View>
              <AppText
                numeric
                role="title"
                color={colors.text.inverse}
              >
                16
              </AppText>
              <AppText
                role="caption"
                color="rgba(255,255,255,0.62)"
              >
                gutter
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <Section eyebrow="01 / Foundations" title="Цветовые роли">
            <View style={styles.swatchGrid}>
              {colorTokens.map((token) => (
                <View key={token.name} style={styles.swatchItem}>
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: token.value },
                    ]}
                  />
                  <AppText role="label" weight="medium">
                    {token.name}
                  </AppText>
                  <AppText
                    numeric
                    role="caption"
                    color={colors.text.secondary}
                  >
                    {token.value}
                  </AppText>
                  <AppText
                    role="caption"
                    color={colors.text.secondary}
                  >
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
                  style={[
                    styles.typeRow,
                    index > 0 && styles.typeRowBorder,
                  ]}
                >
                  <TokenLabel>{specimen.label}</TokenLabel>
                  <AppText role={specimen.role}>
                    {specimen.text}
                  </AppText>
                </View>
              ))}
            </AppCard>

            <View style={styles.numericCard}>
              <View style={styles.numericSample}>
                <AppText
                  numeric
                  role="display"
                  color={colors.brand.primary}
                >
                  7”
                </AppText>
                <AppText
                  numeric
                  role="heading"
                  color={colors.brand.primary}
                >
                  сфера.
                </AppText>
              </View>
              <View style={styles.numericCopy}>
                <TokenLabel>Yaro Rg</TokenLabel>
                <AppText role="label">
                  Все цифры, апострофы и слово «сфера.»
                </AppText>
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
                    <AppText numeric role="body">21</AppText> июля
                  </AppText>
                </GlassControl>
                <GlassControl
                  accessibilityLabel="Календарь"
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
              <AppText
                role="caption"
                color={colors.text.secondary}
              >
                Нажмите «Заполнить», чтобы проверить интерактивное состояние.
              </AppText>
            </View>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="05 / Cards" title="Контентные поверхности">
            <View style={styles.cardRow}>
              <AppCard tone="accent" style={styles.demoCard}>
                <AppText
                  numeric
                  role="title"
                  color={colors.text.inverse}
                >
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
                  <AppText
                    role="body"
                    color={colors.brand.primary}
                  >
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

          <Section
            eyebrow="06 / Status"
            title="Оценка заполнения журнала"
          >
            <AppText role="body" color={colors.text.secondary}>
              Семь разных реализаций одной задачи. Размер каждого ряда
              — 370×58, как на странице «Сегодня».
            </AppText>

            <View style={styles.journalVariants}>
              {journalVariants.map((variant) => (
                <View
                  key={variant.label}
                  style={styles.journalVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{variant.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
                      370×58
                    </AppText>
                  </View>

                  <JournalAssessment
                    value={16}
                    variant={variant.variant}
                    actionLabel="Заполнить"
                    actionIcon={
                      <ArrowButton width={18.3} height={18.3} />
                    }
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="07 / Checkups"
            title="Прохождение чекапов"
          >
            <AppText role="body" color={colors.text.secondary}>
              Пятнадцать production-вариантов одной метрики. Все реализации
              имеют размер 370×58 и кнопку «Пройти».
            </AppText>

            <View style={styles.journalVariants}>
              {checkupVariants.map((variant) => (
                <View
                  key={variant.label}
                  style={styles.journalVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{variant.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
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
                    actionIcon={
                      <ArrowButton width={18.3} height={18.3} />
                    }
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="08 / Metric actions"
            title="Кнопки метрик"
          >
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов кнопки размером 116×48 в реальном
              контексте блоков «Заполнение» и «Прохождение».
            </AppText>

            <View style={styles.journalVariants}>
              {metricButtonVariants.map((item) => {
                const isCheckups = item.metric === 'checkups';
                const isCompleted = item.variant === 'completed';

                return (
                  <View
                    key={item.label}
                    style={styles.journalVariant}
                  >
                    <View style={styles.variantHeader}>
                      <TokenLabel>{item.label}</TokenLabel>
                      <AppText
                        role="caption"
                        color={colors.text.secondary}
                      >
                        116×48
                      </AppText>
                    </View>

                    <JournalAssessment
                      value={isCompleted ? 6 : isCheckups ? 3 : 16}
                      total={isCheckups ? 6 : 24}
                      variant={
                        isCheckups ? 'continuous' : 'ring'
                      }
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
                      actionIcon={
                        <ArrowButton width={18.3} height={18.3} />
                      }
                    />
                  </View>
                );
              })}
            </View>
          </Section>

          <View style={styles.rule} />

          <Section
            eyebrow="09 / Scan actions"
            title="Инфо · Купить · История"
          >
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов нижней панели страницы «Скан». Размер
              каждой реализации — 370×48.
            </AppText>

            <View style={styles.journalVariants}>
              {scanActionVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.scanActionVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
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

          <Section
            eyebrow="10 / Instructions"
            title="Карточки инструкции"
          >
            <AppText role="body" color={colors.text.secondary}>
              Шестнадцать горизонтальных каруселей по пять шагов. Карточки
              имеют production-размер 360×150 и snap-прокрутку.
            </AppText>

            <View style={styles.instructionVariants}>
              {instructionVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.instructionVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
                      {item.variant === 'accent'
                        ? '360×130'
                        : '360×150'}
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
                    cardHeight={
                      item.variant === 'accent' ? 130 : 150
                    }
                  />
                </View>
              ))}
            </View>

            <AppText
              role="heading"
              style={styles.instructionIntroSectionTitle}
            >
              Анимации фона Scan
            </AppText>
            <AppText role="body" color={colors.text.secondary}>
              Восемь вариантов используют исходный PNG 853×1844 без
              изменения цветов и композиции.
            </AppText>

            <View style={styles.scanBackgroundMotionVariants}>
              {scanBackgroundMotionVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.scanBackgroundMotionVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
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

            <AppText
              role="heading"
              style={styles.instructionIntroSectionTitle}
            >
              Обложки инструкции
            </AppText>
            <AppText role="body" color={colors.text.secondary}>
              Десять вариантов стартовой карточки размером 360×150.
            </AppText>

            <View style={styles.instructionVariants}>
              {instructionIntroVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.instructionVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
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
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
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
              Десять систем оформления. В каждой горизонтальной ленте
              доступны пять типов подсказок: QR-код, тест, освещение,
              фон и успешная фиксация.
            </AppText>

            <View style={styles.scanTooltipVariants}>
              {scanTooltipVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.scanTooltipVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
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
                      contentContainerStyle={
                        styles.scanTooltipScrollContent
                      }
                    >
                      {scanTooltipKinds.map((tooltip) => (
                        <View
                          key={tooltip.kind}
                          style={styles.scanTooltipDemo}
                        >
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
              Пять самостоятельных композиций страницы: хронология,
              карточки, плотный журнал, календарь и динамика.
            </AppText>

            <View style={styles.scanHistoryVariants}>
              {scanHistoryVariants.map((item) => (
                <View
                  key={item.label}
                  style={styles.scanHistoryVariant}
                >
                  <View style={styles.variantHeader}>
                    <TokenLabel>{item.label}</TokenLabel>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                    >
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
                    style={[
                      styles.radiusShape,
                      { borderRadius: token.value },
                    ]}
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
                  <View
                    style={[
                      styles.spacingBar,
                      { width: value * 3 },
                    ]}
                  />
                </View>
              ))}
            </View>
          </Section>

          <View style={styles.footer}>
            <ScanIcon width={22} height={22} />
            <View style={styles.footerCopy}>
              <AppText role="label" weight="medium">
                Private Design System
              </AppText>
              <AppText
                role="caption"
                color={colors.text.secondary}
              >
                Expo 54 · React Native · native Liquid Glass
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
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
    ...StyleSheet.absoluteFill,
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
    ...StyleSheet.absoluteFill,
    width: undefined,
    height: undefined,
  },
  scanTooltipStageScrim: {
    ...StyleSheet.absoluteFill,
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
