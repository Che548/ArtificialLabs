import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import type { TextStyle, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { SvgProps } from "react-native-svg";

import ContentShape from "../assets/figma/content-shape.svg";
import BackIcon from "../assets/figma/journal-flow/back.svg";
import ActivityIcon from "../assets/figma/journal-flow/icon-activity.svg";
import CycleIcon from "../assets/figma/journal-flow/icon-cycle.svg";
import EnergyIcon from "../assets/figma/journal-flow/icon-energy.svg";
import MeasurementsIcon from "../assets/figma/journal-flow/icon-measurements.svg";
import MoodIcon from "../assets/figma/journal-flow/icon-mood.svg";
import NutritionIcon from "../assets/figma/journal-flow/icon-nutrition.svg";
import SymptomsIcon from "../assets/figma/journal-flow/icon-symptoms.svg";
import type { JournalKind } from "../lib/health-types";
import {
  deleteLocalSetting,
  loadLocalSetting,
  saveLocalSetting,
} from "../lib/local-database";
import LiquidGlassPetalView from "../modules/liquid-glass-petal";
import { AppText, GlassControl, HeaderDateLabel } from "./components";
import { colors, getHeaderTop, radii, shadows, sizes, spacing } from "./tokens";

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
// The custom native view uses real Liquid Glass on iOS 26 and a shaped
// SwiftUI Material fallback on older iOS versions.
const hasNativePetalGlass = Platform.OS === "ios";
const PETAL_STRUCTURE_CENTER = { x: 201, y: 266 };
const PETAL_RADIUS = 98;
const PETAL_LABEL_RADIUS = 132;
const PETAL_WIDTH = 160;
const PETAL_HEIGHT = 242;
const PETAL_RENDER_SCALE_X = 0.72;
const PETAL_RENDER_SCALE_Y = 0.68;
const PETAL_ACTIVE_COLOR = "#EA4087";
const PETAL_COMPLETED_COLOR = "#F2A8CB";
const OPTIONS_VIEWPORT_HEIGHT = 146;
const OPTIONS_EMPTY_VIEWPORT_HEIGHT = 168;
const COMPACT_PROGRESS_FADE_PAGE_IDS = new Set([
  "discharge",
  "desire",
  "other-symptoms",
  "activity",
]);

export type JournalFlowCategory =
  | "measurements"
  | "cycle"
  | "activity"
  | "mood"
  | "nutrition"
  | "energy"
  | "symptoms";

export type JournalFlowEntry = {
  kind: JournalKind;
  label: string;
  textValue: string;
};

export type JournalFlowActionVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type JournalFlowOptionVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

type JournalFlowActionVariantConfig = {
  row?: ViewStyle;
  back: ViewStyle;
  next: ViewStyle;
  backText?: TextStyle;
  nextText?: TextStyle;
};

type JournalFlowOptionVariantConfig = {
  idle: ViewStyle;
  selected: ViewStyle;
  idleText?: TextStyle;
  selectedText?: TextStyle;
  marker?: "dot" | "check" | "ring";
};

const activeFlowAccentColor = colors.brand.primary;

const journalFlowActionVariantConfig: Record<
  JournalFlowActionVariant,
  JournalFlowActionVariantConfig
> = {
  1: {
    back: { backgroundColor: "#ECEBEC", borderRadius: 18 },
    next: { backgroundColor: colors.brand.primary, borderRadius: 18 },
  },
  2: {
    back: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D8D3D5", borderRadius: 15 },
    next: { backgroundColor: colors.surface.rose, borderWidth: 1, borderColor: "rgba(211,20,113,0.22)", borderRadius: 15 },
    nextText: { color: colors.brand.primary },
  },
  3: {
    back: { backgroundColor: "#F2EFF0", borderRadius: 23 },
    next: { backgroundColor: "#212123", borderRadius: 23 },
  },
  4: {
    back: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#D8D3D5", borderRadius: 14 },
    next: { backgroundColor: colors.brand.success, borderRadius: 14 },
  },
  5: {
    back: { backgroundColor: "#FFFFFF", borderRadius: 16, ...shadows.card },
    next: { backgroundColor: activeFlowAccentColor, borderRadius: 16, shadowColor: activeFlowAccentColor, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 10 },
  },
  6: {
    row: { gap: 0, overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: "#E2DDDF" },
    back: { backgroundColor: "#FFFFFF", borderRightWidth: 1, borderRightColor: "#E2DDDF" },
    next: { backgroundColor: colors.brand.primary },
  },
  7: {
    back: { backgroundColor: "#F5F2F3", borderRadius: 12 },
    next: { backgroundColor: "#FCE8F1", borderWidth: 1, borderColor: "rgba(211,20,113,0.3)", borderRadius: 12 },
    nextText: { color: colors.brand.primary },
  },
  8: {
    back: { backgroundColor: "#212123", borderRadius: 17 },
    next: { backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: colors.brand.primary, borderRadius: 17 },
    backText: { color: "#FFFFFF" },
    nextText: { color: colors.brand.primary },
  },
  9: {
    back: { backgroundColor: "#F1EFF0", borderRadius: 10, borderBottomWidth: 3, borderBottomColor: "#D7D1D3" },
    next: { backgroundColor: colors.brand.burgundy, borderRadius: 10, borderBottomWidth: 3, borderBottomColor: "#5B102D" },
  },
  10: {
    back: { backgroundColor: "rgba(255,255,255,0.62)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", borderRadius: 20 },
    next: { backgroundColor: "rgba(211,20,113,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.46)", borderRadius: 20 },
  },
};

const journalFlowOptionVariantConfig: Record<
  JournalFlowOptionVariant,
  JournalFlowOptionVariantConfig
> = {
  1: {
    idle: { backgroundColor: "#F4F1F2", borderColor: "#E6E1E3", borderRadius: 16 },
    selected: { backgroundColor: colors.surface.rose, borderColor: "rgba(211,20,113,0.28)", borderRadius: 16 },
    selectedText: { color: colors.brand.primary },
  },
  2: {
    idle: { backgroundColor: "#FFFFFF", borderColor: "#DCD6D8", borderRadius: 21 },
    selected: { backgroundColor: "#FFFFFF", borderColor: colors.brand.primary, borderWidth: 1.5, borderRadius: 21 },
    selectedText: { color: colors.brand.primary },
  },
  3: {
    idle: { backgroundColor: "#F3F0F1", borderColor: "transparent", borderRadius: 13 },
    selected: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary, borderRadius: 13 },
    selectedText: { color: "#FFFFFF" },
  },
  4: {
    idle: { backgroundColor: "#F7F5F5", borderColor: "#E5E0E2", borderRadius: 21 },
    selected: { backgroundColor: "#FCEAF2", borderColor: "rgba(211,20,113,0.3)", borderRadius: 21 },
    selectedText: { color: colors.brand.primary },
    marker: "dot",
  },
  5: {
    idle: { backgroundColor: "#FFFFFF", borderColor: "#E3DDDF", borderRadius: 16 },
    selected: { backgroundColor: colors.surface.rose, borderColor: "rgba(211,20,113,0.28)", borderRadius: 16 },
    selectedText: { color: colors.brand.primary },
    marker: "check",
  },
  6: {
    idle: { backgroundColor: "#F4F1F2", borderColor: "#E3DDDF", borderRadius: 12 },
    selected: { backgroundColor: "#F4F1F2", borderColor: colors.brand.primary, borderRadius: 12 },
    selectedText: { color: colors.text.primary },
    marker: "ring",
  },
  7: {
    idle: { backgroundColor: "#F3F1F1", borderColor: "transparent", borderRadius: 18 },
    selected: { backgroundColor: "#E4F8EE", borderColor: "rgba(31,187,116,0.32)", borderRadius: 18 },
    selectedText: { color: "#168452" },
    marker: "check",
  },
  8: {
    idle: { backgroundColor: "#FFFFFF", borderColor: "#E5E0E2", borderRadius: 10, borderBottomWidth: 3, borderBottomColor: "#DDD7D9" },
    selected: { backgroundColor: "#FFFFFF", borderColor: "rgba(211,20,113,0.26)", borderRadius: 10, borderBottomWidth: 3, borderBottomColor: colors.brand.primary },
    selectedText: { color: colors.brand.primary },
  },
  9: {
    idle: { backgroundColor: "#FFFFFF", borderColor: "transparent", borderRadius: 17, ...shadows.card },
    selected: { backgroundColor: "#FFF4F8", borderColor: "rgba(211,20,113,0.24)", borderRadius: 17, shadowColor: colors.brand.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.16, shadowRadius: 9 },
    selectedText: { color: colors.brand.primary },
  },
  10: {
    idle: { backgroundColor: "rgba(255,255,255,0.58)", borderColor: "rgba(255,255,255,0.9)", borderRadius: 20 },
    selected: { backgroundColor: "rgba(211,20,113,0.18)", borderColor: "rgba(211,20,113,0.34)", borderRadius: 20 },
    selectedText: { color: colors.brand.primary },
    marker: "check",
  },
};

const activeFlowBackStyle = journalFlowActionVariantConfig[1];
const activeFlowNextStyle = journalFlowActionVariantConfig[5];
const activeFlowOptionStyle = journalFlowOptionVariantConfig[2];

export function JournalFlowActionPreview({
  variant,
}: {
  variant: JournalFlowActionVariant;
}) {
  const config = journalFlowActionVariantConfig[variant];
  const decorated = variant === 3 || variant === 5 || variant === 9;

  return (
    <View style={[previewStyles.actionRow, config.row]}>
      <View style={[previewStyles.actionButton, config.back]}>
        <AppText role="label" weight="medium" style={config.backText}>
          {decorated ? "‹  Назад" : "Назад"}
        </AppText>
      </View>
      <View style={[previewStyles.actionButton, config.next]}>
        <AppText
          role="label"
          weight="medium"
          color={colors.text.inverse}
          style={config.nextText}
        >
          {decorated ? "Далее  ›" : "Далее"}
        </AppText>
      </View>
    </View>
  );
}

export function JournalFlowOptionPreview({
  variant,
}: {
  variant: JournalFlowOptionVariant;
}) {
  const config = journalFlowOptionVariantConfig[variant];

  const marker = (selected: boolean) => {
    if (!config.marker) return null;
    if (config.marker === "dot") {
      return <View style={[previewStyles.optionDot, selected && previewStyles.optionDotSelected]} />;
    }
    if (config.marker === "ring") {
      return <View style={[previewStyles.optionRing, selected && previewStyles.optionRingSelected]} />;
    }
    return selected ? (
      <AppText role="caption" weight="semibold" color={colors.brand.primary}>
        ✓
      </AppText>
    ) : null;
  };

  return (
    <View style={previewStyles.optionRow}>
      <View style={[previewStyles.optionChip, config.idle]}>
        {marker(false)}
        <AppText
          role="label"
          numberOfLines={1}
          style={[previewStyles.optionText, config.idleText]}
        >
          Слабые
        </AppText>
      </View>
      <View style={[previewStyles.optionChip, config.selected]}>
        {marker(true)}
        <AppText
          role="label"
          numberOfLines={1}
          style={[previewStyles.optionText, config.selectedText]}
        >
          Слабые
        </AppText>
      </View>
    </View>
  );
}

type JournalFlowModalProps = {
  visible: boolean;
  targetDate?: Date;
  initialCategory?: JournalFlowCategory;
  onClose: () => void;
  onComplete: (entries: JournalFlowEntry[]) => void | Promise<void>;
};

type JournalFlowDraft = {
  version: 1;
  category: JournalFlowCategory;
  pageIndex: number;
  selections: Record<string, string[]>;
  inputValues: Record<string, string>;
  updatedAt: number;
};

type JournalPage = {
  id: string;
  kind: JournalKind;
  title: string;
  options?: string[];
  input?: {
    placeholder: string;
    suffix?: string;
    actionLabel?: string;
    multiline?: boolean;
  };
};

type CategoryConfig = {
  icon: ComponentType<SvgProps>;
  iconRotation?: number;
  label: string;
  pages: JournalPage[];
  petalStyle: {
    rotation: number;
  };
  labelStyle: {
    width: number;
  };
};

const categories: Record<JournalFlowCategory, CategoryConfig> = {
  measurements: {
    icon: MeasurementsIcon,
    iconRotation: 180,
    label: "Показатели",
    petalStyle: { rotation: 154 },
    labelStyle: { width: 98 },
    pages: [
      {
        id: "basal-temperature",
        kind: "measurement",
        title: "Базальная температура тела",
        input: {
          placeholder: "Укажите температуру",
          suffix: "°C",
          actionLabel: "Посмотреть график",
        },
      },
      {
        id: "measurements",
        kind: "measurement",
        title: "Вес",
        input: {
          placeholder: "Укажите свой вес",
          suffix: "кг",
          actionLabel: "Посмотреть график",
        },
      },
      {
        id: "water",
        kind: "measurement",
        title: "Вода",
        input: {
          placeholder: "0",
          suffix: "/2,25 л",
          actionLabel: "Посмотреть график",
        },
      },
      {
        id: "notes",
        kind: "note",
        title: "Заметки",
        input: {
          placeholder: "Дополнительные комментарии...",
          multiline: true,
        },
      },
    ],
  },
  cycle: {
    icon: CycleIcon,
    iconRotation: 180,
    label: "Цикл",
    petalStyle: { rotation: -155 },
    labelStyle: { width: 88 },
    pages: [
      {
        id: "menstruation",
        kind: "cycle",
        title: "Менструация",
        options: [
          "Нет менструации",
          "Обильная менструация",
          "Слабая менструация",
          "Умеренная менструация",
        ],
      },
      {
        id: "discharge",
        kind: "cycle",
        title: "Выделения",
        options: [
          "Кровомажущие",
          "Выделений нет",
          "Липкие",
          "Кремообразные",
          "Обильные",
          "Нетипичные",
        ],
      },
      {
        id: "desire",
        kind: "cycle",
        title: "Секс и желание",
        options: [
          "Секса не было",
          "Секс с защитой",
          "Сниженное желание",
          "Повышенное желание",
          "Секс без защиты",
          "Мастурбация",
        ],
      },
    ],
  },
  activity: {
    icon: ActivityIcon,
    iconRotation: 180,
    label: "Активность",
    petalStyle: { rotation: 102 },
    labelStyle: { width: 110 },
    pages: [
      {
        id: "activity",
        kind: "activity",
        title: "Физическая активность",
        options: [
          "Велосипед",
          "Ходьба",
          "Прочее",
          "Аэробика",
          "Тренировки не было",
          "Йога",
          "Плавание",
          "Тренажёрный зал",
          "Бег",
        ],
      },
      {
        id: "day-factors",
        kind: "activity",
        title: "Факторы дня",
        options: [
          "Стресс",
          "Путешествие",
          "Алкоголь",
          "Болезнь или травма",
        ],
      },
    ],
  },
  mood: {
    icon: MoodIcon,
    iconRotation: 180,
    label: "Настроение",
    petalStyle: { rotation: -103 },
    labelStyle: { width: 122 },
    pages: [
      {
        id: "mood",
        kind: "mood",
        title: "Настроение",
        options: [
          "Спокойствие",
          "Радость",
          "Раздражение",
          "Игривость",
          "Перепады настроения",
          "Тревога",
          "Растерянность",
          "Сильная самокритика",
          "Чувство вины",
          "Навязчивые мысли",
        ],
      },
    ],
  },
  nutrition: {
    icon: NutritionIcon,
    iconRotation: 180,
    label: "Питание",
    petalStyle: { rotation: 51 },
    labelStyle: { width: 96 },
    pages: [
      {
        id: "nutrition",
        kind: "nutrition",
        title: "Питание и аппетит",
        options: [
          "Без изменений",
          "Диарея",
          "Тошнота",
          "Изменение предпочтений",
          "Изжога",
          "Повышенный аппетит",
          "Пониженный аппетит",
          "Рвота",
          "Вздутие",
          "Запор",
        ],
      },
    ],
  },
  energy: {
    icon: EnergyIcon,
    iconRotation: 180,
    label: "Энергия",
    petalStyle: { rotation: -52 },
    labelStyle: { width: 104 },
    pages: [
      {
        id: "energy",
        kind: "energy",
        title: "Энергия и сон",
        options: [
          "Много энергии",
          "Мало энергии",
          "Усталость",
          "Сонливость",
          "Тревога",
          "Бессонница",
          "Апатия",
        ],
      },
    ],
  },
  symptoms: {
    icon: SymptomsIcon,
    iconRotation: 180,
    label: "Симптомы",
    petalStyle: { rotation: 0 },
    labelStyle: { width: 106 },
    pages: [
      {
        id: "symptom-pain",
        kind: "symptom",
        title: "Боль",
        options: [
          "Внизу живота",
          "В животе",
          "В спине",
          "Головная боль",
        ],
      },
      {
        id: "other-symptoms",
        kind: "symptom",
        title: "Другие симптомы",
        options: [
          "Чувствительность груди",
          "Выделения из сосков",
          "Прыщи",
          "Частое мочеиспускание",
          "Судороги",
          "Кровоточивость дёсен",
          "Заложенность носа",
          "Отёки лица или конечностей",
        ],
      },
    ],
  },
};

const categoryOrder: JournalFlowCategory[] = [
  "cycle",
  "mood",
  "energy",
  "symptoms",
  "nutrition",
  "activity",
  "measurements",
];

const categoryBackgroundSources: Record<JournalFlowCategory, number> = {
  cycle: require("../assets/figma/journal-flow/background-cycle.png"),
  mood: require("../assets/figma/journal-flow/background-mood.png"),
  energy: require("../assets/figma/journal-flow/background-energy.png"),
  symptoms: require("../assets/figma/journal-flow/background-symptoms.png"),
  nutrition: require("../assets/figma/journal-flow/background-nutrition.png"),
  activity: require("../assets/figma/journal-flow/background-activity.png"),
  measurements: require("../assets/figma/journal-flow/background-measurements.png"),
};

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function sanitizeNumericInput(value: string) {
  const cleaned = value.replace(/[^\d.,]/g, "");
  const separatorIndex = cleaned.search(/[.,]/);
  if (separatorIndex < 0) return cleaned;
  return `${cleaned.slice(0, separatorIndex + 1)}${cleaned
    .slice(separatorIndex + 1)
    .replace(/[.,]/g, "")}`;
}

function sanitizeNumericDraftInputs(values: Record<string, string>) {
  const nextValues = { ...values };
  for (const pageId of ["basal-temperature", "measurements", "water"]) {
    if (typeof nextValues[pageId] === "string") {
      nextValues[pageId] = sanitizeNumericInput(nextValues[pageId]);
    }
  }
  return nextValues;
}

function radialPoint(rotation: number, radius: number) {
  const radians = (rotation * Math.PI) / 180;
  const inwardX = Math.sin(radians);
  const inwardY = -Math.cos(radians);

  return {
    x: PETAL_STRUCTURE_CENTER.x - inwardX * radius,
    y: PETAL_STRUCTURE_CENTER.y - inwardY * radius,
  };
}

function petalPosition(rotation: number) {
  const point = radialPoint(rotation, PETAL_RADIUS);
  return {
    left: point.x - PETAL_WIDTH / 2,
    top: point.y - PETAL_HEIGHT / 2,
  };
}

function petalLabelPosition(rotation: number, width: number) {
  const point = radialPoint(rotation, PETAL_LABEL_RADIUS);
  return {
    left: point.x - width / 2,
    top: point.y - 27,
    width,
  };
}

function PetalGlass({
  active,
  completed,
}: {
  active: boolean;
  completed: boolean;
}) {
  return (
    <View pointerEvents="none" style={styles.petalSvgCanvas}>
      <Svg
        width={PETAL_WIDTH}
        height={PETAL_HEIGHT}
        viewBox="0 0 160 242"
        preserveAspectRatio="none"
      >
        <Path
          d="M40 96Q80-8 120 96L155 187C169 226 140 242 104 242H56C20 242-9 226 5 187L40 96Z"
          fill={
            Platform.OS === "android"
              ? active
                ? colors.brand.primary
                : completed
                  ? colors.brand.burgundy
                  : "#FFFCFD"
              : active
                ? PETAL_ACTIVE_COLOR
                : completed
                  ? PETAL_COMPLETED_COLOR
                  : "#FFFFFF"
          }
          fillOpacity={
            Platform.OS === "android"
              ? active
                ? 0.9
                : completed
                  ? 0.76
                  : 0.96
              : active
                ? 0.28
                : completed
                  ? 0.18
                  : 0.14
          }
          stroke={
            Platform.OS === "android"
              ? active
                ? "rgba(255,255,255,0.58)"
                : "rgba(74,52,61,0.12)"
              : "#FFFFFF"
          }
          strokeOpacity={
            Platform.OS === "android" ? 1 : active ? 0.56 : 0.34
          }
          strokeWidth={Platform.OS === "android" ? 1 : active ? 0.9 : 0.8}
        />
      </Svg>
    </View>
  );
}

type PetalLabelState = "active" | "completed" | "inactive";

function PetalLabel({
  category,
  state,
  onSelect,
}: {
  category: JournalFlowCategory;
  state: PetalLabelState;
  onSelect: (category: JournalFlowCategory) => void;
}) {
  const transition = useRef(new Animated.Value(1)).current;
  const config = categories[category];
  const Icon = config.icon;
  const position = petalLabelPosition(
    config.petalStyle.rotation,
    config.labelStyle.width,
  );
  const color =
    Platform.OS === "android" && state === "inactive"
      ? colors.text.primary
      : colors.text.inverse;

  useEffect(() => {
    transition.stopAnimation();
    transition.setValue(0);
    Animated.timing(transition, {
      toValue: 1,
      duration: 220,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: true,
    }).start();
  }, [state, transition]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={config.label}
      accessibilityState={{ selected: state === "active" }}
      onPress={() => onSelect(category)}
      style={[
        styles.petalLabel,
        position,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.petalLabelContent,
          {
            opacity: transition.interpolate({
              inputRange: [0, 1],
              outputRange: [0.58, 1],
            }),
            transform: [
              {
                scale: transition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.965, 1],
                }),
              },
            ],
          },
        ]}
      >
        {state !== "inactive" ? (
          <View
            style={[
              styles.petalStateMarker,
              state === "active"
                ? styles.petalActiveMarker
                : styles.petalCompletedMarker,
            ]}
          >
            {state === "completed" ? (
              <AppText
                role="caption"
                weight="semibold"
                color={colors.text.inverse}
                style={styles.petalCompletedMarkerText}
              >
                ✓
              </AppText>
            ) : null}
          </View>
        ) : null}
        <Icon
          width={26}
          height={26}
          color={color}
          style={
            config.iconRotation
              ? { transform: [{ rotate: `${config.iconRotation}deg` }] }
              : undefined
          }
        />
        <AppText role="label" color={color} style={styles.petalLabelText}>
          {config.label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

function JournalOptionChip({
  label,
  selected,
  reduceMotion,
  twoColumn,
  onPress,
}: {
  label: string;
  selected: boolean;
  reduceMotion: boolean;
  twoColumn?: boolean;
  onPress: () => void;
}) {
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    selection.stopAnimation();
    if (reduceMotion) {
      selection.setValue(selected ? 1 : 0);
      return;
    }
    Animated.timing(selection, {
      toValue: selected ? 1 : 0,
      duration: 190,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: false,
    }).start();
  }, [reduceMotion, selected, selection]);

  const idleOpacity = selection.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={3}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionTouchTarget,
        twoColumn && styles.twoColumnOptionTouchTarget,
        pressed && styles.optionPressed,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.option,
          twoColumn && styles.twoColumnOption,
          activeFlowOptionStyle.idle,
        ]}
      >
        <Animated.View
          style={[
            styles.optionSelectionOverlay,
            activeFlowOptionStyle.selected,
            { opacity: selection },
          ]}
        />
        <Animated.View style={[styles.optionTextLayer, { opacity: idleOpacity }]}>
          <AppText
            role="label"
            numberOfLines={1}
            color={colors.text.secondary}
            style={[styles.optionLabel, activeFlowOptionStyle.idleText]}
          >
            {label}
          </AppText>
        </Animated.View>
        <Animated.View
          style={[
            styles.optionSelectedTextLayer,
            twoColumn && styles.twoColumnOptionSelectedTextLayer,
            { opacity: selection },
          ]}
        >
          <AppText
            role="label"
            numberOfLines={1}
            color={colors.brand.primary}
            style={[styles.optionLabel, activeFlowOptionStyle.selectedText]}
          >
            {label}
          </AppText>
        </Animated.View>
      </View>
    </Pressable>
  );
}

function PetalWheel({
  activeCategory,
  onSelect,
}: {
  activeCategory: JournalFlowCategory;
  onSelect: (category: JournalFlowCategory) => void;
}) {
  const activeIndex = categoryOrder.indexOf(activeCategory);

  return (
    <View style={styles.petalWheel}>
      {hasNativePetalGlass ? (
        <LiquidGlassPetalView
          activeIndex={activeIndex}
          onPetalPress={(event) => {
            const nextCategory = categoryOrder[event.nativeEvent.index];
            if (nextCategory) onSelect(nextCategory);
          }}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        categoryOrder.map((category, index) => {
          const config = categories[category];
          const active = category === activeCategory;
          const completed = index < activeIndex;
          const position = petalPosition(config.petalStyle.rotation);

          return (
            <View
              key={category}
              style={[
                styles.petalPressable,
                position,
                {
                  transform: [
                    { rotate: `${config.petalStyle.rotation}deg` },
                    { scaleX: PETAL_RENDER_SCALE_X },
                    { scaleY: PETAL_RENDER_SCALE_Y },
                  ],
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={config.label}
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(category)}
                style={({ pressed }) => [
                  styles.petalInteraction,
                  pressed && styles.petalPressed,
                ]}
              >
                <PetalGlass active={active} completed={completed} />
              </Pressable>
            </View>
          );
        })
      )}

      {categoryOrder.map((category, index) => (
        <PetalLabel
          key={`${category}-label`}
          category={category}
          state={
            index === activeIndex
              ? "active"
              : index < activeIndex
                ? "completed"
                : "inactive"
          }
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

export function JournalFlowModal({
  visible,
  targetDate = new Date(),
  initialCategory = "cycle",
  onClose,
  onComplete,
}: JournalFlowModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<JournalFlowCategory>(initialCategory);
  const [pageIndex, setPageIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [showOptionsTopFade, setShowOptionsTopFade] = useState(false);
  const [showOptionsBottomFade, setShowOptionsBottomFade] = useState(false);
  const [optionsContentHeight, setOptionsContentHeight] = useState(0);
  const selectedRowVisibility = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const progressOpacity = useRef(new Animated.Value(1)).current;
  const progressTranslateX = useRef(new Animated.Value(0)).current;
  const transitioningRef = useRef(false);
  const optionsScrollOffsetRef = useRef(0);
  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const headerTop = getHeaderTop(insets.top, scale);
  const pages = categories[category].pages;
  const page = pages[pageIndex] ?? pages[0];
  const selectedOptions = selections[page.id] ?? [];
  const rawInputValue = inputValues[page.id] ?? "";
  const hasSelectedOptions = selectedOptions.length > 0;
  const usesCompactProgressFade = COMPACT_PROGRESS_FADE_PAGE_IDS.has(page.id);
  const usesActiveCompactProgressFade =
    usesCompactProgressFade && hasSelectedOptions;
  const usesMoodBottomFade = page.id === "mood";
  const usesNutritionBottomFade = page.id === "nutrition";
  const optionsViewportHeight =
    (hasSelectedOptions
      ? OPTIONS_VIEWPORT_HEIGHT
      : OPTIONS_EMPTY_VIEWPORT_HEIGHT) -
    (pages.length > 1
      ? hasSelectedOptions
        ? usesCompactProgressFade
          ? 0
          : 36
        : 18
      : 0);
  const optionsScrollable =
    page.id === "nutrition" ||
    optionsContentHeight > optionsViewportHeight + 1;
  const isNumericInput =
    page.id === "basal-temperature" ||
    page.id === "measurements" ||
    page.id === "water";
  const inputValue = isNumericInput
    ? sanitizeNumericInput(rawInputValue)
    : rawInputValue;
  const canContinue = page.options ? hasSelectedOptions : true;
  const isToday = sameDay(targetDate, new Date());
  const categoryIndex = categoryOrder.indexOf(category);
  const isFinalCategory = categoryIndex === categoryOrder.length - 1;
  const isFinalPage = pageIndex === pages.length - 1;
  const isFinalStep = isFinalCategory && isFinalPage;
  const draftKey = `journal-flow-draft:v1:${targetDate.getFullYear()}-${targetDate.getMonth() + 1}-${targetDate.getDate()}`;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    selectedRowVisibility.stopAnimation();
    if (reduceMotion) {
      selectedRowVisibility.setValue(hasSelectedOptions ? 1 : 0);
      return;
    }
    Animated.timing(selectedRowVisibility, {
      toValue: hasSelectedOptions ? 1 : 0,
      duration: 240,
      easing: Easing.bezier(0.23, 1, 0.32, 1),
      useNativeDriver: false,
    }).start();
  }, [hasSelectedOptions, reduceMotion, selectedRowVisibility]);

  useEffect(() => {
    optionsScrollOffsetRef.current = 0;
    setOptionsContentHeight(0);
    setShowOptionsTopFade(false);
    setShowOptionsBottomFade(false);
  }, [page.id]);

  useEffect(() => {
    if (!optionsContentHeight) return;
    const offset = optionsScrollOffsetRef.current;
    setShowOptionsTopFade(offset > 1);
    setShowOptionsBottomFade(
      offset + optionsViewportHeight < optionsContentHeight - 1,
    );
  }, [optionsContentHeight, optionsViewportHeight]);

  useEffect(() => {
    if (!isNumericInput) return;
    setInputValues((current) => {
      const currentValue = current[page.id] ?? "";
      const sanitizedValue = sanitizeNumericInput(currentValue);
      if (currentValue === sanitizedValue) return current;
      return { ...current, [page.id]: sanitizedValue };
    });
  }, [isNumericInput, page.id]);

  useEffect(() => {
    let cancelled = false;

    if (!visible) {
      setDraftReady(false);
      return () => {
        cancelled = true;
      };
    }

    setDraftReady(false);
    setSubmitting(false);
    transitioningRef.current = false;
    contentOpacity.setValue(1);
    contentTranslateX.setValue(0);
    progressOpacity.setValue(1);
    progressTranslateX.setValue(0);

    void loadLocalSetting<JournalFlowDraft>(draftKey)
      .then((draft) => {
        if (cancelled) return;
        if (
          draft?.version === 1 &&
          categoryOrder.includes(draft.category) &&
          Number.isFinite(draft.pageIndex)
        ) {
          const restoredPages = categories[draft.category].pages;
          setCategory(draft.category);
          setPageIndex(
            Math.max(0, Math.min(Math.trunc(draft.pageIndex), restoredPages.length - 1)),
          );
          setSelections(draft.selections ?? {});
          setInputValues(sanitizeNumericDraftInputs(draft.inputValues ?? {}));
        } else {
          setCategory(initialCategory);
          setPageIndex(0);
          setSelections({});
          setInputValues({});
        }
      })
      .finally(() => {
        if (!cancelled) setDraftReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    contentOpacity,
    contentTranslateX,
    draftKey,
    initialCategory,
    progressOpacity,
    progressTranslateX,
    visible,
  ]);

  const persistDraft = useCallback(
    () =>
      saveLocalSetting(draftKey, {
        version: 1,
        category,
        pageIndex,
        selections,
        inputValues,
        updatedAt: Date.now(),
      } satisfies JournalFlowDraft),
    [category, draftKey, inputValues, pageIndex, selections],
  );

  useEffect(() => {
    if (!visible || !draftReady) return;
    void persistDraft();
  }, [draftReady, persistDraft, visible]);

  const allEntries = useMemo(
    () =>
      Object.values(categories).flatMap((config) =>
        config.pages.flatMap((journalPage) => {
          const optionEntries = (selections[journalPage.id] ?? []).map(
            (value) => ({
              kind: journalPage.kind,
              label: journalPage.title,
              textValue: value,
            }),
          );
          const value = inputValues[journalPage.id]?.trim();
          return value
            ? [
                ...optionEntries,
                {
                  kind: journalPage.kind,
                  label: journalPage.title,
                  textValue: value,
                },
              ]
            : optionEntries;
        }),
      ),
    [inputValues, selections],
  );

  const transitionTo = useCallback(
    (
      nextCategory: JournalFlowCategory,
      nextPageIndex: number,
      direction: 1 | -1,
    ) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;

      const updateStep = () => {
        setCategory(nextCategory);
        setPageIndex(nextPageIndex);
      };
      const finish = () => {
        transitioningRef.current = false;
      };

      if (reduceMotion) {
        updateStep();
        contentOpacity.setValue(1);
        contentTranslateX.setValue(0);
        progressOpacity.setValue(1);
        progressTranslateX.setValue(0);
        finish();
        return;
      }

      const easing = Easing.bezier(0.22, 1, 0.36, 1);
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 120,
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateX, {
          toValue: direction * -8,
          duration: 120,
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(progressOpacity, {
          toValue: 0,
          duration: 120,
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(progressTranslateX, {
          toValue: direction * -8,
          duration: 120,
          easing,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) {
          finish();
          return;
        }
        updateStep();
        contentTranslateX.setValue(direction * 8);
        progressTranslateX.setValue(direction * 8);
        requestAnimationFrame(() => {
          Animated.parallel([
            Animated.timing(contentOpacity, {
              toValue: 1,
              duration: 220,
              easing,
              useNativeDriver: true,
            }),
            Animated.timing(contentTranslateX, {
              toValue: 0,
              duration: 220,
              easing,
              useNativeDriver: true,
            }),
            Animated.timing(progressOpacity, {
              toValue: 1,
              duration: 220,
              easing,
              useNativeDriver: true,
            }),
            Animated.timing(progressTranslateX, {
              toValue: 0,
              duration: 220,
              easing,
              useNativeDriver: true,
            }),
          ]).start(finish);
        });
      });
    },
    [
      contentOpacity,
      contentTranslateX,
      progressOpacity,
      progressTranslateX,
      reduceMotion,
    ],
  );

  const selectCategory = (nextCategory: JournalFlowCategory) => {
    if (nextCategory === category) return;
    const direction = categoryOrder.indexOf(nextCategory) > categoryIndex ? 1 : -1;
    transitionTo(nextCategory, 0, direction);
    if (Platform.OS !== "web") void Haptics.selectionAsync();
  };

  const toggleOption = (option: string) => {
    setSelections((current) => {
      const values = current[page.id] ?? [];
      return {
        ...current,
        [page.id]: values.includes(option)
          ? values.filter((value) => value !== option)
          : [...values, option],
      };
    });
    if (Platform.OS !== "web") void Haptics.selectionAsync();
  };

  const closeFlow = async () => {
    try {
      if (draftReady) await persistDraft();
    } finally {
      onClose();
    }
  };

  const goBack = () => {
    if (pageIndex > 0) {
      transitionTo(category, pageIndex - 1, -1);
      if (Platform.OS !== "web") void Haptics.selectionAsync();
      return;
    }
    if (categoryIndex > 0) {
      const previousCategory = categoryOrder[categoryIndex - 1];
      transitionTo(
        previousCategory,
        categories[previousCategory].pages.length - 1,
        -1,
      );
      if (Platform.OS !== "web") void Haptics.selectionAsync();
      return;
    }
    void closeFlow();
  };

  const goForward = async () => {
    if (!canContinue || submitting) return;
    if (pageIndex < pages.length - 1) {
      transitionTo(category, pageIndex + 1, 1);
      if (Platform.OS !== "web") void Haptics.selectionAsync();
      return;
    }

    if (!isFinalCategory) {
      const nextCategory = categoryOrder[categoryIndex + 1];
      transitionTo(nextCategory, 0, 1);
      if (Platform.OS !== "web") void Haptics.selectionAsync();
      return;
    }

    setSubmitting(true);
    try {
      await onComplete(allEntries);
      await deleteLocalSetting(draftKey);
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => void closeFlow()}
    >
      <StatusBar style="dark" hidden={false} />
      <View style={styles.modalRoot}>
        <View style={{ width: DESIGN_WIDTH * scale, height: DESIGN_HEIGHT * scale }}>
          <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
            <View style={styles.canvas}>
              <Image
                source={categoryBackgroundSources[category]}
                resizeMode="cover"
                blurRadius={Platform.OS === "ios" ? 2.4 : 2}
                style={styles.background}
              />
              <View pointerEvents="none" style={styles.backgroundScrim} />

              <View style={[styles.header, { top: headerTop }]}>
                <GlassControl
                  accessibilityLabel="Закрыть журнал"
                  onPress={() => void closeFlow()}
                  style={styles.headerCircle}
                  tintColor={colors.surface.headerGlassWash}
                  washColor={colors.surface.headerGlassWash}
                >
                  <View style={styles.backIcon}>
                    <BackIcon
                      width={25}
                      height={25}
                      color={colors.brand.primary}
                    />
                  </View>
                </GlassControl>

                <GlassControl
                  accessibilityLabel={isToday ? "Сегодня" : "Выбранный день"}
                  style={styles.headerDatePill}
                  tintColor={colors.surface.headerGlassWash}
                  washColor={colors.surface.headerGlassWash}
                >
                  <HeaderDateLabel
                    date={targetDate}
                    label={isToday ? "Сегодня" : "Выбранный день"}
                  />
                </GlassControl>
              </View>

              <PetalWheel
                activeCategory={category}
                onSelect={selectCategory}
              />

              <ContentShape
                pointerEvents="none"
                width={DESIGN_WIDTH}
                height={361}
                style={styles.contentShape}
              />

              <View
                pointerEvents={draftReady ? "auto" : "none"}
                style={styles.contentPanel}
              >
                <Animated.View
                  style={[
                    styles.pageContent,
                    {
                      opacity: contentOpacity,
                      transform: [{ translateX: contentTranslateX }],
                    },
                  ]}
                >
                  <AppText role="heading" weight="medium" style={styles.pageTitle}>
                    {page.title}
                  </AppText>

                <Animated.View
                  pointerEvents={hasSelectedOptions ? "auto" : "none"}
                  style={[
                    styles.selectedOptionsAnimatedContainer,
                    {
                      height: selectedRowVisibility.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 48],
                      }),
                      opacity: selectedRowVisibility,
                      transform: [
                        {
                          translateY: selectedRowVisibility.interpolate({
                            inputRange: [0, 1],
                            outputRange: [4, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <ScrollView
                    horizontal
                    alwaysBounceHorizontal
                    directionalLockEnabled
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    style={styles.selectedOptionsScroll}
                    contentContainerStyle={styles.selectedOptionsRow}
                  >
                    {selectedOptions.map((option) => (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        accessibilityLabel={`Убрать ${option}`}
                        onPress={() => toggleOption(option)}
                        style={({ pressed }) => [
                          styles.selectedOptionTouchTarget,
                          pressed && styles.selectedOptionChipPressed,
                        ]}
                      >
                        <View
                          pointerEvents="none"
                          style={styles.selectedOptionChip}
                        >
                          <AppText
                            role="caption"
                            numberOfLines={1}
                            style={styles.selectedOptionText}
                          >
                            {`${option}  ×`}
                          </AppText>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <LinearGradient
                    pointerEvents="none"
                    colors={["rgba(255,255,255,1)", "rgba(255,255,255,0)"]}
                    locations={[0, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.selectedOptionsEdgeFade, styles.selectedOptionsEdgeFadeLeft]}
                  />
                  <LinearGradient
                    pointerEvents="none"
                    colors={["rgba(255,255,255,0)", "rgba(255,255,255,1)"]}
                    locations={[0, 1]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={[styles.selectedOptionsEdgeFade, styles.selectedOptionsEdgeFadeRight]}
                  />
                </Animated.View>

                {page.options ? (
                  <View
                    style={[
                      styles.optionsViewport,
                      { height: optionsViewportHeight },
                    ]}
                  >
                    <ScrollView
                      key={page.id}
                      nestedScrollEnabled
                      bounces={optionsScrollable}
                      scrollEnabled={optionsScrollable}
                      showsVerticalScrollIndicator={false}
                      scrollEventThrottle={16}
                      style={[
                        styles.optionsScroll,
                        { height: optionsViewportHeight },
                      ]}
                      contentContainerStyle={[
                        styles.optionsWrap,
                        pages.length > 1 && styles.optionsWrapWithProgress,
                      ]}
                      onContentSizeChange={(_width, contentHeight) => {
                        setOptionsContentHeight(contentHeight);
                        setShowOptionsBottomFade(
                          optionsScrollOffsetRef.current + optionsViewportHeight <
                            contentHeight - 1,
                        );
                      }}
                      onScroll={({ nativeEvent }) => {
                        const { contentOffset, contentSize, layoutMeasurement } =
                          nativeEvent;
                        optionsScrollOffsetRef.current = contentOffset.y;
                        setShowOptionsTopFade(contentOffset.y > 1);
                        setShowOptionsBottomFade(
                          contentOffset.y + layoutMeasurement.height <
                            contentSize.height - 1,
                        );
                      }}
                    >
                      {page.options.map((option) => {
                        const selected = selectedOptions.includes(option);
                        return (
                          <JournalOptionChip
                            key={option}
                            label={option}
                            selected={selected}
                            reduceMotion={reduceMotion}
                            twoColumn={page.id === "menstruation"}
                            onPress={() => toggleOption(option)}
                          />
                        );
                      })}
                    </ScrollView>
                    {showOptionsTopFade ? (
                      <LinearGradient
                        pointerEvents="none"
                        colors={["#FFFFFF", "rgba(255,255,255,0)"]}
                        locations={[0, 1]}
                        style={[styles.optionsEdgeFade, styles.optionsEdgeFadeTop]}
                      />
                    ) : null}
                    {(showOptionsBottomFade ||
                      (usesNutritionBottomFade &&
                        optionsScrollOffsetRef.current <= 1)) &&
                    !usesActiveCompactProgressFade ? (
                      <LinearGradient
                        pointerEvents="none"
                        colors={
                          usesMoodBottomFade || usesNutritionBottomFade
                            ? [
                                "rgba(255,255,255,0)",
                                "rgba(255,255,255,0.2)",
                                "rgba(255,255,255,0.7)",
                                "#FFFFFF",
                                "#FFFFFF",
                              ]
                            : usesActiveCompactProgressFade
                            ? [
                                "rgba(255,255,255,0)",
                                "rgba(255,255,255,0.18)",
                                "#FFFFFF",
                              ]
                            : usesCompactProgressFade
                            ? [
                                "rgba(255,255,255,0)",
                                "rgba(255,255,255,0.12)",
                                "rgba(255,255,255,0.42)",
                              ]
                            : pages.length > 1
                            ? [
                                "rgba(255,255,255,0)",
                                "rgba(255,255,255,0.3)",
                                "rgba(255,255,255,0.78)",
                              ]
                            : ["rgba(255,255,255,0)", "#FFFFFF"]
                        }
                        locations={
                          usesMoodBottomFade || usesNutritionBottomFade
                            ? [0, 0.42, 0.72, 0.86, 1]
                            : usesActiveCompactProgressFade
                            ? [0, 0.62, 1]
                            : usesCompactProgressFade
                            ? [0, 0.62, 1]
                            : pages.length > 1
                              ? [0, 0.58, 1]
                              : [0, 1]
                        }
                        style={[
                          styles.optionsEdgeFade,
                          styles.optionsEdgeFadeBottom,
                          !hasSelectedOptions &&
                            styles.optionsEdgeFadeBottomCompact,
                          pages.length > 1 &&
                            styles.optionsEdgeFadeBottomWithProgress,
                          usesCompactProgressFade &&
                            !hasSelectedOptions &&
                            styles.optionsEdgeFadeBottomTargeted,
                          (usesMoodBottomFade || usesNutritionBottomFade) &&
                            styles.optionsEdgeFadeBottomMood,
                        ]}
                      />
                    ) : null}
                  </View>
                ) : page.input ? (
                  <View style={styles.inputContent}>
                    <View
                      style={[
                        styles.inputShell,
                        page.input.multiline && styles.notesInputShell,
                      ]}
                    >
                      <TextInput
                        accessibilityLabel={page.title}
                        value={inputValue}
                        onChangeText={(value) =>
                          setInputValues((current) => ({
                            ...current,
                            [page.id]: isNumericInput
                              ? sanitizeNumericInput(value)
                              : value,
                          }))
                        }
                        placeholder={page.input.placeholder}
                        placeholderTextColor="#C9C7C8"
                        keyboardType={
                          isNumericInput ? "decimal-pad" : "default"
                        }
                        inputMode={isNumericInput ? "decimal" : undefined}
                        autoCorrect={!isNumericInput}
                        spellCheck={!isNumericInput}
                        multiline={page.input.multiline}
                        textAlignVertical={page.input.multiline ? "top" : "center"}
                        style={[
                          styles.inputField,
                          page.input.multiline && styles.notesInputField,
                        ]}
                      />
                      {page.input.suffix ? (
                        <AppText role="label" style={styles.inputSuffix}>
                          {page.input.suffix}
                        </AppText>
                      ) : null}
                    </View>
                    {page.input.actionLabel ? (
                      <AppText role="label" style={styles.inputActionLabel}>
                        {page.input.actionLabel}
                      </AppText>
                    ) : null}
                  </View>
                ) : null}
                </Animated.View>

                {usesActiveCompactProgressFade ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={[
                      "rgba(255,255,255,0)",
                      "rgba(255,255,255,0.2)",
                      "rgba(255,255,255,0.7)",
                      "#FFFFFF",
                      "#FFFFFF",
                    ]}
                    locations={[0, 0.42, 0.72, 0.86, 1]}
                    style={styles.contentProgressFade}
                  />
                ) : null}

                <View style={styles.panelFooter}>
                  {pages.length > 1 ? (
                    <Animated.View
                      style={[
                        styles.progressRow,
                        {
                          opacity: progressOpacity,
                          transform: [{ translateX: progressTranslateX }],
                        },
                      ]}
                    >
                      {pages.map((item, index) => (
                        <View
                          key={item.id}
                          style={[
                            styles.progressSegment,
                            index === pageIndex && styles.progressSegmentActive,
                          ]}
                        />
                      ))}
                    </Animated.View>
                  ) : null}

                  <View style={styles.actionsRow}>
                    <View
                      style={[
                        styles.secondaryButton,
                        activeFlowBackStyle.back,
                        styles.actionButtonPill,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Назад"
                        onPress={goBack}
                        style={({ pressed }) => [
                          styles.actionPressable,
                          pressed && styles.actionPressed,
                        ]}
                      >
                        <AppText
                          role="label"
                          weight="medium"
                          style={activeFlowBackStyle.backText}
                        >
                          ‹  Назад
                        </AppText>
                      </Pressable>
                    </View>
                    <View
                      style={[
                        styles.primaryButton,
                        activeFlowNextStyle.next,
                        styles.actionButtonPill,
                        (!canContinue || submitting) && styles.primaryButtonDisabled,
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={isFinalStep ? "Сохранить" : "Далее"}
                        accessibilityState={{ disabled: !canContinue || submitting }}
                        disabled={!canContinue || submitting}
                        onPress={() => void goForward()}
                        style={({ pressed }) => [
                          styles.actionPressable,
                          pressed && styles.actionPressed,
                        ]}
                      >
                        <AppText
                          role="label"
                          weight="medium"
                          color={colors.text.inverse}
                          style={activeFlowNextStyle.nextText}
                        >
                          {submitting
                            ? "Сохраняем…"
                            : isFinalStep
                              ? "Сохранить  ›"
                              : "Далее  ›"}
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const previewStyles = StyleSheet.create({
  actionRow: {
    width: 358,
    height: 46,
    flexDirection: "row",
    gap: 15,
  },
  actionButton: {
    flex: 1,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  optionRow: {
    width: 358,
    height: 42,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  optionChip: {
    height: 42,
    paddingHorizontal: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    overflow: "hidden",
  },
  optionText: {
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: -0.24,
    textAlign: "center",
  },
  optionDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#D7D1D3",
  },
  optionDotSelected: {
    backgroundColor: colors.brand.primary,
  },
  optionRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#CFC8CB",
    backgroundColor: "transparent",
  },
  optionRingSelected: {
    borderWidth: 4,
    borderColor: colors.brand.primary,
  },
});

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#31564A",
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
    borderRadius: 40,
    backgroundColor: "#31564A",
  },
  background: {
    position: "absolute",
    left: -13,
    top: -23,
    width: 517,
    height: 919,
  },
  backgroundScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(19,43,38,0.06)",
  },
  header: {
    position: "absolute",
    left: sizes.screenGutter,
    right: sizes.screenGutter,
    height: sizes.touch,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  headerCircle: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
  },
  headerDatePill: {
    position: "absolute",
    left: (370 - 156) / 2,
    width: 156,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
  },
  backIcon: {
    transform: [{ rotate: "180deg" }],
  },
  petalWheel: {
    position: "absolute",
    left: 0,
    top: 66,
    width: DESIGN_WIDTH,
    height: 452,
    zIndex: 5,
  },
  petalPressable: {
    position: "absolute",
    width: PETAL_WIDTH,
    height: PETAL_HEIGHT,
  },
  petalInteraction: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  petalSvgCanvas: {
    width: PETAL_WIDTH,
    height: PETAL_HEIGHT,
  },
  petalPressed: {
    opacity: 0.78,
  },
  petalLabel: {
    position: "absolute",
    minHeight: 54,
    zIndex: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  petalLabelContent: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  petalStateMarker: {
    position: "absolute",
    left: "50%",
    zIndex: 2,
  },
  petalActiveMarker: {
    top: -10,
    width: 10,
    height: 10,
    marginLeft: -5,
    borderRadius: 5,
    borderWidth: 1.8,
    borderColor: colors.text.inverse,
  },
  petalCompletedMarker: {
    top: -13,
    width: 14,
    height: 14,
    marginLeft: -7,
    alignItems: "center",
    justifyContent: "center",
  },
  petalCompletedMarkerText: {
    fontSize: 13,
    lineHeight: 14,
  },
  petalLabelText: {
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: -0.28,
    textAlign: "center",
  },
  contentShape: {
    position: "absolute",
    left: 0,
    top: 513,
    zIndex: 10,
  },
  contentPanel: {
    position: "absolute",
    left: sizes.screenGutter,
    right: sizes.screenGutter,
    top: 568,
    bottom: 16,
    zIndex: 11,
    alignItems: "center",
  },
  pageContent: {
    width: DESIGN_WIDTH,
    alignItems: "center",
    zIndex: 1,
  },
  pageTitle: {
    marginTop: 8,
    color: activeFlowAccentColor,
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: -0.38,
    textAlign: "center",
  },
  optionsViewport: {
    width: 358,
    height: OPTIONS_VIEWPORT_HEIGHT,
    marginTop: 8,
    position: "relative",
    overflow: "hidden",
  },
  optionsScroll: {
    width: 358,
    height: OPTIONS_VIEWPORT_HEIGHT,
    flexGrow: 0,
  },
  optionsWrap: {
    width: 358,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: spacing.xs,
    rowGap: 10,
  },
  optionsWrapWithProgress: {
    paddingBottom: 24,
  },
  optionsEdgeFade: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 32,
    zIndex: 8,
  },
  optionsEdgeFadeTop: {
    top: 0,
  },
  optionsEdgeFadeBottom: {
    bottom: 0,
  },
  optionsEdgeFadeBottomCompact: {
    height: 20,
  },
  optionsEdgeFadeBottomWithProgress: {
    height: 24,
  },
  optionsEdgeFadeBottomTargeted: {
    height: 12,
  },
  optionsEdgeFadeBottomMood: {
    height: 56,
  },
  inputContent: {
    width: 358,
    marginTop: 8,
  },
  inputShell: {
    width: 358,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#E6E1E3",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  inputField: {
    flex: 1,
    height: 42,
    paddingHorizontal: 14,
    paddingVertical: 0,
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  inputSuffix: {
    marginRight: 15,
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 18,
  },
  inputActionLabel: {
    marginTop: 6,
    alignSelf: "flex-end",
    color: colors.text.primary,
    fontSize: 14,
    lineHeight: 18,
  },
  notesInputShell: {
    height: 137,
    borderRadius: 20,
    alignItems: "flex-start",
  },
  notesInputField: {
    height: 137,
    paddingTop: 13,
    paddingBottom: 13,
  },
  selectedOptionsAnimatedContainer: {
    width: DESIGN_WIDTH,
    overflow: "hidden",
  },
  selectedOptionsScroll: {
    width: DESIGN_WIDTH,
    height: 40,
    marginTop: 4,
    flexGrow: 0,
  },
  selectedOptionsRow: {
    minWidth: DESIGN_WIDTH,
    paddingHorizontal: 32,
    paddingVertical: 4,
    alignItems: "center",
    gap: 12,
  },
  selectedOptionsEdgeFade: {
    position: "absolute",
    top: 8,
    width: 36,
    height: 32,
    zIndex: 10,
  },
  selectedOptionsEdgeFadeLeft: {
    left: 0,
  },
  selectedOptionsEdgeFadeRight: {
    right: 0,
  },
  selectedOptionTouchTarget: {
    height: 32,
    borderRadius: 16,
  },
  selectedOptionChip: {
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: "#F2F0F1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  selectedOptionChipPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  selectedOptionText: {
    color: "#423E40",
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: -0.18,
    flexShrink: 0,
  },
  optionTouchTarget: {
    height: 42,
    borderRadius: 21,
  },
  twoColumnOptionTouchTarget: {
    width: 175,
  },
  option: {
    height: 42,
    maxWidth: 358,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E6E1E3",
    backgroundColor: "#F4F1F2",
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  twoColumnOption: {
    width: 175,
    paddingHorizontal: 10,
  },
  optionSelectionOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  optionTextLayer: {
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  optionSelectedTextLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  twoColumnOptionSelectedTextLayer: {
    paddingHorizontal: 10,
  },
  optionSelected: {
    borderColor: "rgba(211,20,113,0.28)",
    backgroundColor: colors.surface.rose,
  },
  optionPressed: {
    transform: [{ scale: 1.025 }],
  },
  optionLabel: {
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: -0.24,
    textAlign: "center",
  },
  panelFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: 15,
    zIndex: 3,
  },
  contentProgressFade: {
    position: "absolute",
    left: -sizes.screenGutter,
    right: -sizes.screenGutter,
    bottom: 54,
    height: 80,
    zIndex: 2,
  },
  progressRow: {
    width: 214,
    alignSelf: "center",
    flexDirection: "row",
    gap: 5,
    zIndex: 2,
  },
  progressSegment: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#DFDFDF",
  },
  progressSegmentActive: {
    backgroundColor: colors.brand.primary,
  },
  actionsRow: {
    width: 358,
    alignSelf: "center",
    height: 46,
    flexDirection: "row",
    gap: 15,
    zIndex: 2,
  },
  secondaryButton: {
    width: 171.5,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  primaryButton: {
    width: 171.5,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...shadows.floating,
  },
  actionPressable: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPill: {
    borderRadius: 23,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.state.disabled,
    shadowOpacity: 0,
  },
  actionPressed: {
    transform: [{ scale: 1.025 }],
  },
});
