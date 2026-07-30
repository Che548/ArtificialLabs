import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { useFonts } from 'expo-font';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ColorValue,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  TextProps,
  ViewStyle,
} from 'react-native';

import ArrowButton from './assets/figma/arrow-button.svg';
import ArrowCard from './assets/figma/arrow-card.svg';
import CalendarIcon from './assets/figma/calendar-icon.svg';
import ContentShape from './assets/figma/content-shape.svg';
import MonitoringIcon from './assets/figma/monitoring-icon.svg';
import { useHealthStore } from './lib/health-store';
import type { JournalKind } from './lib/health-types';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const FONT_SF_REGULAR = 'SFProDisplay-Regular';
const FONT_SF_SEMIBOLD = 'SFProDisplay-Semibold';
const FONT_YARO_RG = 'YaroRg-Regular';
const FontReadyContext = createContext(false);
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
const MAX_PREGNANCY_WEEK = 42;
const WEEK_ITEM_WIDTH = 76;
const WEEK_BUBBLE_SIZE = 75;
const WEEK_CENTER_PADDING = (DESIGN_WIDTH - WEEK_ITEM_WIDTH) / 2;
const journalBars = Array.from({ length: 24 }, (_, index) => index < 16);

function getWeekLabel(week: number) {
  const lastTwoDigits = week % 100;
  const lastDigit = week % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'недель';
  }

  if (lastDigit === 1) {
    return 'неделя';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'недели';
  }

  return 'недель';
}

type LiquidGlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: GlassStyle;
  tintColor?: string;
  colorScheme?: GlassColorScheme;
  fallbackTint?: BlurTint;
  intensity?: number;
  washColor?: string;
  highlight?: 'light' | 'dark';
  radius?: number;
}>;

function LiquidGlassSurface({
  children,
  style,
  variant = 'regular',
  tintColor,
  colorScheme = 'auto',
  fallbackTint = 'systemUltraThinMaterial',
  intensity = 62,
  washColor = 'rgba(255,255,255,0.08)',
  highlight = 'light',
  radius = 999,
}: LiquidGlassSurfaceProps) {
  const highlightColors: readonly [ColorValue, ColorValue, ColorValue] =
    highlight === 'light'
      ? [
          'rgba(255,255,255,0.52)',
          'rgba(255,255,255,0.10)',
          'rgba(255,255,255,0.18)',
        ]
      : [
          'rgba(255,255,255,0.26)',
          'rgba(255,255,255,0.03)',
          'rgba(255,255,255,0.10)',
        ];

  return (
    <View
      pointerEvents={hasNativeLiquidGlass ? 'box-none' : 'none'}
      style={[
        styles.glassSurface,
        !hasNativeLiquidGlass && styles.glassSurfaceClipped,
        { borderRadius: radius },
        style,
      ]}
    >
      {hasNativeLiquidGlass ? (
        <GlassView
          glassEffectStyle={variant}
          tintColor={tintColor}
          colorScheme={colorScheme}
          isInteractive
          style={[
            StyleSheet.absoluteFill,
            styles.nativeGlassView,
            { borderRadius: radius },
          ]}
        >
          {children ? (
            <View pointerEvents="none" style={styles.nativeGlassContent}>
              {children}
            </View>
          ) : null}
        </GlassView>
      ) : (
        <>
          {Platform.OS === 'web' ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    highlight === 'dark'
                      ? 'rgba(49,5,12,0.34)'
                      : 'rgba(255,255,255,0.58)',
                },
              ]}
            />
          ) : (
            <BlurView
              tint={fallbackTint}
              intensity={intensity}
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: washColor }]}
          />
          <LinearGradient
            colors={highlightColors}
            locations={[0, 0.42, 1]}
            start={{ x: 0.04, y: 0 }}
            end={{ x: 0.96, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.glassInnerStroke, { borderRadius: radius }]} />
          {children}
        </>
      )}
    </View>
  );
}

type ProjectTextProps = Omit<TextProps, 'children'> & {
  children: string | number;
  className?: string;
  weight?: 'regular' | 'semibold';
};

function ProjectText({
  children,
  className = '',
  style,
  weight = 'regular',
  ...props
}: ProjectTextProps) {
  const fontsReady = useContext(FontReadyContext);
  const segments = String(children).split(/(\d+|сфера)/gi);
  const sfFont =
    fontsReady && weight === 'semibold'
      ? FONT_SF_SEMIBOLD
      : fontsReady
        ? FONT_SF_REGULAR
        : Platform.OS === 'ios'
          ? 'System'
          : 'sans-serif';
  const fallbackWeight = fontsReady
    ? undefined
    : weight === 'semibold'
      ? '600'
      : '400';

  return (
    <Text
      {...props}
      className={`font-sf ${className}`}
      style={[style, { fontFamily: sfFont, fontWeight: fallbackWeight }]}
    >
      {segments.map((segment, index) =>
        /^\d+$|^сфера$/i.test(segment) ? (
          <Text
            key={`${segment}-${index}`}
            style={{
              fontFamily: fontsReady ? FONT_YARO_RG : sfFont,
              fontWeight: fallbackWeight,
            }}
          >
            {segment}
          </Text>
        ) : (
          segment
        ),
      )}
    </Text>
  );
}

type FeatureCardProps = {
  title: string;
  accent?: boolean;
};

function FeatureCard({ title, accent = false }: FeatureCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      className={`h-32 w-[118px] items-end justify-between rounded-card-lg p-4 active:opacity-[0.72] ${accent ? 'bg-brand-primary' : 'bg-[#f2a8cb]'}`}
    >
      {accent ? (
        <ProjectText className="self-start text-[32px] leading-[38px] tracking-[-0.64px] text-brand-success">
          72%
        </ProjectText>
      ) : (
        <View className="h-[27px] w-[27px] items-center justify-center rounded-full bg-brand-primary">
          <ArrowCard width={18.3} height={18.3} />
        </View>
      )}
      <ProjectText
        numberOfLines={3}
        className={`w-full text-[14.2px] leading-[17px] tracking-[-0.284px] ${accent ? 'text-white' : 'text-[#171717]'}`}
        weight="regular"
      >
        {title}
      </ProjectText>
    </Pressable>
  );
}

function MonitoringScreen({ headerTop }: { headerTop: number }) {
  const { profile, journalEntries, addJournalEntry, readOnly, syncStatus } =
    useHealthStore();
  const pregnancyMode = profile?.goal === 'pregnancy';
  const maxPeriod = pregnancyMode
    ? MAX_PREGNANCY_WEEK
    : (profile?.cycleLengthDays ?? 28);
  const initialPeriod = pregnancyMode
    ? Math.min(
        maxPeriod,
        Math.max(
          1,
          Math.floor(
            (Date.now() - (profile?.pregnancyStartAt ?? Date.now())) /
              (7 * 24 * 60 * 60 * 1000),
          ) + 1,
        ),
      )
    : Math.min(
        maxPeriod,
        Math.max(
          1,
          Math.floor(
            (Date.now() - (profile?.lastPeriodStartAt ?? Date.now())) /
              (24 * 60 * 60 * 1000),
          ) + 1,
        ),
      );
  const periods = Array.from({ length: maxPeriod }, (_, index) => index + 1);
  const [activeWeek, setActiveWeek] = useState(initialPeriod);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalKind, setJournalKind] = useState<JournalKind>('symptom');
  const [journalText, setJournalText] = useState('');
  const [journalError, setJournalError] = useState<string>();
  const fontsReady = useContext(FontReadyContext);
  const weekScrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(
    new Animated.Value((initialPeriod - 1) * WEEK_ITEM_WIDTH),
  ).current;
  const weekNumberFont = fontsReady
    ? FONT_YARO_RG
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';
  const weekLabelFont = fontsReady
    ? FONT_SF_REGULAR
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';

  const selectWeekFromOffset = (offsetX: number) => {
    const nextWeek = Math.min(
      maxPeriod,
      Math.max(1, Math.round(offsetX / WEEK_ITEM_WIDTH) + 1),
    );

    setActiveWeek(nextWeek);
  };

  const handleWeekScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    selectWeekFromOffset(event.nativeEvent.contentOffset.x);
  };

  const scrollToWeek = (week: number) => {
    setActiveWeek(week);
    weekScrollRef.current?.scrollTo({
      x: (week - 1) * WEEK_ITEM_WIDTH,
      animated: true,
    });
  };

  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayEntries = journalEntries.filter(
    (entry) => !entry.deletedAt && entry.occurredAt >= todayStart,
  );
  const journalCompleted = todayEntries.length > 0;

  const saveJournal = async () => {
    if (!journalText.trim()) {
      setJournalError('Добавьте короткую запись.');
      return;
    }
    await addJournalEntry({
      occurredAt: Date.now(),
      kind: journalKind,
      label:
        journalKind === 'mood'
          ? 'Настроение'
          : journalKind === 'energy'
            ? 'Энергия'
            : journalKind === 'nutrition'
              ? 'Питание'
              : 'Симптомы',
      textValue: journalText.trim(),
    });
    setJournalText('');
    setJournalError(undefined);
    setJournalOpen(false);
  };

  return (
    <View className="h-[874px] w-[402px] overflow-hidden rounded-card-xl bg-[#f2f2f2]">
      <Image
        source={require('./assets/figma/pregnancy-background.png')}
        resizeMode="cover"
        className="absolute -left-[159px] -top-3 h-[573px] w-[717px]"
      />

      <LinearGradient
        colors={['rgba(130,53,55,0.96)', 'rgba(130,53,55,0)']}
        locations={[0, 0.96]}
        className="absolute left-0 top-0 h-[100px] w-[402px]"
      />

      <GlassContainer spacing={12} style={[styles.topBar, { top: headerTop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть мониторинг"
          className="h-12 w-12 items-center justify-center rounded-full"
          style={({ pressed }) => [
            styles.topCircle,
            !hasNativeLiquidGlass && styles.glassControlShadow,
            pressed && !hasNativeLiquidGlass && styles.glassFallbackPressed,
          ]}
        >
          <LiquidGlassSurface
            variant="clear"
            colorScheme="light"
            fallbackTint="systemUltraThinMaterialLight"
            intensity={58}
            washColor="transparent"
            highlight="light"
          >
            <View className="-scale-y-100">
              <MonitoringIcon width={22} height={22} />
            </View>
          </LiquidGlassSurface>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Выбрать дату"
          className="h-12 w-[156px] items-center justify-center rounded-full"
          style={({ pressed }) => [
            styles.datePill,
            !hasNativeLiquidGlass && styles.glassControlShadow,
            pressed && !hasNativeLiquidGlass && styles.glassFallbackPressed,
          ]}
        >
          <LiquidGlassSurface
            variant="clear"
            colorScheme="light"
            fallbackTint="systemUltraThinMaterialLight"
            intensity={58}
            washColor="transparent"
            highlight="light"
          >
            <ProjectText className="text-[18px] leading-5 tracking-[-0.36px] text-ink">
              21 июля
            </ProjectText>
          </LiquidGlassSurface>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Открыть календарь"
          className="h-12 w-12 items-center justify-center rounded-full"
          style={({ pressed }) => [
            styles.topCircle,
            !hasNativeLiquidGlass && styles.glassControlShadow,
            pressed && !hasNativeLiquidGlass && styles.glassFallbackPressed,
          ]}
        >
          <LiquidGlassSurface
            variant="clear"
            colorScheme="light"
            fallbackTint="systemUltraThinMaterialLight"
            intensity={58}
            washColor="transparent"
            highlight="light"
          >
            <View className="-scale-y-100">
              <CalendarIcon width={22} height={22} />
            </View>
          </LiquidGlassSurface>
        </Pressable>
      </GlassContainer>

      <Animated.ScrollView
        ref={weekScrollRef}
        horizontal
        accessibilityRole="adjustable"
        accessibilityLabel="Текущая неделя беременности"
        contentInsetAdjustmentBehavior="never"
        contentOffset={{
          x: (initialPeriod - 1) * WEEK_ITEM_WIDTH,
          y: 0,
        }}
        contentContainerStyle={styles.weekCarouselContent}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        snapToInterval={WEEK_ITEM_WIDTH}
        style={styles.weekCarousel}
        onMomentumScrollEnd={handleWeekScrollEnd}
        onScrollEndDrag={handleWeekScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
      >
        {periods.map((week, index) => {
          const selected = week === activeWeek;
          const weekLabel = pregnancyMode ? getWeekLabel(week) : 'день';
          const itemOffset = index * WEEK_ITEM_WIDTH;
          const inputRange = [
            itemOffset - WEEK_ITEM_WIDTH * 2,
            itemOffset - WEEK_ITEM_WIDTH,
            itemOffset,
            itemOffset + WEEK_ITEM_WIDTH,
            itemOffset + WEEK_ITEM_WIDTH * 2,
          ];
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.8, 0.867, 1, 0.867, 0.8],
            extrapolate: 'clamp',
          });
          const translateY = scrollX.interpolate({
            inputRange,
            outputRange: [-8, 21, 28, 21, -8],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={week}
              style={[
                styles.weekItem,
                { transform: [{ translateY }, { scale }] },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${week} ${weekLabel}`}
                className="h-[75px] w-[75px] items-center justify-center rounded-full"
                hitSlop={10}
                onPress={() => scrollToWeek(week)}
                style={({ pressed }) => [
                  styles.weekBubble,
                  !hasNativeLiquidGlass && styles.weekBubbleFallbackShadow,
                  pressed &&
                    !hasNativeLiquidGlass &&
                    styles.glassFallbackPressed,
                ]}
              >
                <LiquidGlassSurface
                  variant="clear"
                  colorScheme="light"
                  fallbackTint="systemUltraThinMaterialLight"
                  intensity={58}
                  washColor="transparent"
                  highlight="light"
                >
                  <View className="h-[75px] w-[75px] items-center justify-center">
                    <Text
                      className="text-[18px] leading-[19px] tracking-[-0.32px] text-white"
                      style={{ fontFamily: weekNumberFont }}
                    >
                      {week}
                    </Text>
                    <Text
                      className="-mt-0.5 text-[14px] leading-[15px] tracking-[-0.24px] text-white"
                      style={{ fontFamily: weekLabelFont }}
                    >
                      {weekLabel}
                    </Text>
                  </View>
                </LiquidGlassSurface>
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>

      <View
        pointerEvents="none"
        style={[styles.weekSelector, styles.weekBubbleSelected]}
      >
        <View className="absolute inset-0 rounded-full border-[0.8px] border-white/90 bg-white" />
      </View>

      <View pointerEvents="none" style={styles.weekTextCarousel}>
        <Animated.View
          style={[
            styles.weekTextTrack,
            {
              transform: [{ translateX: Animated.multiply(scrollX, -1) }],
            },
          ]}
        >
          {periods.map((week, index) => {
            const weekLabel = pregnancyMode ? getWeekLabel(week) : 'день';
            const itemOffset = index * WEEK_ITEM_WIDTH;
            const inputRange = [
              itemOffset - WEEK_ITEM_WIDTH * 2,
              itemOffset - WEEK_ITEM_WIDTH,
              itemOffset,
              itemOffset + WEEK_ITEM_WIDTH,
              itemOffset + WEEK_ITEM_WIDTH * 2,
            ];
            const scale = scrollX.interpolate({
              inputRange,
              outputRange: [0.8, 0.867, 1, 0.867, 0.8],
              extrapolate: 'clamp',
            });
            const translateY = scrollX.interpolate({
              inputRange,
              outputRange: [-8, 21, 28, 21, -8],
              extrapolate: 'clamp',
            });
            const selectedTextOpacity = scrollX.interpolate({
              inputRange: [
                itemOffset - WEEK_ITEM_WIDTH,
                itemOffset,
                itemOffset + WEEK_ITEM_WIDTH,
              ],
              outputRange: [0, 1, 0],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={week}
                style={[
                  styles.weekItem,
                  { transform: [{ translateY }, { scale }] },
                ]}
              >
                <View className="h-[75px] w-[75px] items-center justify-center">
                  <Animated.View
                    style={[
                      styles.weekSelectedCopy,
                      { opacity: selectedTextOpacity },
                    ]}
                  >
                    <Animated.Text
                      style={[
                        styles.weekNumber,
                        styles.weekTextSelected,
                        { fontFamily: weekNumberFont },
                      ]}
                    >
                      {week}
                    </Animated.Text>
                    <Animated.Text
                      style={[
                        styles.weekLabel,
                        styles.weekTextSelected,
                        { fontFamily: weekLabelFont },
                      ]}
                    >
                      {weekLabel}
                    </Animated.Text>
                  </Animated.View>
                </View>
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>

      <ContentShape
        pointerEvents="none"
        width={DESIGN_WIDTH}
        height={361}
        style={styles.contentShape}
      />

      <View className="absolute left-4 top-[579px] h-32 w-[386px] flex-row gap-2.5">
        <FeatureCard accent title={'Индекс внимания\nк здоровью'} />
        <FeatureCard
          title={
            pregnancyMode
              ? 'Подбор\nпитания в 1-м\nтриместре'
              : 'Наблюдение\nза циклом и\nсамочувствием'
          }
        />
        <FeatureCard title={'Важные\nобследования\nи анализы'} />
      </View>

      <View className="absolute left-4 right-4 top-[716px] h-[58px] flex-row items-end justify-between">
        <View className="w-60 gap-[3px]">
          <ProjectText className="text-[12px] leading-[14px] tracking-[-0.24px] text-[#5d5d5d]">
            Оценка заполнения журнала
          </ProjectText>
          <View className="h-5 w-60 flex-row justify-between">
            {journalBars.map((filled, index) => (
              <View
                key={index}
                className={`h-5 w-0.5 rounded-sm ${filled || journalCompleted ? 'bg-brand-success' : 'bg-[#e4e4e4]'}`}
              />
            ))}
          </View>
          <View className="w-60 flex-row justify-between">
            <ProjectText className="text-[12px] leading-[14px] tracking-[-0.24px] text-[#5d5d5d]">
              Прошлый месяц 5/7
            </ProjectText>
            <ProjectText className="text-[12px] leading-[14px] tracking-[-0.24px] text-[#5d5d5d]">
              Лучший результат 8/7
            </ProjectText>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Заполнить журнал"
          onPress={() => setJournalOpen(true)}
          className="h-12 min-w-[116px] flex-row items-center justify-center gap-0.5 rounded-full bg-brand-primary px-3.5 active:opacity-[0.72]"
        >
          <ProjectText className="text-[15px] leading-[17px] tracking-[-0.3px] text-white">
            {journalCompleted ? 'Дополнить' : 'Заполнить'}
          </ProjectText>
          <ArrowButton width={18.3} height={18.3} />
        </Pressable>
      </View>

      {journalOpen ? (
        <View className="absolute inset-0 z-50 justify-end bg-black/25 px-4 pb-[92px]">
          <View className="shadow-card rounded-[30px] bg-white p-5">
            <View className="flex-row items-center justify-between">
              <ProjectText
                className="text-[22px] leading-6 text-ink"
                weight="semibold"
              >
                Запись в дневник
              </ProjectText>
              <Pressable
                onPress={() => setJournalOpen(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-[#f2f2f7]"
              >
                <ProjectText className="text-[18px] text-ink">×</ProjectText>
              </Pressable>
            </View>
            <View className="mt-4 flex-row gap-2">
              {(['symptom', 'mood', 'energy', 'nutrition'] as const).map(
                (kind) => (
                  <Pressable
                    key={kind}
                    onPress={() => setJournalKind(kind)}
                    className={`h-9 flex-1 items-center justify-center rounded-full ${journalKind === kind ? 'bg-brand-primary' : 'bg-[#f2f2f7]'}`}
                  >
                    <ProjectText
                      className={`text-[12px] ${journalKind === kind ? 'text-white' : 'text-ink'}`}
                    >
                      {
                        {
                          symptom: 'Симптом',
                          mood: 'Настроение',
                          energy: 'Энергия',
                          nutrition: 'Питание',
                        }[kind]
                      }
                    </ProjectText>
                  </Pressable>
                ),
              )}
            </View>
            <TextInput
              value={journalText}
              onChangeText={setJournalText}
              multiline
              placeholder="Что важно отметить сегодня?"
              className="mt-3 min-h-[92px] rounded-2xl bg-[#f2f2f7] px-4 py-3 font-sf text-[16px] text-ink"
            />
            {journalError ? (
              <ProjectText className="mt-2 text-[13px] text-state-error">
                {journalError}
              </ProjectText>
            ) : null}
            {readOnly ? (
              <ProjectText className="text-text-secondary mt-2 text-[13px]">
                В web-демо сохранение отключено.
              </ProjectText>
            ) : null}
            <Pressable
              disabled={readOnly}
              onPress={() => void saveJournal()}
              className={`mt-4 h-12 items-center justify-center rounded-full ${readOnly ? 'bg-state-disabled' : 'bg-brand-primary'}`}
            >
              <ProjectText className="text-[15px] text-white">
                Сохранить локально
              </ProjectText>
            </Pressable>
            <ProjectText className="text-text-secondary mt-2 text-center text-[11px]">
              {syncStatus === 'syncing'
                ? 'Синхронизация…'
                : 'Сначала сохраняется на устройстве'}
            </ProjectText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useFonts({
    [FONT_SF_REGULAR]: require('./assets/fonts/SF-Pro-Display-Regular.otf'),
    [FONT_SF_SEMIBOLD]: require('./assets/fonts/SF-Pro-Display-Semibold.otf'),
    [FONT_YARO_RG]: require('./assets/fonts/Yaro-Rg-Regular.otf'),
  });
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const headerTop = Math.max(16, insets.top / scale + 12);

  useEffect(() => {
    if (fontError) {
      console.error('Не удалось загрузить проектные шрифты:', fontError);
    }
  }, [fontError]);

  return (
    <FontReadyContext.Provider value={fontsLoaded && !fontError}>
      <View className="flex-1 items-center justify-center bg-brand-burgundy">
        <StatusBar style="light" hidden={false} />
        <View
          style={{
            width: DESIGN_WIDTH * scale,
            height: DESIGN_HEIGHT * scale,
          }}
        >
          <View
            className="h-[874px] w-[402px]"
            style={{ transform: [{ scale }], transformOrigin: 'top left' }}
          >
            <MonitoringScreen headerTop={headerTop} />
          </View>
        </View>
      </View>
    </FontReadyContext.Provider>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute',
    left: 16,
    width: 370,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePill: {
    width: 156,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBubble: {
    width: WEEK_BUBBLE_SIZE,
    height: WEEK_BUBBLE_SIZE,
    borderRadius: WEEK_BUBBLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBubbleFallbackShadow: {
    shadowColor: '#260208',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.22,
    shadowRadius: 13,
    elevation: 8,
  },
  weekBubbleSelected: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  weekSelector: {
    position: 'absolute',
    left: (DESIGN_WIDTH - WEEK_BUBBLE_SIZE) / 2,
    top: 471,
    width: WEEK_BUBBLE_SIZE,
    height: WEEK_BUBBLE_SIZE,
    borderRadius: WEEK_BUBBLE_SIZE / 2,
  },
  weekCarousel: {
    position: 'absolute',
    left: 0,
    top: 423,
    width: DESIGN_WIDTH,
    height: 150,
  },
  weekCarouselContent: {
    paddingHorizontal: WEEK_CENTER_PADDING,
    paddingTop: 20,
    paddingBottom: 20,
  },
  weekTextCarousel: {
    position: 'absolute',
    left: 0,
    top: 423,
    width: DESIGN_WIDTH,
    height: 150,
    overflow: 'hidden',
  },
  weekTextTrack: {
    width: MAX_PREGNANCY_WEEK * WEEK_ITEM_WIDTH + WEEK_CENTER_PADDING * 2,
    height: WEEK_BUBBLE_SIZE + 40,
    paddingHorizontal: WEEK_CENTER_PADDING,
    paddingTop: 20,
    paddingBottom: 20,
    flexDirection: 'row',
  },
  weekItem: {
    width: WEEK_ITEM_WIDTH,
    height: WEEK_BUBBLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekSelectedCopy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNumber: {
    color: '#ffffff',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 18,
    lineHeight: 19,
    letterSpacing: -0.32,
  },
  weekLabel: {
    marginTop: -2,
    color: '#ffffff',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 14,
    lineHeight: 15,
    letterSpacing: -0.24,
  },
  weekTextSelected: {
    color: '#171717',
  },
  contentShape: {
    position: 'absolute',
    left: 0,
    top: 513,
  },
  nativeGlassView: {
    overflow: 'visible',
  },
  nativeGlassContent: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassFallbackPressed: {
    transform: [{ scale: 1.035 }],
  },
  glassSurface: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
  },
  glassSurfaceClipped: {
    overflow: 'hidden',
  },
  glassInnerStroke: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  glassControlShadow: {
    shadowColor: '#260208',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 9,
  },
});
