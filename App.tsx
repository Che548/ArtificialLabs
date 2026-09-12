import { AndroidMaterialBackdrop } from './design-system/android-material';
import { ThemeStatusBar, useAppTheme, useThemeStyles, type ThemeColors } from './lib/theme';
import { colors as defaultThemeColors } from './design-system/tokens';
import { TodayArticleSheet } from './components/TodayArticleSheet';
import { todayArticles, type TodayArticle } from './lib/today-articles';
import { AppSheet, sheetStyles } from './components/AppSheet';
import { TopChromeBackdrop } from './components/TopChromeBackdrop';
import { GradientBlur } from './components/GradientBlur';
import { useProfileReducedMotion } from './components/ProfileMotion';
import { bundledFonts } from './lib/bundled-fonts';
import { fontStyle } from './lib/font-style';
import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  TextProps,
  ViewStyle,
} from 'react-native';

import {
  CycleAnimatedBackground,
  type CycleBackgroundState,
} from './design-system/cycle-animated-background';
import ArrowButton from './assets/figma/arrow-button.svg';
import ArrowCard from './assets/figma/arrow-card.svg';
import CalendarIcon from './assets/figma/calendar-icon.svg';
import ContentShape from './assets/figma/content-shape.svg';
import CycleIcon from './assets/figma/journal-flow/icon-cycle.svg';
import MonitoringIcon from './assets/figma/monitoring-icon.svg';
import AndroidGraphIcon from './assets/android-icons/graph.svg';
import PlanningHeartIcon from './assets/today/planning-heart.svg';
import PlanningSymptomsIcon from './assets/today/planning-symptoms.svg';
import {
  AppText,
  CalendarPageModal,
  androidShadows,
  colors,
  HeaderDateLabel,
  HealthInsightsPage,
  getHeaderTop,
  JournalFlowModal,
  type JournalFlowCategory,
  type JournalFlowEntry,
  JournalAssessment,
  shadows,
} from './design-system';
import { FallbackGlassBackdrop } from './design-system/glass-fallback';
import {
  createCycleHistory,
  cycleDateFromKey,
  cycleDateKey,
  cycleDayInsight,
  cycleHistoryFromHealthData,
  cycleLengthVariation,
  isMenstruationJournalEntry,
  periodDateKeysFromJournal,
} from './lib/cycle-insights';
import { useHealthStore } from './lib/health-store';
import {
  carePlanProgress,
  homeDashboardForGoal,
  journalProgressForDay,
  pregnancyWeekFromStart,
} from './lib/product-insights';

const TODAY_ACCENT = '#EA4087';
const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const FONT_SF_REGULAR = 'SFProDisplay-Regular';
const FONT_SF_SEMIBOLD = 'SFProDisplay-Semibold';
const FONT_YARO_RG = 'Comfortaa-Regular';
const FontReadyContext = createContext(false);
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
const MAX_PREGNANCY_WEEK = 42;
const WEEK_ITEM_WIDTH = 84;
const WEEK_BUBBLE_SIZE = 75;
const WEEK_CENTER_PADDING = (DESIGN_WIDTH - WEEK_ITEM_WIDTH) / 2;
const weeks = Array.from(
  { length: MAX_PREGNANCY_WEEK },
  (_, index) => index + 1,
);

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
  const styles = useThemeStyles(createStyles);
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
          style={[
            StyleSheet.absoluteFillObject,
            styles.nativeGlassView,
            { borderRadius: radius },
          ]}
        >
          {children ? (
            <View pointerEvents="none" style={styles.nativeGlassContent}>
              {children}
            </View>
          ) : (
            <BlurView
              tint={fallbackTint}
              intensity={intensity}
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFillObject}
            />
          )}
        </GlassView>
      ) : (
        <>
          {Platform.OS === 'android' ? (
            <AndroidMaterialBackdrop radius={radius} tone={highlight} washColor={washColor} />
          ) : Platform.OS === 'web' ? (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  backgroundColor:
                    highlight === 'dark'
                      ? 'rgba(49,5,12,0.34)'
                      : 'rgba(255,255,255,0.58)',
                },
              ]}
            />
          ) : (
            <FallbackGlassBackdrop
              intensity={intensity}
              radius={radius}
              tint={fallbackTint}
              tone={highlight}
              washColor={washColor}
            />
          )}
          {Platform.OS === 'web' ? (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                { backgroundColor: washColor },
              ]}
            />
          ) : null}
          {children ? (
            <View pointerEvents="none" style={styles.nativeGlassContent}>
              {children}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

type LiquidGlassPressableProps = LiquidGlassSurfaceProps & {
  accessibilityLabel: string;
  controlStyle: StyleProp<ViewStyle>;
  onPress?: () => void;
  headerElevation?: boolean;
};

function LiquidGlassPressable({
  accessibilityLabel,
  children,
  controlStyle,
  onPress,
  headerElevation = false,
  variant = 'clear',
  tintColor,
  colorScheme = 'auto',
  fallbackTint = 'systemUltraThinMaterialLight',
  intensity = 58,
  washColor = 'transparent',
  highlight = 'light',
  radius = 999,
}: LiquidGlassPressableProps) {
  const styles = useThemeStyles(createStyles);
  if (hasNativeLiquidGlass) {
    return (
      <GlassView
        glassEffectStyle={variant}
        tintColor={tintColor}
        colorScheme={colorScheme}
        isInteractive
        style={[
          controlStyle,
          headerElevation && styles.headerControlShadow,
          { borderRadius: radius },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={styles.nativeGlassPressTarget}
        >
          {children}
        </Pressable>
      </GlassView>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          controlStyle,
          styles.androidMaterialControl,
          headerElevation ? androidShadows.control : undefined,
          { borderRadius: radius },
        ]}
      >
        <AndroidMaterialBackdrop radius={radius} tone={highlight} washColor={washColor} />
        <Pressable
          cssInterop={false}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => [
            styles.androidGlassPressTarget,
            pressed && styles.glassFallbackPressed,
          ]}
        >
          <View pointerEvents="none" style={styles.androidGlassControlContent}>
            {children}
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={[
        controlStyle,
        styles.fallbackGlassHost,
        headerElevation
          ? styles.headerControlShadow
          : styles.glassControlShadow,
      ]}
    >
      <FallbackGlassBackdrop
        intensity={intensity}
        radius={radius}
        tint={fallbackTint}
        tone={highlight}
        washColor={washColor}
      />
      <Pressable
        cssInterop={false}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          StyleSheet.absoluteFillObject,
          pressed && styles.glassFallbackPressed,
        ]}
      >
        <View pointerEvents="none" style={styles.androidGlassControlContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
}

function LiquidGlassGroup({
  children,
  spacing,
  style,
}: PropsWithChildren<{
  spacing: number;
  style: StyleProp<ViewStyle>;
}>) {
  return hasNativeLiquidGlass ? (
    <GlassContainer spacing={spacing} style={style}>
      {children}
    </GlassContainer>
  ) : (
    <View style={style}>{children}</View>
  );
}

type ProjectTextProps = Omit<TextProps, 'children'> & {
  children: string | number;
  weight?: 'regular' | 'semibold';
};

function ProjectText({
  children,
  style,
  weight = 'regular',
  ...props
}: ProjectTextProps) {
  const styles = useThemeStyles(createStyles);
  const fontsReady = useContext(FontReadyContext);
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
      style={[
        styles.projectText,
        style,
        fontStyle(sfFont),
        fallbackWeight ? { fontWeight: fallbackWeight } : undefined,
      ]}
    >
      {children}
    </Text>
  );
}

type FeatureCardProps = {
  title: string;
  background: TodayArticle['background'];
  onPress?: () => void;
};

function FeatureCard({ title, background, onPress }: FeatureCardProps) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={[styles.featureCard, styles.featureCardSoft]}>
      <Image
        accessible={false}
        source={background}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.04)', 'rgba(0,0,0,0.32)']}
        style={StyleSheet.absoluteFill}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title.replace(/\n/g, ' ')}
        onPress={onPress}
      >
        {({ pressed }) => (
          <View style={[styles.featureCardContent, pressed && styles.pressed]}>
            <View
              style={[
                styles.cardArrow,
                { backgroundColor: 'rgba(255,255,255,0.22)' },
              ]}
            >
              <ArrowCard width={18.3} height={18.3} />
            </View>
            <ProjectText
              numberOfLines={3}
              style={styles.featureTitle}
              weight="regular"
            >
              {title}
            </ProjectText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function ImportantMascotCard({ onPress }: { onPress?: () => void }) {
  const styles = useThemeStyles(createStyles);
  const fontsReady = useContext(FontReadyContext);

  return (
    <View style={styles.importantCard}>
      <View pointerEvents="none" style={styles.importantCardSurface} />
      <Pressable
        cssInterop={false}
        accessibilityRole="button"
        accessibilityLabel="Открыть важные пункты плана"
        onPress={onPress}
        style={({ pressed }) => [
          styles.importantCardHitArea,
          pressed && styles.pressed,
        ]}
      />
      <View pointerEvents="none" style={styles.importantMascotLayer}>
        <Image
          source={require('./assets/today/spherka-side-cutout.png')}
          resizeMode="contain"
          style={styles.importantMascot}
        />
      </View>
      <Text
        pointerEvents="none"
        numberOfLines={1}
        style={[
          styles.importantCardLabel,
          {
            ...fontStyle(
              fontsReady
                ? FONT_YARO_RG
                : Platform.OS === 'ios'
                  ? 'System'
                  : 'sans-serif',
            ),
          },
        ]}
      >
        ВАЖНО
      </Text>
    </View>
  );
}

function TodayArticleCards({
  onImportantPress,
  checkupCount,
}: {
  onImportantPress: () => void;
  checkupCount: number;
}) {
  const [article, setArticle] = useState<TodayArticle | null>(null);
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 2 }}
      >
        <ImportantMascotCard onPress={onImportantPress} />
        {todayArticles.map((item) => (
          <FeatureCard
            key={item.id}
            background={item.background}
            title={
              item.id === 'care-plan'
                ? checkupCount
                  ? `План наблюдения\nПунктов: ${checkupCount}`
                  : 'План наблюдения\nпока пуст'
                : item.cardTitle
            }
            onPress={() => setArticle(item)}
          />
        ))}
      </ScrollView>
      <TodayArticleSheet article={article} onClose={() => setArticle(null)} />
    </>
  );
}

function TodayScrollBackdrop({
  scrollY,
  headerTop,
  distance = 320,
}: {
  scrollY: Animated.Value;
  headerTop: number;
  distance?: number;
}) {
  const styles = useThemeStyles(createStyles);
  const opacity = scrollY.interpolate({
    inputRange: [0, distance * 0.1875, distance * 0.5625, distance],
    outputRange: [0, 0.38, 0.95, 1],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.todayScrollBlur, { height: headerTop + 340, opacity }]}
    >
      <GradientBlur intensity={100} strength={1} locations={[0, 0.5, 0.88, 1]} />
    </Animated.View>
  );
}

function MonitoringScreen({
  headerTop,
  onCalendarPress,
  onChartsPress,
  onJournalPress,
  onSymptomsPress,
  onNutritionPress,
  onPregnancyDatePress,
  onCheckupsPress,
}: {
  backgroundState?: CycleBackgroundState;
  headerTop: number;
  onCalendarPress: () => void;
  onChartsPress: () => void;
  onJournalPress: () => void;
  onSymptomsPress: () => void;
  onNutritionPress: () => void;
  onPregnancyDatePress: () => void;
  onCheckupsPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { carePlanItems, profile, journalEntries } = useHealthStore();
  const pregnancyWeek = pregnancyWeekFromStart(profile?.pregnancyStartAt);
  const initialWeek = pregnancyWeek ?? 1;
  const [activeWeek, setActiveWeek] = useState(initialWeek);
  const fontsReady = useContext(FontReadyContext);
  const weekScrollRef = useRef<ScrollView>(null);
  const hapticWeekRef = useRef(initialWeek);
  const scrollX = useRef(
    new Animated.Value((initialWeek - 1) * WEEK_ITEM_WIDTH),
  ).current;
  const weekNumberFont = fontsReady
    ? FONT_SF_REGULAR
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';
  const weekLabelFont = fontsReady
    ? FONT_SF_REGULAR
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';

  useEffect(() => {
    hapticWeekRef.current = initialWeek;
    setActiveWeek(initialWeek);
    scrollX.setValue((initialWeek - 1) * WEEK_ITEM_WIDTH);
    requestAnimationFrame(() => {
      weekScrollRef.current?.scrollTo({
        x: (initialWeek - 1) * WEEK_ITEM_WIDTH,
        animated: false,
      });
    });
  }, [initialWeek, scrollX]);

  const selectWeekFromOffset = (offsetX: number) => {
    const nextWeek = Math.min(
      MAX_PREGNANCY_WEEK,
      Math.max(1, Math.round(offsetX / WEEK_ITEM_WIDTH) + 1),
    );

    hapticWeekRef.current = nextWeek;
    setActiveWeek(nextWeek);
  };

  const handleWeekScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const centeredWeek = Math.min(
      MAX_PREGNANCY_WEEK,
      Math.max(
        1,
        Math.round(event.nativeEvent.contentOffset.x / WEEK_ITEM_WIDTH) + 1,
      ),
    );

    if (centeredWeek === hapticWeekRef.current) {
      return;
    }

    hapticWeekRef.current = centeredWeek;
    setActiveWeek(centeredWeek);

    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
  };

  const handleWeekScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    selectWeekFromOffset(event.nativeEvent.contentOffset.x);
  };

  const scrollToWeek = (week: number) => {
    weekScrollRef.current?.scrollTo({
      x: (week - 1) * WEEK_ITEM_WIDTH,
      animated: true,
    });
  };

  const journalProgress = journalProgressForDay(journalEntries);
  const checkupProgress = carePlanProgress(carePlanItems);

  return (
    <View style={styles.canvas}>
      <Image
        source={require('./assets/figma/today_pregnancy_background.png')}
        resizeMode="cover"
        style={[styles.heroImage, { opacity: colors.surface.canvas === defaultThemeColors.surface.canvas ? 1 : 0.22 }]}
      />

      <TopChromeBackdrop headerTop={headerTop} />

      <LiquidGlassGroup
        spacing={12}
        style={[styles.topBar, { top: headerTop }]}
      >
        <LiquidGlassPressable
          accessibilityLabel="Открыть мониторинг"
          controlStyle={styles.topCircle}
          headerElevation
          onPress={onChartsPress}
          tintColor={
            hasNativeLiquidGlass ? undefined : colors.surface.headerGlassWash
          }
          washColor={colors.surface.headerGlassWash}
        >
          {Platform.OS === 'android' ? (
            <AndroidGraphIcon width={24} height={24} />
          ) : (
            <View style={styles.headerIconOrientation}>
              <MonitoringIcon width={22} height={22} color="#EA4087" />
            </View>
          )}
        </LiquidGlassPressable>

        <LiquidGlassPressable
          accessibilityLabel="Выбрать дату"
          controlStyle={styles.datePill}
          headerElevation
          onPress={onCalendarPress}
          tintColor={
            hasNativeLiquidGlass ? undefined : colors.surface.headerGlassWash
          }
          washColor={colors.surface.headerGlassWash}
        >
          <HeaderDateLabel />
        </LiquidGlassPressable>

        <LiquidGlassPressable
          accessibilityLabel={
            profile?.goal === 'pregnancy'
              ? 'Отметить симптомы за сегодня'
              : 'Открыть календарь'
          }
          controlStyle={styles.topCircle}
          headerElevation
          onPress={
            profile?.goal === 'pregnancy' ? onSymptomsPress : onCalendarPress
          }
          tintColor={
            hasNativeLiquidGlass ? undefined : colors.surface.headerGlassWash
          }
          washColor={colors.surface.headerGlassWash}
        >
          <View style={styles.headerIconOrientation}>
            {profile?.goal === 'pregnancy' ? (
              <Svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                accessible={false}
              >
                <Path
                  d="M12 4v16M4 12h16"
                  stroke="#EA4087"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            ) : (
              <CalendarIcon width={22} height={22} color="#EA4087" />
            )}
          </View>
        </LiquidGlassPressable>
      </LiquidGlassGroup>

      <ScrollView
        contentInsetAdjustmentBehavior="never"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        style={styles.dashboardScroll}
        contentContainerStyle={styles.dashboardScrollContent}
      >
        <View style={styles.dashboardScrollCanvas}>
          {pregnancyWeek ? (
            <>
              <Animated.ScrollView
                ref={weekScrollRef}
                horizontal
                nestedScrollEnabled
                accessibilityRole="adjustable"
                accessibilityLabel="Текущая неделя беременности"
                contentInsetAdjustmentBehavior="never"
                contentOffset={{
                  x: (initialWeek - 1) * WEEK_ITEM_WIDTH,
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
                  {
                    useNativeDriver: true,
                    listener: handleWeekScroll,
                  },
                )}
                scrollEventThrottle={16}
              >
                {weeks.map((week, index) => {
                  const selected = week === activeWeek;
                  const weekLabel = getWeekLabel(week);
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
                      <LiquidGlassPressable
                        accessibilityLabel={`${week} ${weekLabel}`}
                        controlStyle={styles.weekBubble}
                        onPress={() => scrollToWeek(week)}
                        washColor="transparent"
                      >
                        <View style={styles.weekCopy}>
                          <Text
                            style={[
                              styles.weekNumber,
                              { ...fontStyle(weekNumberFont) },
                            ]}
                          >
                            {week}
                          </Text>
                          <Text
                            style={[
                              styles.weekLabel,
                              { ...fontStyle(weekLabelFont) },
                            ]}
                          >
                            {weekLabel}
                          </Text>
                        </View>
                      </LiquidGlassPressable>
                    </Animated.View>
                  );
                })}
              </Animated.ScrollView>

              <View
                pointerEvents="none"
                style={[styles.weekSelector, styles.weekBubbleSelected]}
              >
                <View style={styles.selectedWeekFill} />
              </View>

              <View pointerEvents="none" style={styles.weekTextCarousel}>
                <Animated.View
                  style={[
                    styles.weekTextTrack,
                    {
                      transform: [
                        { translateX: Animated.multiply(scrollX, -1) },
                      ],
                    },
                  ]}
                >
                  {weeks.map((week, index) => {
                    const weekLabel = getWeekLabel(week);
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
                        <View style={styles.weekCopy}>
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
                                { ...fontStyle(weekNumberFont) },
                              ]}
                            >
                              {week}
                            </Animated.Text>
                            <Animated.Text
                              style={[
                                styles.weekLabel,
                                styles.weekTextSelected,
                                { ...fontStyle(weekLabelFont) },
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
            </>
          ) : (
            <Pressable
              cssInterop={false}
              accessibilityRole="button"
              accessibilityLabel="Добавить дату беременности в профиль"
              onPress={onPregnancyDatePress}
              style={({ pressed }) => [
                styles.pregnancyDateMissing,
                pressed && styles.pressed,
              ]}
            >
              <ProjectText
                style={styles.pregnancyDateMissingTitle}
                weight="semibold"
              >
                Срок беременности не рассчитан
              </ProjectText>
              <ProjectText style={styles.pregnancyDateMissingBody}>
                Добавьте дату в профиле
              </ProjectText>
              <View style={styles.pregnancyDateMissingArrow}>
                <ArrowCard width={18.3} height={18.3} />
              </View>
            </Pressable>
          )}

          <View pointerEvents="none" style={styles.contentSurfaceExtension} />

          <ContentShape
            color={colors.surface.raised}
            pointerEvents="none"
            width={DESIGN_WIDTH}
            height={361}
            style={styles.contentShape}
          />

          <View style={styles.journalArea}>
            <JournalAssessment
              variant="ring"
              value={journalProgress.completed}
              total={journalProgress.total}
              status={journalProgress.status}
              actionLabel={
                journalProgress.completed === journalProgress.total
                  ? 'Готово'
                  : journalProgress.completed
                    ? 'Дополнить'
                    : 'Заполнить'
              }
              actionVariant="outline"
              onPress={onJournalPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View style={styles.checkupsArea}>
            <JournalAssessment
              variant="fraction"
              value={checkupProgress.completed}
              total={checkupProgress.total}
              title="Прохождение чекапов"
              status={checkupProgress.status}
              leftCaption={`Пройдено ${checkupProgress.completed}`}
              rightCaption={`Всего ${checkupProgress.total}`}
              actionLabel={
                checkupProgress.total > 0 &&
                checkupProgress.completed === checkupProgress.total
                  ? 'Готово'
                  : 'Открыть'
              }
              actionVariant="outline"
              onPress={onCheckupsPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View pointerEvents="none" style={styles.metricsDivider} />

          <View style={styles.cardsRow}>
            <TodayArticleCards
              onImportantPress={onCheckupsPress}
              checkupCount={checkupProgress.total}
            />
          </View>
        </View>
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0)',
          `${colors.surface.raised}ff`,
        ]}
        locations={[0, 0.62, 1]}
        style={styles.navbarFadeGradient}
      />
    </View>
  );
}

type PlanningQuickActionProps = {
  glyph: ReactNode;
  label: string;
  primary?: boolean;
  onPress: () => void;
};

export function PlanningQuickAction({
  glyph,
  label,
  onPress,
  primary = false,
}: PlanningQuickActionProps) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const content = <View style={styles.planningActionIcon}>{glyph}</View>;

  return (
    <View style={styles.planningActionItem}>
      {Platform.OS === 'android' ? (
        <Pressable
          cssInterop={false}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={({ pressed }) => [
            styles.planningActionCircle,
            styles.planningAndroidAction,
            primary && styles.planningAndroidActionPrimary,
            pressed && styles.glassFallbackPressed,
          ]}
        >
          {content}
        </Pressable>
      ) : (
        <LiquidGlassPressable
          accessibilityLabel={label}
          controlStyle={styles.planningActionCircle}
          onPress={onPress}
          tintColor={primary ? TODAY_ACCENT : colors.surface.headerGlassWash}
          washColor={primary ? `${TODAY_ACCENT}F0` : colors.surface.glassWash}
          intensity={72}
        >
          {primary ? (
            <View
              pointerEvents="none"
              style={styles.planningActionPrimaryFill}
            />
          ) : null}
          {content}
        </LiquidGlassPressable>
      )}
      <ProjectText
        accessible={false}
        importantForAccessibility="no"
        numberOfLines={2}
        style={styles.planningActionLabel}
        weight="semibold"
      >
        {label}
      </ProjectText>
    </View>
  );
}

type PlanningIntimacyOption = {
  group: 'contact' | 'desire';
  id: string;
  label: string;
};

const planningIntimacyOptions: PlanningIntimacyOption[] = [
  { id: 'none', group: 'contact', label: 'Близости не было' },
  { id: 'protected', group: 'contact', label: 'С защитой' },
  { id: 'unprotected', group: 'contact', label: 'Без защиты' },
  { id: 'withdrawal', group: 'contact', label: 'Прерванный акт' },
  { id: 'touch', group: 'contact', label: 'Прикосновения' },
  { id: 'high', group: 'desire', label: 'Высокое желание' },
  { id: 'medium', group: 'desire', label: 'Среднее желание' },
  { id: 'low', group: 'desire', label: 'Низкое желание' },
];

function PlanningIntimacyModal({
  onClose,
  onSave,
  visible,
}: {
  onClose: () => void;
  onSave: (labels: string[]) => void | Promise<void>;
  visible: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<{
    contact?: string;
    desire?: string;
  }>({});
  const selectedLabels = planningIntimacyOptions
    .filter((option) => selection[option.group] === option.id)
    .map((option) => option.label);

  const close = () => {
    setSelection({});
    onClose();
  };

  return (
    <AppSheet
      visible={visible}
      title="Близость"
      onClose={close}
      footer={
        <View style={styles.planningModalActions}>
          <View style={styles.planningModalActionSlot}>
            <View style={styles.planningModalCancel}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Отменить"
                onPress={close}
                style={StyleSheet.absoluteFillObject}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.planningModalActionContent,
                      pressed && styles.planningActionPressed,
                    ]}
                  >
                    <AppText
                      role="label"
                      weight="medium"
                      color={colors.text.secondary}
                    >
                      Отмена
                    </AppText>
                  </View>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.planningModalActionSlot}>
            <View
              style={[
                styles.planningModalSave,
                selectedLabels.length === 0 && styles.planningModalSaveDisabled,
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Сохранить отметки"
                accessibilityState={{ disabled: selectedLabels.length === 0 }}
                disabled={selectedLabels.length === 0}
                onPress={() => {
                  void onSave(selectedLabels);
                  close();
                }}
                style={StyleSheet.absoluteFillObject}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.planningModalActionContent,
                      pressed &&
                        selectedLabels.length > 0 &&
                        styles.planningActionPressed,
                    ]}
                  >
                    <AppText role="label" weight="semibold" color="#FFFFFF">
                      Сохранить
                    </AppText>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      }
    >
      <View style={styles.planningModalContent}>
        {(
          [
            {
              group: 'contact' as const,
              title: 'Близость',
              caption: 'Выберите один вариант',
            },
            {
              group: 'desire' as const,
              title: 'Желание',
              caption: 'Необязательно',
            },
          ] as const
        ).map((section) => (
          <View key={section.group} style={styles.planningOptionSection}>
            <View style={styles.planningOptionSectionHeader}>
              <AppText role="label" weight="semibold">
                {section.title}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {section.caption}
              </AppText>
            </View>

            <View style={styles.planningOptionList}>
              {planningIntimacyOptions
                .filter((option) => option.group === section.group)
                .map((option, index) => {
                  const selected = selection[option.group] === option.id;
                  return (
                    <View
                      key={option.id}
                      style={[
                        styles.planningOption,
                        index > 0 && styles.planningOptionDivider,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={option.label}
                        onPress={() =>
                          setSelection((current) => ({
                            ...current,
                            [option.group]:
                              current[option.group] === option.id
                                ? undefined
                                : option.id,
                          }))
                        }
                      >
                        {({ pressed }) => (
                          <View
                            style={[
                              styles.planningOptionContent,
                              pressed && styles.planningActionPressed,
                            ]}
                          >
                            <AppText
                              role="label"
                              weight="regular"
                              style={styles.planningOptionLabel}
                            >
                              {option.label}
                            </AppText>

                            <View style={styles.planningOptionSelection}>
                              {selected ? (
                                <View style={styles.planningOptionCheck} />
                              ) : null}
                            </View>
                          </View>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
            </View>
          </View>
        ))}
      </View>
    </AppSheet>
  );
}

function formatPlanningDateRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  const startLabel =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear()
      ? start.getDate()
      : formatter.format(start);
  return `${startLabel}–${formatter.format(end)}`;
}

function PlanningMonitoringScreen({
  backgroundState,
  headerTop,
  onCalendarPress,
  onChartsPress,
  onIntimacyPress,
  onNutritionPress,
  onSymptomsPress,
  onCheckupsPress,
}: {
  backgroundState?: CycleBackgroundState;
  headerTop: number;
  onCalendarPress: () => void;
  onChartsPress: () => void;
  onIntimacyPress: () => void;
  onNutritionPress: () => void;
  onSymptomsPress: () => void;
  onCheckupsPress: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { carePlanItems, journalEntries, profile } = useHealthStore();
  const scrollY = useRef(new Animated.Value(0)).current;
  const reducedMotion = useProfileReducedMotion();
  const forecastTranslateY = scrollY.interpolate({
    inputRange: [0, 360],
    outputRange: [0, -54],
    extrapolate: 'clamp',
  });
  const today = new Date();
  const cycleHistory = cycleHistoryFromHealthData(profile, journalEntries);
  const cycleInsight = cycleHistory
    ? cycleDayInsight(today, cycleHistory, today)
    : undefined;
  const forecastAvailable = Boolean(cycleInsight && !cycleInsight.delayDays);
  const planningMode = profile?.goal === 'planning';
  const daysUntilPeriod =
    cycleInsight && cycleHistory
      ? Math.max(0, cycleHistory.cycleLengthDays - cycleInsight.cycleDay + 1)
      : undefined;
  const probabilityLabel = cycleInsight
    ? cycleInsight.probability === 'high'
      ? 'Высокая'
      : cycleInsight.probability === 'medium'
        ? 'Средняя'
        : 'Низкая'
    : undefined;
  const fertileStart = cycleInsight
    ? new Date(cycleInsight.fertileStartAt)
    : undefined;
  const fertileEnd = cycleInsight
    ? new Date(cycleInsight.fertileEndAt)
    : undefined;
  const daysUntilOvulation = cycleInsight
    ? Math.max(
        0,
        Math.round(
          (new Date(cycleInsight.nextOvulationAt).setHours(0, 0, 0, 0) -
            new Date(today).setHours(0, 0, 0, 0)) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : undefined;
  const journalProgress = journalProgressForDay(journalEntries);
  const checkupProgress = carePlanProgress(carePlanItems);
  const latestPeriodRun = cycleHistory?.periodRuns.at(-1);
  const latestObservedCycleLength = cycleHistory?.observedCycleLengths.at(-1);
  const displayedCycleLength =
    latestObservedCycleLength ?? profile?.cycleLengthDays;
  const cycleVariation = cycleHistory
    ? cycleLengthVariation(cycleHistory)
    : undefined;

  return (
    <View style={styles.planningCanvas}>
      <CycleAnimatedBackground
        scrollY={scrollY}
        state={
          backgroundState ??
          (cycleInsight?.kind === 'menstruation'
            ? 'menstruation'
            : planningMode && cycleInsight?.kind === 'ovulation'
              ? 'ovulation'
              : 'neutral')
        }
      />
      <LiquidGlassGroup
        spacing={12}
        style={[styles.topBar, { top: headerTop }]}
      >
        <LiquidGlassPressable
          accessibilityLabel="Открыть мониторинг"
          controlStyle={styles.topCircle}
          headerElevation
          onPress={onChartsPress}
          tintColor={
            hasNativeLiquidGlass ? undefined : colors.surface.headerGlassWash
          }
          washColor={colors.surface.headerGlassWash}
        >
          <View style={styles.headerIconOrientation}>
            <MonitoringIcon width={22} height={22} color={TODAY_ACCENT} />
          </View>
        </LiquidGlassPressable>
        <LiquidGlassPressable
          accessibilityLabel="Выбрать дату"
          controlStyle={styles.datePill}
          headerElevation
          onPress={onCalendarPress}
          tintColor={
            hasNativeLiquidGlass ? undefined : colors.surface.headerGlassWash
          }
          washColor={colors.surface.headerGlassWash}
        >
          <HeaderDateLabel dateColor={TODAY_ACCENT} />
        </LiquidGlassPressable>
        <LiquidGlassPressable
          accessibilityLabel="Открыть календарь"
          controlStyle={styles.topCircle}
          headerElevation
          onPress={onCalendarPress}
          tintColor={
            hasNativeLiquidGlass ? undefined : colors.surface.headerGlassWash
          }
          washColor={colors.surface.headerGlassWash}
        >
          <View style={styles.headerIconOrientation}>
            <CalendarIcon width={22} height={22} color={TODAY_ACCENT} />
          </View>
        </LiquidGlassPressable>
      </LiquidGlassGroup>

      <Animated.View
        style={[
          styles.planningForecast,
          !reducedMotion && { transform: [{ translateY: forecastTranslateY }] },
        ]}
      >
        <ProjectText style={styles.planningCycleDay} weight="semibold">
          {cycleInsight
            ? `${cycleInsight.cycleDay}-й день цикла`
            : 'Цикл пока не настроен'}
        </ProjectText>
        <AppText style={styles.planningProbability} weight={planningMode ? "medium" : "bold"}>
          {planningMode
            ? probabilityLabel
              ? `${probabilityLabel} вероятность`
              : 'Вероятность не рассчитана'
            : cycleInsight?.delayDays
              ? `Задержка ${cycleInsight.delayDays} дн.`
              : daysUntilPeriod !== undefined
                ? `Через ${daysUntilPeriod} дн.`
                : 'Добавьте дату месячных'}
        </AppText>
        <ProjectText style={styles.planningProbabilityCaption}>
          {planningMode
            ? 'забеременеть'
            : cycleInsight?.delayDays
              ? 'от ожидаемой даты'
              : daysUntilPeriod !== undefined
                ? 'ожидаются месячные'
                : 'в календаре'}
        </ProjectText>
      </Animated.View>

      <TodayScrollBackdrop scrollY={scrollY} headerTop={headerTop} />

      <Animated.ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        style={styles.planningLowerScroll}
        contentContainerStyle={styles.planningLowerScrollContent}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
      >
        <View style={styles.planningLowerCanvas}>
          <ContentShape
            color={colors.surface.raised}
            pointerEvents="none"
            width={DESIGN_WIDTH}
            height={361}
            style={styles.planningContentShape}
          />
          <View pointerEvents="none" style={styles.planningContentExtension} />

          <View style={styles.planningActions}>
            <PlanningQuickAction
              glyph={
                <View style={styles.planningCycleIconOrientation}>
                  <CycleIcon width={28} height={28} color="#FFFFFF" />
                </View>
              }
              label="Месячные"
              onPress={onCalendarPress}
              primary
            />
            <PlanningQuickAction
              glyph={
                <PlanningSymptomsIcon
                  width={28}
                  height={28}
                  color={TODAY_ACCENT}
                />
              }
              label="Симптомы"
              onPress={onSymptomsPress}
            />
            <PlanningQuickAction
              glyph={
                <PlanningHeartIcon
                  width={28}
                  height={28}
                  color={TODAY_ACCENT}
                />
              }
              label="Близость"
              onPress={onIntimacyPress}
            />
          </View>

          <View
            pointerEvents="none"
            style={[
              styles.planningMetricsDivider,
              styles.planningMetricsTopDivider,
            ]}
          />

          <View style={styles.planningJournalArea}>
            <JournalAssessment
              variant="ring"
              value={journalProgress.completed}
              total={journalProgress.total}
              status={journalProgress.status}
              actionLabel={
                journalProgress.completed === journalProgress.total
                  ? 'Готово'
                  : journalProgress.completed
                    ? 'Дополнить'
                    : 'Заполнить'
              }
              actionVariant="outline"
              actionColor={TODAY_ACCENT}
              onPress={onSymptomsPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View style={styles.planningCheckupsArea}>
            <JournalAssessment
              variant="fraction"
              value={checkupProgress.completed}
              total={checkupProgress.total}
              title="Прохождение чекапов"
              status={checkupProgress.status}
              leftCaption={`Пройдено ${checkupProgress.completed}`}
              rightCaption={`Всего ${checkupProgress.total}`}
              actionLabel={
                checkupProgress.total > 0 &&
                checkupProgress.completed === checkupProgress.total
                  ? 'Готово'
                  : 'Открыть'
              }
              actionVariant="outline"
              actionColor={TODAY_ACCENT}
              onPress={onCheckupsPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View pointerEvents="none" style={styles.planningMetricsDivider} />

          <View style={styles.planningCardsRow}>
            <TodayArticleCards
              onImportantPress={onCheckupsPress}
              checkupCount={checkupProgress.total}
            />
          </View>

          <View pointerEvents="none" style={styles.planningCyclesDivider} />

          <View style={styles.planningCyclesContent}>
            <ProjectText style={styles.planningCyclesTitle} weight="semibold">
              Мои циклы
            </ProjectText>

            <View style={styles.planningCyclesStatsCard}>
              {[
                {
                  label: 'Лучшие дни',
                  planningOnly: true,
                  value:
                    forecastAvailable && fertileStart && fertileEnd
                      ? formatPlanningDateRange(fertileStart, fertileEnd)
                      : cycleInsight?.delayDays
                        ? 'Отметьте новые месячные в календаре'
                        : 'Добавьте дату последних месячных',
                  missing: !forecastAvailable,
                },
                {
                  label: 'Овуляция ожидается',
                  planningOnly: true,
                  value:
                    forecastAvailable && daysUntilOvulation !== undefined
                      ? daysUntilOvulation === 0
                        ? 'Сегодня'
                        : `Через ${daysUntilOvulation} дн.`
                      : cycleInsight?.delayDays
                        ? `Ожидаемая дата месячных прошла ${cycleInsight.delayDays} дн. назад`
                        : 'После добавления даты месячных',
                  missing: !forecastAvailable,
                },
                {
                  label: 'Предыдущий цикл',
                  value: displayedCycleLength
                    ? `${displayedCycleLength} дней`
                    : 'Пока нет данных',
                  source: latestObservedCycleLength
                    ? 'Из дневника'
                    : displayedCycleLength
                      ? 'Из профиля'
                      : undefined,
                  missing: !displayedCycleLength,
                },
                {
                  label: 'Предыдущие месячные',
                  value: latestPeriodRun
                    ? `${latestPeriodRun.lengthDays} дн.`
                    : 'Пока нет данных',
                  source: latestPeriodRun ? 'Из дневника' : undefined,
                  missing: !latestPeriodRun,
                },
                {
                  label: 'Колебания длины цикла',
                  value:
                    cycleVariation === undefined
                      ? 'Нужно больше данных'
                      : `${cycleVariation} дн.`,
                  source:
                    cycleVariation === undefined ? undefined : 'Из дневника',
                  missing: cycleVariation === undefined,
                },
              ]
                .filter((metric) => !metric.planningOnly || planningMode)
                .map((metric, index) => (
                  <View key={metric.label}>
                    {index > 0 ? (
                      <View style={styles.planningCyclesRowDivider} />
                    ) : null}
                    <View style={styles.planningCyclesRow}>
                      <View style={styles.planningCyclesMetricCopy}>
                        <ProjectText style={styles.planningCyclesMetricLabel}>
                          {metric.label}
                        </ProjectText>
                        <ProjectText
                          weight="regular"
                          style={[
                            styles.planningCyclesMetricValue,
                            metric.missing && styles.planningCyclesMissing,
                          ]}
                        >
                          {metric.value}
                        </ProjectText>
                      </View>
                      {metric.source ? (
                        <ProjectText style={styles.planningCyclesSource}>
                          {metric.source}
                        </ProjectText>
                      ) : null}
                    </View>
                  </View>
                ))}
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

export function PlanningTodayScreenCatalogPreview({
  backgroundState,
}: { backgroundState?: CycleBackgroundState } = {}) {
  const insets = useSafeAreaInsets();
  const { addJournalEntry } = useHealthStore();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [symptomsDate, setSymptomsDate] = useState<Date | null>(null);
  const [intimacyVisible, setIntimacyVisible] = useState(false);
  const headerTop = getHeaderTop(insets.top, 1) + 1;

  const saveJournalEntries = async (entries: JournalFlowEntry[]) => {
    const targetDate = symptomsDate ?? new Date();
    const occurredAt = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      12,
    ).getTime();

    for (const entry of entries) {
      await addJournalEntry({ occurredAt, ...entry });
    }
  };

  return (
    <FontReadyContext.Provider value>
      <PlanningMonitoringScreen
        backgroundState={backgroundState}
        headerTop={headerTop}
        onCalendarPress={() => setCalendarVisible(true)}
        onChartsPress={() => undefined}
        onIntimacyPress={() => setIntimacyVisible(true)}
        onNutritionPress={() => setSymptomsDate(new Date())}
        onSymptomsPress={() => setSymptomsDate(new Date())}
        onCheckupsPress={() => undefined}
      />
      <CalendarPageModal
        visible={calendarVisible}
        onClose={() => setCalendarVisible(false)}
        onAddSymptoms={(date) => {
          setCalendarVisible(false);
          setSymptomsDate(date);
        }}
      />
      <JournalFlowModal
        visible={symptomsDate !== null}
        targetDate={symptomsDate ?? new Date()}
        initialCategory="cycle"
        onClose={() => setSymptomsDate(null)}
        onComplete={async (entries) => {
          await saveJournalEntries(entries);
          setSymptomsDate(null);
        }}
      />
      <PlanningIntimacyModal
        visible={intimacyVisible}
        onClose={() => setIntimacyVisible(false)}
        onSave={async (labels) => {
          await addJournalEntry({
            occurredAt: Date.now(),
            kind: 'activity',
            label: 'Близость и желание',
            textValue: labels.join(', '),
          });
        }}
      />
    </FontReadyContext.Provider>
  );
}

export default function App() {
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const {
    addJournalEntry,
    deleteRecord,
    journalEntries,
    labResults,
    profile,
    scanResults,
    updateProfile,
  } = useHealthStore();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [chartsVisible, setChartsVisible] = useState(false);
  const [planningIntimacyVisible, setPlanningIntimacyVisible] = useState(false);
  const [journalFlowDate, setJournalFlowDate] = useState<Date | null>(null);
  const [journalFlowCategory, setJournalFlowCategory] =
    useState<JournalFlowCategory>('cycle');
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === 'web' ? bundledFonts : {},
  );
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const headerTop = getHeaderTop(insets.top, scale) + 1;
  const symptomDateKeys = useMemo(
    () =>
      new Set(
        journalEntries
          .filter(
            (entry) =>
              !entry.deletedAt &&
              ['symptom', 'mood', 'energy', 'nutrition', 'activity'].includes(
                entry.kind,
              ),
          )
          .map((entry) => {
            const date = new Date(entry.occurredAt);
            return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          }),
      ),
    [journalEntries],
  );
  const savedPeriodDateKeys = useMemo(
    () => periodDateKeysFromJournal(journalEntries),
    [journalEntries],
  );

  const savePeriodDateKeys = async (nextDateKeys: ReadonlySet<string>) => {
    const menstruationEntries = journalEntries.filter(
      isMenstruationJournalEntry,
    );
    const currentDateKeys = new Set(
      menstruationEntries.map((entry) => cycleDateKey(entry.occurredAt)),
    );

    for (const entry of menstruationEntries) {
      if (!nextDateKeys.has(cycleDateKey(entry.occurredAt))) {
        await deleteRecord('journalEntries', entry);
      }
    }

    for (const key of nextDateKeys) {
      if (currentDateKeys.has(key)) continue;
      const date = cycleDateFromKey(key);
      if (!date) continue;
      await addJournalEntry({
        occurredAt: date.getTime(),
        kind: 'cycle',
        label: 'Менструация',
        textValue: 'Отмечено в календаре',
      });
    }

    const recordedHistory = createCycleHistory({
      cycleLengthDays: profile?.cycleLengthDays,
      periodDateKeys: nextDateKeys,
    });
    const observedLengths = recordedHistory?.observedCycleLengths ?? [];
    const latestRecordedPeriodStartAt =
      recordedHistory?.periodRuns.at(-1)?.startAt;
    const observedCycleLength = observedLengths.length
      ? Math.round(
          observedLengths.reduce((sum, length) => sum + length, 0) /
            observedLengths.length,
        )
      : undefined;
    if (latestRecordedPeriodStartAt || observedCycleLength) {
      await updateProfile({
        ...(latestRecordedPeriodStartAt
          ? { lastPeriodStartAt: latestRecordedPeriodStartAt }
          : undefined),
        ...(observedCycleLength
          ? { cycleLengthDays: observedCycleLength }
          : undefined),
      });
    }
  };

  const openJournalFlow = (
    date: Date,
    category: JournalFlowCategory = 'cycle',
  ) => {
    setJournalFlowCategory(category);
    setJournalFlowDate(new Date(date));
  };

  const saveJournalFlow = async (entries: JournalFlowEntry[]) => {
    if (!journalFlowDate) return;
    const occurredAt = new Date(
      journalFlowDate.getFullYear(),
      journalFlowDate.getMonth(),
      journalFlowDate.getDate(),
      12,
    ).getTime();

    for (const entry of entries) {
      await addJournalEntry({ occurredAt, ...entry });
    }
  };

  useEffect(() => {
    if (fontError) {
      console.error('Не удалось загрузить проектные шрифты:', fontError);
    }
  }, [fontError]);

  return (
    <FontReadyContext.Provider value={fontsLoaded && !fontError}>
      <View
        style={[styles.root, Platform.OS === 'android' && styles.androidRoot]}
      >
        <ThemeStatusBar hidden={false} />
        <View
          style={{
            width: DESIGN_WIDTH * scale,
            height: DESIGN_HEIGHT * scale,
          }}
        >
          <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
            {homeDashboardForGoal(profile?.goal) === 'cycle' ? (
              <PlanningMonitoringScreen
                headerTop={headerTop}
                onCalendarPress={() => setCalendarVisible(true)}
                onChartsPress={() => setChartsVisible(true)}
                onIntimacyPress={() => setPlanningIntimacyVisible(true)}
                onNutritionPress={() =>
                  openJournalFlow(new Date(), 'nutrition')
                }
                onSymptomsPress={() => openJournalFlow(new Date(), 'cycle')}
                onCheckupsPress={() => router.push('/analyses')}
              />
            ) : (
              <MonitoringScreen
                headerTop={headerTop}
                onCalendarPress={() => setCalendarVisible(true)}
                onChartsPress={() => setChartsVisible(true)}
                onJournalPress={() => openJournalFlow(new Date(), 'cycle')}
                onSymptomsPress={() => openJournalFlow(new Date(), 'cycle')}
                onNutritionPress={() =>
                  openJournalFlow(new Date(), 'nutrition')
                }
                onPregnancyDatePress={() =>
                  router.push({
                    pathname: '/profile',
                    params: { panel: 'personal' },
                  })
                }
                onCheckupsPress={() => router.push('/analyses')}
              />
            )}
          </View>
        </View>
        <CalendarPageModal
          visible={calendarVisible}
          onClose={() => setCalendarVisible(false)}
          onAddSymptoms={(date) => openJournalFlow(date, 'cycle')}
          symptomDateKeys={symptomDateKeys}
          allowPeriodMarking={profile?.goal !== 'pregnancy'}
          cycleLengthDays={profile?.cycleLengthDays}
          lastPeriodStartAt={profile?.lastPeriodStartAt}
          periodDateKeys={savedPeriodDateKeys}
          onSavePeriodDateKeys={savePeriodDateKeys}
          pregnancyMode={profile?.goal === 'pregnancy'}
          highlightFertility={profile?.goal === 'planning'}
        />
        <JournalFlowModal
          visible={journalFlowDate !== null}
          targetDate={journalFlowDate ?? new Date()}
          initialCategory={journalFlowCategory}
          onClose={() => setJournalFlowDate(null)}
          onComplete={saveJournalFlow}
        />
        <PlanningIntimacyModal
          visible={planningIntimacyVisible}
          onClose={() => setPlanningIntimacyVisible(false)}
          onSave={async (labels) => {
            await addJournalEntry({
              occurredAt: Date.now(),
              kind: 'activity',
              label: 'Близость и желание',
              textValue: labels.join(', '),
            });
          }}
        />
        <HealthInsightsPage
          visible={chartsVisible}
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
    </FontReadyContext.Provider>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.warm,
  },
  androidRoot: {
    justifyContent: 'flex-start',
  },
  scaledCanvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    transformOrigin: 'top left',
  },
  canvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
    backgroundColor: colors.surface.warm,
    borderRadius: Platform.OS === 'android' ? 0 : 40,
  },
  heroImage: {
    position: 'absolute',
    left: 0,
    top: 48,
    width: DESIGN_WIDTH,
    height: 714,
  },
  topBar: {
    position: 'absolute',
    zIndex: 10,
    left: 16,
    width: 370,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerFadeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 132,
    zIndex: 9,
  },
  navbarFadeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    zIndex: 8,
  },
  topCircle: {
    width: 48,
    minWidth: 48,
    flexBasis: 48,
    flexShrink: 0,
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
  headerIconOrientation: {
    transform: [{ scaleY: -1 }],
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 13,
    elevation: 8,
  },
  weekBubbleSelected: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  weekSelector: {
    position: 'absolute',
    left: (DESIGN_WIDTH - WEEK_BUBBLE_SIZE) / 2,
    top: 48,
    width: WEEK_BUBBLE_SIZE,
    height: WEEK_BUBBLE_SIZE,
    borderRadius: WEEK_BUBBLE_SIZE / 2,
  },
  weekCarousel: {
    position: 'absolute',
    left: 0,
    top: 0,
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
    top: 0,
    width: DESIGN_WIDTH,
    height: 150,
    overflow: 'hidden',
  },
  weekTextTrack: {
    width: weeks.length * WEEK_ITEM_WIDTH + WEEK_CENTER_PADDING * 2,
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
  weekCopy: {
    width: WEEK_BUBBLE_SIZE,
    height: WEEK_BUBBLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekSelectedCopy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedWeekFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: colors.surface.raised,
    borderWidth: 0.8,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(255,255,255,0.92)',
  },
  weekNumber: {
    color: '#F2A8CB',
    ...fontStyle(FONT_SF_REGULAR),
    fontSize: 18,
    lineHeight: 19,
    letterSpacing: -0.32,
  },
  weekLabel: {
    marginTop: -2,
    color: '#F2A8CB',
    ...fontStyle(FONT_SF_REGULAR),
    fontSize: 14,
    lineHeight: 15,
    letterSpacing: -0.24,
  },
  weekTextSelected: {
    color: '#EA4087',
  },
  pregnancyDateMissing: {
    position: 'absolute',
    zIndex: 3,
    left: 32,
    top: 28,
    width: DESIGN_WIDTH - 64,
    minHeight: 90,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 18,
    justifyContent: 'center',
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : 'rgba(255,255,255,0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(234,64,135,0.14)',
    ...shadows.card,
  },
  pregnancyDateMissingTitle: {
    width: 245,
    color: colors.surface.canvas === '#161417' ? colors.text.primary : '#56162D',
    fontSize: 16,
    lineHeight: 19,
  },
  pregnancyDateMissingBody: {
    marginTop: 4,
    color: colors.surface.canvas === '#161417' ? colors.text.secondary : '#7D6870',
    fontSize: 13,
    lineHeight: 16,
  },
  pregnancyDateMissingArrow: {
    position: 'absolute',
    right: 18,
    top: 31,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.rose : '#F4C0D8',
  },
  contentShape: {
    position: 'absolute',
    left: 0,
    top: 90,
  },
  contentSurfaceExtension: {
    position: 'absolute',
    left: 0,
    top: 180,
    width: DESIGN_WIDTH,
    height: 371,
    backgroundColor: colors.surface.raised,
  },
  cardsRow: {
    position: 'absolute',
    left: 16,
    top: 322,
    width: 386,
    height: 128,
    flexDirection: 'row',
    gap: 10,
  },
  featureCard: {
    width: 118,
    height: 128,
    borderRadius: 30,
    overflow: 'hidden',
  },
  importantCard: {
    position: 'relative',
    width: 118,
    height: 128,
    overflow: 'visible',
  },
  importantCardSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    backgroundColor: colors.surface.canvas === defaultThemeColors.surface.canvas
      ? '#ECA4C8'
      : colors.surface.rose,
    borderWidth: colors.surface.canvas === defaultThemeColors.surface.canvas ? 0 : 1,
    borderColor: colors.surface.divider,
  },
  importantCardHitArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    borderRadius: 30,
  },
  importantMascotLayer: {
    position: 'absolute',
    zIndex: 2,
    left: -5,
    top: 23,
    width: 84,
    height: 88,
  },
  importantMascot: {
    width: '100%',
    height: '100%',
  },
  importantCardLabel: {
    position: 'absolute',
    zIndex: 3,
    right: -33,
    top: 48,
    width: 114,
    color: colors.surface.canvas === defaultThemeColors.surface.canvas
      ? '#FDECE5'
      : colors.text.primary,
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.5,
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
  },
  featureCardContent: {
    width: 118,
    height: 128,
    padding: 16,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  featureCardSoft: {
    backgroundColor: '#233329',
  },
  cardArrow: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    backgroundColor: '#ECA4C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    width: '100%',
    color: '#FFFFFF',
    ...fontStyle(FONT_SF_REGULAR),
    fontSize: 13.5,
    lineHeight: 16.5,
    letterSpacing: -0.27,
  },
  journalArea: {
    position: 'absolute',
    left: 16,
    top: 156,
    width: 370,
    height: 58,
  },
  checkupsArea: {
    position: 'absolute',
    left: 16,
    top: 230,
    width: 370,
    height: 58,
  },
  metricsDivider: {
    position: 'absolute',
    left: 16,
    top: 304,
    width: 370,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#ededed',
  },
  dashboardScroll: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  dashboardScrollContent: {
    width: DESIGN_WIDTH,
    height: 970,
  },
  dashboardScrollCanvas: {
    width: DESIGN_WIDTH,
    height: 551,
    marginTop: 423,
  },
  planningCanvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
    borderRadius: Platform.OS === 'android' ? 0 : 40,
    backgroundColor: colors.surface.warm,
  },
  todayScrollBlur: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 2,
  },
  planningHeaderFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 132,
    zIndex: 9,
  },
  planningForecast: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 212,
    alignItems: 'center',
  },
  planningCycleDay: {
    color: colors.text.secondary,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  planningProbability: {
    marginTop: 4,
    color: TODAY_ACCENT,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  planningProbabilityCaption: {
    marginTop: -2,
    color: colors.text.primary,
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.48,
  },
  planningActions: {
    position: 'absolute',
    zIndex: 4,
    left: 20,
    right: 20,
    top: 68,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  planningActionItem: {
    width: 108,
    alignItems: 'center',
  },
  planningActionCircle: {
    width: 72,
    minWidth: 72,
    maxWidth: 72,
    flexBasis: 72,
    flexGrow: 0,
    flexShrink: 0,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7A183F',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 7,
  },
  planningActionPrimaryFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    backgroundColor: TODAY_ACCENT,
    borderWidth: 1,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(255,255,255,0.82)',
  },
  planningAndroidAction: {
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#FFF9FC',
    borderWidth: 1,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#FFFFFF',
  },
  planningAndroidActionPrimary: {
    backgroundColor: TODAY_ACCENT,
  },
  planningActionIcon: {
    zIndex: 1,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningCycleIconOrientation: {
    transform: [{ scaleY: -1 }],
  },
  planningActionLabel: {
    minHeight: 38,
    marginTop: 9,
    color: colors.text.primary,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.16,
    textAlign: 'center',
  },
  planningActionPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.98 }],
  },
  planningLowerScroll: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  planningLowerScrollContent: {
    width: DESIGN_WIDTH,
  },
  planningLowerCanvas: {
    width: DESIGN_WIDTH,
    paddingTop: 390,
    paddingBottom: 130,
    marginTop: 420,
  },
  planningContentShape: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  planningContentExtension: {
    position: 'absolute',
    left: 0,
    top: 180,
    width: DESIGN_WIDTH,
    bottom: 0,
    backgroundColor: colors.surface.raised,
  },
  planningJournalArea: {
    position: 'absolute',
    left: 16,
    top: 212,
    width: 370,
    height: 58,
  },
  planningCheckupsArea: {
    position: 'absolute',
    left: 16,
    top: 286,
    width: 370,
    height: 58,
  },
  planningMetricsDivider: {
    position: 'absolute',
    left: 16,
    top: 360,
    width: 370,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#EDEDED',
  },
  planningMetricsTopDivider: {
    top: 178,
  },
  planningCyclesContent: {
    marginTop: 18,
    marginHorizontal: 16,
  },
  planningCyclesTitle: {
    color: colors.text.primary,
    fontSize: 22,
    lineHeight: 27,
    letterSpacing: -0.4,
  },
  planningCyclesStatsCard: { marginTop: 12 },
  planningCyclesRow: {
    minHeight: 84,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planningCyclesRowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#EDEDED',
  },
  planningCyclesMetricCopy: { minWidth: 0, flex: 1, gap: 5 },
  planningCyclesMetricLabel: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 18,
  },
  planningCyclesMetricValue: {
    color: colors.text.primary,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  planningCyclesMissing: { color: colors.text.secondary },
  planningCyclesSource: { color: colors.text.secondary, fontSize: 12, lineHeight: 16 },
  planningCyclesDivider: {
    marginTop: 22,
    marginHorizontal: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#EDEDED',
  },
  planningCardsRow: {
    marginLeft: 16,
    width: 386,
    height: 128,
    flexDirection: 'row',
    gap: 10,
  },
  planningModalContent: {
    width: '100%',
    paddingTop: 6,
    gap: 24,
  },
  planningOptionSection: {
    width: '100%',
    gap: 10,
  },
  planningOptionSectionHeader: {
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  planningOptionList: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.surface.raised,
  },
  planningOption: {
    position: 'relative',
    width: '100%',
    minHeight: 52,
  },
  planningOptionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#EDEBED',
  },
  planningOptionContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planningOptionLabel: {
    minWidth: 0,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text.primary,
  },
  planningOptionSelection: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningOptionCheck: {
    width: 7,
    height: 13,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#EA4087',
    transform: [{ rotate: '40deg' }],
    marginTop: -4,
  },
  planningModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  planningModalActionSlot: {
    flex: 1,
    height: 48,
  },
  planningModalActionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningModalCancel: { ...sheetStyles.secondary },
  planningModalSave: { ...sheetStyles.primary },
  planningModalSaveDisabled: {
    opacity: 0.38,
  },
  pressed: {
    opacity: 0.72,
  },
  nativeGlassView: {
    overflow: 'visible',
  },
  nativeGlassContent: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeGlassPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidGlassControlContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidGlassPressTarget: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidGlassMaterialFill: {
    flex: 1,
    alignSelf: 'stretch',
  },
  glassFallbackPressed: {
    opacity: Platform.OS === 'android' ? 0.94 : 1,
    transform: [{ scale: Platform.OS === 'android' ? 0.98 : 1.035 }],
  },
  fallbackGlassHost: {
    position: 'relative',
  },
  androidMaterialControl: {
    overflow: 'hidden',
    borderWidth: 0.8,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : '#ECDDE2',
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#FFFDFC',
  },
  glassSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  glassSurfaceClipped: {
    overflow: 'hidden',
  },
  glassInnerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(255,255,255,0.52)',
  },
  glassControlShadow: {
    shadowColor: '#260208',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 9,
  },
  headerControlShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  projectText: {
    ...fontStyle(FONT_SF_REGULAR),
    includeFontPadding: false,
  },
});

const styles = createStyles(defaultThemeColors);
