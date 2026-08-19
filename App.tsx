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
import Svg, { Circle, Rect } from 'react-native-svg';
import type {
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
import CycleIcon from './assets/figma/journal-flow/icon-cycle.svg';
import MonitoringIcon from './assets/figma/monitoring-icon.svg';
import AndroidGraphIcon from './assets/android-icons/graph.svg';
import PlanningHeartIcon from './assets/today/planning-heart.svg';
import PlanningSymptomsIcon from './assets/today/planning-symptoms.svg';
import {
  AppText,
  CalendarPageModal,
  androidMaterials,
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
import { useHealthStore } from './lib/health-store';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const FONT_SF_REGULAR = 'SFProDisplay-Regular';
const FONT_SF_SEMIBOLD = 'SFProDisplay-Semibold';
const FONT_YARO_RG = 'YaroRg';
const FontReadyContext = createContext(false);
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
const MAX_PREGNANCY_WEEK = 42;
const INITIAL_WEEK = 7;
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
            <View
              style={[
                StyleSheet.absoluteFillObject,
                highlight === 'dark'
                  ? androidMaterials.dark
                  : androidMaterials.light,
                { borderRadius: radius },
              ]}
            />
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
  androidShape?: 'circle' | 'pill';
  controlStyle: StyleProp<ViewStyle>;
  onPress?: () => void;
  headerElevation?: boolean;
};

function LiquidGlassPressable({
  accessibilityLabel,
  androidShape = 'circle',
  children,
  controlStyle,
  onPress,
  headerElevation = false,
  variant = 'clear',
  tintColor,
  colorScheme = 'light',
  fallbackTint = 'systemUltraThinMaterialLight',
  intensity = 58,
  washColor = 'transparent',
  highlight = 'light',
  radius = 999,
}: LiquidGlassPressableProps) {
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
          { borderRadius: radius },
        ]}
      >
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFillObject}
        >
          {androidShape === 'circle' ? (
            <Circle
              cx="50%"
              cy="50%"
              r="48.5%"
              fill={
                highlight === 'dark'
                  ? 'rgba(31,24,27,0.82)'
                  : 'rgba(255,250,252,0.82)'
              }
              stroke={
                highlight === 'dark'
                  ? 'rgba(255,255,255,0.24)'
                  : 'rgba(255,255,255,0.94)'
              }
              strokeWidth={1}
            />
          ) : (
            <Rect
              x="0.5%"
              y="1%"
              width="99%"
              height="98%"
              rx={24}
              ry={24}
              fill="rgba(255,250,252,0.82)"
              stroke="rgba(255,255,255,0.94)"
              strokeWidth={1}
            />
          )}
        </Svg>
        <Pressable
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

  return (
    <View
      style={[
        controlStyle,
        styles.fallbackGlassHost,
        headerElevation ? styles.headerControlShadow : styles.glassControlShadow,
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
  const fontsReady = useContext(FontReadyContext);
  const segments = String(children).split(/(сфера)/gi);
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
        { fontFamily: sfFont, fontWeight: fallbackWeight },
      ]}
    >
      {segments.map((segment, index) =>
        /^сфера$/i.test(segment) ? (
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
    <View
      style={[
        styles.featureCard,
        accent ? styles.featureCardAccent : styles.featureCardSoft,
      ]}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={title}>
        {({ pressed }) => (
          <View style={[styles.featureCardContent, pressed && styles.pressed]}>
            {accent ? (
              <ProjectText style={styles.attentionValue}>72%</ProjectText>
            ) : (
              <View style={styles.cardArrow}>
                <ArrowCard width={18.3} height={18.3} />
              </View>
            )}
            <ProjectText
              numberOfLines={3}
              style={[styles.featureTitle, accent && styles.featureTitleLight]}
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

function ImportantMascotCard() {
  const fontsReady = useContext(FontReadyContext);

  return (
    <View style={styles.importantCard}>
      <View pointerEvents="none" style={styles.importantCardSurface} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Важно"
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
            fontFamily: fontsReady
              ? FONT_YARO_RG
              : Platform.OS === 'ios'
                ? 'System'
                : 'sans-serif',
          },
        ]}
      >
        ВАЖНО
      </Text>
    </View>
  );
}

function MonitoringScreen({
  headerTop,
  onCalendarPress,
  onChartsPress,
  onJournalPress,
  onCheckupsPress,
}: {
  headerTop: number;
  onCalendarPress: () => void;
  onChartsPress: () => void;
  onJournalPress: () => void;
  onCheckupsPress: () => void;
}) {
  const { profile, journalEntries, labResults, scanResults } = useHealthStore();
  const initialWeek =
    profile?.goal === 'pregnancy' && profile.pregnancyStartAt
      ? Math.min(
          MAX_PREGNANCY_WEEK,
          Math.max(
            1,
            Math.floor(
              (Date.now() - profile.pregnancyStartAt) /
                (7 * 24 * 60 * 60 * 1000),
            ) + 1,
          ),
        )
      : INITIAL_WEEK;
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

  const todayStart = new Date().setHours(0, 0, 0, 0);
  const journalCompleted = journalEntries.some(
    (entry) => !entry.deletedAt && entry.occurredAt >= todayStart,
  );
  const completedCheckups = Math.min(
    6,
    labResults.filter((item) => !item.deletedAt).length +
      scanResults.filter((item) => !item.deletedAt).length,
  );

  return (
    <View style={styles.canvas}>
      <Image
        source={require('./assets/figma/today_pregnancy_background.png')}
        resizeMode="cover"
        style={styles.heroImage}
      />

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(252,231,220,1)', 'rgba(252,231,220,0)']}
        locations={[0, 1]}
        style={styles.headerFadeGradient}
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
          tintColor={colors.surface.headerGlassWash}
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
          androidShape="pill"
          controlStyle={styles.datePill}
          headerElevation
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
        >
          <HeaderDateLabel />
        </LiquidGlassPressable>

        <LiquidGlassPressable
          accessibilityLabel="Открыть календарь"
          controlStyle={styles.topCircle}
          headerElevation
          onPress={onCalendarPress}
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
        >
          <View style={styles.headerIconOrientation}>
            <CalendarIcon width={22} height={22} color="#EA4087" />
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
                          { fontFamily: weekNumberFont },
                        ]}
                      >
                        {week}
                      </Text>
                      <Text
                        style={[
                          styles.weekLabel,
                          { fontFamily: weekLabelFont },
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
                  transform: [{ translateX: Animated.multiply(scrollX, -1) }],
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

          <View pointerEvents="none" style={styles.contentSurfaceExtension} />

          <ContentShape
            pointerEvents="none"
            width={DESIGN_WIDTH}
            height={361}
            style={styles.contentShape}
          />

          <View style={styles.journalArea}>
            <JournalAssessment
              variant="ring"
              value={journalCompleted ? 24 : 16}
              actionLabel={journalCompleted ? 'Готово' : 'Заполнить'}
              actionVariant="outline"
              onPress={onJournalPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View style={styles.checkupsArea}>
            <JournalAssessment
              variant="fraction"
              value={completedCheckups}
              total={6}
              title="Прохождение чекапов"
              status="Средняя регулярность"
              leftCaption={`Пройдено ${completedCheckups}`}
              rightCaption="Всего 6"
              actionLabel={completedCheckups >= 6 ? 'Готово' : 'Пройти'}
              actionVariant="outline"
              onPress={onCheckupsPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View pointerEvents="none" style={styles.metricsDivider} />

          <View style={styles.cardsRow}>
            <ImportantMascotCard />
            <FeatureCard title={'Подбор\nпитания в 1-м\nтриместре'} />
            <FeatureCard title={'7 Важных\nобследований\nи анализов'} />
          </View>
        </View>
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(255,255,255,0)',
          'rgba(255,255,255,0)',
          'rgba(255,255,255,1)',
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

function PlanningQuickAction({
  glyph,
  label,
  onPress,
  primary = false,
}: PlanningQuickActionProps) {
  const content = <View style={styles.planningActionIcon}>{glyph}</View>;

  return (
    <View style={styles.planningActionItem}>
      <LiquidGlassPressable
        accessibilityLabel={label}
        controlStyle={styles.planningActionCircle}
        onPress={onPress}
        tintColor={primary ? '#EA4087' : 'rgba(255,255,255,0.62)'}
        washColor={
          primary ? 'rgba(234,64,135,0.94)' : 'rgba(255,255,255,0.22)'
        }
        intensity={72}
      >
        {primary ? (
          <View pointerEvents="none" style={styles.planningActionPrimaryFill} />
        ) : null}
        {content}
      </LiquidGlassPressable>
      <ProjectText
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
  glyph: string;
  group: 'contact' | 'desire';
  id: string;
  label: string;
};

const planningIntimacyOptions: PlanningIntimacyOption[] = [
  { id: 'none', group: 'contact', glyph: '—', label: 'Близости не было' },
  { id: 'protected', group: 'contact', glyph: '✓', label: 'С защитой' },
  { id: 'unprotected', group: 'contact', glyph: '♡', label: 'Без защиты' },
  { id: 'withdrawal', group: 'contact', glyph: '◐', label: 'Прерванный акт' },
  { id: 'touch', group: 'contact', glyph: '∞', label: 'Прикосновения' },
  { id: 'high', group: 'desire', glyph: '↑', label: 'Высокое желание' },
  { id: 'medium', group: 'desire', glyph: '•', label: 'Среднее желание' },
  { id: 'low', group: 'desire', glyph: '↓', label: 'Низкое желание' },
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
  const insets = useSafeAreaInsets();
  const [selection, setSelection] = useState<{
    contact?: string;
    desire?: string;
  }>({});
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [scrollContentHeight, setScrollContentHeight] = useState(0);
  const scrollEnabled =
    scrollViewportHeight > 0 &&
    scrollContentHeight > scrollViewportHeight + 1;
  const selectedLabels = planningIntimacyOptions
    .filter((option) => selection[option.group] === option.id)
    .map((option) => option.label);

  const close = () => {
    setSelection({});
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={close}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.planningModalRoot}>
        <Pressable
          accessibilityLabel="Закрыть окно"
          onPress={close}
          style={styles.planningModalScrim}
        />
        <ScrollView
          alwaysBounceVertical={false}
          bounces={scrollEnabled}
          contentContainerStyle={styles.planningModalPageContent}
          onContentSizeChange={(_width, height) =>
            setScrollContentHeight(height)
          }
          onLayout={({ nativeEvent }) =>
            setScrollViewportHeight(nativeEvent.layout.height)
          }
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
          style={styles.planningModalPageScroll}
        >
          <Pressable
            accessibilityLabel="Закрыть окно"
            onPress={close}
            style={styles.planningModalDismissArea}
          />
          <View
            style={[
              styles.planningModalSheet,
              { paddingBottom: Math.max(insets.bottom + 102, 118) },
            ]}
          >
          <View style={styles.planningModalHandle} />

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
                    .map((option) => {
                      const selected = selection[option.group] === option.id;
                      return (
                        <View
                          key={option.id}
                          style={[
                            styles.planningOption,
                            selected && styles.planningOptionSelected,
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
                            style={StyleSheet.absoluteFillObject}
                          >
                            {({ pressed }) => (
                              <View
                               style={[
                                  styles.planningOptionContent,
                                  pressed && styles.planningActionPressed,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.planningOptionIcon,
                                    selected && styles.planningOptionIconSelected,
                                  ]}
                                >
                                  <AppText
                                    weight="semibold"
                                    style={[
                                      styles.planningOptionGlyph,
                                      selected && styles.planningOptionGlyphSelected,
                                    ]}
                                  >
                                    {option.glyph}
                                  </AppText>
                                </View>

                                <AppText
                                  role="label"
                                  weight="medium"
                                  style={styles.planningOptionLabel}
                                >
                                  {option.label}
                                </AppText>

                                <View
                                  style={[
                                    styles.planningOptionRadio,
                                    selected && styles.planningOptionRadioSelected,
                                  ]}
                                >
                                  {selected ? (
                                    <View style={styles.planningOptionRadioDot} />
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

        </View>
        </ScrollView>
        <View
          style={[
            styles.planningModalActionsFixed,
            { paddingBottom: Math.max(insets.bottom + 18, 34) },
          ]}
        >
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
        </View>
      </View>
    </Modal>
  );
}

function formatPlanningDateRange(start: Date, end: Date) {
  const month = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(end);
  return `${start.getDate()}–${end.getDate()} ${month}`;
}

function PlanningMonitoringScreen({
  headerTop,
  onCalendarPress,
  onChartsPress,
  onIntimacyPress,
  onSymptomsPress,
  onCheckupsPress,
}: {
  headerTop: number;
  onCalendarPress: () => void;
  onChartsPress: () => void;
  onIntimacyPress: () => void;
  onSymptomsPress: () => void;
  onCheckupsPress: () => void;
}) {
  const { journalEntries, labResults, profile, scanResults } = useHealthStore();
  const today = new Date();
  const cycleLength = profile?.cycleLengthDays ?? 28;
  const fallbackPeriodStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 11,
  ).getTime();
  const periodStartAt =
    profile?.goal === 'planning' && profile.lastPeriodStartAt
      ? profile.lastPeriodStartAt
      : fallbackPeriodStart;
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const elapsedDays = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(periodStartAt).setHours(0, 0, 0, 0)) /
      dayMilliseconds,
  );
  const cycleDay =
    ((elapsedDays % cycleLength) + cycleLength) % cycleLength + 1;
  const ovulationDay = Math.max(10, cycleLength - 14);
  const fertileStartDay = Math.max(1, ovulationDay - 5);
  const fertileEndDay = Math.min(cycleLength, ovulationDay + 1);
  const highProbability =
    cycleDay >= fertileStartDay && cycleDay <= fertileEndDay;
  const nearWindow =
    cycleDay >= fertileStartDay - 2 && cycleDay <= fertileEndDay + 2;
  const probabilityLabel = highProbability
    ? 'Высокая'
    : nearWindow
      ? 'Средняя'
      : 'Низкая';
  const daysUntilOvulation =
    ovulationDay >= cycleDay
      ? ovulationDay - cycleDay
      : cycleLength - cycleDay + ovulationDay;
  const completedCycles = Math.floor(elapsedDays / cycleLength);
  const currentCycleStart = new Date(periodStartAt);
  currentCycleStart.setHours(12, 0, 0, 0);
  currentCycleStart.setDate(
    currentCycleStart.getDate() + completedCycles * cycleLength,
  );
  const fertileStart = new Date(currentCycleStart);
  fertileStart.setHours(12, 0, 0, 0);
  fertileStart.setDate(fertileStart.getDate() + fertileStartDay - 1);
  const fertileEnd = new Date(currentCycleStart);
  fertileEnd.setHours(12, 0, 0, 0);
  fertileEnd.setDate(fertileEnd.getDate() + fertileEndDay - 1);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const journalCompleted = journalEntries.some(
    (entry) => !entry.deletedAt && entry.occurredAt >= todayStart,
  );
  const completedCheckups = Math.min(
    6,
    labResults.filter((item) => !item.deletedAt).length +
      scanResults.filter((item) => !item.deletedAt).length,
  );

  return (
    <View style={styles.planningCanvas}>
      <Image
        source={require('./assets/today/planning-background.png')}
        resizeMode="cover"
        style={styles.planningBackground}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,246,246,0.92)', 'rgba(255,246,246,0)']}
        locations={[0, 1]}
        style={styles.planningHeaderFade}
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
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
        >
          <View style={styles.headerIconOrientation}>
            <MonitoringIcon width={22} height={22} color="#EA4087" />
          </View>
        </LiquidGlassPressable>
        <LiquidGlassPressable
          accessibilityLabel="Выбрать дату"
          androidShape="pill"
          controlStyle={styles.datePill}
          headerElevation
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
        >
          <HeaderDateLabel />
        </LiquidGlassPressable>
        <LiquidGlassPressable
          accessibilityLabel="Открыть календарь"
          controlStyle={styles.topCircle}
          headerElevation
          onPress={onCalendarPress}
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
        >
          <View style={styles.headerIconOrientation}>
            <CalendarIcon width={22} height={22} color="#EA4087" />
          </View>
        </LiquidGlassPressable>
      </LiquidGlassGroup>

      <View style={styles.planningForecast}>
        <ProjectText style={styles.planningCycleDay} weight="semibold">
          {`${cycleDay}-й день цикла`}
        </ProjectText>
        <ProjectText style={styles.planningProbability} weight="semibold">
          {`${probabilityLabel} вероятность`}
        </ProjectText>
        <ProjectText style={styles.planningProbabilityCaption}>
          забеременеть
        </ProjectText>
        <View style={styles.planningForecastMeta}>
          <ProjectText style={styles.planningForecastMetaText} weight="semibold">
            {`Лучшие дни: ${formatPlanningDateRange(fertileStart, fertileEnd)}`}
          </ProjectText>
          <ProjectText style={styles.planningForecastMetaText}>
            {daysUntilOvulation === 0
              ? 'Овуляция ожидается сегодня'
              : `Овуляция ожидается через ${daysUntilOvulation} дн.`}
          </ProjectText>
        </View>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        style={styles.planningLowerScroll}
        contentContainerStyle={styles.planningLowerScrollContent}
      >
        <View style={styles.planningLowerCanvas}>
          <ContentShape
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
                  color="#EA4087"
                />
              }
              label="Симптомы"
              onPress={onSymptomsPress}
            />
            <PlanningQuickAction
              glyph={<PlanningHeartIcon width={28} height={28} color="#EA4087" />}
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
              value={journalCompleted ? 24 : 16}
              actionLabel={journalCompleted ? 'Готово' : 'Заполнить'}
              actionVariant="outline"
              onPress={onSymptomsPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View style={styles.planningCheckupsArea}>
            <JournalAssessment
              variant="fraction"
              value={completedCheckups}
              total={6}
              title="Прохождение чекапов"
              status="Средняя регулярность"
              leftCaption={`Пройдено ${completedCheckups}`}
              rightCaption="Всего 6"
              actionLabel={completedCheckups >= 6 ? 'Готово' : 'Пройти'}
              actionVariant="outline"
              onPress={onCheckupsPress}
              actionIcon={<ArrowButton width={18.3} height={18.3} />}
            />
          </View>

          <View pointerEvents="none" style={styles.planningMetricsDivider} />

          <View style={styles.planningCyclesContent}>
            <ProjectText style={styles.planningCyclesTitle} weight="semibold">
              Мои циклы
            </ProjectText>

            <View style={styles.planningCyclesStatsCard}>
              <View style={styles.planningCyclesRow}>
                <View style={styles.planningCyclesMetricCopy}>
                  <ProjectText style={styles.planningCyclesMetricLabel}>
                    Предыдущий цикл
                  </ProjectText>
                  <ProjectText
                    style={styles.planningCyclesMetricValue}
                    weight="semibold"
                  >
                    {`${cycleLength} дней`}
                  </ProjectText>
                </View>
                <View style={styles.planningCyclesStatus}>
                  <View style={styles.planningCyclesStatusGood}>
                    <ProjectText
                      style={styles.planningCyclesStatusGoodGlyph}
                      weight="semibold"
                    >
                      ✓
                    </ProjectText>
                  </View>
                  <ProjectText
                    style={styles.planningCyclesStatusLabel}
                    weight="semibold"
                  >
                    В норме
                  </ProjectText>
                </View>
              </View>

              <View style={styles.planningCyclesRowDivider} />

              <View style={styles.planningCyclesRow}>
                <View style={styles.planningCyclesMetricCopy}>
                  <ProjectText style={styles.planningCyclesMetricLabel}>
                    Предыдущие месячные
                  </ProjectText>
                  <ProjectText
                    style={styles.planningCyclesMetricValue}
                    weight="semibold"
                  >
                    4 дня
                  </ProjectText>
                </View>
                <View style={styles.planningCyclesStatus}>
                  <View style={styles.planningCyclesStatusGood}>
                    <ProjectText
                      style={styles.planningCyclesStatusGoodGlyph}
                      weight="semibold"
                    >
                      ✓
                    </ProjectText>
                  </View>
                  <ProjectText
                    style={styles.planningCyclesStatusLabel}
                    weight="semibold"
                  >
                    В норме
                  </ProjectText>
                </View>
              </View>

              <View style={styles.planningCyclesRowDivider} />

              <View style={styles.planningCyclesRow}>
                <View style={styles.planningCyclesMetricCopy}>
                  <ProjectText style={styles.planningCyclesMetricLabel}>
                    Колебания длины цикла
                  </ProjectText>
                  <ProjectText
                    style={styles.planningCyclesMetricValueSmall}
                    weight="semibold"
                  >
                    Пока нет данных
                  </ProjectText>
                </View>
                <View style={styles.planningCyclesStatus}>
                  <View style={styles.planningCyclesStatusPending}>
                    <ProjectText
                      style={styles.planningCyclesStatusPendingGlyph}
                      weight="semibold"
                    >
                      i
                    </ProjectText>
                  </View>
                  <ProjectText
                    style={styles.planningCyclesStatusPendingLabel}
                    weight="semibold"
                  >
                    Наблюдаем
                  </ProjectText>
                </View>
              </View>
            </View>

          </View>

          <View
            pointerEvents="none"
            style={[
              styles.planningMetricsDivider,
              styles.planningCyclesDivider,
            ]}
          />

          <View style={styles.planningCardsRow}>
            <ImportantMascotCard />
            <FeatureCard title={'Подбор\nпитания в 1-м\nтриместре'} />
            <FeatureCard title={'7 Важных\nобследований\nи анализов'} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function PlanningTodayScreenCatalogPreview() {
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
        headerTop={headerTop}
        onCalendarPress={() => setCalendarVisible(true)}
        onChartsPress={() => undefined}
        onIntimacyPress={() => setIntimacyVisible(true)}
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
        initialCategory="symptoms"
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

export function TodayScreenCatalogPreview() {
  const insets = useSafeAreaInsets();
  const headerTop = getHeaderTop(insets.top, 1) + 1;

  return (
    <FontReadyContext.Provider value>
      <MonitoringScreen
        headerTop={headerTop}
        onCalendarPress={() => undefined}
        onChartsPress={() => undefined}
        onJournalPress={() => undefined}
        onCheckupsPress={() => undefined}
      />
    </FontReadyContext.Provider>
  );
}

export default function App() {
  const router = useRouter();
  const { addJournalEntry, journalEntries, labResults, profile, scanResults } =
    useHealthStore();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [chartsVisible, setChartsVisible] = useState(false);
  const [planningIntimacyVisible, setPlanningIntimacyVisible] = useState(false);
  const [journalFlowDate, setJournalFlowDate] = useState<Date | null>(null);
  const [journalFlowCategory, setJournalFlowCategory] =
    useState<JournalFlowCategory>('cycle');
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === 'web'
      ? {
          [FONT_SF_REGULAR]: require('./assets/fonts/SF-Pro-Display-Regular.otf'),
          [FONT_SF_SEMIBOLD]: require('./assets/fonts/SF-Pro-Display-Semibold.otf'),
          [FONT_YARO_RG]: require('./assets/fonts/Yaro-Rg-Regular.otf'),
        }
      : {},
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
        <StatusBar style="dark" hidden={false} />
        <View
          style={{
            width: DESIGN_WIDTH * scale,
            height: DESIGN_HEIGHT * scale,
          }}
        >
          <View
            style={[styles.scaledCanvas, { transform: [{ scale }] }]}
          >
            {profile?.goal === 'planning' ? (
              <PlanningMonitoringScreen
                headerTop={headerTop}
                onCalendarPress={() => setCalendarVisible(true)}
                onChartsPress={() => setChartsVisible(true)}
                onIntimacyPress={() => setPlanningIntimacyVisible(true)}
                onSymptomsPress={() =>
                  openJournalFlow(new Date(), 'symptoms')
                }
                onCheckupsPress={() => router.push('/analyses')}
              />
            ) : (
              <MonitoringScreen
                headerTop={headerTop}
                onCalendarPress={() => setCalendarVisible(true)}
                onChartsPress={() => setChartsVisible(true)}
                onJournalPress={() =>
                  openJournalFlow(
                    new Date(),
                    profile?.goal === 'pregnancy' ? 'symptoms' : 'cycle',
                  )
                }
                onCheckupsPress={() => router.push('/analyses')}
              />
            )}
          </View>
        </View>
        <CalendarPageModal
          visible={calendarVisible}
          onClose={() => setCalendarVisible(false)}
          onAddSymptoms={(date) => openJournalFlow(date, 'symptoms')}
          symptomDateKeys={symptomDateKeys}
          allowPeriodMarking={profile?.goal !== 'pregnancy'}
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
          profile={profile}
          journalEntries={journalEntries}
          labResults={labResults}
          scanResults={scanResults}
        />
      </View>
    </FontReadyContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDECE5',
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
    backgroundColor: '#FDECE5',
    borderRadius: 40,
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
    backgroundColor: '#ffffff',
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  weekNumber: {
    color: '#F2A8CB',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 18,
    lineHeight: 19,
    letterSpacing: -0.32,
  },
  weekLabel: {
    marginTop: -2,
    color: '#F2A8CB',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 14,
    lineHeight: 15,
    letterSpacing: -0.24,
  },
  weekTextSelected: {
    color: '#EA4087',
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ECA4C8',
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
    color: '#FDECE5',
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
  featureCardAccent: {
    backgroundColor: '#EA4087',
  },
  featureCardSoft: {
    backgroundColor: '#FDECE5',
  },
  attentionValue: {
    alignSelf: 'flex-start',
    color: '#1fbb74',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.64,
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
    color: '#171717',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 13.5,
    lineHeight: 16.5,
    letterSpacing: -0.27,
  },
  featureTitleLight: {
    color: '#ffffff',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 14.2,
    lineHeight: 17,
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
    backgroundColor: '#ededed',
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
    borderRadius: 40,
    backgroundColor: '#FFF1EF',
  },
  planningBackground: {
    ...StyleSheet.absoluteFillObject,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
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
    color: '#7B6470',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  planningProbability: {
    marginTop: 4,
    color: '#EA4087',
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  planningProbabilityCaption: {
    marginTop: -2,
    color: '#171717',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.48,
  },
  planningForecastMeta: {
    marginTop: 16,
    alignItems: 'center',
    gap: 3,
  },
  planningForecastMetaText: {
    color: '#5D5055',
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.14,
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
    backgroundColor: '#EA4087',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
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
    color: '#30262A',
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
    height: 1402,
  },
  planningLowerCanvas: {
    width: DESIGN_WIDTH,
    height: 982,
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
    height: 802,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#EDEDED',
  },
  planningMetricsTopDivider: {
    top: 178,
  },
  planningCyclesContent: {
    position: 'absolute',
    left: 16,
    top: 390,
    width: 370,
  },
  planningCyclesTitle: {
    color: '#171717',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.48,
  },
  planningCyclesStatsCard: {
    marginTop: 16,
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#FFF8FB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.15)',
  },
  planningCyclesRow: {
    minHeight: 82,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  planningCyclesRowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 18,
    backgroundColor: 'rgba(68,48,56,0.1)',
  },
  planningCyclesMetricCopy: {
    minWidth: 0,
    flex: 1,
    gap: 4,
  },
  planningCyclesMetricLabel: {
    color: '#766B70',
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  planningCyclesMetricValue: {
    color: '#211B1E',
    fontSize: 21,
    lineHeight: 24,
    letterSpacing: -0.32,
  },
  planningCyclesMetricValueSmall: {
    color: '#211B1E',
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  planningCyclesStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  planningCyclesStatusGood: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#31B76A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningCyclesStatusGoodGlyph: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 18,
  },
  planningCyclesStatusPending: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#F7D6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningCyclesStatusPendingGlyph: {
    color: '#C32E6E',
    fontSize: 15,
    lineHeight: 18,
  },
  planningCyclesStatusLabel: {
    color: '#267B4B',
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.18,
    textTransform: 'uppercase',
  },
  planningCyclesStatusPendingLabel: {
    color: '#A72A60',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.1,
    textTransform: 'uppercase',
  },
  planningCyclesDivider: {
    top: 704,
  },
  planningCardsRow: {
    position: 'absolute',
    left: 16,
    top: 724,
    width: 386,
    height: 128,
    flexDirection: 'row',
    gap: 10,
  },
  planningModalRoot: {
    flex: 1,
  },
  planningModalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(43,31,36,0.24)',
  },
  planningModalSheet: {
    width: '100%',
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface.raised,
    ...shadows.floating,
  },
  planningModalPageScroll: {
    flex: 1,
  },
  planningModalPageContent: {
    flexGrow: 1,
  },
  planningModalDismissArea: {
    flex: 1,
    minHeight: 174,
  },
  planningModalHandle: {
    width: 38,
    height: 5,
    marginBottom: 16,
    borderRadius: 3,
    backgroundColor: '#DED9DB',
    alignSelf: 'center',
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
    gap: 8,
  },
  planningOption: {
    position: 'relative',
    width: '100%',
    height: 54,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#F7F3F4',
    borderWidth: 1,
    borderColor: 'rgba(58,42,48,0.06)',
  },
  planningOptionContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  planningOptionSelected: {
    backgroundColor: '#FFF7FA',
    borderColor: '#F2A8CB',
  },
  planningOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F5E8ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningOptionIconSelected: {
    backgroundColor: '#EA4087',
  },
  planningOptionGlyph: {
    color: '#EA4087',
    fontSize: 17,
    lineHeight: 20,
  },
  planningOptionGlyphSelected: {
    color: '#FFFFFF',
  },
  planningOptionLabel: {
    minWidth: 0,
    flex: 1,
  },
  planningOptionRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#C9C2C5',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningOptionRadioSelected: {
    borderColor: '#EA4087',
  },
  planningOptionRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EA4087',
  },
  planningModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  planningModalActionsFixed: {
    position: 'absolute',
    zIndex: 6,
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.surface.raised,
    shadowColor: '#2B131B',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 12,
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
  planningModalCancel: {
    position: 'relative',
    height: 48,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#F5F1F2',
  },
  planningModalSave: {
    position: 'relative',
    height: 48,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#EA4087',
  },
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
    borderColor: '#ECDDE2',
    backgroundColor: '#FFFDFC',
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
    borderColor: 'rgba(255,255,255,0.52)',
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
    fontFamily: FONT_SF_REGULAR,
    includeFontPadding: false,
  },
});
