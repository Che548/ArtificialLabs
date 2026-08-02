import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { GlassContainer, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import type { ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AddIcon from "../assets/figma/calendar-page/add.svg";
import BackIcon from "../assets/figma/calendar-page/back.svg";
import HeaderShape from "../assets/figma/calendar-page/header-shape.svg";
import { AppText, HeaderDateLabel, LiquidGlassSurface } from "./components";
import { colors, radii, shadows, sizes, spacing } from "./tokens";

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const HEADER_SHAPE_HEIGHT = 250;
const CALENDAR_CONTENT_TOP = 246;
const MONTH_SECTION_HEIGHT = 410;
const DAY_DETAILS_HEIGHT = 196;
const RETURN_BUTTON_SIZE = 52;
const MONTHS_BEFORE_SELECTED = 60;
const MONTHS_AFTER_SELECTED = 60;
const WEEK_DAYS = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"];
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
const hasNativeLiquidGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

type CalendarPageModalProps = {
  visible: boolean;
  onClose: () => void;
  initialDate?: Date;
};

type CalendarPageVariant = "backup" | "continuous";

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

type DayForecastKind =
  "fertile" | "menstruation" | "neutral" | "ovulation" | "upcoming";

type DayForecast = {
  cycleDay: number;
  description: string;
  kind: DayForecastKind;
  title: string;
};

export type CalendarSymptomStatusVariant =
  "banner" | "compact" | "footer" | "inline" | "side" | "underDate";

function getDayForecast(date: Date): DayForecast {
  const dayInMilliseconds = 24 * 60 * 60 * 1000;
  const dateUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const cycleStartUtc = Date.UTC(
    CYCLE_START.getFullYear(),
    CYCLE_START.getMonth(),
    CYCLE_START.getDate(),
  );
  const difference = Math.floor((dateUtc - cycleStartUtc) / dayInMilliseconds);
  const cycleDay =
    (((difference % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH) + 1;

  if (cycleDay <= 5) {
    return {
      cycleDay,
      description: `Ожидается ${cycleDay}-й день менструации.`,
      kind: "menstruation",
      title: "Менструация",
    };
  }

  if (cycleDay === 9) {
    return {
      cycleDay,
      description: "Предполагаемый день овуляции по прогнозу цикла.",
      kind: "ovulation",
      title: "Овуляция",
    };
  }

  if (cycleDay >= 6 && cycleDay <= 11) {
    return {
      cycleDay,
      description: "Фертильное окно по прогнозу текущего цикла.",
      kind: "fertile",
      title: "Повышенная вероятность забеременеть",
    };
  }

  if (cycleDay >= 26) {
    return {
      cycleDay,
      description: "Менструация ожидается в ближайшие несколько дней.",
      kind: "upcoming",
      title: "Ожидается менструация",
    };
  }

  return {
    cycleDay,
    description: "Особых событий по прогнозу цикла не ожидается.",
    kind: "neutral",
    title: "Обычный день цикла",
  };
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function monthTitle(date: Date) {
  return capitalize(
    new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    }).format(date),
  );
}

function dayTitle(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
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
  month,
  onDayPressIn,
  selectedDate,
  onSelectDate,
  showSymptomLogs = false,
  showOutsideDays = true,
  useCycleForecast = false,
}: {
  month: Date;
  onDayPressIn?: () => void;
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  showSymptomLogs?: boolean;
  showOutsideDays?: boolean;
  useCycleForecast?: boolean;
}) {
  const cells = useMemo(() => makeCalendarCells(month), [month]);
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;

  return (
    <View style={styles.daysGrid}>
      {cells.map(({ date, inCurrentMonth }) => {
        const key = dateKey(date);

        if (!inCurrentMonth && !showOutsideDays) {
          return <View key={key} style={styles.dayCell} />;
        }

        const selected = key === selectedKey;
        const symptomsLogged =
          showSymptomLogs && SYMPTOM_LOG_DATE_KEYS.has(key);
        const forecast = getDayForecast(date);
        const fertile = useCycleForecast
          ? forecast.kind === "fertile" || forecast.kind === "ovulation"
          : FERTILE_DATE_KEYS.has(key);
        const period = useCycleForecast
          ? forecast.kind === "menstruation"
          : PERIOD_DATE_KEYS.has(key);
        const ovulation = useCycleForecast
          ? forecast.kind === "ovulation"
          : key === OVULATION_DATE_KEY;

        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={`${dayTitle(date)}${
              symptomsLogged ? ", симптомы отмечены" : ""
            }`}
            accessibilityState={{ selected }}
            onPressIn={onDayPressIn}
            onPress={() => onSelectDate(date)}
            style={({ pressed }) => [
              styles.dayCell,
              pressed && styles.dayCellPressed,
            ]}
          >
            <View
              style={[
                styles.dayCircle,
                fertile && styles.dayFertile,
                period && styles.dayPeriod,
                ovulation && styles.dayOvulation,
                selected && styles.daySelected,
              ]}
            >
              <AppText
                numeric
                role="label"
                color={
                  selected
                    ? colors.text.inverse
                    : inCurrentMonth
                      ? colors.text.primary
                      : "rgba(115,110,108,0.34)"
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
            <View style={styles.dayMarkerRow}>
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
          </Pressable>
        );
      })}
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerCircle,
        !hasNativeLiquidGlass && styles.headerGlassShadow,
        pressed && styles.pressed,
      ]}
    >
      <LiquidGlassSurface
        variant="clear"
        tintColor={colors.surface.headerGlassWash}
        colorScheme="light"
        fallbackTint="systemUltraThinMaterialLight"
        intensity={58}
        washColor={colors.surface.headerGlassWash}
        radius={sizes.touch / 2}
      >
        {children}
      </LiquidGlassSurface>
    </Pressable>
  );
}

function MonthArrow({
  direction,
  onPress,
}: {
  direction: "left" | "right";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        direction === "left" ? "Предыдущий месяц" : "Следующий месяц"
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.monthArrow,
        pressed && styles.monthArrowPressed,
      ]}
    >
      <BackIcon
        width={18}
        height={18}
        style={direction === "left" ? styles.backIconLeft : undefined}
      />
    </Pressable>
  );
}

function SymptomStatusMark({
  variant,
}: {
  variant: CalendarSymptomStatusVariant;
}) {
  const compact = variant === "compact";
  const side = variant === "side";
  const underDate = variant === "underDate";

  return (
    <View
      style={[
        styles.symptomStatusMark,
        variant === "banner" && styles.symptomStatusBanner,
        compact && styles.symptomStatusCompact,
        variant === "footer" && styles.symptomStatusFooter,
        variant === "inline" && styles.symptomStatusInline,
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
          ? "Отмечены"
          : side
            ? "Симптомы\nотмечены"
            : "Симптомы успешно отмечены"}
      </AppText>
    </View>
  );
}

function CalendarDayDetailsCard({
  date,
  forecast,
  hasLoggedSymptoms,
  onAddPress,
  symptomStatusVariant = "banner",
}: {
  date: Date;
  forecast: DayForecast;
  hasLoggedSymptoms: boolean;
  onAddPress?: () => void;
  symptomStatusVariant?: CalendarSymptomStatusVariant;
}) {
  const showBanner = hasLoggedSymptoms && symptomStatusVariant === "banner";
  const showCompact = hasLoggedSymptoms && symptomStatusVariant === "compact";
  const showFooter = hasLoggedSymptoms && symptomStatusVariant === "footer";
  const showInline = hasLoggedSymptoms && symptomStatusVariant === "inline";
  const showSide = hasLoggedSymptoms && symptomStatusVariant === "side";
  const showUnderDate =
    hasLoggedSymptoms && symptomStatusVariant === "underDate";

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Добавить симптомы на ${dayTitle(date)}`}
            onPress={onAddPress}
            style={({ pressed }) => [
              styles.dayDetailsAddButton,
              pressed && styles.dayDetailsAddButtonPressed,
            ]}
          >
            <AddIcon width={20} height={20} />
          </Pressable>
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
              forecast.kind === "menstruation" &&
                styles.dayDetailsIndicatorPeriod,
              forecast.kind === "fertile" && styles.dayDetailsIndicatorFertile,
              forecast.kind === "ovulation" &&
                styles.dayDetailsIndicatorOvulation,
              forecast.kind === "upcoming" &&
                styles.dayDetailsIndicatorUpcoming,
              forecast.kind === "neutral" && styles.dayDetailsIndicatorNeutral,
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
            style={styles.cycleDayLabel}
          >
            День цикла{" "}
            <AppText numeric role="caption" color={colors.brand.primary}>
              {forecast.cycleDay}
            </AppText>
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
  variant,
}: CalendarPageBaseProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const monthListRef = useRef<FlatList<Date>>(null);
  const initialMonthPositionedRef = useRef(false);
  const protectedDayInteractionRef = useRef(false);
  const returnButtonProgress = useRef(new Animated.Value(0)).current;
  const daySheetProgress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(
    variant === "continuous" ? null : initialDate,
  );
  const [currentMonthVisible, setCurrentMonthVisible] = useState(true);
  const [returnDirection, setReturnDirection] = useState<"up" | "down">("up");
  const [dayDetailsVisible, setDayDetailsVisible] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSelectedDate(variant === "continuous" ? null : initialDate);
    setVisibleMonth(
      new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
    );
    setCurrentMonthVisible(true);
    setReturnDirection("up");
    setDayDetailsVisible(false);
    initialMonthPositionedRef.current = false;
    returnButtonProgress.setValue(0);
    daySheetProgress.setValue(0);
  }, [daySheetProgress, initialDate, returnButtonProgress, visible]);

  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const headerTop = Math.max(16, insets.top / scale + 8);
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
  const detailsDate = selectedDate ?? initialDate;
  const headerDate = dayTitle(
    variant === "continuous" ? initialDate : detailsDate,
  );
  const selectedForecast = getDayForecast(detailsDate);
  const hasLoggedSymptoms = SYMPTOM_LOG_DATE_KEYS.has(dateKey(detailsDate));
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
        setReturnDirection(indexes[0] > MONTHS_BEFORE_SELECTED ? "up" : "down");
      }
    },
  ).current;

  useEffect(() => {
    if (!visible || variant !== "continuous") {
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
    const target = variant === "continuous" && !currentMonthVisible ? 1 : 0;

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
    const target = variant === "continuous" && dayDetailsVisible ? 1 : 0;

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
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync();
    }

    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + direction, 1),
    );
  };

  const selectDate = (date: Date) => {
    const repeatedContinuousSelection =
      variant === "continuous" &&
      selectedDate !== null &&
      dateKey(selectedDate) === dateKey(date);

    if (repeatedContinuousSelection) {
      setSelectedDate(null);
      setDayDetailsVisible(false);

      if (Platform.OS !== "web") {
        void Haptics.selectionAsync();
      }
      return;
    }

    setSelectedDate(date);
    if (variant === "continuous") {
      setDayDetailsVisible(true);
    }
    if (
      variant === "backup" &&
      (date.getMonth() !== visibleMonth.getMonth() ||
        date.getFullYear() !== visibleMonth.getFullYear())
    ) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }

    if (Platform.OS !== "web") {
      void Haptics.selectionAsync();
    }
  };

  const showAddMenu = (date = selectedDate ?? initialDate) => {
    Alert.alert(
      variant === "backup"
        ? "Добавить запись"
        : `Добавить запись · ${dayTitle(date)}`,
      "Что вы хотите отметить в календаре?",
      [
        { text: "Симптом" },
        { text: "Результат теста" },
        { text: "Отмена", style: "cancel" },
      ],
    );
  };

  const dismissDayDetails = () => {
    setDayDetailsVisible(false);
    if (variant === "continuous") {
      setSelectedDate(null);
    }
  };

  const scrollToCurrentMonth = () => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    monthListRef.current?.scrollToOffset({
      animated: !reduceMotion,
      offset: MONTHS_BEFORE_SELECTED * MONTH_SECTION_HEIGHT,
    });
    dismissDayDetails();
  };

  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
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
                  variant === "continuous" &&
                  dayDetailsVisible &&
                  !protectedDayInteractionRef.current
                ) {
                  dismissDayDetails();
                }
              }}
            >
              {variant === "backup" ? (
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
                <FlatList
                  ref={monthListRef}
                  data={monthSequence}
                  keyExtractor={(month) =>
                    `${month.getFullYear()}-${month.getMonth()}`
                  }
                  renderItem={({ item: month }) => (
                    <View style={styles.continuousMonth}>
                      <AppText
                        role="title"
                        weight="semibold"
                        color={colors.brand.primary}
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
                        month={month}
                        onDayPressIn={() => {
                          protectedDayInteractionRef.current = true;
                        }}
                        selectedDate={selectedDate}
                        onSelectDate={selectDate}
                        showSymptomLogs
                        showOutsideDays={false}
                        useCycleForecast
                      />
                      <View style={styles.continuousMonthDivider} />
                    </View>
                  )}
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
                  contentContainerStyle={styles.continuousScrollContent}
                />
              )}

              <View pointerEvents="none" style={styles.headerWhiteFill} />
              <HeaderShape
                pointerEvents="none"
                width={DESIGN_WIDTH}
                height={HEADER_SHAPE_HEIGHT}
                style={styles.headerShape}
              />

              <GlassContainer
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

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    variant === "continuous"
                      ? `Сегодня, ${headerDate}`
                      : "Выбранная дата"
                  }
                  style={({ pressed }) => [
                    styles.datePill,
                    !hasNativeLiquidGlass && styles.headerGlassShadow,
                    pressed && styles.pressed,
                  ]}
                >
                  <LiquidGlassSurface
                    variant="clear"
                    tintColor={colors.surface.headerGlassWash}
                    colorScheme="light"
                    fallbackTint="systemUltraThinMaterialLight"
                    intensity={58}
                    washColor={colors.surface.headerGlassWash}
                    radius={sizes.touch / 2}
                  >
                    {variant === "continuous" ? (
                      <HeaderDateLabel date={initialDate} />
                    ) : (
                      <AppText
                        role="body"
                        weight="medium"
                        color={colors.brand.primary}
                        style={styles.headerDate}
                      >
                        {headerDate}
                      </AppText>
                    )}
                  </LiquidGlassSurface>
                </Pressable>

                <GlassHeaderButton
                  accessibilityLabel="Добавить запись"
                  onPress={() => showAddMenu()}
                >
                  <AddIcon width={24} height={24} />
                </GlassHeaderButton>
              </GlassContainer>

              <View style={[styles.metrics, { top: headerTop + 61 }]}>
                <View style={styles.metricNarrow}>
                  <AppText
                    numeric
                    color={colors.brand.primary}
                    style={styles.metricValue}
                  >
                    3
                  </AppText>
                  <AppText
                    role="caption"
                    color="#5D5D5D"
                    style={styles.metricLabel}
                  >
                    Задержка
                  </AppText>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricWide}>
                  <AppText
                    weight="medium"
                    color={colors.brand.success}
                    style={styles.metricValue}
                  >
                    Высокая
                  </AppText>
                  <AppText
                    role="caption"
                    color="#5D5D5D"
                    style={styles.metricLabel}
                  >
                    Вероятность забеременеть
                  </AppText>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metricNarrow}>
                  <AppText
                    numeric
                    color={colors.brand.primary}
                    style={styles.metricValue}
                  >
                    2
                  </AppText>
                  <AppText
                    role="caption"
                    color="#5D5D5D"
                    style={styles.metricLabel}
                  >
                    День цикла
                  </AppText>
                </View>
              </View>

              {variant === "continuous" ? (
                <>
                  <Animated.View
                    pointerEvents={currentMonthVisible ? "none" : "auto"}
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
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Вернуться к текущему месяцу"
                      onPress={scrollToCurrentMonth}
                      style={({ pressed }) => [
                        styles.returnButton,
                        pressed && styles.returnButtonPressed,
                      ]}
                    >
                      <LiquidGlassSurface
                        variant="clear"
                        tintColor="transparent"
                        colorScheme="light"
                        fallbackTint="systemUltraThinMaterialLight"
                        intensity={64}
                        washColor="transparent"
                        radius={RETURN_BUTTON_SIZE / 2}
                      >
                        <BackIcon
                          width={25}
                          height={25}
                          style={
                            returnDirection === "up"
                              ? styles.returnArrowUp
                              : styles.returnArrowDown
                          }
                        />
                      </LiquidGlassSurface>
                    </Pressable>
                  </Animated.View>

                  <Animated.View
                    onTouchStart={() => {
                      protectedDayInteractionRef.current = true;
                    }}
                    pointerEvents={dayDetailsVisible ? "auto" : "none"}
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
                      onAddPress={() => showAddMenu(detailsDate)}
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.warm,
  },
  scaledCanvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    transformOrigin: "top left",
  },
  canvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: "hidden",
    borderRadius: radii.xl,
    backgroundColor: colors.surface.warm,
  },
  scroll: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
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
    flexDirection: "row",
    alignItems: "center",
  },
  continuousMonthDivider: {
    position: "absolute",
    left: spacing.xs,
    right: spacing.xs,
    bottom: 5,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(115,110,108,0.20)",
  },
  headerShape: {
    position: "absolute",
    left: 0,
    top: -18,
    zIndex: 5,
    transform: [{ scaleY: -1 }],
  },
  headerWhiteFill: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 154,
    zIndex: 4,
    backgroundColor: colors.surface.raised,
  },
  headerControls: {
    position: "absolute",
    left: sizes.screenGutter,
    width: sizes.contentWidth,
    zIndex: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerCircle: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  datePill: {
    width: 156,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  headerDate: {
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.36,
    textAlign: "center",
  },
  headerBackIcon: {
    transform: [{ rotate: "180deg" }],
  },
  headerGlassShadow: {
    ...shadows.floating,
  },
  pressed: {
    transform: [{ scale: 1.035 }],
  },
  metrics: {
    position: "absolute",
    left: 24,
    width: 354,
    height: 65,
    zIndex: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricNarrow: {
    width: 57,
    alignItems: "center",
    justifyContent: "center",
  },
  metricWide: {
    width: 138,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.5,
    textAlign: "center",
  },
  metricLabel: {
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: -0.22,
    textAlign: "center",
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 65,
    backgroundColor: colors.surface.divider,
  },
  returnButtonWrap: {
    position: "absolute",
    right: sizes.screenGutter,
    width: RETURN_BUTTON_SIZE,
    height: RETURN_BUTTON_SIZE,
    zIndex: 12,
  },
  returnButton: {
    width: RETURN_BUTTON_SIZE,
    height: RETURN_BUTTON_SIZE,
    borderRadius: RETURN_BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.raised,
    ...shadows.floating,
  },
  returnButtonPressed: {
    transform: [{ scale: 1.05 }],
  },
  returnArrowUp: {
    transform: [{ rotate: "-90deg" }],
  },
  returnArrowDown: {
    transform: [{ rotate: "90deg" }],
  },
  dayDetailsWrap: {
    position: "absolute",
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
    width: "100%",
    height: "100%",
    padding: spacing.md,
    borderRadius: 30,
    backgroundColor: colors.surface.raised,
    shadowColor: "#3A171C",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
  dayDetailsHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(211,20,113,0.16)",
    backgroundColor: "rgba(211,20,113,0.08)",
  },
  dayDetailsAddButtonPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: "rgba(211,20,113,0.14)",
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
    flexDirection: "row",
    alignItems: "flex-start",
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
    backgroundColor: "rgba(211,20,113,0.36)",
  },
  dayDetailsIndicatorNeutral: {
    backgroundColor: "rgba(115,110,108,0.32)",
  },
  dayDetailsForecastCopy: {
    flex: 1,
    gap: 4,
  },
  dayDetailsForecastTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  symptomStatusBanner: {
    minHeight: 30,
    marginTop: 4,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: "rgba(31,187,116,0.10)",
  },
  symptomStatusInline: {
    minHeight: 22,
    alignSelf: "flex-start",
  },
  symptomStatusCompact: {
    minHeight: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    gap: 5,
    backgroundColor: "rgba(31,187,116,0.10)",
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
    flexDirection: "column",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(31,187,116,0.10)",
  },
  symptomStatusFooter: {
    width: "100%",
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(31,187,116,0.08)",
  },
  symptomStatusFooterPosition: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
  },
  symptomStatusCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
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
    textAlign: "center",
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
    textAlign: "center",
  },
  cycleDayPill: {
    minWidth: 86,
    minHeight: 28,
    paddingHorizontal: spacing.xs,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(211,20,113,0.08)",
  },
  cycleDayLabel: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: "center",
  },
  calendarCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  monthHeader: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(211,20,113,0.08)",
  },
  monthArrowPressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: "rgba(211,20,113,0.14)",
  },
  backIconLeft: {
    transform: [{ rotate: "180deg" }],
  },
  weekRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
  },
  weekDay: {
    width: "14.2857%",
    textAlign: "center",
    fontSize: 11,
    lineHeight: 14,
  },
  daysGrid: {
    marginTop: spacing.xs,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.2857%",
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellPressed: {
    opacity: 0.66,
    transform: [{ scale: 0.94 }],
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  symptomDayMarker: {
    position: "absolute",
    top: -3,
    right: -3,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: 1.5,
    borderColor: colors.surface.raised,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brand.success,
  },
  symptomDayMarkerCheck: {
    fontSize: 8,
    lineHeight: 9,
    textAlign: "center",
  },
  dayFertile: {
    backgroundColor: "rgba(31,187,116,0.10)",
  },
  dayPeriod: {
    backgroundColor: "rgba(211,20,113,0.10)",
  },
  dayOvulation: {
    borderWidth: 1.5,
    borderColor: colors.brand.success,
  },
  daySelected: {
    borderWidth: 0,
    backgroundColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  dayNumber: {
    fontSize: 16,
    lineHeight: 18,
  },
  dayMarkerRow: {
    position: "absolute",
    bottom: 2,
    height: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
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
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
