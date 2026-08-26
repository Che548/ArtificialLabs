import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle, ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AddIcon from '../assets/figma/calendar-page/add.svg';
import BackIcon from '../assets/figma/calendar-page/back.svg';
import HeaderShape from '../assets/figma/calendar-page/header-shape.svg';
import {
  createCycleHistory,
  cycleDayInsight,
  type CycleHistory,
} from '../lib/cycle-insights';
import { AppText, LiquidGlassSurface, SegmentedSwitcher } from './components';
import {
  androidShadows,
  colors,
  getHeaderTop,
  radii,
  shadows,
  sizes,
  spacing,
} from './tokens';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const HEADER_SHAPE_HEIGHT = 235;
const CALENDAR_CONTENT_TOP = 246;
const MONTH_SECTION_HEIGHT = 410;
const DAY_DETAILS_HEIGHT = 196;
const RETURN_BUTTON_SIZE = 52;
const YEAR_SECTION_HEIGHT = 646;
const YEARS_BEFORE_SELECTED = 5;
const YEARS_AFTER_SELECTED = 5;
const MENSTRUATION_HEADER_COLOR = '#EA4087';
const MONTHS_BEFORE_SELECTED = 60;
const MONTHS_AFTER_SELECTED = 60;
const WEEK_DAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const DEFAULT_DATE = new Date(2026, 6, 21);
const CYCLE_START = new Date(2026, 6, 20);
const CYCLE_LENGTH = 28;
const SYMPTOMS_LOG_DATE = new Date(2026, 7, 2);
const SYMPTOM_LOG_DATE_KEYS = new Set(
  [new Date(2026, 6, 28), new Date(2026, 6, 31), SYMPTOMS_LOG_DATE].map(
    dateKey,
  ),
);
const PERIOD_DATE_KEYS = new Set(
  Array.from({ length: 5 }, (_, index) =>
    dateKey(new Date(2026, 6, 20 + index)),
  ),
);
const FERTILE_DATE_KEYS = new Set(
  Array.from({ length: 6 }, (_, index) =>
    dateKey(new Date(2026, 6, 25 + index)),
  ),
);
const OVULATION_DATE_KEY = dateKey(new Date(2026, 6, 28));
const EMPTY_PERIOD_DATE_KEYS = new Set<string>();
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
const AnimatedHeaderShape = Animated.createAnimatedComponent(HeaderShape);

type CalendarPageModalProps = {
  visible: boolean;
  onClose: () => void;
  initialDate?: Date;
  onAddSymptoms?: (date: Date) => void;
  symptomDateKeys?: ReadonlySet<string>;
  allowPeriodMarking?: boolean;
  cycleLengthDays?: number;
  lastPeriodStartAt?: number;
  periodDateKeys?: ReadonlySet<string>;
  onSavePeriodDateKeys?: (
    dateKeys: ReadonlySet<string>,
  ) => void | Promise<void>;
  pregnancyMode?: boolean;
};

type CalendarPageVariant = 'backup' | 'continuous';
type CalendarViewMode = 'month' | 'year';

const calendarViewModes: ReadonlyArray<{
  value: CalendarViewMode;
  label: string;
}> = [
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
];

type CalendarPageBaseProps = CalendarPageModalProps & {
  variant: CalendarPageVariant;
};

type CalendarCell = {
  date: Date;
  inCurrentMonth: boolean;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayTimestamp(date: Date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function periodDayOrdinal(date: Date, periodDates: ReadonlySet<string>) {
  let ordinal = 1;
  const cursor = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - 1,
  );

  while (periodDates.has(dateKey(cursor)) && ordinal < 31) {
    ordinal += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return ordinal;
}

type DayForecastKind =
  'fertile' | 'menstruation' | 'neutral' | 'ovulation' | 'upcoming';

type DayForecast = {
  cycleDay: number;
  description: string;
  kind: DayForecastKind;
  title: string;
};

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

const NO_CYCLE_FORECAST: DayForecast = {
  cycleDay: 0,
  description: 'Отметьте дни месячных, чтобы появился прогноз цикла.',
  kind: 'neutral',
  title: 'Нет данных о цикле',
};

const PREGNANCY_FORECAST: DayForecast = {
  cycleDay: 0,
  description:
    'Во время беременности прогнозы менструации и овуляции не отображаются.',
  kind: 'neutral',
  title: 'Беременность',
};

const EMPTY_DATE_KEYS: ReadonlySet<string> = new Set();

export type CalendarSymptomStatusVariant =
  'banner' | 'compact' | 'footer' | 'inline' | 'side' | 'underDate';

function getDayForecast(date: Date): DayForecast {
  const dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const cycleStartUtc = Date.UTC(
    CYCLE_START.getFullYear(),
    CYCLE_START.getMonth(),
    CYCLE_START.getDate(),
  );
  const difference = Math.floor(
    (dateUtc - cycleStartUtc) / DAY_IN_MILLISECONDS,
  );
  const cycleDay =
    (((difference % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;

  if (cycleDay <= 5) {
    return {
      cycleDay,
      description: `Ожидается ${cycleDay}-й день менструации.`,
      kind: 'menstruation',
      title: 'Менструация',
    };
  }

  if (cycleDay === 9) {
    return {
      cycleDay,
      description: 'Предполагаемый день овуляции по прогнозу цикла.',
      kind: 'ovulation',
      title: 'Овуляция',
    };
  }

  if (cycleDay >= 6 && cycleDay <= 11) {
    return {
      cycleDay,
      description: 'Фертильное окно по прогнозу текущего цикла.',
      kind: 'fertile',
      title: 'Повышенная вероятность забеременеть',
    };
  }

  if (cycleDay >= 26) {
    return {
      cycleDay,
      description: 'Менструация ожидается в ближайшие несколько дней.',
      kind: 'upcoming',
      title: 'Ожидается менструация',
    };
  }

  return {
    cycleDay,
    description: 'Особых событий по прогнозу цикла не ожидается.',
    kind: 'neutral',
    title: 'Обычный день цикла',
  };
}

function buildCalculatedCycle(
  periodDates: ReadonlySet<string>,
  lastPeriodStartAt?: number,
  cycleLengthDays?: number,
) {
  return createCycleHistory({
    cycleLengthDays,
    lastPeriodStartAt,
    periodDateKeys: periodDates,
  });
}

function getCalculatedDayForecast(
  date: Date,
  cycle: CycleHistory,
): DayForecast {
  const insight = cycleDayInsight(date, cycle);

  if (insight.kind === 'menstruation') {
    const actualPeriod = cycle.periodDateKeys.has(dateKey(date));
    return {
      cycleDay: insight.cycleDay,
      description: actualPeriod
        ? 'День менструации отмечен пользователем.'
        : `Ожидается ${insight.cycleDay}-й день менструации.`,
      kind: 'menstruation',
      title: 'Менструация',
    };
  }

  if (insight.kind === 'ovulation') {
    return {
      cycleDay: insight.cycleDay,
      description: 'Предполагаемый день овуляции по истории цикла.',
      kind: 'ovulation',
      title: 'Овуляция',
    };
  }

  if (insight.kind === 'fertile') {
    return {
      cycleDay: insight.cycleDay,
      description: 'Фертильное окно рассчитано по истории цикла.',
      kind: 'fertile',
      title:
        insight.probability === 'high'
          ? 'Высокая вероятность забеременеть'
          : 'Средняя вероятность забеременеть',
    };
  }

  if (insight.kind === 'upcoming') {
    return {
      cycleDay: insight.cycleDay,
      description: 'Менструация ожидается в ближайшие несколько дней.',
      kind: 'upcoming',
      title: 'Ожидается менструация',
    };
  }

  return {
    cycleDay: insight.cycleDay,
    description: 'Особых событий по прогнозу цикла не ожидается.',
    kind: 'neutral',
    title: 'Обычный день цикла',
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function monthTitle(date: Date) {
  return capitalize(
    new Intl.DateTimeFormat('ru-RU', {
      month: 'long',
      year: 'numeric',
    }).format(date),
  );
}

function dayTitle(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(date);
}

function makeCalendarCells(month: Date): CalendarCell[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );

    return {
      date,
      inCurrentMonth: date.getMonth() === monthIndex,
    };
  });
}

function CalendarDayGrid({
  cellWidth,
  currentDate,
  forecastForDate,
  maximumSelectableDate,
  month,
  onDayPressIn,
  periodDateKeys,
  periodSelectionMode = false,
  selectOnPressIn = false,
  selectedDate,
  onSelectDate,
  showSymptomLogs = false,
  symptomDateKeys,
  showOutsideDays = true,
  useCycleForecast = false,
}: {
  cellWidth: number;
  currentDate?: Date;
  forecastForDate?: (date: Date) => DayForecast | null;
  maximumSelectableDate?: Date;
  month: Date;
  onDayPressIn?: () => void;
  periodDateKeys?: ReadonlySet<string>;
  periodSelectionMode?: boolean;
  selectOnPressIn?: boolean;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  showSymptomLogs?: boolean;
  symptomDateKeys?: ReadonlySet<string>;
  showOutsideDays?: boolean;
  useCycleForecast?: boolean;
}) {
  const cells = useMemo(() => makeCalendarCells(month), [month]);
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const currentDateKey = currentDate ? dateKey(currentDate) : null;
  const maximumSelectableTimestamp = maximumSelectableDate
    ? dayTimestamp(maximumSelectableDate)
    : Number.POSITIVE_INFINITY;

  return (
    <View style={styles.daysGrid}>
      {cells.map(({ date, inCurrentMonth }) => {
        const key = dateKey(date);
        const futureDisabled =
          periodSelectionMode &&
          dayTimestamp(date) > maximumSelectableTimestamp;

        if (!inCurrentMonth && !showOutsideDays) {
          return (
            <View key={key} style={[styles.dayCell, { width: cellWidth }]} />
          );
        }

        const selected = key === selectedKey;
        const current = key === currentDateKey;
        const symptomsLogged =
          symptomDateKeys?.has(key) ??
          (showSymptomLogs && SYMPTOM_LOG_DATE_KEYS.has(key));
        const forecast = forecastForDate
          ? forecastForDate(date)
          : getDayForecast(date);
        const fertile = useCycleForecast
          ? forecast?.kind === 'fertile' || forecast?.kind === 'ovulation'
          : FERTILE_DATE_KEYS.has(key);
        const forecastPeriod = useCycleForecast
          ? forecast?.kind === 'menstruation'
          : PERIOD_DATE_KEYS.has(key);
        const loggedPeriod = periodDateKeys?.has(key) ?? false;
        const loggedPeriodOrdinal =
          periodSelectionMode && loggedPeriod && periodDateKeys
            ? periodDayOrdinal(date, periodDateKeys)
            : null;
        const period = periodSelectionMode
          ? loggedPeriod
          : forecastPeriod || loggedPeriod;
        const forecastOnlyPeriod =
          useCycleForecast && forecastPeriod && !loggedPeriod;
        const confirmedOrSamplePeriod = useCycleForecast
          ? loggedPeriod
          : period;
        const ovulation = useCycleForecast
          ? forecast?.kind === 'ovulation'
          : key === OVULATION_DATE_KEY;

        return (
          <View key={key} style={[styles.dayCell, { width: cellWidth }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${dayTitle(date)}${
                symptomsLogged ? ', симптомы отмечены' : ''
              }${current ? ', сегодня' : ''}${
                futureDisabled ? ', будущая дата, недоступно' : ''
              }`}
              accessibilityState={{ disabled: futureDisabled, selected }}
              disabled={futureDisabled}
              onTouchStart={onDayPressIn}
              onPressIn={() => {
                if (selectOnPressIn) {
                  onSelectDate(date);
                }
              }}
              onPress={() => {
                if (!selectOnPressIn) {
                  onSelectDate(date);
                }
              }}
              onAccessibilityTap={() => {
                if (selectOnPressIn) {
                  onSelectDate(date);
                }
              }}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.dayCellContent,
                    { width: cellWidth },
                    pressed && styles.dayCellPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      fertile && styles.dayFertile,
                      confirmedOrSamplePeriod && styles.dayPeriod,
                      forecastOnlyPeriod && styles.dayForecastPeriod,
                      periodSelectionMode && period && styles.dayPeriodSelected,
                      ovulation &&
                        !(periodSelectionMode && period) &&
                        styles.dayOvulation,
                      selected && styles.daySelected,
                      futureDisabled && styles.dayFutureDisabled,
                    ]}
                  >
                    <AppText
                      numeric
                      role="label"
                      color={
                        futureDisabled
                          ? 'rgba(115,110,108,0.38)'
                          : selected
                            ? colors.text.inverse
                            : inCurrentMonth
                              ? colors.text.primary
                              : 'rgba(115,110,108,0.34)'
                      }
                      style={styles.dayNumber}
                    >
                      {date.getDate()}
                    </AppText>
                    {symptomsLogged ? (
                      <View style={styles.symptomDayMarker}>
                        <AppText
                          role="caption"
                          weight="semibold"
                          color={colors.text.inverse}
                          style={styles.symptomDayMarkerCheck}
                        >
                          ✓
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  {current && !periodSelectionMode ? (
                    <View
                      style={[
                        styles.todayBadge,
                        fertile && styles.todayBadgeFertile,
                        period && styles.todayBadgeMenstruation,
                        selected && styles.todayBadgeSelected,
                      ]}
                    >
                      <AppText
                        role="caption"
                        weight="semibold"
                        color={colors.text.inverse}
                        style={styles.todayBadgeLabel}
                      >
                        сегодня
                      </AppText>
                    </View>
                  ) : null}
                  {periodSelectionMode && !futureDisabled ? (
                    <View
                      style={[
                        styles.periodTickbox,
                        loggedPeriod && styles.periodTickboxSelected,
                      ]}
                    >
                      {loggedPeriodOrdinal ? (
                        <AppText
                          numeric
                          role="caption"
                          color={colors.text.inverse}
                          style={styles.periodTickboxLabel}
                        >
                          {loggedPeriodOrdinal}
                        </AppText>
                      ) : null}
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.dayMarkerRow,
                        current && styles.dayMarkerRowToday,
                      ]}
                    >
                      {period && !selected ? (
                        <View style={styles.periodMarker} />
                      ) : null}
                      {fertile && !selected ? (
                        <View
                          style={[
                            styles.fertileMarker,
                            ovulation && styles.ovulationMarker,
                          ]}
                        />
                      ) : null}
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function compactMonthTitle(date: Date) {
  return capitalize(
    new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date),
  );
}

function YearMiniMonth({
  currentDate,
  forecastForDate,
  month,
  onSelectDate,
  periodDateKeys,
  selectedDate,
}: {
  currentDate: Date;
  forecastForDate: (date: Date) => DayForecast | null;
  month: Date;
  onSelectDate: (date: Date) => void;
  periodDateKeys: ReadonlySet<string>;
  selectedDate: Date | null;
}) {
  const cells = useMemo(() => makeCalendarCells(month), [month]);
  const currentKey = dateKey(currentDate);
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const currentMonth =
    month.getFullYear() === currentDate.getFullYear() &&
    month.getMonth() === currentDate.getMonth();

  return (
    <View style={styles.yearMiniMonth}>
      <AppText
        role="label"
        weight={currentMonth ? 'semibold' : 'medium'}
        style={styles.yearMiniMonthTitle}
      >
        {compactMonthTitle(month)}
      </AppText>
      <View style={styles.yearMiniDays}>
        {cells.map(({ date, inCurrentMonth }) => {
          const key = dateKey(date);

          if (!inCurrentMonth) {
            return <View key={key} style={styles.yearMiniDayCell} />;
          }

          const forecast = forecastForDate(date);
          const loggedPeriod = periodDateKeys.has(key);
          const forecastPeriod = forecast?.kind === 'menstruation';
          const forecastOnlyPeriod = forecastPeriod && !loggedPeriod;
          const fertile = forecast?.kind === 'fertile';
          const ovulation = forecast?.kind === 'ovulation';
          const current = key === currentKey;
          const selected = key === selectedKey;

          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={dayTitle(date)}
              accessibilityState={{ selected }}
              onPress={() => onSelectDate(date)}
              style={styles.yearMiniDayCell}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.yearMiniDay,
                    fertile && styles.yearMiniDayFertile,
                    ovulation && styles.yearMiniDayOvulation,
                    loggedPeriod && styles.yearMiniDayPeriod,
                    forecastOnlyPeriod && styles.yearMiniDayForecastPeriod,
                    selected && styles.yearMiniDaySelected,
                    pressed && styles.yearMiniDayPressed,
                  ]}
                >
                  <AppText
                    numeric
                    role="caption"
                    weight={current ? 'bold' : 'regular'}
                    color={
                      loggedPeriod
                        ? colors.text.inverse
                        : forecastOnlyPeriod
                          ? colors.brand.primary
                          : fertile || ovulation
                            ? '#2EB7B1'
                            : colors.text.primary
                    }
                    style={styles.yearMiniDayNumber}
                  >
                    {date.getDate()}
                  </AppText>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function YearCalendarSection({
  currentDate,
  forecastForDate,
  onSelectDate,
  periodDateKeys,
  selectedDate,
  year,
}: {
  currentDate: Date;
  forecastForDate: (date: Date) => DayForecast | null;
  onSelectDate: (date: Date) => void;
  periodDateKeys: ReadonlySet<string>;
  selectedDate: Date | null;
  year: number;
}) {
  return (
    <View style={styles.yearSection}>
      <AppText
        numeric
        role="display"
        weight="semibold"
        style={styles.yearTitle}
      >
        {year}
      </AppText>
      <View style={styles.yearMonthsGrid}>
        {Array.from({ length: 12 }, (_, monthIndex) => (
          <YearMiniMonth
            key={monthIndex}
            currentDate={currentDate}
            forecastForDate={forecastForDate}
            month={new Date(year, monthIndex, 1)}
            onSelectDate={onSelectDate}
            periodDateKeys={periodDateKeys}
            selectedDate={selectedDate}
          />
        ))}
      </View>
    </View>
  );
}

function CalendarGlassControl({
  activateOnPressIn = false,
  accessibilityLabel,
  children,
  height,
  headerElevation = false,
  intensity = 58,
  onPress,
  radius,
  style,
  tintColor = colors.surface.headerGlassWash,
  variant = 'regular',
  washColor = colors.surface.headerGlassWash,
  width,
}: {
  activateOnPressIn?: boolean;
  accessibilityLabel: string;
  children: React.ReactNode;
  height: number;
  headerElevation?: boolean;
  intensity?: number;
  onPress?: () => void;
  radius: number;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  variant?: 'clear' | 'regular';
  washColor?: string;
  width: number;
}) {
  const controlStyle: StyleProp<ViewStyle> = [
    style,
    {
      width,
      height,
      borderRadius: radius,
      alignItems: 'center',
      justifyContent: 'center',
    },
  ];
  const contentStyle: StyleProp<ViewStyle> = {
    width,
    height,
    borderRadius: radius,
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (hasNativeLiquidGlass) {
    return (
      <GlassView
        glassEffectStyle={variant}
        tintColor={tintColor}
        colorScheme="light"
        isInteractive
        style={[controlStyle, headerElevation && shadows.control]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPressIn={activateOnPressIn ? onPress : undefined}
          onPress={activateOnPressIn ? undefined : onPress}
          onAccessibilityTap={activateOnPressIn ? onPress : undefined}
        >
          {({ pressed }) => (
            <View style={[contentStyle, pressed && styles.pressed]}>
              {children}
            </View>
          )}
        </Pressable>
      </GlassView>
    );
  }

  return (
    <View
      style={[
        controlStyle,
        Platform.OS === 'android'
          ? headerElevation
            ? androidShadows.control
            : androidShadows.floating
          : headerElevation
            ? shadows.control
            : styles.headerGlassShadow,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPressIn={activateOnPressIn ? onPress : undefined}
        onPress={activateOnPressIn ? undefined : onPress}
        onAccessibilityTap={activateOnPressIn ? onPress : undefined}
      >
        {({ pressed }) => (
          <View style={[contentStyle, pressed && styles.pressed]}>
            <LiquidGlassSurface
              variant={variant}
              tintColor={tintColor}
              colorScheme="light"
              fallbackTint="systemUltraThinMaterialLight"
              intensity={intensity}
              washColor={washColor}
              radius={radius}
            >
              {children}
            </LiquidGlassSurface>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function GlassHeaderButton({
  accessibilityLabel,
  children,
  onPress,
}: {
  accessibilityLabel: string;
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <CalendarGlassControl
      accessibilityLabel={accessibilityLabel}
      width={sizes.touch}
      height={sizes.touch}
      radius={sizes.touch / 2}
      headerElevation
      onPress={onPress}
    >
      {children}
    </CalendarGlassControl>
  );
}

function CalendarGlassGroup({
  children,
  spacing: glassSpacing,
  style,
}: React.PropsWithChildren<{
  spacing: number;
  style: React.ComponentProps<typeof View>['style'];
}>) {
  return hasNativeLiquidGlass ? (
    <GlassContainer spacing={glassSpacing} style={style}>
      {children}
    </GlassContainer>
  ) : (
    <View style={style}>{children}</View>
  );
}

function MonthArrow({
  direction,
  onPress,
}: {
  direction: 'left' | 'right';
  onPress: () => void;
}) {
  return (
    <View style={styles.monthArrow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          direction === 'left' ? 'Предыдущий месяц' : 'Следующий месяц'
        }
        onPress={onPress}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.monthArrowContent,
              pressed && styles.monthArrowPressed,
            ]}
          >
            <BackIcon
              width={18}
              height={18}
              style={direction === 'left' ? styles.backIconLeft : undefined}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

function SymptomStatusMark({
  variant,
}: {
  variant: CalendarSymptomStatusVariant;
}) {
  const compact = variant === 'compact';
  const side = variant === 'side';
  const underDate = variant === 'underDate';

  return (
    <View
      style={[
        styles.symptomStatusMark,
        variant === 'banner' && styles.symptomStatusBanner,
        compact && styles.symptomStatusCompact,
        variant === 'footer' && styles.symptomStatusFooter,
        variant === 'inline' && styles.symptomStatusInline,
        side && styles.symptomStatusSide,
        underDate && styles.symptomStatusUnderDate,
      ]}
    >
      <View
        style={[
          styles.symptomStatusCheck,
          compact && styles.symptomStatusCheckCompact,
          side && styles.symptomStatusCheckSide,
          underDate && styles.symptomStatusCheckUnderDate,
        ]}
      >
        <AppText
          role="caption"
          weight="semibold"
          color={colors.text.inverse}
          style={[
            styles.symptomStatusCheckmark,
            underDate && styles.symptomStatusCheckmarkSmall,
          ]}
        >
          ✓
        </AppText>
      </View>
      <AppText
        role="caption"
        weight="medium"
        color={colors.brand.success}
        style={[
          styles.symptomStatusLabel,
          compact && styles.symptomStatusLabelCompact,
          side && styles.symptomStatusLabelSide,
          underDate && styles.symptomStatusLabelUnderDate,
        ]}
      >
        {compact
          ? 'Отмечены'
          : side
            ? 'Симптомы\nотмечены'
            : 'Симптомы успешно отмечены'}
      </AppText>
    </View>
  );
}

function CalendarDayDetailsCard({
  date,
  forecast,
  hasLoggedSymptoms,
  onAddPress,
  symptomStatusVariant = 'banner',
}: {
  date: Date;
  forecast: DayForecast;
  hasLoggedSymptoms: boolean;
  onAddPress?: () => void;
  symptomStatusVariant?: CalendarSymptomStatusVariant;
}) {
  const showBanner = hasLoggedSymptoms && symptomStatusVariant === 'banner';
  const showCompact = hasLoggedSymptoms && symptomStatusVariant === 'compact';
  const showFooter = hasLoggedSymptoms && symptomStatusVariant === 'footer';
  const showInline = hasLoggedSymptoms && symptomStatusVariant === 'inline';
  const showSide = hasLoggedSymptoms && symptomStatusVariant === 'side';
  const showUnderDate =
    hasLoggedSymptoms && symptomStatusVariant === 'underDate';

  return (
    <View style={styles.dayDetailsCard}>
      <View style={styles.dayDetailsHeader}>
        <View style={styles.dayDetailsDateCopy}>
          <AppText
            role="heading"
            weight="semibold"
            style={styles.dayDetailsDate}
          >
            {dayTitle(date)}
          </AppText>
          {showUnderDate ? <SymptomStatusMark variant="underDate" /> : null}
        </View>

        <View style={styles.dayDetailsActionGroup}>
          <AppText
            role="label"
            weight="medium"
            color={colors.brand.primary}
            style={styles.dayDetailsActionLabel}
          >
            Симптомы
          </AppText>
          <View style={styles.dayDetailsAddButton}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Добавить симптомы на ${dayTitle(date)}`}
              onPress={onAddPress}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.dayDetailsAddButtonContent,
                    pressed && styles.dayDetailsAddButtonPressed,
                  ]}
                >
                  <AddIcon width={20} height={20} />
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {showBanner ? <SymptomStatusMark variant="banner" /> : null}

      <View
        style={[
          styles.dayDetailsDivider,
          showBanner && styles.dayDetailsDividerAfterBanner,
        ]}
      />

      <View
        style={[
          styles.dayDetailsForecastRow,
          showFooter && styles.dayDetailsForecastRowWithFooter,
        ]}
      >
        {showSide ? (
          <SymptomStatusMark variant="side" />
        ) : (
          <View
            style={[
              styles.dayDetailsIndicator,
              forecast.kind === 'menstruation' &&
                styles.dayDetailsIndicatorPeriod,
              forecast.kind === 'fertile' && styles.dayDetailsIndicatorFertile,
              forecast.kind === 'ovulation' &&
                styles.dayDetailsIndicatorOvulation,
              forecast.kind === 'upcoming' &&
                styles.dayDetailsIndicatorUpcoming,
              forecast.kind === 'neutral' && styles.dayDetailsIndicatorNeutral,
            ]}
          />
        )}

        <View style={styles.dayDetailsForecastCopy}>
          {showInline ? <SymptomStatusMark variant="inline" /> : null}
          <View style={styles.dayDetailsForecastTitleRow}>
            <AppText
              role="body"
              weight="semibold"
              style={styles.dayDetailsForecastTitle}
            >
              {forecast.title}
            </AppText>
            {showCompact ? <SymptomStatusMark variant="compact" /> : null}
          </View>
          <AppText
            role="label"
            color={colors.text.secondary}
            style={styles.dayDetailsDescription}
          >
            {forecast.description}
          </AppText>
        </View>

        <View style={styles.cycleDayPill}>
          <AppText
            role="caption"
            color={colors.brand.primary}
            numberOfLines={1}
            style={styles.cycleDayLabel}
          >
            {`День цикла ${forecast.cycleDay || '—'}`}
          </AppText>
        </View>
      </View>

      {showFooter ? (
        <View style={styles.symptomStatusFooterPosition}>
          <SymptomStatusMark variant="footer" />
        </View>
      ) : null}
    </View>
  );
}

export function CalendarSymptomStatusPreview({
  variant,
}: {
  variant: CalendarSymptomStatusVariant;
}) {
  return (
    <View style={styles.dayDetailsPreview}>
      <CalendarDayDetailsCard
        date={SYMPTOMS_LOG_DATE}
        forecast={getDayForecast(SYMPTOMS_LOG_DATE)}
        hasLoggedSymptoms
        symptomStatusVariant={variant}
      />
    </View>
  );
}

function CalendarPageModalBase({
  visible,
  onClose,
  initialDate = DEFAULT_DATE,
  onAddSymptoms,
  symptomDateKeys,
  allowPeriodMarking = true,
  cycleLengthDays,
  lastPeriodStartAt,
  periodDateKeys: savedPeriodDateKeys = EMPTY_PERIOD_DATE_KEYS,
  onSavePeriodDateKeys,
  pregnancyMode = false,
  variant,
}: CalendarPageBaseProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const monthListRef = useRef<FlatList<Date>>(null);
  const initialMonthPositionedRef = useRef(false);
  const protectedDayInteractionRef = useRef(false);
  const periodSaveInFlightRef = useRef(false);
  const returnButtonProgress = useRef(new Animated.Value(0)).current;
  const daySheetProgress = useRef(new Animated.Value(0)).current;
  const viewProgress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    variant === 'continuous' ? null : initialDate,
  );
  const [currentMonthVisible, setCurrentMonthVisible] = useState(true);
  const [returnDirection, setReturnDirection] = useState<'up' | 'down'>('up');
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  const [periodMarkingMode, setPeriodMarkingMode] = useState(false);
  const [periodDateKeys, setPeriodDateKeys] = useState<Set<string>>(
    () => new Set(savedPeriodDateKeys),
  );
  const [periodDraftDateKeys, setPeriodDraftDateKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedDate(variant === 'continuous' ? null : initialDate);
    setVisibleMonth(
      new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
    );
    setCurrentMonthVisible(true);
    setReturnDirection('up');
    setDayDetailsVisible(false);
    setPeriodMarkingMode(false);
    setPeriodDateKeys(new Set(savedPeriodDateKeys));
    setPeriodDraftDateKeys(new Set(savedPeriodDateKeys));
    setViewMode('month');
    initialMonthPositionedRef.current = false;
    returnButtonProgress.setValue(0);
    daySheetProgress.setValue(0);
    viewProgress.setValue(0);
  }, [
    daySheetProgress,
    initialDate,
    returnButtonProgress,
    savedPeriodDateKeys,
    viewProgress,
    visible,
  ]);

  useEffect(() => {
    if (!pregnancyMode) {
      return;
    }

    setPeriodMarkingMode(false);
    setPeriodDraftDateKeys(new Set());
  }, [pregnancyMode]);

  useEffect(() => {
    const target = viewMode === 'year' ? 1 : 0;

    viewProgress.stopAnimation();
    if (reduceMotion) {
      viewProgress.setValue(target);
      return;
    }

    Animated.spring(viewProgress, {
      toValue: target,
      damping: 24,
      stiffness: 230,
      mass: 0.78,
      overshootClamping: true,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, viewMode, viewProgress]);

  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const headerTop = getHeaderTop(insets.top, scale);
  const anchorMonthKey = `${initialDate.getFullYear()}-${initialDate.getMonth()}`;
  const monthSequence = useMemo(
    () =>
      Array.from(
        { length: MONTHS_BEFORE_SELECTED + MONTHS_AFTER_SELECTED + 1 },
        (_, index) =>
          new Date(
            initialDate.getFullYear(),
            initialDate.getMonth() + index - MONTHS_BEFORE_SELECTED,
            1,
          ),
      ),
    [initialDate],
  );
  const yearSequence = useMemo(
    () =>
      Array.from(
        { length: YEARS_BEFORE_SELECTED + YEARS_AFTER_SELECTED + 1 },
        (_, index) => initialDate.getFullYear() + index - YEARS_BEFORE_SELECTED,
      ),
    [initialDate],
  );
  const detailsDate = selectedDate ?? initialDate;
  const visiblePeriodDateKeys = pregnancyMode
    ? EMPTY_DATE_KEYS
    : periodDateKeys;
  const calculatedCycle = useMemo(
    () =>
      pregnancyMode
        ? null
        : buildCalculatedCycle(
            visiblePeriodDateKeys,
            lastPeriodStartAt,
            cycleLengthDays,
          ),
    [
      cycleLengthDays,
      lastPeriodStartAt,
      pregnancyMode,
      visiblePeriodDateKeys,
    ],
  );
  const calculatedForecastForDate = useMemo(
    () =>
      calculatedCycle
        ? (date: Date) => getCalculatedDayForecast(date, calculatedCycle)
        : (_date: Date) => null,
    [calculatedCycle],
  );
  const yearForecastForDate = useMemo(
    () =>
      calculatedCycle
        ? (date: Date) => getCalculatedDayForecast(date, calculatedCycle)
        : (_date: Date) => null,
    [calculatedCycle],
  );
  const headerDate = dayTitle(
    variant === 'continuous' ? initialDate : detailsDate,
  );
  const selectedForecast = pregnancyMode
    ? PREGNANCY_FORECAST
    : calculatedCycle
      ? getCalculatedDayForecast(detailsDate, calculatedCycle)
      : NO_CYCLE_FORECAST;
  const todayForecast = pregnancyMode
    ? PREGNANCY_FORECAST
    : calculatedCycle
      ? getCalculatedDayForecast(initialDate, calculatedCycle)
      : NO_CYCLE_FORECAST;
  const headerForecast = selectedDate ? selectedForecast : todayForecast;
  const selectedHeaderIsFertile =
    headerForecast.kind === 'fertile' || headerForecast.kind === 'ovulation';
  const selectedHeaderIsMenstruation = headerForecast.kind === 'menstruation';
  const selectedHeaderIsColored =
    selectedHeaderIsFertile || selectedHeaderIsMenstruation;
  const selectedHeaderColor = selectedHeaderIsFertile
    ? colors.brand.success
    : selectedHeaderIsMenstruation
      ? MENSTRUATION_HEADER_COLOR
      : colors.surface.raised;
  const selectedHeaderShadowColor = selectedHeaderIsColored
    ? selectedHeaderColor
    : colors.brand.primary;
  const selectedHeaderLabelColor = selectedHeaderIsColored
    ? 'rgba(255,255,255,0.82)'
    : '#5D5D5D';
  const todayInsight = calculatedCycle
    ? cycleDayInsight(initialDate, calculatedCycle, initialDate)
    : undefined;
  const currentCycleDay = todayInsight?.cycleDay ?? 0;
  const delayDays = todayInsight?.delayDays ?? 0;
  const fertilityLabel = !calculatedCycle
    ? '—'
    : delayDays > 0
      ? 'Низкая'
      : todayInsight?.probability === 'high'
        ? 'Высокая'
        : todayInsight?.probability === 'medium'
          ? 'Средняя'
          : 'Низкая';
  const fertilityColor =
    fertilityLabel === 'Высокая' ? colors.brand.success : colors.text.secondary;
  const isTodayMenstruation = todayForecast.kind === 'menstruation';
  const isTodayOvulation = todayForecast.kind === 'ovulation';
  const isTodayFertile =
    todayForecast.kind === 'fertile' || todayForecast.kind === 'ovulation';
  const daysUntilPeriod = calculatedCycle
    ? Math.max(0, calculatedCycle.cycleLengthDays - currentCycleDay + 1)
    : 0;
  const hasLoggedSymptoms =
    symptomDateKeys?.has(dateKey(detailsDate)) ??
    (variant === 'backup' && SYMPTOM_LOG_DATE_KEYS.has(dateKey(detailsDate)));
  const canMarkPeriod = allowPeriodMarking && !pregnancyMode;
  const sheetBottom = Math.max(6, insets.bottom / scale - 4);
  const returnButtonBottom = sheetBottom + DAY_DETAILS_HEIGHT + spacing.sm;
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
  }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Date>[] }) => {
      if (!initialMonthPositionedRef.current) {
        return;
      }

      const indexes = viewableItems
        .map((item) => item.index)
        .filter((index): index is number => index !== null)
        .sort((left, right) => left - right);

      if (indexes.length === 0) {
        return;
      }

      const anchorVisible = indexes.includes(MONTHS_BEFORE_SELECTED);
      setCurrentMonthVisible(anchorVisible);

      if (!anchorVisible) {
        setReturnDirection(indexes[0] > MONTHS_BEFORE_SELECTED ? 'up' : 'down');
      }
    },
  ).current;

  useEffect(() => {
    if (!visible || variant !== 'continuous') {
      return;
    }

    requestAnimationFrame(() => {
      monthListRef.current?.scrollToOffset({
        animated: false,
        offset: MONTHS_BEFORE_SELECTED * MONTH_SECTION_HEIGHT,
      });
      initialMonthPositionedRef.current = true;
      setCurrentMonthVisible(true);
    });
  }, [anchorMonthKey, variant, visible]);

  useEffect(() => {
    const target = variant === 'continuous' && !currentMonthVisible ? 1 : 0;

    returnButtonProgress.stopAnimation();
    if (reduceMotion) {
      returnButtonProgress.setValue(target);
      return;
    }

    Animated.spring(returnButtonProgress, {
      toValue: target,
      damping: 18,
      stiffness: 220,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  }, [currentMonthVisible, reduceMotion, returnButtonProgress, variant]);

  useEffect(() => {
    const target = variant === 'continuous' && dayDetailsVisible ? 1 : 0;

    daySheetProgress.stopAnimation();
    if (reduceMotion) {
      daySheetProgress.setValue(target);
      return;
    }

    Animated.spring(daySheetProgress, {
      toValue: target,
      damping: 22,
      stiffness: 230,
      mass: 0.78,
      useNativeDriver: true,
    }).start();
  }, [dayDetailsVisible, daySheetProgress, reduceMotion, variant]);

  const shiftMonth = (direction: -1 | 1) => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }

    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
  };

  const selectDate = (date: Date) => {
    if (variant === 'continuous' && periodMarkingMode) {
      const key = dateKey(date);
      const todayTimestamp = dayTimestamp(initialDate);

      if (dayTimestamp(date) > todayTimestamp) {
        return;
      }

      setPeriodDraftDateKeys((current) => {
        const next = new Set(current);
        if (next.has(key)) {
          next.delete(key);
        } else {
          for (let offset = 0; offset < 5; offset += 1) {
            const rangeDate = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate() + offset,
            );

            if (dayTimestamp(rangeDate) <= todayTimestamp) {
              next.add(dateKey(rangeDate));
            }
          }
        }
        return next;
      });

      if (Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }
      return;
    }

    const repeatedContinuousSelection =
      variant === 'continuous' &&
      selectedDate !== null &&
      dateKey(selectedDate) === dateKey(date);

    if (repeatedContinuousSelection) {
      setSelectedDate(null);
      setDayDetailsVisible(false);

      if (Platform.OS !== 'web') {
        void Haptics.selectionAsync();
      }
      return;
    }

    setSelectedDate(date);
    if (variant === 'continuous') {
      setDayDetailsVisible(true);
    }
    if (
      variant === 'backup' &&
      (date.getMonth() !== visibleMonth.getMonth() ||
        date.getFullYear() !== visibleMonth.getFullYear())
    ) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }

    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
  };

  const showAddMenu = (date = selectedDate ?? initialDate) => {
    Alert.alert(
      variant === 'backup'
        ? 'Добавить запись'
        : `Добавить запись · ${dayTitle(date)}`,
      'Что вы хотите отметить в календаре?',
      [
        {
          text: 'Симптом',
          onPress: () => onAddSymptoms?.(date),
        },
        { text: 'Результат теста' },
        { text: 'Отмена', style: 'cancel' },
      ],
    );
  };

  const dismissDayDetails = () => {
    setDayDetailsVisible(false);
    if (variant === 'continuous') {
      setSelectedDate(null);
    }
  };

  const enterPeriodMarkingMode = () => {
    if (!canMarkPeriod) return;
    setSelectedDate(null);
    setDayDetailsVisible(false);
    setPeriodDraftDateKeys(new Set(visiblePeriodDateKeys));
    setPeriodMarkingMode(true);

    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const exitPeriodMarkingMode = () => {
    setPeriodDraftDateKeys(new Set(periodDateKeys));
    setPeriodMarkingMode(false);

    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
  };

  const savePeriodMarking = async () => {
    if (periodSaveInFlightRef.current) return;
    periodSaveInFlightRef.current = true;
    const nextDateKeys = new Set(periodDraftDateKeys);
    try {
      await onSavePeriodDateKeys?.(nextDateKeys);
      setPeriodDateKeys(nextDateKeys);
      setPeriodMarkingMode(false);

      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    } catch (error) {
      console.error('Saving period dates failed', error);
      Alert.alert(
        'Не удалось сохранить дни месячных',
        'Попробуйте ещё раз. Уже сохранённые данные не изменены.',
      );
    } finally {
      periodSaveInFlightRef.current = false;
    }
  };

  const scrollToCurrentMonth = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    monthListRef.current?.scrollToOffset({
      animated: !reduceMotion,
      offset: MONTHS_BEFORE_SELECTED * MONTH_SECTION_HEIGHT,
    });
    dismissDayDetails();
  };

  const changeViewMode = (nextMode: CalendarViewMode) => {
    if (nextMode === viewMode) {
      return;
    }

    setViewMode(nextMode);
    setDayDetailsVisible(false);
    setPeriodMarkingMode(false);

    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
  };

  const selectDateFromYear = (date: Date) => {
    const monthOffset =
      (date.getFullYear() - initialDate.getFullYear()) * 12 +
      date.getMonth() -
      initialDate.getMonth();
    const targetIndex = Math.max(
      0,
      Math.min(monthSequence.length - 1, MONTHS_BEFORE_SELECTED + monthOffset),
    );

    setSelectedDate(date);
    setDayDetailsVisible(false);
    setViewMode('month');
    setCurrentMonthVisible(targetIndex === MONTHS_BEFORE_SELECTED);
    requestAnimationFrame(() => {
      monthListRef.current?.scrollToOffset({
        animated: false,
        offset: targetIndex * MONTH_SECTION_HEIGHT,
      });
    });

    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
  };

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <StatusBar style="dark" hidden={false} />
        <View
          style={{
            width: DESIGN_WIDTH * scale,
            height: DESIGN_HEIGHT * scale,
          }}
        >
          <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
            <View
              style={styles.canvas}
              onStartShouldSetResponderCapture={() => {
                protectedDayInteractionRef.current = false;
                return false;
              }}
              onTouchEnd={() => {
                if (
                  variant === 'continuous' &&
                  dayDetailsVisible &&
                  !protectedDayInteractionRef.current
                ) {
                  dismissDayDetails();
                }
              }}
            >
              {variant === 'backup' ? (
                <ScrollView
                  contentInsetAdjustmentBehavior="never"
                  showsVerticalScrollIndicator={false}
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                >
                  <View style={styles.calendarCard}>
                    <View style={styles.monthHeader}>
                      <MonthArrow
                        direction="left"
                        onPress={() => shiftMonth(-1)}
                      />
                      <AppText role="heading" weight="semibold">
                        {monthTitle(visibleMonth)}
                      </AppText>
                      <MonthArrow
                        direction="right"
                        onPress={() => shiftMonth(1)}
                      />
                    </View>

                    <View style={styles.weekRow}>
                      {WEEK_DAYS.map((day, index) => (
                        <AppText
                          key={day}
                          role="caption"
                          weight="medium"
                          color={
                            index > 4
                              ? colors.brand.primary
                              : colors.text.secondary
                          }
                          style={styles.weekDay}
                        >
                          {day}
                        </AppText>
                      ))}
                    </View>

                    <CalendarDayGrid
                      cellWidth={(sizes.contentWidth - spacing.md * 2) / 7}
                      currentDate={initialDate}
                      month={visibleMonth}
                      selectedDate={selectedDate}
                      onSelectDate={selectDate}
                    />
                  </View>

                  <View style={styles.selectedSection}>
                    <AppText role="caption" color={colors.text.secondary}>
                      {headerDate.toUpperCase()}
                    </AppText>
                    <View style={styles.selectedCard}>
                      <View style={styles.selectedAccent} />
                      <View style={styles.selectedCopy}>
                        <AppText role="body" weight="semibold">
                          Высокая вероятность забеременеть
                        </AppText>
                        <AppText role="label" color={colors.text.secondary}>
                          День цикла 2 · прогноз фертильности
                        </AppText>
                      </View>
                    </View>
                  </View>

                  <View style={styles.forecastSection}>
                    <AppText role="heading" weight="semibold">
                      Прогноз цикла
                    </AppText>
                    <View style={styles.forecastCard}>
                      <View style={styles.forecastRow}>
                        <View style={[styles.legendDot, styles.legendPeriod]} />
                        <View style={styles.forecastCopy}>
                          <AppText role="label" weight="medium">
                            Менструация
                          </AppText>
                          <AppText role="caption" color={colors.text.secondary}>
                            20–24 июля
                          </AppText>
                        </View>
                      </View>
                      <View style={styles.forecastDivider} />
                      <View style={styles.forecastRow}>
                        <View
                          style={[styles.legendDot, styles.legendFertile]}
                        />
                        <View style={styles.forecastCopy}>
                          <AppText role="label" weight="medium">
                            Фертильное окно
                          </AppText>
                          <AppText role="caption" color={colors.text.secondary}>
                            25–30 июля
                          </AppText>
                        </View>
                      </View>
                      <View style={styles.forecastDivider} />
                      <View style={styles.forecastRow}>
                        <View
                          style={[styles.legendDot, styles.legendOvulation]}
                        />
                        <View style={styles.forecastCopy}>
                          <AppText role="label" weight="medium">
                            Предполагаемая овуляция
                          </AppText>
                          <AppText role="caption" color={colors.text.secondary}>
                            28 июля
                          </AppText>
                        </View>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              ) : (
                <>
                  <Animated.View
                    pointerEvents={viewMode === 'month' ? 'auto' : 'none'}
                    style={[
                      styles.calendarViewLayer,
                      {
                        opacity: viewProgress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 0],
                        }),
                        transform: [
                          {
                            scale: viewProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 0.94],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    {calculatedCycle ? (
                      <View
                        style={[styles.yearLegend, { top: headerTop + 60 }]}
                      >
                        <View style={styles.yearLegendItem}>
                          <View
                            style={[
                              styles.yearLegendMarker,
                              styles.yearLegendMarkerLogged,
                            ]}
                          />
                          <AppText role="caption" color={colors.text.secondary}>
                            Отмечено
                          </AppText>
                        </View>
                        <View style={styles.yearLegendItem}>
                          <View
                            style={[
                              styles.yearLegendMarker,
                              styles.yearLegendMarkerForecast,
                            ]}
                          />
                          <AppText role="caption" color={colors.text.secondary}>
                            Прогноз
                          </AppText>
                        </View>
                        <View style={styles.yearLegendItem}>
                          <View
                            style={[
                              styles.yearLegendMarker,
                              styles.yearLegendMarkerFertile,
                            ]}
                          />
                          <AppText role="caption" color={colors.text.secondary}>
                            Фертильность
                          </AppText>
                        </View>
                        <View style={styles.yearLegendItem}>
                          <View
                            style={[
                              styles.yearLegendMarker,
                              styles.yearLegendMarkerOvulation,
                            ]}
                          />
                          <AppText role="caption" color={colors.text.secondary}>
                            Овуляция
                          </AppText>
                        </View>
                      </View>
                    ) : null}
                    <FlatList
                      ref={monthListRef}
                      data={monthSequence}
                      keyExtractor={(month) =>
                        `${month.getFullYear()}-${month.getMonth()}`
                      }
                      renderItem={({ item: month }) => {
                        const initialMonthTimestamp = dayTimestamp(
                          new Date(
                            initialDate.getFullYear(),
                            initialDate.getMonth(),
                            1,
                          ),
                        );
                        const futureMonth =
                          dayTimestamp(
                            new Date(month.getFullYear(), month.getMonth(), 1),
                          ) > initialMonthTimestamp;

                        return (
                          <View style={styles.continuousMonth}>
                            <AppText
                              role="title"
                              weight="semibold"
                              color={
                                futureMonth
                                  ? colors.text.secondary
                                  : colors.brand.primary
                              }
                              style={styles.continuousMonthTitle}
                            >
                              {monthTitle(month)}
                            </AppText>
                            <View style={styles.continuousWeekRow}>
                              {WEEK_DAYS.map((day, index) => (
                                <AppText
                                  key={day}
                                  role="caption"
                                  weight="medium"
                                  color={
                                    index > 4
                                      ? colors.brand.primary
                                      : colors.text.secondary
                                  }
                                  style={styles.weekDay}
                                >
                                  {day}
                                </AppText>
                              ))}
                            </View>
                            <CalendarDayGrid
                              cellWidth={sizes.contentWidth / 7}
                              currentDate={initialDate}
                              forecastForDate={calculatedForecastForDate}
                              maximumSelectableDate={initialDate}
                              month={month}
                              onDayPressIn={() => {
                                protectedDayInteractionRef.current = true;
                              }}
                              periodDateKeys={
                                pregnancyMode
                                  ? EMPTY_DATE_KEYS
                                  : periodMarkingMode
                                    ? periodDraftDateKeys
                                    : visiblePeriodDateKeys
                              }
                              periodSelectionMode={periodMarkingMode}
                              selectOnPressIn={!periodMarkingMode}
                              selectedDate={selectedDate}
                              onSelectDate={selectDate}
                              symptomDateKeys={symptomDateKeys}
                              showOutsideDays={false}
                              useCycleForecast
                            />
                            <View style={styles.continuousMonthDivider} />
                          </View>
                        );
                      }}
                      getItemLayout={(_, index) => ({
                        index,
                        length: MONTH_SECTION_HEIGHT,
                        offset: MONTH_SECTION_HEIGHT * index,
                      })}
                      initialNumToRender={3}
                      maxToRenderPerBatch={4}
                      windowSize={5}
                      onViewableItemsChanged={onViewableItemsChanged}
                      viewabilityConfig={viewabilityConfig}
                      contentInsetAdjustmentBehavior="never"
                      showsVerticalScrollIndicator={false}
                      style={styles.scroll}
                      contentContainerStyle={[
                        styles.continuousScrollContent,
                        periodMarkingMode && styles.periodMarkingScrollContent,
                      ]}
                      extraData={{
                        periodDateKeys: visiblePeriodDateKeys,
                        periodDraftDateKeys,
                        periodMarkingMode,
                        pregnancyMode,
                        selectedDate,
                      }}
                    />
                  </Animated.View>

                  <Animated.View
                    pointerEvents={viewMode === 'year' ? 'auto' : 'none'}
                    style={[
                      styles.calendarViewLayer,
                      {
                        opacity: viewProgress,
                        transform: [
                          {
                            scale: viewProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.94, 1],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <FlatList
                      data={yearSequence}
                      keyExtractor={(year) => String(year)}
                      renderItem={({ item: year }) => (
                        <YearCalendarSection
                          currentDate={initialDate}
                          forecastForDate={yearForecastForDate}
                          onSelectDate={selectDateFromYear}
                          periodDateKeys={visiblePeriodDateKeys}
                          selectedDate={selectedDate}
                          year={year}
                        />
                      )}
                      getItemLayout={(_, index) => ({
                        index,
                        length: YEAR_SECTION_HEIGHT,
                        offset: YEAR_SECTION_HEIGHT * index,
                      })}
                      initialScrollIndex={YEARS_BEFORE_SELECTED}
                      initialNumToRender={2}
                      maxToRenderPerBatch={3}
                      windowSize={5}
                      contentInsetAdjustmentBehavior="never"
                      showsVerticalScrollIndicator={false}
                      style={[
                        styles.yearScroll,
                        { top: headerTop + (calculatedCycle ? 86 : 62) },
                      ]}
                      contentContainerStyle={styles.yearScrollContent}
                      extraData={{
                        periodDateKeys: visiblePeriodDateKeys,
                        pregnancyMode,
                        selectedDate,
                      }}
                    />
                  </Animated.View>
                </>
              )}

              <AnimatedHeaderShape
                pointerEvents="none"
                width={DESIGN_WIDTH}
                height={HEADER_SHAPE_HEIGHT}
                color={selectedHeaderColor}
                style={[
                  styles.headerShape,
                  { shadowColor: selectedHeaderShadowColor },
                  periodMarkingMode && styles.periodModeHidden,
                  variant === 'continuous' && {
                    opacity: viewProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0],
                    }),
                  },
                ]}
              />

              {!periodMarkingMode ? (
                <CalendarGlassGroup
                  spacing={12}
                  style={[styles.headerControls, { top: headerTop }]}
                >
                  <GlassHeaderButton
                    accessibilityLabel="Закрыть календарь"
                    onPress={onClose}
                  >
                    <BackIcon
                      width={25}
                      height={25}
                      style={styles.headerBackIcon}
                    />
                  </GlassHeaderButton>

                  {variant === 'continuous' ? (
                    <View style={styles.calendarModeHeaderSlot}>
                      <SegmentedSwitcher
                        accessibilityLabel="Масштаб календаря"
                        options={calendarViewModes}
                        value={viewMode}
                        onChange={changeViewMode}
                      />
                    </View>
                  ) : (
                    <CalendarGlassControl
                      accessibilityLabel="Выбранная дата"
                      width={156}
                      height={sizes.touch}
                      radius={sizes.touch / 2}
                      headerElevation
                    >
                      <AppText
                        role="body"
                        weight="medium"
                        color={colors.brand.primary}
                        style={styles.headerDate}
                      >
                        {headerDate}
                      </AppText>
                    </CalendarGlassControl>
                  )}

                  <GlassHeaderButton
                    accessibilityLabel="Добавить запись"
                    onPress={() => showAddMenu()}
                  >
                    <AddIcon width={24} height={24} />
                  </GlassHeaderButton>
                </CalendarGlassGroup>
              ) : (
                <View style={[styles.periodModeClose, { top: headerTop }]}>
                  <CalendarGlassControl
                    activateOnPressIn
                    accessibilityLabel="Завершить выбор дней месячных"
                    onPress={exitPeriodMarkingMode}
                    width={sizes.touch}
                    height={sizes.touch}
                    radius={sizes.touch / 2}
                    headerElevation
                    intensity={64}
                    tintColor="transparent"
                    variant="clear"
                    washColor="transparent"
                  >
                    <View style={styles.closeIcon}>
                      <View
                        style={[styles.closeIconLine, styles.closeIconLineUp]}
                      />
                      <View
                        style={[styles.closeIconLine, styles.closeIconLineDown]}
                      />
                    </View>
                  </CalendarGlassControl>
                </View>
              )}

              {!pregnancyMode ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.metrics,
                  { top: headerTop + 61 },
                  periodMarkingMode && styles.periodModeHidden,
                  variant === 'continuous' && {
                    opacity: viewProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0],
                    }),
                  },
                ]}
              >
                <View style={styles.metricNarrow}>
                  <AppText
                    numeric
                    color={
                      selectedHeaderIsColored
                        ? colors.text.inverse
                        : isTodayFertile && !isTodayMenstruation
                          ? colors.brand.success
                          : colors.brand.primary
                    }
                    style={styles.metricValue}
                  >
                    {isTodayMenstruation
                      ? '—'
                      : isTodayFertile
                        ? '+'
                        : calculatedCycle
                          ? delayDays || daysUntilPeriod
                          : '—'}
                  </AppText>
                  <AppText
                    role="caption"
                    numberOfLines={1}
                    color={selectedHeaderLabelColor}
                    style={[
                      styles.metricLabel,
                      (isTodayMenstruation || isTodayFertile) &&
                        styles.metricStatusLabel,
                    ]}
                  >
                    {isTodayMenstruation
                      ? 'Менструация'
                      : isTodayOvulation
                        ? 'Овуляция'
                        : isTodayFertile
                          ? 'Фертильное окно'
                          : delayDays > 0
                            ? 'Задержка'
                            : 'До месячных'}
                  </AppText>
                </View>
                <View
                  style={[
                    styles.metricDivider,
                    selectedHeaderIsColored && styles.metricDividerOnColor,
                  ]}
                />
                <View style={styles.metricWide}>
                  <AppText
                    weight="medium"
                    color={
                      selectedHeaderIsColored
                        ? colors.text.inverse
                        : fertilityColor
                    }
                    style={styles.metricValue}
                  >
                    {fertilityLabel}
                  </AppText>
                  <AppText
                    role="caption"
                    numberOfLines={1}
                    color={selectedHeaderLabelColor}
                    style={styles.metricLabel}
                  >
                    Вероятность забеременеть
                  </AppText>
                </View>
                <View
                  style={[
                    styles.metricDivider,
                    selectedHeaderIsColored && styles.metricDividerOnColor,
                  ]}
                />
                <View style={styles.metricNarrow}>
                  <AppText
                    numeric
                    color={
                      selectedHeaderIsColored
                        ? colors.text.inverse
                        : colors.brand.primary
                    }
                    style={styles.metricValue}
                  >
                    {calculatedCycle ? currentCycleDay : '—'}
                  </AppText>
                  <AppText
                    role="caption"
                    numberOfLines={1}
                    color={selectedHeaderLabelColor}
                    style={styles.metricLabel}
                  >
                    День цикла
                  </AppText>
                </View>
              </Animated.View>
              ) : null}

              {variant === 'continuous' && viewMode === 'month' ? (
                <>
                  <Animated.View
                    pointerEvents={currentMonthVisible ? 'none' : 'auto'}
                    style={[
                      styles.returnButtonWrap,
                      { bottom: returnButtonBottom },
                      {
                        opacity: returnButtonProgress,
                        transform: [
                          {
                            translateY: daySheetProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [DAY_DETAILS_HEIGHT + spacing.sm, 0],
                            }),
                          },
                          {
                            scale: returnButtonProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.86, 1],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <CalendarGlassControl
                      accessibilityLabel="Вернуться к текущему месяцу"
                      onPress={scrollToCurrentMonth}
                      width={RETURN_BUTTON_SIZE}
                      height={RETURN_BUTTON_SIZE}
                      radius={RETURN_BUTTON_SIZE / 2}
                      intensity={64}
                      tintColor="transparent"
                      variant="clear"
                      washColor="transparent"
                      style={styles.returnButton}
                    >
                      <BackIcon
                        width={25}
                        height={25}
                        style={
                          returnDirection === 'up'
                            ? styles.returnArrowUp
                            : styles.returnArrowDown
                        }
                      />
                    </CalendarGlassControl>
                  </Animated.View>

                  {!dayDetailsVisible && canMarkPeriod ? (
                    <View
                      style={[
                        styles.periodEntryButtonWrap,
                        { bottom: sheetBottom },
                      ]}
                    >
                      {periodMarkingMode ? (
                        <CalendarGlassControl
                          activateOnPressIn
                          accessibilityLabel="Сохранить выбранные дни месячных"
                          onPress={savePeriodMarking}
                          width={166}
                          height={48}
                          radius={24}
                          intensity={68}
                          tintColor={colors.brand.primary}
                          variant="regular"
                          washColor={colors.brand.primary}
                          style={[
                            styles.periodEntryButton,
                            styles.periodSaveButton,
                          ]}
                        >
                          <View style={styles.periodEntryButtonContent}>
                            <AppText
                              role="body"
                              weight="semibold"
                              color={colors.text.inverse}
                              style={styles.periodSaveCheck}
                            >
                              ✓
                            </AppText>
                            <AppText
                              role="body"
                              weight="medium"
                              color={colors.text.inverse}
                              style={styles.periodEntryButtonLabel}
                            >
                              Сохранить
                            </AppText>
                          </View>
                        </CalendarGlassControl>
                      ) : (
                        <CalendarGlassControl
                          activateOnPressIn
                          accessibilityLabel="Отметить дни месячных"
                          onPress={enterPeriodMarkingMode}
                          width={166}
                          height={48}
                          radius={24}
                          intensity={64}
                          tintColor="rgba(255,255,255,0.20)"
                          variant="regular"
                          washColor="rgba(255,255,255,0.20)"
                          style={styles.periodEntryButton}
                        >
                          <View style={styles.periodEntryButtonContent}>
                            <AddIcon width={19} height={19} />
                            <AppText
                              role="body"
                              weight="medium"
                              color={colors.brand.primary}
                              style={styles.periodEntryButtonLabel}
                            >
                              Месячные
                            </AppText>
                          </View>
                        </CalendarGlassControl>
                      )}
                    </View>
                  ) : null}

                  <Animated.View
                    onTouchStart={() => {
                      protectedDayInteractionRef.current = true;
                    }}
                    pointerEvents={dayDetailsVisible ? 'auto' : 'none'}
                    style={[
                      styles.dayDetailsWrap,
                      { bottom: sheetBottom },
                      {
                        opacity: daySheetProgress,
                        transform: [
                          {
                            translateY: daySheetProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [DAY_DETAILS_HEIGHT + 24, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <CalendarDayDetailsCard
                      date={detailsDate}
                      forecast={selectedForecast}
                      hasLoggedSymptoms={hasLoggedSymptoms}
                      onAddPress={() =>
                        onAddSymptoms
                          ? onAddSymptoms(detailsDate)
                          : showAddMenu(detailsDate)
                      }
                      symptomStatusVariant="banner"
                    />
                  </Animated.View>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function CalendarPageModal(props: CalendarPageModalProps) {
  const currentDate = useRef(new Date()).current;

  return (
    <CalendarPageModalBase
      {...props}
      initialDate={props.initialDate ?? currentDate}
      variant="continuous"
    />
  );
}

export function CalendarPageBackupModal(props: CalendarPageModalProps) {
  return <CalendarPageModalBase {...props} variant="backup" />;
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.raised,
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
    borderRadius: radii.xl,
    backgroundColor: colors.surface.raised,
  },
  scroll: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  calendarViewLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  yearScroll: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
  },
  yearScrollContent: {
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: 96,
  },
  yearLegend: {
    position: 'absolute',
    right: sizes.screenGutter,
    left: sizes.screenGutter,
    zIndex: 2,
    height: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  yearLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yearLegendMarker: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  yearLegendMarkerLogged: {
    backgroundColor: colors.brand.primary,
  },
  yearLegendMarkerForecast: {
    borderWidth: 1,
    borderStyle: 'dotted',
    borderColor: colors.brand.primary,
  },
  yearLegendMarkerFertile: {
    backgroundColor: 'rgba(46,183,177,0.14)',
  },
  yearLegendMarkerOvulation: {
    borderWidth: 1,
    borderStyle: 'dotted',
    borderColor: '#2EB7B1',
  },
  yearSection: {
    height: YEAR_SECTION_HEIGHT,
    paddingTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(115,110,108,0.18)',
  },
  yearTitle: {
    height: 46,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.64,
    textAlign: 'center',
  },
  yearMonthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: 8,
    rowGap: 8,
  },
  yearMiniMonth: {
    width: 112,
    height: 136,
  },
  yearMiniMonthTitle: {
    height: 22,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.18,
    textAlign: 'center',
  },
  yearMiniDays: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  yearMiniDayCell: {
    width: '14.2857%',
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearMiniDay: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearMiniDayFertile: {
    backgroundColor: 'rgba(46,183,177,0.05)',
  },
  yearMiniDayOvulation: {
    borderWidth: 1,
    borderStyle: 'dotted',
    borderColor: '#2EB7B1',
    backgroundColor: 'transparent',
  },
  yearMiniDayPeriod: {
    backgroundColor: colors.brand.primary,
  },
  yearMiniDayForecastPeriod: {
    borderWidth: 1,
    borderStyle: 'dotted',
    borderColor: colors.brand.primary,
    backgroundColor: 'transparent',
  },
  yearMiniDaySelected: {
    borderWidth: 1.25,
    borderColor: colors.text.primary,
  },
  yearMiniDayPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.88 }],
  },
  yearMiniDayNumber: {
    fontSize: 8.5,
    lineHeight: 10,
    letterSpacing: -0.12,
    textAlign: 'center',
  },
  scrollContent: {
    paddingTop: CALENDAR_CONTENT_TOP,
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: 92,
    gap: spacing.lg,
  },
  continuousScrollContent: {
    paddingTop: CALENDAR_CONTENT_TOP,
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: 116,
  },
  periodMarkingScrollContent: {
    paddingTop: 124,
  },
  continuousMonth: {
    height: MONTH_SECTION_HEIGHT,
    paddingTop: spacing.md,
  },
  continuousMonthTitle: {
    height: 42,
    paddingHorizontal: spacing.xs,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.56,
  },
  continuousWeekRow: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
  },
  continuousMonthDivider: {
    position: 'absolute',
    left: spacing.xs,
    right: spacing.xs,
    bottom: 5,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(115,110,108,0.20)',
  },
  headerShape: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 5,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  headerControls: {
    position: 'absolute',
    left: sizes.screenGutter,
    width: sizes.contentWidth,
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarModeHeaderSlot: {
    width: 184,
    height: 46,
  },
  headerCircle: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePill: {
    width: 156,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDate: {
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.36,
    textAlign: 'center',
  },
  headerBackIcon: {
    transform: [{ rotate: '180deg' }],
  },
  headerGlassShadow: {
    ...shadows.floating,
  },
  periodModeHidden: {
    opacity: 0,
  },
  periodModeClose: {
    position: 'absolute',
    left: sizes.screenGutter,
    width: sizes.touch,
    height: sizes.touch,
    zIndex: 13,
  },
  closeIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIconLine: {
    position: 'absolute',
    width: 19,
    height: 2.2,
    borderRadius: 1.1,
    backgroundColor: colors.text.primary,
  },
  closeIconLineUp: {
    transform: [{ rotate: '45deg' }],
  },
  closeIconLineDown: {
    transform: [{ rotate: '-45deg' }],
  },
  pressed: {
    opacity: Platform.OS === 'android' ? 0.94 : 1,
    transform: [{ scale: Platform.OS === 'android' ? 0.98 : 1.035 }],
  },
  metrics: {
    position: 'absolute',
    left: 24,
    width: 354,
    height: 65,
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricNarrow: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricWide: {
    width: 174,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
    textAlign: 'center',
  },
  metricStatusLabel: {
    width: 104,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 65,
    marginHorizontal: 7,
    backgroundColor: colors.surface.divider,
  },
  metricDividerOnColor: {
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  returnButtonWrap: {
    position: 'absolute',
    right: sizes.screenGutter,
    width: RETURN_BUTTON_SIZE,
    height: RETURN_BUTTON_SIZE,
    zIndex: 12,
  },
  returnButton: {
    width: RETURN_BUTTON_SIZE,
    height: RETURN_BUTTON_SIZE,
    borderRadius: RETURN_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.raised,
    ...shadows.floating,
  },
  returnButtonPressed: {
    transform: [{ scale: 1.05 }],
  },
  periodEntryButtonWrap: {
    position: 'absolute',
    left: (DESIGN_WIDTH - 166) / 2,
    width: 166,
    height: 48,
    zIndex: 12,
  },
  periodEntryButton: {
    width: 166,
    height: 48,
    borderRadius: 24,
    ...shadows.floating,
  },
  periodSaveButton: {
    shadowColor: colors.brand.primary,
    shadowOpacity: 0.24,
  },
  periodEntryButtonContent: {
    width: 166,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  periodEntryButtonLabel: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.36,
  },
  periodSaveCheck: {
    fontSize: 17,
    lineHeight: 20,
    textAlign: 'center',
  },
  returnArrowUp: {
    transform: [{ rotate: '-90deg' }],
  },
  returnArrowDown: {
    transform: [{ rotate: '90deg' }],
  },
  dayDetailsWrap: {
    position: 'absolute',
    left: sizes.screenGutter,
    width: sizes.contentWidth,
    height: DAY_DETAILS_HEIGHT,
    zIndex: 11,
  },
  dayDetailsPreview: {
    width: sizes.contentWidth,
    height: DAY_DETAILS_HEIGHT,
  },
  dayDetailsCard: {
    width: '100%',
    height: '100%',
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.surface.raised,
    shadowColor: '#3A171C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  dayDetailsHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayDetailsDateCopy: {
    flex: 1,
  },
  dayDetailsDate: {
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.48,
  },
  dayDetailsActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  dayDetailsActionLabel: {
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.22,
  },
  dayDetailsAddButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.16)',
    backgroundColor: 'rgba(211,20,113,0.08)',
  },
  dayDetailsAddButtonContent: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDetailsAddButtonPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: 'rgba(211,20,113,0.14)',
  },
  dayDetailsDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
    backgroundColor: colors.surface.divider,
  },
  dayDetailsDividerAfterBanner: {
    marginVertical: spacing.xs,
  },
  dayDetailsForecastRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dayDetailsForecastRowWithFooter: {
    paddingBottom: 30,
  },
  dayDetailsIndicator: {
    width: 6,
    height: 56,
    marginTop: 2,
    borderRadius: 3,
  },
  dayDetailsIndicatorPeriod: {
    backgroundColor: colors.brand.primary,
  },
  dayDetailsIndicatorFertile: {
    backgroundColor: colors.brand.success,
  },
  dayDetailsIndicatorOvulation: {
    backgroundColor: colors.surface.raised,
    borderWidth: 2,
    borderColor: colors.brand.success,
  },
  dayDetailsIndicatorUpcoming: {
    backgroundColor: 'rgba(211,20,113,0.36)',
  },
  dayDetailsIndicatorNeutral: {
    backgroundColor: 'rgba(115,110,108,0.32)',
  },
  dayDetailsForecastCopy: {
    flex: 1,
    gap: 4,
  },
  dayDetailsForecastTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayDetailsForecastTitle: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.34,
  },
  dayDetailsDescription: {
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.18,
  },
  symptomStatusMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  symptomStatusBanner: {
    minHeight: 30,
    marginTop: 4,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(31,187,116,0.10)',
  },
  symptomStatusInline: {
    minHeight: 22,
    alignSelf: 'flex-start',
  },
  symptomStatusCompact: {
    minHeight: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    gap: 5,
    backgroundColor: 'rgba(31,187,116,0.10)',
  },
  symptomStatusUnderDate: {
    minHeight: 15,
    marginTop: 1,
    gap: 5,
  },
  symptomStatusSide: {
    width: 66,
    minHeight: 66,
    paddingHorizontal: 6,
    borderRadius: 18,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(31,187,116,0.10)',
  },
  symptomStatusFooter: {
    width: '100%',
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(31,187,116,0.08)',
  },
  symptomStatusFooterPosition: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
  },
  symptomStatusCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.success,
  },
  symptomStatusCheckCompact: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  symptomStatusCheckSide: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  symptomStatusCheckUnderDate: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  symptomStatusCheckmark: {
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'center',
  },
  symptomStatusCheckmarkSmall: {
    fontSize: 8,
    lineHeight: 9,
  },
  symptomStatusLabel: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
  },
  symptomStatusLabelCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
  symptomStatusLabelUnderDate: {
    fontSize: 10,
    lineHeight: 12,
  },
  symptomStatusLabelSide: {
    fontSize: 10,
    lineHeight: 11,
    textAlign: 'center',
  },
  cycleDayPill: {
    minWidth: 86,
    minHeight: 30,
    flexShrink: 0,
    paddingHorizontal: spacing.xs,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(211,20,113,0.08)',
  },
  cycleDayLabel: {
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
  },
  calendarCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  monthHeader: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(211,20,113,0.08)',
  },
  monthArrowContent: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: 'rgba(211,20,113,0.14)',
  },
  backIconLeft: {
    transform: [{ rotate: '180deg' }],
  },
  weekRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
  },
  weekDay: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
  },
  daysGrid: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellContent: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellPressed: {
    opacity: 0.66,
    transform: [{ scale: 0.94 }],
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symptomDayMarker: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.5,
    borderColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.success,
  },
  symptomDayMarkerCheck: {
    fontSize: 8,
    lineHeight: 9,
    textAlign: 'center',
  },
  dayFertile: {
    backgroundColor: 'rgba(31,187,116,0.10)',
  },
  dayPeriod: {
    backgroundColor: 'rgba(211,20,113,0.10)',
  },
  dayForecastPeriod: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand.primarySoft,
    backgroundColor: 'transparent',
  },
  dayPeriodSelected: {
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.20)',
    backgroundColor: 'rgba(211,20,113,0.10)',
    shadowOpacity: 0,
    elevation: 0,
  },
  dayFutureDisabled: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  periodTickbox: {
    position: 'absolute',
    bottom: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.25,
    borderColor: 'rgba(115,110,108,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  periodTickboxSelected: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  periodTickboxLabel: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
  },
  dayOvulation: {
    borderWidth: 1.5,
    borderColor: colors.brand.success,
  },
  daySelected: {
    borderWidth: 0,
    backgroundColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  dayNumber: {
    fontSize: 16,
    lineHeight: 18,
  },
  todayBadge: {
    position: 'absolute',
    bottom: -1,
    minWidth: 39,
    height: 14,
    paddingHorizontal: 5,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.72)',
    backgroundColor: '#EA4087',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBadgeSelected: {
    borderColor: colors.surface.raised,
  },
  todayBadgeFertile: {
    backgroundColor: colors.brand.success,
  },
  todayBadgeMenstruation: {
    backgroundColor: MENSTRUATION_HEADER_COLOR,
  },
  todayBadgeLabel: {
    fontSize: 10,
    lineHeight: 11,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  dayMarkerRow: {
    position: 'absolute',
    bottom: 2,
    height: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dayMarkerRowToday: {
    opacity: 0,
  },
  periodMarker: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand.primary,
  },
  fertileMarker: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand.success,
  },
  ovulationMarker: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  selectedSection: {
    gap: spacing.xs,
  },
  selectedCard: {
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.card,
  },
  selectedAccent: {
    width: 5,
    height: 52,
    borderRadius: 3,
    backgroundColor: colors.brand.success,
  },
  selectedCopy: {
    flex: 1,
    gap: 4,
  },
  forecastSection: {
    gap: spacing.sm,
  },
  forecastCard: {
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  forecastRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  forecastCopy: {
    flex: 1,
    gap: 3,
  },
  forecastDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 24,
    backgroundColor: colors.surface.divider,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendPeriod: {
    backgroundColor: colors.brand.primary,
  },
  legendFertile: {
    backgroundColor: colors.brand.success,
  },
  legendOvulation: {
    backgroundColor: colors.surface.raised,
    borderWidth: 2,
    borderColor: colors.brand.success,
  },
});
