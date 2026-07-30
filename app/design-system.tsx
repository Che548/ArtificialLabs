import { useFonts } from 'expo-font';
import { GlassContainer } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, Platform, ScrollView, StyleSheet, View } from 'react-native';
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
    <View className="gap-6">
      <View className="gap-2">
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
    return <View className="flex-1 bg-surface-canvas" />;
  }

  return (
    <View className="flex-1 bg-brand-burgundy">
      <StatusBar style="light" hidden={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="bg-surface-canvas"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 16) + 112,
        }}
      >
        <View
          className="min-h-[430px] overflow-hidden bg-brand-burgundy px-4 pb-[34px]"
          style={{ paddingTop: Math.max(insets.top, 16) + 12 }}
        >
          <Image
            source={require('../assets/figma/pregnancy-background.png')}
            resizeMode="cover"
            className="absolute -left-[220px] -top-[70px] h-[570px] w-[820px] opacity-[0.82]"
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
              className="h-12 w-12 rounded-full"
            >
              <AppText
                role="heading"
                color={colors.text.primary}
                className="text-[36px] leading-[38px]"
                style={{ marginTop: Platform.OS === 'ios' ? -3 : -1 }}
              >
                ‹
              </AppText>
            </GlassControl>

            <GlassControl
              accessibilityLabel="Версия дизайн-системы"
              className="h-12 w-[174px] rounded-full"
            >
              <AppText role="label" weight="medium" color={colors.text.primary}>
                Private · UI kit 01
              </AppText>
            </GlassControl>
          </GlassContainer>

          <View className="mt-16">
            <AppText
              role="caption"
              weight="semibold"
              color="rgba(255,255,255,0.72)"
              className="tracking-[1.5px]"
            >
              DESIGN SYSTEM / IOS
            </AppText>
            <AppText
              role="display"
              weight="semibold"
              color={colors.text.inverse}
              className="mt-2.5 text-[50px] leading-[52px] tracking-[-1.4px]"
            >
              Private
            </AppText>
            <AppText
              role="body"
              color="rgba(255,255,255,0.82)"
              className="mt-3 max-w-[300px]"
            >
              Исполняемый каталог токенов и компонентов приложения.
            </AppText>
          </View>

          <View className="mt-[42px] flex-row justify-between border-t border-white/30 pt-[18px]">
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

        <View className="-mt-7 rounded-t-card-xl bg-surface-canvas px-4 pt-[38px]">
          <Section eyebrow="01 / Foundations" title="Цветовые роли">
            <View className="flex-row flex-wrap gap-4">
              {colorTokens.map((token) => (
                <View key={token.name} className="w-[46%] gap-[5px]">
                  <View
                    className="mb-1 aspect-[1.6] w-full rounded-card-md border border-black/10"
                    style={{ backgroundColor: token.value }}
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

          <View className="my-[38px] h-px bg-surface-divider" />

          <Section eyebrow="02 / Typography" title="Два шрифтовых голоса">
            <AppCard className="py-0" style={shadows.card}>
              {typeSpecimens.map((specimen, index) => (
                <View
                  key={specimen.label}
                  className={`gap-2 py-4 ${index > 0 ? 'border-t border-surface-divider' : ''}`}
                >
                  <TokenLabel>{specimen.label}</TokenLabel>
                  <AppText role={specimen.role}>{specimen.text}</AppText>
                </View>
              ))}
            </AppCard>

            <View className="min-h-[116px] flex-row items-center gap-6 rounded-card-lg bg-surface-warm p-4">
              <View className="w-[100px] items-center">
                <AppText numeric role="display" color={colors.brand.primary}>
                  7”
                </AppText>
                <AppText numeric role="heading" color={colors.brand.primary}>
                  сфера.
                </AppText>
              </View>
              <View className="flex-1 gap-2">
                <TokenLabel>Yaro Rg</TokenLabel>
                <AppText role="label">
                  Все цифры, апострофы и слово «сфера.»
                </AppText>
              </View>
            </View>
          </Section>

          <View className="my-[38px] h-px bg-surface-divider" />

          <Section eyebrow="03 / Material" title="Liquid Glass">
            <View className="h-[190px] justify-center overflow-hidden rounded-card-lg">
              <Image
                source={require('../assets/figma/scan-screen/background.png')}
                resizeMode="cover"
                className="absolute inset-0 h-full w-full"
              />
              <GlassContainer spacing={12} style={styles.glassRow}>
                <GlassControl
                  accessibilityLabel="Мониторинг"
                  className="h-12 w-12 rounded-full"
                >
                  <MonitoringIcon width={sizes.icon} height={sizes.icon} />
                </GlassControl>
                <GlassControl
                  accessibilityLabel="Дата"
                  className="h-12 w-[156px] rounded-full"
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
                  className="h-12 w-12 rounded-full"
                >
                  <CalendarIcon width={sizes.icon} height={sizes.icon} />
                </GlassControl>
              </GlassContainer>
              <AppText
                role="caption"
                color="rgba(33,33,35,0.64)"
                className="absolute bottom-3.5 right-[18px]"
              >
                clear · interactive · no tint
              </AppText>
            </View>
          </Section>

          <View className="my-[38px] h-px bg-surface-divider" />

          <Section eyebrow="04 / Controls" title="Кнопки и состояния">
            <View className="gap-3">
              <PrimaryButton
                label={complete ? 'Готово' : 'Заполнить'}
                onPress={() => setComplete((value) => !value)}
                icon={<ArrowButton width={18} height={18} />}
              />
              <View className="flex-row gap-3">
                <PrimaryButton compact label="Купить" />
                <PrimaryButton compact disabled label="Недоступно" />
              </View>
              <AppText role="caption" color={colors.text.secondary}>
                Нажмите «Заполнить», чтобы проверить интерактивное состояние.
              </AppText>
            </View>
          </Section>

          <View className="my-[38px] h-px bg-surface-divider" />

          <Section eyebrow="05 / Cards" title="Контентные поверхности">
            <View className="flex-row gap-3">
              <AppCard
                tone="accent"
                className="min-h-[150px] flex-1 justify-between"
              >
                <AppText numeric role="title" color={colors.text.inverse}>
                  72%
                </AppText>
                <AppText
                  role="label"
                  color={colors.text.inverse}
                  className="mt-6"
                >
                  Индекс внимания к здоровью
                </AppText>
              </AppCard>
              <AppCard
                tone="warm"
                className="min-h-[150px] flex-1 justify-between"
              >
                <View className="h-[34px] w-[34px] items-center justify-center self-end rounded-full bg-surface-raised">
                  <AppText role="body" color={colors.brand.primary}>
                    ↗
                  </AppText>
                </View>
                <AppText role="label" className="mt-6">
                  Подбор питания в 1-м триместре
                </AppText>
              </AppCard>
            </View>

            <AppCard
              className="min-h-[120px] flex-row items-center gap-4 bg-surface-raised"
              style={shadows.card}
            >
              <AppText
                numeric
                className="w-[76px] text-center text-[58px] leading-[64px] tracking-[-1.2px]"
              >
                1”
              </AppText>
              <View className="flex-1 gap-2">
                <AppText role="heading" weight="medium">
                  Ознакомление
                </AppText>
                <AppText role="body">
                  Вскройте коробку, внимательно изучите инструкции.
                </AppText>
              </View>
            </AppCard>
          </Section>

          <View className="my-[38px] h-px bg-surface-divider" />

          <Section eyebrow="06 / Status" title="Прогресс и семантика">
            <AppCard className="gap-4" style={shadows.card}>
              <View className="flex-row items-center justify-between">
                <AppText role="body" weight="medium">
                  Оценка заполнения журнала
                </AppText>
                <AppText numeric role="label" color={colors.brand.success}>
                  {complete ? '24/24' : '16/24'}
                </AppText>
              </View>
              <ProgressMeter value={complete ? 24 : 16} />
              <View className="flex-row gap-6">
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 rounded-full bg-brand-success" />
                  <AppText role="caption" color={colors.text.secondary}>
                    Выполнено
                  </AppText>
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 rounded-full bg-surface-divider" />
                  <AppText role="caption" color={colors.text.secondary}>
                    Не заполнено
                  </AppText>
                </View>
              </View>
            </AppCard>
          </Section>

          <View className="my-[38px] h-px bg-surface-divider" />

          <Section eyebrow="07 / Geometry" title="Радиусы и ритм">
            <View className="flex-row justify-between">
              {radiusTokens.map((token) => (
                <View key={token.name} className="items-center gap-2">
                  <View
                    className="h-[68px] w-[68px] border border-brand-primary/20 bg-surface-warm"
                    style={{ borderRadius: token.value }}
                  />
                  <AppText numeric role="caption">
                    {token.name}
                  </AppText>
                </View>
              ))}
            </View>

            <View className="gap-3 rounded-card-lg bg-surface-raised p-4">
              {spacingTokens.map((value) => (
                <View
                  key={value}
                  className="h-[18px] flex-row items-center gap-3"
                >
                  <AppText
                    numeric
                    role="caption"
                    color={colors.text.secondary}
                    className="w-6 text-right"
                  >
                    {value}
                  </AppText>
                  <View
                    className="h-2 max-w-[160px] rounded bg-brand-primary"
                    style={{ width: value * 3 }}
                  />
                </View>
              ))}
            </View>
          </Section>

          <View className="mt-12 flex-row items-center gap-3 border-t border-surface-divider py-6">
            <ScanIcon width={22} height={22} />
            <View className="gap-0.5">
              <AppText role="label" weight="medium">
                Private Design System
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                Expo 57 · NativeWind 4 · native Liquid Glass
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  glassRow: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
