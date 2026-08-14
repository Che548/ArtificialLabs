import { Image, StyleSheet, View } from "react-native";
import Svg, { G, Path, Rect, Text as SvgText } from "react-native-svg";

import { AppText, TokenLabel } from "./components";
import { colors, fonts, radii, shadows, spacing } from "./tokens";

export type SymptomPetalContrastVariant =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10;

export type PetalProgressStateVariant =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10;

type VariantConfig = {
  title: string;
  description: string;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  text: string;
  textOpacity?: number;
  textStroke?: string;
  textStrokeWidth?: number;
  shadowText?: string;
  capsuleFill?: string;
  capsuleStroke?: string;
};

type PetalStateStyle = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  text: string;
  outerStroke?: string;
  outerStrokeOpacity?: number;
  outerStrokeWidth?: number;
  capsuleFill?: string;
  marker?: "dot" | "ring" | "check";
};

type PetalProgressVariantConfig = {
  title: string;
  description: string;
  active: PetalStateStyle;
  completed: PetalStateStyle;
};

const variants: Record<SymptomPetalContrastVariant, VariantConfig> = {
  1: {
    title: "Текущий вариант",
    description: "Контрольный образец: почти прозрачный лепесток и белый текст 50%.",
    fill: "#FFFFFF",
    fillOpacity: 0.012,
    stroke: "#FFFFFF",
    strokeOpacity: 0.08,
    strokeWidth: 0.5,
    text: "#FFFFFF",
    textOpacity: 0.5,
  },
  2: {
    title: "Тёмное стекло",
    description: "Дымчатая заливка удерживает белую подпись на любом участке фона.",
    fill: "#21171D",
    fillOpacity: 0.34,
    stroke: "#FFFFFF",
    strokeOpacity: 0.28,
    strokeWidth: 0.8,
    text: "#FFFFFF",
  },
  3: {
    title: "Светлый frost",
    description: "Молочное стекло и тёмно-бордовый текст — спокойный светлый вариант.",
    fill: "#FFFFFF",
    fillOpacity: 0.68,
    stroke: "#FFFFFF",
    strokeOpacity: 0.9,
    strokeWidth: 1,
    text: colors.brand.burgundy,
  },
  4: {
    title: "Нейтральный smoke",
    description: "Менее цветная поверхность сохраняет фотографию, но отделяет подпись.",
    fill: "#3E3A3D",
    fillOpacity: 0.27,
    stroke: "#FFFFFF",
    strokeOpacity: 0.32,
    strokeWidth: 0.8,
    text: "#FFFFFF",
  },
  5: {
    title: "Розовое стекло",
    description: "Системный розовый wash связывает контрол с брендом и даёт белому опору.",
    fill: colors.brand.primary,
    fillOpacity: 0.3,
    stroke: "#FFD7EA",
    strokeOpacity: 0.72,
    strokeWidth: 0.9,
    text: "#FFFFFF",
  },
  6: {
    title: "Контур + светлая поверхность",
    description: "Выраженная кромка, плотный frost и основной цвет текста без тяжёлой тени.",
    fill: "#FFFFFF",
    fillOpacity: 0.54,
    stroke: "#FFFFFF",
    strokeOpacity: 1,
    strokeWidth: 1.7,
    text: "#5F273F",
  },
  7: {
    title: "Тёмный текст с halo",
    description: "Тонкий светлый ореол защищает бордовую подпись на неоднородном фоне.",
    fill: "#FFFFFF",
    fillOpacity: 0.3,
    stroke: "#FFFFFF",
    strokeOpacity: 0.5,
    strokeWidth: 0.8,
    text: "#5B233A",
    textStroke: "rgba(255,255,255,0.72)",
    textStrokeWidth: 3,
  },
  8: {
    title: "Белый текст без тени",
    description: "Воздушная поверхность, усиленная кромка и чистая белая подпись.",
    fill: "#FFFFFF",
    fillOpacity: 0.14,
    stroke: "#FFFFFF",
    strokeOpacity: 0.34,
    strokeWidth: 0.8,
    text: "#FFFFFF",
  },
  9: {
    title: "Локальная капсула",
    description: "Мини-подложка только под подпись; сам лепесток почти не утяжеляется.",
    fill: "#FFFFFF",
    fillOpacity: 0.1,
    stroke: "#FFFFFF",
    strokeOpacity: 0.24,
    strokeWidth: 0.7,
    text: "#FFFFFF",
    capsuleFill: "rgba(42,18,29,0.58)",
    capsuleStroke: "rgba(255,255,255,0.24)",
  },
  10: {
    title: "Адаптивный баланс",
    description: "Сдержанный розово-тёмный wash, светлая кромка и минимальная тень текста.",
    fill: "#7A244B",
    fillOpacity: 0.3,
    stroke: "#FFFFFF",
    strokeOpacity: 0.46,
    strokeWidth: 1,
    text: "#FFFFFF",
    shadowText: "rgba(38,8,22,0.52)",
  },
};

const variantOrder: SymptomPetalContrastVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const progressVariants: Record<
  PetalProgressStateVariant,
  PetalProgressVariantConfig
> = {
  1: {
    title: "Текущая система",
    description: "Контрольный вариант: яркий активный и деликатный пройденный tint.",
    active: {
      fill: "#D83588",
      fillOpacity: 0.2,
      stroke: "#D83588",
      strokeOpacity: 0.42,
      strokeWidth: 0.9,
      text: "#D83588",
    },
    completed: {
      fill: "#F2A8CB",
      fillOpacity: 0.1,
      stroke: "#FFFFFF",
      strokeOpacity: 0.12,
      strokeWidth: 0.7,
      text: "#F2A8CB",
    },
  },
  2: {
    title: "Плотный brand tint",
    description: "Оба состояния читаются цветом поверхности; активный заметно плотнее.",
    active: {
      fill: colors.brand.primary,
      fillOpacity: 0.44,
      stroke: "#FFD8EA",
      strokeOpacity: 0.72,
      strokeWidth: 1,
      text: "#FFFFFF",
    },
    completed: {
      fill: "#F2A8CB",
      fillOpacity: 0.26,
      stroke: "#FFFFFF",
      strokeOpacity: 0.42,
      strokeWidth: 0.8,
      text: "#6C2947",
    },
  },
  3: {
    title: "Светлый frost",
    description: "Светлая поверхность и цветная кромка дают спокойную иерархию.",
    active: {
      fill: "#FFFFFF",
      fillOpacity: 0.66,
      stroke: colors.brand.primary,
      strokeOpacity: 0.88,
      strokeWidth: 1.6,
      text: colors.brand.primary,
    },
    completed: {
      fill: "#FFFFFF",
      fillOpacity: 0.46,
      stroke: "#E88BB7",
      strokeOpacity: 0.7,
      strokeWidth: 1.1,
      text: colors.brand.burgundy,
    },
  },
  4: {
    title: "Бордовый контраст",
    description: "Тёмные стеклянные поверхности уверенно отделяются от сложного фона.",
    active: {
      fill: "#5B233A",
      fillOpacity: 0.62,
      stroke: "#FFFFFF",
      strokeOpacity: 0.48,
      strokeWidth: 1,
      text: "#FFFFFF",
    },
    completed: {
      fill: colors.brand.burgundy,
      fillOpacity: 0.34,
      stroke: "#FFFFFF",
      strokeOpacity: 0.3,
      strokeWidth: 0.8,
      text: "#FFFFFF",
    },
  },
  5: {
    title: "Тональная пара",
    description: "Один розовый диапазон: насыщенный активный и мягкий пройденный.",
    active: {
      fill: colors.brand.primary,
      fillOpacity: 0.36,
      stroke: "#FFD8EA",
      strokeOpacity: 0.64,
      strokeWidth: 1,
      text: "#FFFFFF",
    },
    completed: {
      fill: "#F2A8CB",
      fillOpacity: 0.22,
      stroke: "#FFFFFF",
      strokeOpacity: 0.38,
      strokeWidth: 0.8,
      text: "#FFFFFF",
    },
  },
  6: {
    title: "Двойная кромка",
    description: "Почти прозрачное стекло; статус задают внутренняя и внешняя линии.",
    active: {
      fill: colors.brand.primary,
      fillOpacity: 0.18,
      stroke: "#FFD5E8",
      strokeOpacity: 0.95,
      strokeWidth: 1.4,
      text: "#FFFFFF",
      outerStroke: colors.brand.primary,
      outerStrokeOpacity: 0.48,
      outerStrokeWidth: 4,
    },
    completed: {
      fill: "#FFFFFF",
      fillOpacity: 0.18,
      stroke: "#F2A8CB",
      strokeOpacity: 0.92,
      strokeWidth: 1.2,
      text: "#FFFFFF",
      outerStroke: "#F2A8CB",
      outerStrokeOpacity: 0.24,
      outerStrokeWidth: 3.4,
    },
  },
  7: {
    title: "Светящийся активный",
    description: "Мягкое внешнее кольцо усиливает активный, не делая пройденный тяжёлым.",
    active: {
      fill: colors.brand.primary,
      fillOpacity: 0.3,
      stroke: "#FFFFFF",
      strokeOpacity: 0.7,
      strokeWidth: 1,
      text: "#FFFFFF",
      outerStroke: "#F05A9E",
      outerStrokeOpacity: 0.42,
      outerStrokeWidth: 7,
    },
    completed: {
      fill: "#F2A8CB",
      fillOpacity: 0.16,
      stroke: "#FFFFFF",
      strokeOpacity: 0.34,
      strokeWidth: 0.8,
      text: "#FAD5E6",
    },
  },
  8: {
    title: "Подложка подписи",
    description: "Стекло остаётся лёгким, а статус закрепляется локальной капсулой.",
    active: {
      fill: colors.brand.primary,
      fillOpacity: 0.22,
      stroke: "#FFFFFF",
      strokeOpacity: 0.48,
      strokeWidth: 0.9,
      text: "#FFFFFF",
      capsuleFill: "rgba(139,24,80,0.78)",
    },
    completed: {
      fill: "#FFFFFF",
      fillOpacity: 0.18,
      stroke: "#FFFFFF",
      strokeOpacity: 0.3,
      strokeWidth: 0.8,
      text: "#6A2946",
      capsuleFill: "rgba(250,213,230,0.88)",
    },
  },
  9: {
    title: "Статус-маркер",
    description: "Цвет поддержан отдельным маркером — состояние не зависит только от tint.",
    active: {
      fill: colors.brand.primary,
      fillOpacity: 0.28,
      stroke: "#FFFFFF",
      strokeOpacity: 0.56,
      strokeWidth: 0.9,
      text: "#FFFFFF",
      marker: "ring",
    },
    completed: {
      fill: "#F2A8CB",
      fillOpacity: 0.18,
      stroke: "#FFFFFF",
      strokeOpacity: 0.34,
      strokeWidth: 0.8,
      text: "#FFFFFF",
      marker: "check",
    },
  },
  10: {
    title: "Сбалансированная система",
    description: "Рекомендуемый вариант: ясная иерархия без тяжёлого glow и лишних деталей.",
    active: {
      fill: colors.brand.primary,
      fillOpacity: 0.38,
      stroke: "#FFFFFF",
      strokeOpacity: 0.7,
      strokeWidth: 1.1,
      text: "#FFFFFF",
      marker: "dot",
    },
    completed: {
      fill: "#F2A8CB",
      fillOpacity: 0.24,
      stroke: "#FFFFFF",
      strokeOpacity: 0.42,
      strokeWidth: 0.9,
      text: "#6B2947",
      marker: "check",
    },
  },
};

const progressVariantOrder: PetalProgressStateVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

const petals = [
  { index: 3, label: "Симптомы", rotation: 0 },
  { index: 4, label: "Питание", rotation: 51 },
  { index: 5, label: "Активность", rotation: 102 },
  { index: 6, label: "Показатели", rotation: 154 },
  { index: 0, label: "Цикл", rotation: -155 },
  { index: 1, label: "Настроение", rotation: -103 },
  { index: 2, label: "Энергия", rotation: -52 },
];

const PETAL_PATH =
  "M40 96Q80-8 120 96L155 187C169 224 147 242 116 242H44C13 242-9 224 5 187L40 96Z";

function pointAt(rotation: number, radius: number) {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: 201 + Math.sin(radians) * radius,
    y: 174 - Math.cos(radians) * radius,
  };
}

function PetalWheelPreview({ config }: { config: VariantConfig }) {
  return (
    <View style={styles.stage}>
      <Image
        source={require("../assets/figma/journal-flow/background-symptoms.png")}
        resizeMode="contain"
        style={styles.realBackground}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 402 350">
          {petals.map(({ label, rotation }) => {
            const petal = pointAt(rotation, 81);
            const text = pointAt(rotation, 116);
            const capsuleWidth = Math.max(60, label.length * 7.2 + 18);

            return (
              <G key={label}>
                <G
                  transform={`translate(${petal.x - 80} ${petal.y - 121}) translate(80 121) rotate(${rotation}) scale(.6 .58) translate(-80 -121)`}
                >
                  <Path
                    d={PETAL_PATH}
                    fill={config.fill}
                    fillOpacity={config.fillOpacity}
                    stroke={config.stroke}
                    strokeOpacity={config.strokeOpacity}
                    strokeWidth={config.strokeWidth}
                  />
                </G>

                {config.capsuleFill ? (
                  <Rect
                    x={text.x - capsuleWidth / 2}
                    y={text.y - 12}
                    width={capsuleWidth}
                    height={25}
                    rx={12.5}
                    fill={config.capsuleFill}
                    stroke={config.capsuleStroke}
                    strokeWidth={0.8}
                  />
                ) : null}

                {config.textStroke ? (
                  <SvgText
                    x={text.x}
                    y={text.y + 5}
                    textAnchor="middle"
                    fill={config.text}
                    stroke={config.textStroke}
                    strokeWidth={config.textStrokeWidth}
                    strokeLinejoin="round"
                    fontFamily={fonts.sfSemibold}
                    fontSize={13.5}
                  >
                    {label}
                  </SvgText>
                ) : null}

                {config.shadowText ? (
                  <SvgText
                    x={text.x + 0.8}
                    y={text.y + 6.3}
                    textAnchor="middle"
                    fill={config.shadowText}
                    fontFamily={fonts.sfSemibold}
                    fontSize={13.5}
                  >
                    {label}
                  </SvgText>
                ) : null}

                <SvgText
                  x={text.x}
                  y={text.y + 5}
                  textAnchor="middle"
                  fill={config.text}
                  fillOpacity={config.textOpacity ?? 1}
                  fontFamily={fonts.sfSemibold}
                  fontSize={13.5}
                >
                  {label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
      <View style={styles.stageBadge}>
        <AppText role="caption" weight="semibold" color={colors.text.inverse}>
          реальный фон · Симптомы
        </AppText>
      </View>
    </View>
  );
}

function ProgressPetalWheelPreview({
  config,
}: {
  config: PetalProgressVariantConfig;
}) {
  const inactiveStyle: PetalStateStyle = {
    fill: "#FFFFFF",
    fillOpacity: 0.14,
    stroke: "#FFFFFF",
    strokeOpacity: 0.34,
    strokeWidth: 0.8,
    text: "#FFFFFF",
  };

  return (
    <View style={styles.stage}>
      <Image
        source={require("../assets/figma/journal-flow/background-symptoms.png")}
        resizeMode="contain"
        style={styles.realBackground}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 402 350">
          {petals.map(({ index, label, rotation }) => {
            const state =
              index === 3 ? "active" : index < 3 ? "completed" : "inactive";
            const stateStyle =
              state === "active"
                ? config.active
                : state === "completed"
                  ? config.completed
                  : inactiveStyle;
            const petal = pointAt(rotation, 81);
            const labelPoint = pointAt(rotation, 116);
            const capsuleWidth = Math.max(60, label.length * 7.2 + 18);
            const transform = `translate(${petal.x - 80} ${petal.y - 121}) translate(80 121) rotate(${rotation}) scale(.6 .58) translate(-80 -121)`;

            return (
              <G key={`${config.title}-${label}`}>
                {stateStyle.outerStroke ? (
                  <G transform={transform}>
                    <Path
                      d={PETAL_PATH}
                      fill="none"
                      stroke={stateStyle.outerStroke}
                      strokeOpacity={stateStyle.outerStrokeOpacity}
                      strokeWidth={stateStyle.outerStrokeWidth}
                    />
                  </G>
                ) : null}

                <G transform={transform}>
                  <Path
                    d={PETAL_PATH}
                    fill={stateStyle.fill}
                    fillOpacity={stateStyle.fillOpacity}
                    stroke={stateStyle.stroke}
                    strokeOpacity={stateStyle.strokeOpacity}
                    strokeWidth={stateStyle.strokeWidth}
                  />
                </G>

                {stateStyle.capsuleFill ? (
                  <Rect
                    x={labelPoint.x - capsuleWidth / 2}
                    y={labelPoint.y - 12}
                    width={capsuleWidth}
                    height={25}
                    rx={12.5}
                    fill={stateStyle.capsuleFill}
                  />
                ) : null}

                {stateStyle.marker ? (
                  <G>
                    {stateStyle.marker === "ring" ? (
                      <Rect
                        x={labelPoint.x - 5}
                        y={labelPoint.y - 25}
                        width={10}
                        height={10}
                        rx={5}
                        fill="none"
                        stroke={stateStyle.text}
                        strokeWidth={1.8}
                      />
                    ) : stateStyle.marker === "dot" ? (
                      <Rect
                        x={labelPoint.x - 4}
                        y={labelPoint.y - 24}
                        width={8}
                        height={8}
                        rx={4}
                        fill={stateStyle.text}
                      />
                    ) : (
                      <SvgText
                        x={labelPoint.x}
                        y={labelPoint.y - 15}
                        textAnchor="middle"
                        fill={stateStyle.text}
                        fontFamily={fonts.sfBold}
                        fontSize={13}
                      >
                        ✓
                      </SvgText>
                    )}
                  </G>
                ) : null}

                <SvgText
                  x={labelPoint.x}
                  y={labelPoint.y + 5}
                  textAnchor="middle"
                  fill={stateStyle.text}
                  fontFamily={fonts.sfSemibold}
                  fontSize={13.5}
                >
                  {label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>

      <View style={styles.progressLegend}>
        <View style={styles.progressLegendItem}>
          <View style={[styles.legendDot, { backgroundColor: config.completed.fill }]} />
          <AppText role="caption" weight="semibold" color={colors.text.inverse}>
            Пройденные
          </AppText>
        </View>
        <View style={styles.progressLegendItem}>
          <View style={[styles.legendDot, { backgroundColor: config.active.fill }]} />
          <AppText role="caption" weight="semibold" color={colors.text.inverse}>
            Активный
          </AppText>
        </View>
      </View>
    </View>
  );
}

export function SymptomPetalContrastPreview({
  variant,
}: {
  variant: SymptomPetalContrastVariant;
}) {
  const config = variants[variant];

  return (
    <View style={styles.variantCard}>
      <View style={styles.variantHeader}>
        <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
        <AppText role="heading" weight="semibold">
          {config.title}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {config.description}
        </AppText>
      </View>
      <PetalWheelPreview config={config} />
    </View>
  );
}

export function SymptomPetalContrastCatalog() {
  return (
    <View style={styles.catalog}>
      {variantOrder.map((variant) => (
        <SymptomPetalContrastPreview key={variant} variant={variant} />
      ))}
    </View>
  );
}

export function PetalProgressStatesCatalog() {
  return (
    <View style={styles.catalog}>
      {progressVariantOrder.map((variant) => {
        const config = progressVariants[variant];

        return (
          <View key={variant} style={styles.variantCard}>
            <View style={styles.variantHeader}>
              <TokenLabel>ВАРИАНТ {variant}</TokenLabel>
              <AppText role="heading" weight="semibold">
                {config.title}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {config.description}
              </AppText>
            </View>
            <ProgressPetalWheelPreview config={config} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  catalog: {
    width: 358,
    gap: spacing.xl,
  },
  variantCard: {
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  variantHeader: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  stage: {
    width: "100%",
    height: 312,
    overflow: "hidden",
    backgroundColor: "#2A201D",
  },
  realBackground: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: 778,
  },
  stageBadge: {
    position: "absolute",
    left: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(25,12,18,0.54)",
  },
  progressLegend: {
    position: "absolute",
    left: 12,
    bottom: 12,
    flexDirection: "row",
    gap: 8,
  },
  progressLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: "rgba(25,12,18,0.58)",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
  },
});
