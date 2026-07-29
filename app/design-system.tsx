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
import ScanIcon from '../assets/figma/scan-screen/scan.svg';
import {
  AppCard,
  AppText,
  colors,
  fonts,
  GlassControl,
  PrimaryButton,
  ProgressMeter,
  radii,
  shadows,
  sizes,
  spacing,
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

          <Section eyebrow="06 / Status" title="Прогресс и семантика">
            <AppCard style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <AppText role="body" weight="medium">
                  Оценка заполнения журнала
                </AppText>
                <AppText
                  numeric
                  role="label"
                  color={colors.brand.success}
                >
                  {complete ? '24/24' : '16/24'}
                </AppText>
              </View>
              <ProgressMeter value={complete ? 24 : 16} />
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.brand.success },
                    ]}
                  />
                  <AppText
                    role="caption"
                    color={colors.text.secondary}
                  >
                    Выполнено
                  </AppText>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: colors.surface.divider },
                    ]}
                  />
                  <AppText
                    role="caption"
                    color={colors.text.secondary}
                  >
                    Не заполнено
                  </AppText>
                </View>
              </View>
            </AppCard>
          </Section>

          <View style={styles.rule} />

          <Section eyebrow="07 / Geometry" title="Радиусы и ритм">
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
  progressCard: {
    gap: spacing.md,
    ...shadows.card,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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

