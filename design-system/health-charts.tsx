import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';

import { AppText, TokenLabel } from './components';
import {
  chartColors,
  colors,
  radii,
  shadows,
  sizes,
  spacing,
} from './tokens';

const CHART_WIDTH = 330;
const CHART_HEIGHT = 150;

export type HealthMetricPoint = {
  label: string;
  value: number;
};

export type HealthCategoryPoint = {
  label: string;
  value: number;
};

function scalePoints(
  values: number[],
  min: number,
  max: number,
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
) {
  const range = Math.max(max - min, 0.001);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values.map((value, index) => ({
    x: index * step,
    y: height - ((value - min) / range) * height,
  }));
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');
}

function areaPath(points: Array<{ x: number; y: number }>, height: number) {
  if (points.length === 0) return '';
  return `${linePath(points)} L${points.at(-1)?.x ?? 0} ${height} L${points[0].x} ${height} Z`;
}

function ChartFrame({
  accessibilitySummary,
  children,
  index,
  period,
  summary,
  title,
  unit,
  value,
}: {
  accessibilitySummary: string;
  children: ReactNode;
  index: number;
  period: string;
  summary: string;
  title: string;
  unit?: string;
  value: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilitySummary}
      style={styles.chartFrame}
    >
      <View style={styles.chartHeading}>
        <View style={styles.chartTitleGroup}>
          <TokenLabel>{String(index).padStart(2, '0')} / HEALTH DATA</TokenLabel>
          <AppText role="heading" weight="semibold">
            {title}
          </AppText>
        </View>
        <AppText role="caption" color={colors.text.secondary}>
          {period}
        </AppText>
      </View>

      <View style={styles.chartValueRow}>
        <AppText numeric role="title" weight="semibold">
          {value}
        </AppText>
        {unit ? (
          <AppText role="label" color={colors.text.secondary}>
            {unit}
          </AppText>
        ) : null}
        <AppText role="caption" color={colors.text.secondary} style={styles.chartSummary}>
          {summary}
        </AppText>
      </View>

      {children}
    </View>
  );
}

function AxisLabels({ labels }: { labels: string[] }) {
  return (
    <View style={styles.axisLabels}>
      {labels.map((label, index) => (
        <AppText key={`${label}-${index}`} role="caption" color={colors.text.secondary}>
          {label}
        </AppText>
      ))}
    </View>
  );
}

export function BasalTemperatureChart({
  data = [36.42, 36.39, 36.45, 36.48, 36.51, 36.73, 36.78, 36.71, 36.76],
}: {
  data?: number[];
}) {
  const points = scalePoints(data, 36.2, 36.95, CHART_WIDTH, 124);
  const coverlineY = 124 - ((36.6 - 36.2) / 0.75) * 124;

  return (
    <ChartFrame
      accessibilitySummary="График базальной температуры. После пятого дня температура поднялась выше базовой линии 36,6 градуса."
      index={9}
      period="9 дней"
      summary="+0,29 за цикл"
      title="Базальная температура"
      unit="°C"
      value="36,76"
    >
      <View style={styles.plotWrap}>
        <Svg width="100%" height={140} viewBox={`0 0 ${CHART_WIDTH} 140`}>
          <Defs>
            <LinearGradient id="bbtArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={chartColors.primary} stopOpacity={0.22} />
              <Stop offset="1" stopColor={chartColors.primary} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0, 41, 82, 123].map((y) => (
            <Line key={y} x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke={chartColors.grid} />
          ))}
          <Line
            x1={0}
            x2={CHART_WIDTH}
            y1={coverlineY}
            y2={coverlineY}
            stroke={chartColors.burgundy}
            strokeDasharray="5 5"
            strokeOpacity={0.5}
          />
          <Path d={areaPath(points, 124)} fill="url(#bbtArea)" />
          <Path
            d={linePath(points)}
            fill="none"
            stroke={chartColors.primary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          {points.map((point, index) => (
            <Circle
              key={`${point.x}-${point.y}`}
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 5 : 3}
              fill={index === points.length - 1 ? colors.surface.raised : chartColors.primary}
              stroke={chartColors.primary}
              strokeWidth={index === points.length - 1 ? 3 : 0}
            />
          ))}
        </Svg>
        <AxisLabels labels={['1', '3', '5', '7', '9 день']} />
      </View>
    </ChartFrame>
  );
}

export function WeightTrendChart({
  data = [64.8, 64.5, 64.4, 64.2, 64.1, 63.9, 63.8],
}: {
  data?: number[];
}) {
  const points = scalePoints(data, 63.4, 65.1, CHART_WIDTH, 112);

  return (
    <ChartFrame
      accessibilitySummary="График веса за семь недель. Вес плавно снизился с 64,8 до 63,8 килограмма."
      index={10}
      period="7 недель"
      summary="−1,0 кг стабильно"
      title="Вес"
      unit="кг"
      value="63,8"
    >
      <View style={styles.plotWrap}>
        <Svg width="100%" height={132} viewBox={`0 0 ${CHART_WIDTH} 132`}>
          <Defs>
            <LinearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={chartColors.burgundy} stopOpacity={0.24} />
              <Stop offset="1" stopColor={chartColors.burgundy} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={45} width={CHART_WIDTH} height={34} rx={17} fill={chartColors.quiet} />
          <Path d={areaPath(points, 112)} fill="url(#weightArea)" />
          <Path
            d={linePath(points)}
            fill="none"
            stroke={chartColors.burgundy}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
          <Circle
            cx={points.at(-1)?.x}
            cy={points.at(-1)?.y}
            r={6}
            fill={colors.surface.raised}
            stroke={chartColors.burgundy}
            strokeWidth={3}
          />
        </Svg>
        <AxisLabels labels={['30 июн', '14 июл', '28 июл', '10 авг']} />
      </View>
    </ChartFrame>
  );
}

export function WaterGoalChart({
  data = [1.8, 2.25, 1.55, 2.4, 2.1, 2.25, 1.95],
}: {
  data?: number[];
}) {
  const max = 2.6;
  const barWidth = 28;
  const gap = 19;

  return (
    <ChartFrame
      accessibilitySummary="Столбчатый график воды за неделю. Цель 2,25 литра достигнута в четырёх из семи дней."
      index={11}
      period="Эта неделя"
      summary="цель выполнена 4/7"
      title="Вода"
      unit="л"
      value="1,95"
    >
      <View style={styles.plotWrap}>
        <Svg width="100%" height={142} viewBox={`0 0 ${CHART_WIDTH} 142`}>
          <Line
            x1={0}
            x2={CHART_WIDTH}
            y1={120 - (2.25 / max) * 108}
            y2={120 - (2.25 / max) * 108}
            stroke={chartColors.positive}
            strokeDasharray="6 5"
            strokeWidth={2}
          />
          {data.map((value, index) => {
            const height = (value / max) * 108;
            return (
              <Rect
                key={`${index}-${value}`}
                x={index * (barWidth + gap) + 10}
                y={120 - height}
                width={barWidth}
                height={height}
                rx={barWidth / 2}
                fill={value >= 2.25 ? chartColors.positive : chartColors.primarySoft}
              />
            );
          })}
        </Svg>
        <AxisLabels labels={['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']} />
      </View>
    </ChartFrame>
  );
}

export function CyclePhaseChart() {
  const days = Array.from({ length: 28 }, (_, index) => index + 1);

  return (
    <ChartFrame
      accessibilitySummary="Лента цикла на 28 дней. Менструация с первого по пятый день, фертильное окно с десятого по шестнадцатый, овуляция на четырнадцатый день."
      index={12}
      period="Текущий цикл"
      summary="овуляция через 2 дня"
      title="Фазы цикла"
      unit="день"
      value="12"
    >
      <View style={styles.phaseLegend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: chartColors.primary }]} /><AppText role="caption">Менструация</AppText></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: chartColors.positive }]} /><AppText role="caption">Фертильное окно</AppText></View>
      </View>
      <View style={styles.cycleGrid}>
        {days.map((day) => {
          const menstruation = day <= 5;
          const fertile = day >= 10 && day <= 16;
          const ovulation = day === 14;
          const current = day === 12;
          return (
            <View key={day} style={styles.cycleDay}>
              <View
                style={[
                  styles.cycleDayMark,
                  menstruation && styles.cycleDayMenstruation,
                  fertile && styles.cycleDayFertile,
                  ovulation && styles.cycleDayOvulation,
                  current && styles.cycleDayCurrent,
                ]}
              />
              {(day === 1 || day % 7 === 0 || current) ? (
                <AppText numeric role="caption" color={current ? colors.text.primary : colors.text.secondary}>
                  {day}
                </AppText>
              ) : <View style={styles.cycleLabelSpacer} />}
            </View>
          );
        })}
      </View>
    </ChartFrame>
  );
}

export function MenstruationIntensityChart({
  data = [0, 0, 0, 1, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0],
}: {
  data?: number[];
}) {
  return (
    <ChartFrame
      accessibilitySummary="График интенсивности менструации за четырнадцать дней. Пик отмечен на пятый день, затем интенсивность снижается."
      index={13}
      period="14 дней"
      summary="4 дня отмечено"
      title="Интенсивность менструации"
      value="Умеренная"
    >
      <View style={styles.intensityRows}>
        {[3, 2, 1].map((level) => (
          <View key={level} style={styles.intensityRow}>
            <AppText role="caption" color={colors.text.secondary} style={styles.intensityLabel}>
              {level === 3 ? 'Обильная' : level === 2 ? 'Умеренная' : 'Слабая'}
            </AppText>
            <View style={styles.intensityTrack}>
              {data.map((value, index) => (
                <View
                  key={`${level}-${index}`}
                  style={[
                    styles.intensityCell,
                    value === level && {
                      backgroundColor:
                        level === 3
                          ? chartColors.burgundy
                          : level === 2
                            ? chartColors.primary
                            : chartColors.primarySoft,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </ChartFrame>
  );
}

export function MoodHeatmapChart() {
  const values = [2, 3, 3, 4, 2, 1, 2, 3, 4, 4, 3, 2, 2, 3, 4, 3, 2, 1, 2, 3, 3, 4, 4, 3, 2, 3, 4, 3];
  const palette = ['#F3ECEF', '#E8CAD7', '#D891B1', '#C95388'];

  return (
    <ChartFrame
      accessibilitySummary="Тепловая карта настроения за четыре недели. Большинство дней спокойные или радостные, четыре дня отмечены как напряжённые."
      index={14}
      period="4 недели"
      summary="стабильно 21/28 дней"
      title="Настроение"
      value="Спокойное"
    >
      <View style={styles.heatmapWrap}>
        <View style={styles.heatmapGrid}>
          {values.map((value, index) => (
            <View
              key={`${index}-${value}`}
              style={[styles.heatmapCell, { backgroundColor: palette[value - 1] }]}
            />
          ))}
        </View>
        <View style={styles.heatmapLegend}>
          <AppText role="caption" color={colors.text.secondary}>напряжение</AppText>
          <View style={styles.heatmapScale}>
            {palette.map((color) => <View key={color} style={[styles.heatmapScaleCell, { backgroundColor: color }]} />)}
          </View>
          <AppText role="caption" color={colors.text.secondary}>позитивно</AppText>
        </View>
      </View>
    </ChartFrame>
  );
}

export function EnergySleepChart() {
  const values = [2, 3, 2, 4, 3, 1, 2, 3, 4, 3, 2, 2, 4, 3];
  const points = scalePoints(values, 1, 4, CHART_WIDTH, 104);

  return (
    <ChartFrame
      accessibilitySummary="Индекс отметок энергии и сна за четырнадцать дней. Низкая энергия была отмечена один раз, бессонница два раза."
      index={15}
      period="14 дней"
      summary="бессонница 2 раза"
      title="Энергия и сон"
      value="Средняя"
    >
      <View style={styles.plotWrap}>
        <Svg width="100%" height={130} viewBox={`0 0 ${CHART_WIDTH} 130`}>
          {[0, 34.5, 69, 103.5].map((y) => (
            <Line key={y} x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke={chartColors.grid} />
          ))}
          <Path
            d={linePath(points)}
            fill="none"
            stroke={chartColors.positive}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
          />
          {points.map((point, index) => (
            <Line
              key={`${point.x}-${point.y}`}
              x1={point.x}
              x2={point.x}
              y1={104}
              y2={point.y}
              stroke={index === 5 ? chartColors.warning : chartColors.positive}
              strokeOpacity={0.32}
              strokeWidth={6}
              strokeLinecap="round"
            />
          ))}
          {points.map((point, index) => (
            <Circle
              key={`dot-${point.x}-${point.y}`}
              cx={point.x}
              cy={point.y}
              r={4}
              fill={index === 5 ? chartColors.warning : chartColors.positive}
            />
          ))}
        </Svg>
        <AxisLabels labels={['28 июл', '1 авг', '5 авг', '10 авг']} />
      </View>
    </ChartFrame>
  );
}

export function ActivityDistributionChart() {
  const segments = [
    { label: 'Ходьба', value: 5, color: chartColors.positive },
    { label: 'Йога', value: 2, color: chartColors.primary },
    { label: 'Плавание', value: 1, color: chartColors.burgundy },
    { label: 'Без тренировки', value: 6, color: chartColors.grid },
  ];
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

  return (
    <ChartFrame
      accessibilitySummary="Распределение активности за четырнадцать дней. Пять дней ходьбы, два дня йоги, один день плавания и шесть дней без тренировки."
      index={16}
      period="14 дней"
      summary="8 активных дней"
      title="Физическая активность"
      value="57%"
    >
      <View style={styles.activityChart}>
        <View style={styles.activityRingWrap}>
          <Svg width={132} height={132} viewBox="0 0 132 132">
            <Circle cx={66} cy={66} r={48} fill="none" stroke={chartColors.grid} strokeWidth={20} />
            {segments.slice(0, 3).map((segment) => {
              const circumference = 2 * Math.PI * 48;
              const length = circumference * (segment.value / total);
              const dashOffset = -circumference * offset;
              offset += segment.value / total;
              return (
                <Circle
                  key={segment.label}
                  cx={66}
                  cy={66}
                  r={48}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={20}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 66 66)"
                />
              );
            })}
          </Svg>
          <View style={styles.activityRingValue}>
            <AppText numeric role="heading" weight="semibold">8</AppText>
            <AppText role="caption" color={colors.text.secondary}>дней</AppText>
          </View>
        </View>
        <View style={styles.activityLegend}>
          {segments.map((segment) => (
            <View key={segment.label} style={styles.activityLegendRow}>
              <View style={[styles.legendDot, { backgroundColor: segment.color }]} />
              <AppText role="caption" style={styles.activityLegendLabel}>{segment.label}</AppText>
              <AppText numeric role="caption" weight="semibold">{segment.value}</AppText>
            </View>
          ))}
        </View>
      </View>
    </ChartFrame>
  );
}

export function SymptomRadarChart() {
  const values = [0.7, 0.45, 0.25, 0.55, 0.32, 0.18];
  const labels = ['Живот', 'Спина', 'Голова', 'Грудь', 'Кожа', 'Судороги'];
  const center = 76;
  const radius = 60;
  const pointAt = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + (index / values.length) * Math.PI * 2;
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale,
    };
  };
  const polygon = values.map((value, index) => pointAt(index, value));

  return (
    <ChartFrame
      accessibilitySummary="Радар частоты симптомов. Чаще всего отмечалась боль в животе, затем чувствительность груди и боль в спине."
      index={17}
      period="Текущий цикл"
      summary="6 типов симптомов"
      title="Частота симптомов"
      value="11 отметок"
    >
      <View style={styles.radarLayout}>
        <Svg width={160} height={160} viewBox="0 0 152 152">
          {[0.33, 0.66, 1].map((scale) => (
            <Polygon
              key={scale}
              points={values.map((_, index) => pointAt(index, scale)).map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={chartColors.grid}
            />
          ))}
          {values.map((_, index) => {
            const point = pointAt(index, 1);
            return <Line key={index} x1={center} y1={center} x2={point.x} y2={point.y} stroke={chartColors.grid} />;
          })}
          <Polygon
            points={polygon.map((point) => `${point.x},${point.y}`).join(' ')}
            fill={chartColors.primary}
            fillOpacity={0.18}
            stroke={chartColors.primary}
            strokeWidth={2.5}
          />
          {polygon.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={3.5} fill={chartColors.primary} />)}
        </Svg>
        <View style={styles.radarLegend}>
          {labels.map((label, index) => (
            <View key={label} style={styles.radarLegendRow}>
              <AppText role="caption" color={colors.text.secondary} style={styles.radarLegendLabel}>{label}</AppText>
              <View style={styles.radarLegendTrack}>
                <View style={[styles.radarLegendFill, { width: `${Math.round(values[index] * 100)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </ChartFrame>
  );
}

export function LabReferenceChart() {
  const analytes = [
    { label: 'Гемоглобин', value: 0.62, status: 'Норма' },
    { label: 'Ферритин', value: 0.28, status: 'Ниже цели' },
    { label: 'ТТГ', value: 0.48, status: 'Норма' },
    { label: 'Витамин D', value: 0.36, status: 'Погранично' },
  ];

  return (
    <ChartFrame
      accessibilitySummary="График лабораторных показателей относительно референса. Гемоглобин и ТТГ в норме, ферритин ниже целевого уровня, витамин D пограничный."
      index={18}
      period="Последний анализ"
      summary="2 из 4 требуют внимания"
      title="Лабораторные референсы"
      value="2 / 4"
    >
      <View style={styles.labRows}>
        {analytes.map((analyte) => (
          <View key={analyte.label} style={styles.labRow}>
            <View style={styles.labRowHeading}>
              <AppText role="caption" weight="medium">{analyte.label}</AppText>
              <AppText
                role="caption"
                color={analyte.status === 'Норма' ? chartColors.positive : chartColors.warning}
              >
                {analyte.status}
              </AppText>
            </View>
            <View style={styles.labTrack}>
              <View style={styles.labReferenceRange} />
              <View
                style={[
                  styles.labMarker,
                  {
                    left: `${Math.round(analyte.value * 100)}%`,
                    backgroundColor: analyte.status === 'Норма' ? chartColors.positive : chartColors.warning,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </ChartFrame>
  );
}

export function HormoneWindowChart() {
  const estrogen = [18, 22, 27, 34, 48, 72, 96, 68, 42, 31, 25];
  const lh = [8, 9, 8, 10, 12, 22, 94, 30, 13, 10, 9];
  const estrogenPoints = scalePoints(estrogen, 0, 110, CHART_WIDTH, 118);
  const lhPoints = scalePoints(lh, 0, 110, CHART_WIDTH, 118);

  return (
    <ChartFrame
      accessibilitySummary="График гормонального окна. Эстроген растёт постепенно, пик ЛГ приходится на четырнадцатый день цикла."
      index={1}
      period="Дни 8–18"
      summary="пик ЛГ сегодня"
      title="Гормональное окно"
      value="14 день"
    >
      <View style={styles.inlineLegend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: chartColors.primary }]} /><AppText role="caption">ЛГ</AppText></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: chartColors.positive }]} /><AppText role="caption">Эстроген</AppText></View>
      </View>
      <View style={styles.plotWrap}>
        <Svg width="100%" height={140} viewBox={`0 0 ${CHART_WIDTH} 140`}>
          <Defs>
            <LinearGradient id="hormoneArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={chartColors.positive} stopOpacity={0.2} />
              <Stop offset="1" stopColor={chartColors.positive} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={158} y={0} width={64} height={118} rx={16} fill="rgba(31,187,116,0.08)" />
          {[0, 39, 78, 117].map((y) => <Line key={y} x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke={chartColors.grid} />)}
          <Path d={areaPath(estrogenPoints, 118)} fill="url(#hormoneArea)" />
          <Path d={linePath(estrogenPoints)} fill="none" stroke={chartColors.positive} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
          <Path d={linePath(lhPoints)} fill="none" stroke={chartColors.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
          <Circle cx={lhPoints[6].x} cy={lhPoints[6].y} r={6} fill={colors.surface.raised} stroke={chartColors.primary} strokeWidth={3} />
        </Svg>
        <AxisLabels labels={['8', '10', '12', '14', '16', '18 день']} />
      </View>
    </ChartFrame>
  );
}

export function SleepCompositionChart() {
  const nights = [
    [18, 48, 25, 9], [14, 51, 29, 6], [22, 44, 24, 10],
    [16, 49, 28, 7], [12, 53, 30, 5], [26, 41, 22, 11], [15, 50, 29, 6],
  ];
  const stageColors = [chartColors.burgundy, chartColors.primary, chartColors.primarySoft, chartColors.quiet];

  return (
    <ChartFrame
      accessibilitySummary="Состав сна за семь ночей. В среднем семь часов сорок две минуты, глубокий сон составляет восемнадцать процентов."
      index={2}
      period="7 ночей"
      summary="+24 мин к прошлой неделе"
      title="Структура сна"
      unit="ч"
      value="7:42"
    >
      <View style={styles.inlineLegend}>
        {['Глубокий', 'Основной', 'REM', 'Пробуждения'].map((label, index) => (
          <View key={label} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: stageColors[index] }]} /><AppText role="caption">{label}</AppText></View>
        ))}
      </View>
      <View style={styles.sleepRows}>
        {nights.map((night, nightIndex) => (
          <View key={nightIndex} style={styles.sleepRow}>
            <AppText role="caption" color={colors.text.secondary} style={styles.sleepDay}>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][nightIndex]}</AppText>
            <View style={styles.sleepTrack}>
              {night.map((width, stageIndex) => <View key={stageIndex} style={[styles.sleepSegment, { width: `${width}%`, backgroundColor: stageColors[stageIndex] }]} />)}
            </View>
          </View>
        ))}
      </View>
    </ChartFrame>
  );
}

export function CycleRegularityChart() {
  const cycleLengths = [29, 28, 31, 30, 29, 30];
  const min = 25;
  const max = 34;

  return (
    <ChartFrame
      accessibilitySummary="График регулярности шести циклов. Продолжительность находится в диапазоне от двадцати восьми до тридцати одного дня."
      index={3}
      period="6 циклов"
      summary="разброс 3 дня"
      title="Регулярность цикла"
      unit="дней"
      value="29,5"
    >
      <View style={styles.plotWrap}>
        <Svg width="100%" height={148} viewBox={`0 0 ${CHART_WIDTH} 148`}>
          <Rect x={(3 / 9) * CHART_WIDTH} y={4} width={(3 / 9) * CHART_WIDTH} height={126} rx={18} fill="rgba(31,187,116,0.08)" />
          <Line x1={(4.5 / 9) * CHART_WIDTH} x2={(4.5 / 9) * CHART_WIDTH} y1={0} y2={132} stroke={chartColors.positive} strokeDasharray="5 5" />
          {cycleLengths.map((value, index) => {
            const y = 14 + index * 21;
            const x = ((value - min) / (max - min)) * CHART_WIDTH;
            return <Path key={index} d={`M0 ${y} H${x}`} fill="none" stroke={index === cycleLengths.length - 1 ? chartColors.primary : chartColors.grid} strokeLinecap="round" strokeWidth={10} />;
          })}
          {cycleLengths.map((value, index) => {
            const y = 14 + index * 21;
            const x = ((value - min) / (max - min)) * CHART_WIDTH;
            return <Circle key={`point-${index}`} cx={x} cy={y} r={5} fill={index === cycleLengths.length - 1 ? chartColors.primary : chartColors.positive} />;
          })}
        </Svg>
        <AxisLabels labels={['25', '28', '31', '34 дня']} />
      </View>
    </ChartFrame>
  );
}

export function PainPatternChart() {
  const pain = [1, 2, 4, 7, 6, 4, 3, 2, 1, 2, 3, 2, 1, 1];
  const points = scalePoints(pain, 0, 8, CHART_WIDTH, 116);

  return (
    <ChartFrame
      accessibilitySummary="График боли по дням цикла. Максимальная интенсивность семь из десяти отмечена на четвёртый день."
      index={4}
      period="14 дней"
      summary="пик на 4 день"
      title="Паттерн боли"
      unit="из 10"
      value="7"
    >
      <View style={styles.plotWrap}>
        <Svg width="100%" height={140} viewBox={`0 0 ${CHART_WIDTH} 140`}>
          <Defs><LinearGradient id="painArea" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={chartColors.primary} stopOpacity={0.28} /><Stop offset="1" stopColor={chartColors.primary} stopOpacity={0} /></LinearGradient></Defs>
          <Rect x={0} y={0} width={102} height={116} rx={18} fill={chartColors.range} fillOpacity={0.42} />
          {[0, 38.5, 77, 115.5].map((y) => <Line key={y} x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke={chartColors.grid} />)}
          <Path d={areaPath(points, 116)} fill="url(#painArea)" />
          <Path d={linePath(points)} fill="none" stroke={chartColors.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
          {points.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={index === 3 ? 5.5 : 2.8} fill={index === 3 ? chartColors.burgundy : chartColors.primary} />)}
        </Svg>
        <AxisLabels labels={['1', '4', '7', '10', '14 день']} />
      </View>
    </ChartFrame>
  );
}

export function FerritinTrendChart() {
  const values = [18, 21, 27, 32, 39, 46];
  const points = scalePoints(values, 10, 60, CHART_WIDTH, 116);
  const referenceTop = 116 - ((50 - 10) / 50) * 116;
  const referenceBottom = 116 - ((30 - 10) / 50) * 116;

  return (
    <ChartFrame
      accessibilitySummary="Динамика ферритина за шесть измерений. Показатель вырос с восемнадцати до сорока шести нанограмм на миллилитр и вошёл в целевой диапазон."
      index={5}
      period="12 месяцев"
      summary="в целевом диапазоне"
      title="Ферритин"
      unit="нг/мл"
      value="46"
    >
      <View style={styles.referenceCaption}>
        <View style={[styles.legendDot, { backgroundColor: 'rgba(31,187,116,0.24)' }]} />
        <AppText role="caption" color={colors.text.secondary}>персональная цель 30–50</AppText>
      </View>
      <View style={styles.plotWrap}>
        <Svg width="100%" height={140} viewBox={`0 0 ${CHART_WIDTH} 140`}>
          <Defs><LinearGradient id="ferritinArea" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={chartColors.burgundy} stopOpacity={0.2} /><Stop offset="1" stopColor={chartColors.burgundy} stopOpacity={0} /></LinearGradient></Defs>
          <Rect x={0} y={referenceTop} width={CHART_WIDTH} height={referenceBottom - referenceTop} rx={14} fill="rgba(31,187,116,0.12)" />
          {[0, 38.5, 77, 115.5].map((y) => <Line key={y} x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke={chartColors.grid} />)}
          <Path d={areaPath(points, 116)} fill="url(#ferritinArea)" />
          <Path d={linePath(points)} fill="none" stroke={chartColors.burgundy} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
          {points.map((point, index) => <Circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 5.5 : 3} fill={index === points.length - 1 ? colors.surface.raised : chartColors.burgundy} stroke={chartColors.burgundy} strokeWidth={index === points.length - 1 ? 3 : 0} />)}
        </Svg>
        <AxisLabels labels={['авг', 'окт', 'дек', 'фев', 'май', 'авг']} />
      </View>
    </ChartFrame>
  );
}

export function RecoveryBalanceChart() {
  const energy = [3, 4, 2, 5, 4, 3, 5];
  const load = [2, 1, 4, 2, 3, 4, 1];
  const maxBar = 44;

  return (
    <ChartFrame
      accessibilitySummary="Баланс восстановления за неделю. Лучшее восстановление было во вторник и воскресенье, повышенная нагрузка — в среду и субботу."
      index={6}
      period="Эта неделя"
      summary="баланс выше на 18%"
      title="Восстановление"
      value="Хорошее"
    >
      <View style={styles.inlineLegend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: chartColors.positive }]} /><AppText role="caption">ресурс</AppText></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: chartColors.primarySoft }]} /><AppText role="caption">нагрузка</AppText></View>
      </View>
      <View style={styles.balanceChart}>
        <View style={styles.balanceBaseline} />
        {energy.map((value, index) => (
          <View key={index} style={styles.balanceColumn}>
            <View style={[styles.balanceBar, styles.balanceBarEnergy, { height: (value / 5) * maxBar }]} />
            <View style={[styles.balanceBar, styles.balanceBarLoad, { height: (load[index] / 5) * maxBar }]} />
            <AppText role="caption" color={colors.text.secondary}>{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][index]}</AppText>
          </View>
        ))}
      </View>
    </ChartFrame>
  );
}

export function SymptomCorrelationChart() {
  const samples = [
    { sleep: 5.4, pain: 7 }, { sleep: 6.1, pain: 6 }, { sleep: 6.7, pain: 5 },
    { sleep: 7.2, pain: 4 }, { sleep: 7.8, pain: 3 }, { sleep: 8.1, pain: 2 },
    { sleep: 6.4, pain: 5.5 }, { sleep: 7.5, pain: 3.5 }, { sleep: 8.4, pain: 2.2 },
  ];

  return (
    <ChartFrame
      accessibilitySummary="Диаграмма связи сна и боли. При продолжительности сна больше семи часов интенсивность боли в среднем ниже."
      index={7}
      period="28 дней"
      summary="умеренная связь"
      title="Сон и боль"
      value="−34%"
    >
      <View style={styles.correlationHint}>
        <AppText role="caption" color={colors.text.secondary}>больше сна</AppText>
        <AppText role="caption" color={chartColors.positive}>меньше боли</AppText>
      </View>
      <View style={styles.plotWrap}>
        <Svg width="100%" height={150} viewBox={`0 0 ${CHART_WIDTH} 150`}>
          {[0, 40, 80, 120].map((y) => <Line key={y} x1={0} x2={CHART_WIDTH} y1={y} y2={y} stroke={chartColors.grid} />)}
          <Path d={`M8 112 L${CHART_WIDTH - 8} 16`} fill="none" stroke={chartColors.positive} strokeDasharray="7 6" strokeOpacity={0.65} strokeWidth={2} />
          {samples.map((sample, index) => {
            const x = ((sample.sleep - 5) / 4) * CHART_WIDTH;
            const y = 120 - (sample.pain / 8) * 112;
            return <Circle key={index} cx={x} cy={y} r={index % 3 === 0 ? 6 : 4.5} fill={chartColors.primary} fillOpacity={0.72} stroke={colors.surface.raised} strokeWidth={2} />;
          })}
        </Svg>
        <AxisLabels labels={['5 ч', '6 ч', '7 ч', '8 ч', '9 ч сна']} />
      </View>
    </ChartFrame>
  );
}

export function HealthAttentionChart() {
  const rings = [
    { label: 'Журнал', value: 0.82, color: chartColors.primary, radius: 52 },
    { label: 'Анализы', value: 0.68, color: chartColors.positive, radius: 39 },
    { label: 'Цели', value: 0.54, color: chartColors.burgundy, radius: 26 },
  ];

  return (
    <ChartFrame
      accessibilitySummary="Сводный индекс внимания к здоровью семьдесят два процента. Журнал заполнен на восемьдесят два, анализы — на шестьдесят восемь, цели — на пятьдесят четыре процента."
      index={8}
      period="Последние 90 дней"
      summary="+8 п.п. за месяц"
      title="Индекс внимания"
      unit="%"
      value="72"
    >
      <View style={styles.attentionLayout}>
        <View style={styles.attentionRingWrap}>
          <Svg width={136} height={136} viewBox="0 0 136 136">
            {rings.map((ring) => <Circle key={`track-${ring.label}`} cx={68} cy={68} r={ring.radius} fill="none" stroke={chartColors.quiet} strokeWidth={9} />)}
            {rings.map((ring) => {
              const circumference = 2 * Math.PI * ring.radius;
              return <Circle key={ring.label} cx={68} cy={68} r={ring.radius} fill="none" stroke={ring.color} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${circumference * ring.value} ${circumference * (1 - ring.value)}`} transform="rotate(-90 68 68)" />;
            })}
          </Svg>
          <View style={styles.attentionCenter}><AppText numeric role="heading" weight="semibold">72</AppText><AppText role="caption" color={colors.text.secondary}>из 100</AppText></View>
        </View>
        <View style={styles.attentionLegend}>
          {rings.map((ring) => (
            <View key={ring.label} style={styles.attentionLegendRow}>
              <View style={[styles.legendDot, { backgroundColor: ring.color }]} />
              <AppText role="caption" style={styles.attentionLegendLabel}>{ring.label}</AppText>
              <AppText numeric role="caption" weight="semibold">{Math.round(ring.value * 100)}%</AppText>
            </View>
          ))}
        </View>
      </View>
    </ChartFrame>
  );
}

export function HealthMetricsChartsCatalog() {
  return (
    <View style={styles.catalog}>
      <HormoneWindowChart />
      <SleepCompositionChart />
      <CycleRegularityChart />
      <PainPatternChart />
      <FerritinTrendChart />
      <RecoveryBalanceChart />
      <SymptomCorrelationChart />
      <HealthAttentionChart />
      <BasalTemperatureChart />
      <WeightTrendChart />
      <WaterGoalChart />
      <CyclePhaseChart />
      <MenstruationIntensityChart />
      <MoodHeatmapChart />
      <EnergySleepChart />
      <ActivityDistributionChart />
      <SymptomRadarChart />
      <LabReferenceChart />
    </View>
  );
}

const styles = StyleSheet.create({
  catalog: {
    width: sizes.contentWidth,
    gap: spacing.xl,
  },
  chartFrame: {
    width: sizes.contentWidth,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(45,28,34,0.06)',
    gap: spacing.md,
    ...shadows.card,
  },
  chartHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  chartTitleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  chartValueRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  chartSummary: {
    marginLeft: 'auto',
  },
  plotWrap: {
    width: '100%',
  },
  axisLabels: {
    marginTop: -2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  phaseLegend: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cycleGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cycleDay: {
    width: 9,
    alignItems: 'center',
    gap: spacing.xs,
  },
  cycleDayMark: {
    width: 8,
    height: 54,
    borderRadius: 4,
    backgroundColor: chartColors.quiet,
  },
  cycleDayMenstruation: {
    backgroundColor: chartColors.primarySoft,
  },
  cycleDayFertile: {
    backgroundColor: 'rgba(31,187,116,0.28)',
  },
  cycleDayOvulation: {
    backgroundColor: chartColors.positive,
  },
  cycleDayCurrent: {
    borderWidth: 2,
    borderColor: colors.text.primary,
  },
  cycleLabelSpacer: {
    height: 15,
  },
  intensityRows: {
    gap: spacing.sm,
  },
  intensityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  intensityLabel: {
    width: 72,
  },
  intensityTrack: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  intensityCell: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: chartColors.quiet,
  },
  heatmapWrap: {
    gap: spacing.md,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  heatmapCell: {
    width: 40,
    height: 40,
    borderRadius: 13,
  },
  heatmapLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  heatmapScale: {
    flexDirection: 'row',
    gap: 3,
  },
  heatmapScaleCell: {
    width: 18,
    height: 8,
    borderRadius: 4,
  },
  activityChart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  activityRingWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityRingValue: {
    position: 'absolute',
    alignItems: 'center',
  },
  activityLegend: {
    minWidth: 0,
    flex: 1,
    gap: spacing.sm,
  },
  activityLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  activityLegendLabel: {
    flex: 1,
  },
  radarLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  radarLegend: {
    minWidth: 0,
    flex: 1,
    gap: 8,
  },
  radarLegendRow: {
    gap: 3,
  },
  radarLegendLabel: {
    fontSize: 10,
  },
  radarLegendTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: chartColors.quiet,
  },
  radarLegendFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: chartColors.primarySoft,
  },
  labRows: {
    gap: spacing.md,
  },
  labRow: {
    gap: spacing.xs,
  },
  labRowHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: chartColors.quiet,
  },
  labReferenceRange: {
    position: 'absolute',
    left: '35%',
    width: '45%',
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(31,187,116,0.18)',
  },
  labMarker: {
    position: 'absolute',
    top: -3,
    width: 5,
    height: 18,
    marginLeft: -2.5,
    borderRadius: 3,
  },
  inlineLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sleepRows: {
    gap: 9,
  },
  sleepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sleepDay: {
    width: 20,
  },
  sleepTrack: {
    height: 14,
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 7,
    backgroundColor: chartColors.quiet,
  },
  sleepSegment: {
    height: '100%',
    borderRightWidth: 2,
    borderRightColor: colors.surface.raised,
  },
  referenceCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceChart: {
    position: 'relative',
    height: 124,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  balanceBaseline: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: chartColors.grid,
  },
  balanceColumn: {
    position: 'relative',
    width: 34,
    height: 124,
    alignItems: 'center',
  },
  balanceBar: {
    position: 'absolute',
    width: 16,
  },
  balanceBarEnergy: {
    bottom: 74,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: chartColors.positive,
  },
  balanceBarLoad: {
    top: 52,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: chartColors.primarySoft,
  },
  correlationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attentionLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  attentionRingWrap: {
    width: 136,
    height: 136,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  attentionLegend: {
    minWidth: 0,
    flex: 1,
    gap: spacing.md,
  },
  attentionLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  attentionLegendLabel: {
    flex: 1,
  },
});
