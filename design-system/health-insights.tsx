import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import type {
  JournalEntry,
  LabResult,
  LocalProfile,
  ScanResult,
} from '../lib/health-types';
import {
  buildHealthInsightCycles,
  type HealthInsightCycleSegment,
} from '../lib/health-insights';
import { AppText, GlassControl, SegmentedSwitcher } from './components';
import { ProfileActionRow } from './profile';
import BackIcon from '../assets/figma/calendar-page/back.svg';
import {
  chartColors,
  colors,
  fonts,
  getHeaderTop,
  radii,
  shadows,
  spacing,
} from './tokens';

export type HealthInsightsPeriod = '7' | '30' | '90';

type DayBucket = {
  date: Date;
  key: string;
  journal: JournalEntry[];
  labs: LabResult[];
  scans: ScanResult[];
};

type CycleSegment = HealthInsightCycleSegment;

type CycleContext = {
  cycle: CycleSegment;
  cycleDay: number;
  phase: CyclePhase;
};

type CyclePhase = 'menstruation' | 'follicular' | 'fertile' | 'luteal';
type LifestyleTab = 'weight' | 'water' | 'activity';

type NumericPoint = { date: Date; value: number };
type AnalytePoint = NumericPoint & { reference?: string };
type AnalyteSeries = {
  key: string;
  name: string;
  unit?: string;
  points: AnalytePoint[];
  reference?: { low: number; high: number };
};

const DAY = 24 * 60 * 60 * 1000;
const PLOT_WIDTH = 330;
const PLOT_HEIGHT = 126;

const labels = {
  basalTemperature: 'Базальная температура тела',
  weight: 'Вес',
  water: 'Вода',
  menstruation: 'Менструация',
  pain: 'Боль',
  symptoms: 'Другие симптомы',
  mood: 'Настроение',
  energy: 'Энергия и сон',
  activity: 'Физическая активность',
  dayFactors: 'Факторы дня',
} as const;

const phaseMeta: Record<
  CyclePhase,
  { label: string; short: string; color: string }
> = {
  menstruation: {
    label: 'Менструация',
    short: 'Менс.',
    color: colors.brand.primary,
  },
  follicular: {
    label: 'Фолликулярная',
    short: 'Фол.',
    color: colors.brand.success,
  },
  fertile: {
    label: 'Овуляторное окно',
    short: 'Овул.',
    color: chartColors.warning,
  },
  luteal: {
    label: 'Лютеиновая',
    short: 'Лют.',
    color: colors.brand.burgundy,
  },
};

const phaseSentence: Record<CyclePhase, string> = {
  menstruation: 'дни менструации',
  follicular: 'фолликулярную фазу',
  fertile: 'овуляторное окно',
  luteal: 'лютеиновую фазу',
};

function startOfDay(value: number | Date) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(value: number | Date) {
  const date = startOfDay(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function parseLocalizedNumber(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0];
  if (!normalized) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function compactDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })
    .format(date)
    .replace('.', '');
}

function shortMonth(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'short' })
    .format(date)
    .replace('.', '');
}

function pluralDays(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function pluralTimes(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
    ? 'раза'
    : 'раз';
}

function valueFromEntry(entry: JournalEntry) {
  return entry.numericValue ?? parseLocalizedNumber(entry.textValue);
}

function buildBuckets(
  period: HealthInsightsPeriod,
  journalEntries: JournalEntry[],
  labResults: LabResult[],
  scanResults: ScanResult[],
) {
  const days = Number(period);
  const today = startOfDay(new Date());
  const buckets = Array.from({ length: days }, (_, index): DayBucket => {
    const date = new Date(today.getTime() - (days - 1 - index) * DAY);
    return { date, key: dayKey(date), journal: [], labs: [], scans: [] };
  });
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  journalEntries.forEach(
    (entry) =>
      !entry.deletedAt &&
      byKey.get(dayKey(entry.occurredAt))?.journal.push(entry),
  );
  labResults.forEach(
    (result) =>
      !result.deletedAt &&
      byKey.get(dayKey(result.collectedAt))?.labs.push(result),
  );
  scanResults.forEach(
    (result) =>
      !result.deletedAt &&
      byKey.get(dayKey(result.capturedAt))?.scans.push(result),
  );
  return buckets;
}

function phaseForCycleDay(
  cycle: CycleSegment,
  cycleDay: number,
  fallbackLength?: number,
): CyclePhase {
  if (
    cycle.dailyIntensity.has(
      dayKey(new Date(cycle.start.getTime() + (cycleDay - 1) * DAY)),
    )
  )
    return 'menstruation';
  const length = cycle.cycleLength ?? fallbackLength ?? 28;
  const ovulationDay = Math.max(10, Math.min(21, length - 14));
  if (cycleDay >= ovulationDay - 2 && cycleDay <= ovulationDay + 1)
    return 'fertile';
  return cycleDay < ovulationDay - 2 ? 'follicular' : 'luteal';
}

function cycleContextForDate(
  date: Date,
  cycles: CycleSegment[],
  profile: LocalProfile | null,
): CycleContext | undefined {
  const target = startOfDay(date).getTime();
  for (let index = cycles.length - 1; index >= 0; index -= 1) {
    const cycle = cycles[index];
    const next = cycles[index + 1];
    const day = Math.floor((target - cycle.start.getTime()) / DAY) + 1;
    const length = next
      ? Math.round((next.start.getTime() - cycle.start.getTime()) / DAY)
      : (cycle.cycleLength ?? profile?.cycleLengthDays ?? 28);
    if (day >= 1 && day <= length)
      return {
        cycle,
        cycleDay: day,
        phase: phaseForCycleDay(cycle, day, profile?.cycleLengthDays),
      };
  }
  return undefined;
}

function uniqueDailyNumeric(
  buckets: DayBucket[],
  label: string,
  aggregation: 'average' | 'sum' = 'average',
) {
  return buckets.flatMap((bucket) => {
    const values = bucket.journal
      .filter((entry) => entry.label === label)
      .map(valueFromEntry)
      .filter((value): value is number => value !== undefined);
    if (!values.length) return [];
    return [
      {
        date: bucket.date,
        value:
          aggregation === 'sum'
            ? values.reduce((sum, value) => sum + value, 0)
            : values.reduce((sum, value) => sum + value, 0) / values.length,
      },
    ];
  });
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`)
    .join(' ');
}

function segmentedPaths(
  points: Array<{ x: number; y: number; index: number }>,
) {
  const paths: Array<Array<{ x: number; y: number }>> = [];
  points.forEach((point) => {
    const current = paths.at(-1);
    const previous = current?.at(-1) as
      { x: number; y: number; index?: number } | undefined;
    if (
      !current ||
      previous?.index === undefined ||
      point.index - previous.index > 1
    )
      paths.push([point]);
    else current.push(point);
  });
  return paths.map(linePath);
}

function colorWithOpacity(hex: string, opacity: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${opacity})`;
}

function EmptyChart({ text }: { text: string }) {
  return (
    <View style={styles.emptyChart}>
      <View style={styles.emptyChartMark}>
        <View style={styles.emptyChartLine} />
        <View style={[styles.emptyChartLine, styles.emptyChartLineShort]} />
      </View>
      <AppText
        role="label"
        color={colors.text.secondary}
        style={styles.emptyChartText}
      >
        {text}
      </AppText>
    </View>
  );
}

function InsightCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <AppText role="heading" weight="semibold">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

function CoverageChart({ buckets }: { buckets: DayBucket[] }) {
  const recentBuckets = buckets.slice(-35);
  const activeDays = recentBuckets.filter(
    (bucket) => bucket.journal.length > 0,
  );
  const maxCoverage = Math.max(
    1,
    ...recentBuckets.map(
      (bucket) => new Set(bucket.journal.map((entry) => entry.kind)).size,
    ),
  );
  return (
    <InsightCard title="Ритм наблюдений">
      <View style={styles.coverageSummary}>
        <View>
          <AppText numeric role="title" weight="semibold">
            {activeDays.length}
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            дней с записями
          </AppText>
        </View>
        <AppText role="caption" color={colors.text.secondary}>
          последние {recentBuckets.length} дней
        </AppText>
      </View>
      <View style={styles.coverageGrid}>
        {recentBuckets.map((bucket) => {
          const coverage = new Set(bucket.journal.map((entry) => entry.kind))
            .size;
          const opacity = coverage ? 0.2 + (coverage / maxCoverage) * 0.8 : 0;
          return (
            <View
              key={bucket.key}
              accessibilityLabel={`${compactDate(bucket.date)}: ${coverage} разделов`}
              style={[
                styles.coverageCell,
                coverage
                  ? { backgroundColor: `rgba(211,20,113,${opacity})` }
                  : styles.coverageCellEmpty,
              ]}
            />
          );
        })}
      </View>
      <View style={styles.coverageLegend}>
        <AppText role="caption" color={colors.text.secondary}>
          меньше данных
        </AppText>
        {[0.15, 0.38, 0.65, 1].map((opacity) => (
          <View
            key={opacity}
            style={[
              styles.coverageLegendCell,
              { backgroundColor: `rgba(211,20,113,${opacity})` },
            ]}
          />
        ))}
        <AppText role="caption" color={colors.text.secondary}>
          больше
        </AppText>
      </View>
    </InsightCard>
  );
}

function CycleHistoryCard({ cycles }: { cycles: CycleSegment[] }) {
  const rows = cycles
    .filter((cycle) => cycle.cycleLength)
    .slice(-4)
    .reverse();
  if (!rows.length)
    return (
      <InsightCard title="История циклов">
        <EmptyChart text="Отметьте начало менструации хотя бы в двух циклах — здесь появится история." />
      </InsightCard>
    );
  const average = Math.round(
    rows.reduce((sum, cycle) => sum + (cycle.cycleLength ?? 0), 0) /
      rows.length,
  );
  return (
    <InsightCard title="История циклов">
      <View style={styles.cycleTableHead}>
        <AppText role="caption" color={colors.text.secondary}>
          Начало
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          Цикл
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          Менструация
        </AppText>
      </View>
      {rows.map((cycle) => {
        const length = cycle.cycleLength ?? 0;
        const delta = average === undefined ? 0 : length - average;
        const periodDays = Math.max(
          1,
          Math.round((cycle.end.getTime() - cycle.start.getTime()) / DAY) + 1,
        );
        return (
          <View key={cycle.start.getTime()} style={styles.cycleTableRow}>
            <AppText role="label">{compactDate(cycle.start)}</AppText>
            <View style={styles.cycleLengthCell}>
              <AppText numeric role="label" weight="semibold">
                {length} {pluralDays(length)}
              </AppText>
              {delta ? (
                <AppText
                  numeric
                  role="caption"
                  color={
                    delta > 0 ? colors.brand.burgundy : colors.brand.success
                  }
                >
                  {delta > 0 ? '+' : ''}
                  {delta}
                </AppText>
              ) : null}
            </View>
            <AppText numeric role="label">
              {periodDays} {pluralDays(periodDays)}
            </AppText>
          </View>
        );
      })}
      <View style={styles.averageRow}>
        <AppText role="caption" color={colors.text.secondary}>
          Средняя длина
        </AppText>
        <AppText numeric role="label" weight="semibold">
          {average} {pluralDays(average)}
        </AppText>
      </View>
    </InsightCard>
  );
}

function BasalTemperatureCard({
  entries,
  cycles,
  profile,
}: {
  entries: JournalEntry[];
  cycles: CycleSegment[];
  profile: LocalProfile | null;
}) {
  const cycle = cycles.at(-1);
  const cycleLength = cycle?.cycleLength ?? profile?.cycleLengthDays ?? 28;
  const values = cycle
    ? entries
        .flatMap((entry) => {
          if (entry.deletedAt || entry.label !== labels.basalTemperature)
            return [];
          const context = cycleContextForDate(
            new Date(entry.occurredAt),
            cycles,
            profile,
          );
          const value = valueFromEntry(entry);
          if (!context || context.cycle !== cycle || value === undefined)
            return [];
          return [{ day: context.cycleDay, value }];
        })
        .sort((a, b) => a.day - b.day)
    : [];
  if (!cycle || values.length < 2)
    return (
      <InsightCard title="Базальная температура">
        <EmptyChart text="Добавьте минимум две записи базальной температуры в одном цикле." />
      </InsightCard>
    );
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const low = min - Math.max((max - min) * 0.25, 0.08);
  const high = max + Math.max((max - min) * 0.25, 0.08);
  const points = values.map((point) => ({
    index: point.day,
    x: ((point.day - 1) / Math.max(1, cycleLength - 1)) * PLOT_WIDTH,
    y:
      PLOT_HEIGHT -
      ((point.value - low) / Math.max(0.01, high - low)) * PLOT_HEIGHT,
  }));
  const periodDays = Math.max(
    1,
    Math.round((cycle.end.getTime() - cycle.start.getTime()) / DAY) + 1,
  );
  const ovulationDay = Math.max(10, Math.min(21, cycleLength - 14));
  return (
    <InsightCard title="Базальная температура">
      <View style={styles.metricTopline}>
        <AppText numeric role="title" weight="semibold">
          {values.at(-1)?.value.toFixed(2)} °C
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          день {values.at(-1)?.day} цикла
        </AppText>
      </View>
      <Svg width="100%" height={158} viewBox={`0 0 ${PLOT_WIDTH} 158`}>
        <Rect
          x={0}
          y={0}
          width={(periodDays / cycleLength) * PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill={colorWithOpacity(colors.brand.primary, 0.08)}
        />
        <Rect
          x={((ovulationDay - 3) / cycleLength) * PLOT_WIDTH}
          y={0}
          width={(4 / cycleLength) * PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill={colorWithOpacity(chartColors.warning, 0.13)}
        />
        {[0, 42, 84, 126].map((y) => (
          <Line
            key={y}
            x1={0}
            x2={PLOT_WIDTH}
            y1={y}
            y2={y}
            stroke={chartColors.grid}
          />
        ))}
        {segmentedPaths(points).map((path, index) => (
          <Path
            key={index}
            d={path}
            fill="none"
            stroke={colors.brand.primary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
          />
        ))}
        {points.map((point, index) => (
          <Circle
            key={point.index}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 5 : 3.2}
            fill={
              index === points.length - 1
                ? colors.surface.raised
                : colors.brand.primary
            }
            stroke={colors.brand.primary}
            strokeWidth={index === points.length - 1 ? 3 : 1}
          />
        ))}
      </Svg>
      <View style={styles.axisRow}>
        <AppText role="caption" color={colors.text.secondary}>
          1 день
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {cycleLength} день
        </AppText>
      </View>
    </InsightCard>
  );
}

function countEntriesByPhase(
  entries: JournalEntry[],
  cycles: CycleSegment[],
  profile: LocalProfile | null,
  allowedLabels: readonly string[],
) {
  const count = new Map<string, Record<CyclePhase, number>>();
  entries.forEach((entry) => {
    if (
      entry.deletedAt ||
      !allowedLabels.includes(entry.label) ||
      !entry.textValue
    )
      return;
    const context = cycleContextForDate(
      new Date(entry.occurredAt),
      cycles,
      profile,
    );
    if (!context) return;
    const current = count.get(entry.textValue) ?? {
      menstruation: 0,
      follicular: 0,
      fertile: 0,
      luteal: 0,
    };
    current[context.phase] += 1;
    count.set(entry.textValue, current);
  });
  return count;
}

function PhaseHeatmap({
  rows,
  color,
}: {
  rows: Array<{ label: string; counts: Record<CyclePhase, number> }>;
  color: string;
}) {
  const max = Math.max(1, ...rows.flatMap((row) => Object.values(row.counts)));
  return (
    <View style={styles.phaseMatrix}>
      <View style={styles.phaseHead}>
        <View style={styles.phaseNameSpace} />
        {(Object.keys(phaseMeta) as CyclePhase[]).map((phase) => (
          <AppText
            key={phase}
            role="caption"
            color={colors.text.secondary}
            style={styles.phaseHeading}
          >
            {phaseMeta[phase].short}
          </AppText>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.label} style={styles.phaseRow}>
          <AppText
            role="caption"
            numberOfLines={1}
            style={styles.phaseRowLabel}
          >
            {row.label}
          </AppText>
          {(Object.keys(phaseMeta) as CyclePhase[]).map((phase) => {
            const value = row.counts[phase];
            return (
              <View
                key={phase}
                style={[
                  styles.phaseCell,
                  {
                    backgroundColor: value
                      ? colorWithOpacity(color, 0.18 + (value / max) * 0.82)
                      : chartColors.quiet,
                  },
                ]}
              >
                <AppText
                  numeric
                  role="caption"
                  color={
                    value > max * 0.55
                      ? colors.surface.raised
                      : colors.text.secondary
                  }
                >
                  {value || ''}
                </AppText>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function PhaseLegend() {
  return (
    <View style={styles.phaseLegend}>
      {(Object.keys(phaseMeta) as CyclePhase[]).map((phase) => (
        <View key={phase} style={styles.phaseLegendItem}>
          <View
            style={[
              styles.phaseLegendDot,
              { backgroundColor: phaseMeta[phase].color },
            ]}
          />
          <AppText role="caption" color={colors.text.secondary}>
            <AppText role="caption" weight="semibold">
              {phaseMeta[phase].short}
            </AppText>{' '}
            — {phaseMeta[phase].label.toLocaleLowerCase('ru-RU')}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function SymptomsByPhaseCard({
  entries,
  cycles,
  profile,
}: {
  entries: JournalEntry[];
  cycles: CycleSegment[];
  profile: LocalProfile | null;
}) {
  const counts = countEntriesByPhase(entries, cycles, profile, [
    labels.pain,
    labels.symptoms,
  ]);
  const rows = [...counts.entries()]
    .map(([label, phaseCounts]) => ({ label, counts: phaseCounts }))
    .sort(
      (a, b) =>
        Object.values(b.counts).reduce((sum, value) => sum + value, 0) -
        Object.values(a.counts).reduce((sum, value) => sum + value, 0),
    )
    .slice(0, 5);
  return (
    <InsightCard title="Симптомы по фазам">
      {rows.length ? (
        <>
          <PhaseHeatmap rows={rows} color={colors.brand.primary} />
          <PhaseLegend />
        </>
      ) : (
        <EmptyChart text="Отмечайте симптомы в цикле — здесь будет видно, на какие фазы приходились записи." />
      )}
    </InsightCard>
  );
}

function MoodEnergyByPhaseCard({
  entries,
  cycles,
  profile,
}: {
  entries: JournalEntry[];
  cycles: CycleSegment[];
  profile: LocalProfile | null;
}) {
  const mood = countEntriesByPhase(entries, cycles, profile, [labels.mood]);
  const energy = countEntriesByPhase(entries, cycles, profile, [labels.energy]);
  const makeRows = (counts: Map<string, Record<CyclePhase, number>>) =>
    [...counts.entries()]
      .map(([label, phaseCounts]) => ({ label, counts: phaseCounts }))
      .sort(
        (a, b) =>
          Object.values(b.counts).reduce((sum, value) => sum + value, 0) -
          Object.values(a.counts).reduce((sum, value) => sum + value, 0),
      )
      .slice(0, 2);
  const moodRows = makeRows(mood);
  const energyRows = makeRows(energy);
  return (
    <InsightCard title="Настроение и энергия">
      {moodRows.length || energyRows.length ? (
        <View style={styles.moodEnergyContent}>
          {moodRows.length ? (
            <View style={styles.subsection}>
              <AppText role="label" weight="semibold">
                Настроение
              </AppText>
              <PhaseHeatmap rows={moodRows} color={colors.brand.primary} />
            </View>
          ) : null}
          {energyRows.length ? (
            <View style={styles.subsection}>
              <AppText role="label" weight="semibold">
                Энергия
              </AppText>
              <PhaseHeatmap rows={energyRows} color={colors.brand.success} />
            </View>
          ) : null}
          <PhaseLegend />
        </View>
      ) : (
        <EmptyChart text="Отмечайте настроение и энергию — будут показаны состояния, выбранные в разных фазах цикла." />
      )}
    </InsightCard>
  );
}

function PatternsCard({
  entries,
  cycles,
  profile,
}: {
  entries: JournalEntry[];
  cycles: CycleSegment[];
  profile: LocalProfile | null;
}) {
  const symptomCounts = countEntriesByPhase(entries, cycles, profile, [
    labels.pain,
    labels.symptoms,
  ]);
  const phaseCases = [...symptomCounts.entries()]
    .flatMap(([symptom, counts]) => {
      const phases = Object.entries(counts) as Array<[CyclePhase, number]>;
      const total = phases.reduce((sum, [, value]) => sum + value, 0);
      const strongest = phases.sort((a, b) => b[1] - a[1])[0];
      if (!strongest || total < 3 || strongest[1] / total < 0.5) return [];
      return [
        {
          key: `phase-${symptom}`,
          count: strongest[1],
          color: phaseMeta[strongest[0]].color,
          text: `${strongest[1]} из ${total} отметок «${symptom}» пришлись на ${phaseSentence[strongest[0]]}.`,
        },
      ];
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  const byDay = new Map<
    string,
    { symptoms: Set<string>; factors: Set<string> }
  >();
  entries.forEach((entry) => {
    if (entry.deletedAt || !entry.textValue) return;
    if (
      ![labels.pain, labels.symptoms, labels.dayFactors].includes(
        entry.label as
          | typeof labels.pain
          | typeof labels.symptoms
          | typeof labels.dayFactors,
      )
    )
      return;
    const key = dayKey(entry.occurredAt);
    const day = byDay.get(key) ?? {
      symptoms: new Set<string>(),
      factors: new Set<string>(),
    };
    if (entry.label === labels.dayFactors) day.factors.add(entry.textValue);
    else day.symptoms.add(entry.textValue);
    byDay.set(key, day);
  });
  const combinations = new Map<string, number>();
  byDay.forEach((day) => {
    day.symptoms.forEach((symptom) =>
      day.factors.forEach((factor) => {
        const key = `${symptom}|${factor}`;
        combinations.set(key, (combinations.get(key) ?? 0) + 1);
      }),
    );
  });
  const coincidence = [...combinations.entries()]
    .map(([key, count]) => {
      const [symptom, factor] = key.split('|');
      return {
        key: `factor-${key}`,
        count,
        color: chartColors.warning,
        text: `«${symptom}» и «${factor}» были отмечены в один день ${count} ${pluralTimes(count)}.`,
      };
    })
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 1);
  const patterns = [...phaseCases, ...coincidence];

  return (
    <InsightCard title="Повторяющиеся закономерности">
      {patterns.length ? (
        <View style={styles.patternList}>
          {patterns.map((pattern) => (
            <View key={pattern.key} style={styles.patternRow}>
              <View
                style={[styles.patternDot, { backgroundColor: pattern.color }]}
              />
              <AppText role="label" style={styles.patternCopy}>
                {pattern.text}
              </AppText>
            </View>
          ))}
        </View>
      ) : (
        <EmptyChart text="Когда накопятся повторяющиеся отметки, здесь появятся описательные совпадения — без вывода о причине." />
      )}
    </InsightCard>
  );
}

function MenstruationIntensityCard({ cycles }: { cycles: CycleSegment[] }) {
  const rows = cycles
    .filter((cycle) =>
      [...cycle.dailyIntensity.values()].some((intensity) => intensity > 0),
    )
    .slice(-4)
    .reverse();
  if (!rows.length)
    return (
      <InsightCard title="Интенсивность менструации">
        <EmptyChart text="Отметьте интенсивность менструации, чтобы увидеть изменения по циклам." />
      </InsightCard>
    );
  const days = 7;
  return (
    <InsightCard title="Интенсивность менструации">
      <View style={styles.intensityLegend}>
        {[
          ['Слабая', 1],
          ['Умеренная', 2],
          ['Обильная', 3],
        ].map(([label, intensity]) => (
          <View key={String(label)} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                {
                  backgroundColor: colorWithOpacity(
                    colors.brand.primary,
                    0.28 + Number(intensity) * 0.22,
                  ),
                },
              ]}
            />
            <AppText role="caption" color={colors.text.secondary}>
              {label}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.intensityRows}>
        {rows.map((cycle) => (
          <View key={cycle.start.getTime()} style={styles.intensityRow}>
            <AppText
              role="caption"
              color={colors.text.secondary}
              style={styles.intensityDate}
            >
              {shortMonth(cycle.start)}
            </AppText>
            <View style={styles.intensityCells}>
              {Array.from({ length: days }, (_, index) => {
                const date = new Date(cycle.start.getTime() + index * DAY);
                const intensity = cycle.dailyIntensity.get(dayKey(date)) ?? 0;
                return (
                  <View
                    key={index}
                    style={[
                      styles.intensityCell,
                      intensity
                        ? {
                            backgroundColor: colorWithOpacity(
                              colors.brand.primary,
                              0.2 + intensity * 0.24,
                            ),
                          }
                        : styles.intensityCellEmpty,
                    ]}
                  />
                );
              })}
            </View>
          </View>
        ))}
      </View>
      <View style={styles.intensityAxis}>
        <View style={styles.intensityDate} />
        {Array.from({ length: days }, (_, index) => (
          <AppText
            key={index}
            role="caption"
            color={colors.text.secondary}
            style={styles.intensityAxisText}
          >
            {index + 1}
          </AppText>
        ))}
      </View>
    </InsightCard>
  );
}

function OvulationTestsCard({
  scans,
  cycles,
  profile,
}: {
  scans: ScanResult[];
  cycles: CycleSegment[];
  profile: LocalProfile | null;
}) {
  const shownCycles = cycles.slice(-4);
  const tests = scans
    .filter(
      (scan) =>
        !scan.deletedAt &&
        (scan.testSystemKey === 'ovulation-strip' ||
          scan.testSystemKey === 'ovulation'),
    )
    .map((scan) => ({
      scan,
      context: cycleContextForDate(new Date(scan.capturedAt), cycles, profile),
    }))
    .filter(
      (item): item is { scan: ScanResult; context: CycleContext } =>
        item.context !== undefined,
    )
    .filter((item) => shownCycles.includes(item.context.cycle));
  const cycleLength =
    shownCycles.at(-1)?.cycleLength ?? profile?.cycleLengthDays ?? 28;
  if (!tests.length)
    return (
      <InsightCard title="Тесты на овуляцию">
        <EmptyChart text="Сохраните результат теста на овуляцию — здесь появится временная шкала ЛГ-пика." />
      </InsightCard>
    );
  const colorsByResult: Record<ScanResult['confirmedValue'], string> = {
    positive: colors.brand.success,
    negative: chartColors.neutral,
    invalid: chartColors.warning,
  };
  return (
    <InsightCard title="Тесты на овуляцию">
      <View style={styles.scanLegend}>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: colors.brand.success },
            ]}
          />
          <AppText role="caption" color={colors.text.secondary}>
            ЛГ-пик
          </AppText>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: chartColors.neutral }]}
          />
          <AppText role="caption" color={colors.text.secondary}>
            отрицательный
          </AppText>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: chartColors.warning }]}
          />
          <AppText role="caption" color={colors.text.secondary}>
            невалидный
          </AppText>
        </View>
      </View>
      <View style={styles.testCycleDates}>
        {shownCycles.map((cycle) => (
          <AppText
            key={cycle.start.getTime()}
            role="caption"
            color={colors.text.secondary}
          >
            {compactDate(cycle.start)}
          </AppText>
        ))}
      </View>
      <Svg width="100%" height={132} viewBox={`0 0 ${PLOT_WIDTH} 132`}>
        {shownCycles.map((_, index) => (
          <Line
            key={index}
            x1={0}
            x2={PLOT_WIDTH}
            y1={18 + index * 29}
            y2={18 + index * 29}
            stroke={chartColors.grid}
          />
        ))}
        {tests.map(({ scan, context }) => {
          const x =
            ((context.cycleDay - 1) / Math.max(1, cycleLength - 1)) *
            PLOT_WIDTH;
          const row = Math.max(0, shownCycles.indexOf(context.cycle));
          const y = 18 + row * 29;
          return (
            <Circle
              key={scan.localId}
              cx={x}
              cy={y}
              r={scan.confirmedValue === 'positive' ? 8 : 6}
              fill={colorsByResult[scan.confirmedValue]}
              stroke={colors.surface.raised}
              strokeWidth={3}
            />
          );
        })}
      </Svg>
      <View style={styles.axisRow}>
        <AppText role="caption" color={colors.text.secondary}>
          1 день цикла
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {cycleLength} день
        </AppText>
      </View>
    </InsightCard>
  );
}

function LifestyleCard({ buckets }: { buckets: DayBucket[] }) {
  const [tab, setTab] = useState<LifestyleTab>('weight');
  const values =
    tab === 'weight'
      ? uniqueDailyNumeric(buckets, labels.weight)
      : tab === 'water'
        ? uniqueDailyNumeric(buckets, labels.water, 'sum')
        : [];
  const activities = buckets.map((bucket) => ({
    date: bucket.date,
    values: [
      ...new Set(
        bucket.journal
          .filter((entry) => entry.label === labels.activity && entry.textValue)
          .map((entry) => entry.textValue!),
      ),
    ],
  }));
  const latest = values.at(-1)?.value;
  const latestLabel =
    tab === 'weight'
      ? `${latest?.toFixed(1) ?? '—'} кг`
      : tab === 'water'
        ? `${latest?.toFixed(1) ?? '—'} л`
        : `${activities.filter((item) => item.values.length).length}`;
  const min = values.length
    ? Math.min(...values.map((point) => point.value))
    : 0;
  const max = values.length
    ? Math.max(...values.map((point) => point.value))
    : 1;
  const pad = Math.max((max - min) * 0.25, tab === 'weight' ? 0.35 : 0.25);
  const trendValues =
    tab === 'weight'
      ? values.map((point, index) => {
          const window = values.filter(
            (candidate, candidateIndex) =>
              candidateIndex <= index &&
              point.date.getTime() - candidate.date.getTime() <= 7 * DAY,
          );
          return {
            ...point,
            value:
              window.reduce((sum, candidate) => sum + candidate.value, 0) /
              window.length,
          };
        })
      : values;
  const points = trendValues.map((point, index) => ({
    index,
    x:
      values.length === 1
        ? PLOT_WIDTH / 2
        : (index / Math.max(1, values.length - 1)) * PLOT_WIDTH,
    y:
      PLOT_HEIGHT -
      ((point.value - (min - pad)) / Math.max(0.001, max - min + pad * 2)) *
        PLOT_HEIGHT,
  }));
  const rawWeightPoints = values.map((point, index) => ({
    index,
    x:
      values.length === 1
        ? PLOT_WIDTH / 2
        : (index / Math.max(1, values.length - 1)) * PLOT_WIDTH,
    y:
      PLOT_HEIGHT -
      ((point.value - (min - pad)) / Math.max(0.001, max - min + pad * 2)) *
        PLOT_HEIGHT,
  }));
  const activityMax = Math.max(
    1,
    ...activities.map((item) => item.values.length),
  );
  return (
    <InsightCard title="Показатели и активность">
      <View style={styles.metricTabs}>
        {(
          [
            { value: 'weight', label: 'Вес' },
            { value: 'water', label: 'Вода' },
            { value: 'activity', label: 'Активность' },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.value }}
            onPress={() => setTab(item.value)}
            style={[
              styles.metricTab,
              tab === item.value && styles.metricTabSelected,
            ]}
          >
            <AppText
              role="caption"
              weight={tab === item.value ? 'semibold' : 'regular'}
              color={
                tab === item.value
                  ? colors.brand.primary
                  : colors.text.secondary
              }
            >
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      {tab === 'activity' ? (
        <>
          <View style={styles.metricTopline}>
            <AppText numeric role="title" weight="semibold">
              {latestLabel}
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              дней с активностью
            </AppText>
          </View>
          <View style={styles.activityBars}>
            {activities.slice(-21).map((item, index) => (
              <View key={item.date.getTime()} style={styles.activityBarWrap}>
                <View
                  style={[
                    styles.activityBar,
                    {
                      height: item.values.length
                        ? 14 + (item.values.length / activityMax) * 54
                        : 6,
                      backgroundColor: item.values.length
                        ? chartColors.warning
                        : chartColors.quiet,
                    },
                  ]}
                />
                {index % 5 === 0 ? (
                  <AppText
                    role="caption"
                    color={colors.text.secondary}
                    style={styles.activityTick}
                  >
                    {item.date.getDate()}
                  </AppText>
                ) : (
                  <View style={styles.activityTick} />
                )}
              </View>
            ))}
          </View>
        </>
      ) : values.length ? (
        <>
          <View style={styles.metricTopline}>
            <AppText numeric role="title" weight="semibold">
              {latestLabel}
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              {tab === 'weight'
                ? 'последнее измерение'
                : 'за последний день с записью'}
            </AppText>
          </View>
          {tab === 'weight' ? (
            <AppText role="caption" color={colors.text.secondary}>
              Точки — измерения, линия — среднее за 7 дней
            </AppText>
          ) : null}
          <Svg width="100%" height={150} viewBox={`0 0 ${PLOT_WIDTH} 150`}>
            <Defs>
              <LinearGradient id="lifestyleArea" x1="0" y1="0" x2="0" y2="1">
                <Stop
                  offset="0"
                  stopColor={
                    tab === 'weight'
                      ? colors.brand.burgundy
                      : colors.brand.success
                  }
                  stopOpacity={0.2}
                />
                <Stop
                  offset="1"
                  stopColor={
                    tab === 'weight'
                      ? colors.brand.burgundy
                      : colors.brand.success
                  }
                  stopOpacity={0}
                />
              </LinearGradient>
            </Defs>
            {[0, 42, 84, 126].map((y) => (
              <Line
                key={y}
                x1={0}
                x2={PLOT_WIDTH}
                y1={y}
                y2={y}
                stroke={chartColors.grid}
              />
            ))}
            {tab === 'water'
              ? values.map((point, index) => {
                  const slot = PLOT_WIDTH / Math.max(1, values.length);
                  const height = Math.max(
                    4,
                    (point.value / Math.max(max, 0.001)) * (PLOT_HEIGHT - 8),
                  );
                  return (
                    <Rect
                      key={point.date.getTime()}
                      x={index * slot + Math.max(1, slot * 0.18)}
                      y={PLOT_HEIGHT - height}
                      width={Math.max(3, slot * 0.64)}
                      height={height}
                      rx={Math.min(5, slot * 0.28)}
                      fill={colors.brand.success}
                      fillOpacity={index === values.length - 1 ? 1 : 0.62}
                    />
                  );
                })
              : null}
            {tab === 'weight' && points.length > 1 ? (
              <Path
                d={`${linePath(points)} L${points.at(-1)!.x} ${PLOT_HEIGHT} L${points[0].x} ${PLOT_HEIGHT} Z`}
                fill="url(#lifestyleArea)"
              />
            ) : null}
            {tab === 'weight' ? (
              <Path
                d={linePath(points)}
                fill="none"
                stroke={colors.brand.burgundy}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {tab === 'weight'
              ? rawWeightPoints.map((point, index) => (
                  <Circle
                    key={point.index}
                    cx={point.x}
                    cy={point.y}
                    r={index === rawWeightPoints.length - 1 ? 4.5 : 2.7}
                    fill={colors.surface.raised}
                    stroke={colors.brand.burgundy}
                    strokeWidth={index === rawWeightPoints.length - 1 ? 3 : 2}
                  />
                ))
              : null}
          </Svg>
          <View style={styles.axisRow}>
            <AppText role="caption" color={colors.text.secondary}>
              {compactDate(values[0].date)}
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              {compactDate(values.at(-1)!.date)}
            </AppText>
          </View>
        </>
      ) : (
        <EmptyChart
          text={
            tab === 'weight'
              ? 'Добавьте вес в разделе «Показатели».'
              : 'Добавьте объём воды в разделе «Показатели».'
          }
        />
      )}
    </InsightCard>
  );
}

function parseReference(reference?: string) {
  if (!reference) return undefined;
  const match = reference
    .replace(',', '.')
    .match(/(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const low = Number(match[1]);
  const high = Number(match[2]);
  return Number.isFinite(low) && Number.isFinite(high) && high > low
    ? { low, high }
    : undefined;
}

function buildAnalyteSeries(labs: LabResult[]) {
  const series = new Map<string, AnalyteSeries>();
  labs.forEach((lab) => {
    if (lab.deletedAt) return;
    lab.analytes.forEach((analyte) => {
      const value = parseLocalizedNumber(analyte.value);
      if (value === undefined) return;
      const name = analyte.name.trim();
      const unit = analyte.unit?.trim();
      const key = `${name.toLocaleLowerCase('ru-RU')}|${unit?.toLocaleLowerCase('ru-RU') ?? ''}`;
      const current = series.get(key) ?? { key, name, unit, points: [] };
      current.points.push({
        date: new Date(lab.collectedAt),
        value,
        reference: analyte.reference,
      });
      series.set(key, current);
    });
  });
  return [...series.values()]
    .map((item) => {
      item.points.sort((a, b) => a.date.getTime() - b.date.getTime());
      const parsed = item.points.map((point) =>
        parseReference(point.reference),
      );
      const first = parsed.find(Boolean);
      if (
        first &&
        parsed.every(
          (value) => value?.low === first.low && value?.high === first.high,
        )
      )
        item.reference = first;
      return item;
    })
    .filter((item) => item.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length);
}

function AnalyteLabsCard({ labs }: { labs: LabResult[] }) {
  const series = useMemo(() => buildAnalyteSeries(labs), [labs]);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(undefined);
  const active = series.find((item) => item.key === selectedKey) ?? series[0];
  if (!active)
    return (
      <InsightCard title="Анализы">
        <EmptyChart text="Добавьте повторный результат одного показателя — здесь появится его динамика." />
      </InsightCard>
    );
  const values = active.points.map((point) => point.value);
  const reference = active.reference;
  const min = Math.min(...values, ...(reference ? [reference.low] : []));
  const max = Math.max(...values, ...(reference ? [reference.high] : []));
  const pad = Math.max((max - min) * 0.18, 0.5);
  const lower = min - pad;
  const upper = max + pad;
  const firstDate = active.points[0].date.getTime();
  const lastDate = active.points.at(-1)!.date.getTime();
  const dateRange = Math.max(DAY, lastDate - firstDate);
  const points = active.points.map((point) => ({
    x: ((point.date.getTime() - firstDate) / dateRange) * PLOT_WIDTH,
    y:
      PLOT_HEIGHT -
      ((point.value - lower) / Math.max(0.001, upper - lower)) * PLOT_HEIGHT,
  }));
  const referenceY = reference
    ? PLOT_HEIGHT -
      ((reference.high - lower) / Math.max(0.001, upper - lower)) * PLOT_HEIGHT
    : 0;
  const referenceHeight = reference
    ? ((reference.high - reference.low) / Math.max(0.001, upper - lower)) *
      PLOT_HEIGHT
    : 0;
  return (
    <InsightCard title="Анализы">
      <View style={styles.analyteTabs}>
        {series.slice(0, 4).map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setSelectedKey(item.key)}
            style={[
              styles.analyteTab,
              active.key === item.key && styles.analyteTabSelected,
            ]}
          >
            <AppText
              role="caption"
              numberOfLines={1}
              weight={active.key === item.key ? 'semibold' : 'regular'}
              color={
                active.key === item.key
                  ? colors.brand.burgundy
                  : colors.text.secondary
              }
            >
              {item.name}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.metricTopline}>
        <AppText numeric role="title" weight="semibold">
          {active.points.at(-1)?.value}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {active.unit ?? ''}
        </AppText>
      </View>
      <Svg width="100%" height={150} viewBox={`0 0 ${PLOT_WIDTH} 150`}>
        <Defs>
          <LinearGradient id="analyteArea" x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0"
              stopColor={colors.brand.burgundy}
              stopOpacity={0.2}
            />
            <Stop
              offset="1"
              stopColor={colors.brand.burgundy}
              stopOpacity={0}
            />
          </LinearGradient>
        </Defs>
        {reference ? (
          <Rect
            x={0}
            y={referenceY}
            width={PLOT_WIDTH}
            height={referenceHeight}
            fill={colorWithOpacity(colors.brand.success, 0.12)}
          />
        ) : null}
        {[0, 42, 84, 126].map((y) => (
          <Line
            key={y}
            x1={0}
            x2={PLOT_WIDTH}
            y1={y}
            y2={y}
            stroke={chartColors.grid}
          />
        ))}
        <Path
          d={`${linePath(points)} L${points.at(-1)!.x} ${PLOT_HEIGHT} L${points[0].x} ${PLOT_HEIGHT} Z`}
          fill="url(#analyteArea)"
        />
        <Path
          d={linePath(points)}
          fill="none"
          stroke={colors.brand.burgundy}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => (
          <Circle
            key={`${point.x}-${point.y}`}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 5 : 3}
            fill={
              index === points.length - 1
                ? colors.surface.raised
                : colors.brand.burgundy
            }
            stroke={colors.brand.burgundy}
            strokeWidth={index === points.length - 1 ? 3 : 1}
          />
        ))}
      </Svg>
      <View style={styles.axisRow}>
        <AppText role="caption" color={colors.text.secondary}>
          {compactDate(active.points[0].date)}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {compactDate(active.points.at(-1)!.date)}
        </AppText>
      </View>
    </InsightCard>
  );
}

export function HealthInsightsDashboard({
  journalEntries,
  labResults,
  onExportPress,
  period,
  profile,
  scanResults,
  onPeriodChange,
}: {
  journalEntries: JournalEntry[];
  labResults: LabResult[];
  onExportPress: () => void;
  period: HealthInsightsPeriod;
  profile: LocalProfile | null;
  scanResults: ScanResult[];
  onPeriodChange: (period: HealthInsightsPeriod) => void;
}) {
  const buckets = useMemo(
    () => buildBuckets(period, journalEntries, labResults, scanResults),
    [period, journalEntries, labResults, scanResults],
  );
  const cycles = useMemo(
    () => buildHealthInsightCycles(journalEntries, profile),
    [journalEntries, profile],
  );
  return (
    <View style={styles.dashboard}>
      <SegmentedSwitcher
        accessibilityLabel="Период графиков"
        options={[
          { value: '7', label: '7 дней' },
          { value: '30', label: '30 дней' },
          { value: '90', label: '3 месяца' },
        ]}
        value={period}
        onChange={onPeriodChange}
        style={styles.periodSwitcher}
        labelStyle={styles.periodLabel}
      />
      <CoverageChart buckets={buckets} />
      <CycleHistoryCard cycles={cycles} />
      <MenstruationIntensityCard cycles={cycles} />
      <SymptomsByPhaseCard
        entries={journalEntries}
        cycles={cycles}
        profile={profile}
      />
      <BasalTemperatureCard
        entries={journalEntries}
        cycles={cycles}
        profile={profile}
      />
      <MoodEnergyByPhaseCard
        entries={journalEntries}
        cycles={cycles}
        profile={profile}
      />
      <OvulationTestsCard
        scans={scanResults}
        cycles={cycles}
        profile={profile}
      />
      <LifestyleCard buckets={buckets} />
      <AnalyteLabsCard labs={labResults} />
      <PatternsCard
        entries={journalEntries}
        cycles={cycles}
        profile={profile}
      />
      <ProfileActionRow
        icon="square.and.arrow.up"
        label="Открыть экспорт данных"
        onPress={onExportPress}
      />
    </View>
  );
}

export function HealthInsightsPage({
  initialPeriod = '30',
  journalEntries,
  labResults,
  onClose,
  onExportPress,
  profile,
  scanResults,
  visible,
}: {
  initialPeriod?: HealthInsightsPeriod;
  journalEntries: JournalEntry[];
  labResults: LabResult[];
  onClose: () => void;
  onExportPress: () => void;
  profile: LocalProfile | null;
  scanResults: ScanResult[];
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<HealthInsightsPeriod>(initialPeriod);
  const headerTop = getHeaderTop(insets.top);
  const bottomScrollClearance = Math.max(insets.bottom + 120, 148);
  if (!visible) return null;
  return (
    <View style={styles.pageRoot}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ bottom: bottomScrollClearance }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.pageScrollContent,
          {
            paddingTop: headerTop + 72,
            paddingBottom: bottomScrollClearance,
          },
        ]}
      >
        <HealthInsightsDashboard
          journalEntries={journalEntries}
          labResults={labResults}
          onExportPress={onExportPress}
          period={period}
          profile={profile}
          scanResults={scanResults}
          onPeriodChange={setPeriod}
        />
      </ScrollView>
      <ExpoLinearGradient
        pointerEvents="none"
        colors={[
          colors.surface.canvas,
          colors.surface.canvas,
          'rgba(245,243,243,0)',
        ]}
        locations={[0, 0.74, 1]}
        style={[styles.pageHeaderFade, { height: headerTop + 58 }]}
      />
      <View style={[styles.pageHeader, { top: headerTop }]}>
        <GlassControl
          accessibilityLabel="Закрыть графики"
          onPress={onClose}
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
          style={styles.pageBackButton}
        >
          {Platform.OS === 'android' ? (
            <BackIcon width={25} height={25} style={styles.pageBackIcon} />
          ) : (
            <SymbolView
              name="chevron.left"
              size={21}
              weight="semibold"
              tintColor={colors.brand.primary}
            />
          )}
        </GlassControl>
        <AppText
          role="heading"
          weight="semibold"
          style={styles.pageHeaderTitle}
        >
          Графики
        </AppText>
        <View style={styles.pageHeaderSpacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: colors.surface.canvas,
  },
  pageScrollContent: { width: 370, alignSelf: 'center', gap: spacing.lg },
  pageHeaderFade: { position: 'absolute', top: 0, left: 0, right: 0 },
  pageHeader: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
    left: 16,
    right: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageBackButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBackIcon: { transform: [{ scaleX: -1 }] },
  pageHeaderTitle: { flex: 1, textAlign: 'center' },
  pageHeaderSpacer: { width: 48, height: 48 },
  dashboard: { width: '100%', gap: spacing.lg },
  periodSwitcher: { width: '100%' },
  periodLabel: { fontFamily: fonts.sfMedium, fontSize: 13 },
  card: {
    padding: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.surface.raised,
    gap: spacing.md,
    ...shadows.card,
  },
  cardHeader: { gap: spacing.xs },
  emptyChart: {
    minHeight: 150,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: chartColors.quiet,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyChartMark: {
    width: 64,
    height: 42,
    justifyContent: 'center',
    gap: 9,
    transform: [{ rotate: '-8deg' }],
  },
  emptyChartLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand.primarySoft,
    opacity: 0.7,
  },
  emptyChartLineShort: {
    width: 42,
    alignSelf: 'flex-end',
    backgroundColor: colors.brand.success,
  },
  emptyChartText: { textAlign: 'center', lineHeight: 19 },
  coverageSummary: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  coverageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  coverageCell: { width: 40, height: 40, borderRadius: 12 },
  coverageCellEmpty: {
    backgroundColor: chartColors.quiet,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chartColors.grid,
  },
  coverageLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  coverageLegendCell: { width: 17, height: 8, borderRadius: 4 },
  cycleTableHead: {
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cycleTableRow: {
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: chartColors.quiet,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cycleLengthCell: { alignItems: 'center', gap: 1 },
  averageRow: {
    paddingTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricTopline: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  axisRow: {
    marginTop: -2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  phaseMatrix: { gap: 6 },
  phaseHead: { flexDirection: 'row', gap: 6 },
  phaseNameSpace: { width: 118 },
  phaseHeading: { flex: 1, textAlign: 'center' },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phaseRowLabel: { width: 118, flexShrink: 1 },
  phaseCell: {
    flex: 1,
    minWidth: 30,
    height: 31,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseLegend: {
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chartColors.grid,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.xs,
  },
  phaseLegendItem: {
    width: '50%',
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phaseLegendDot: { width: 7, height: 7, borderRadius: 4 },
  moodEnergyContent: { gap: spacing.lg },
  subsection: { gap: spacing.sm },
  patternList: { gap: spacing.sm },
  patternRow: {
    minHeight: 58,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: chartColors.quiet,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  patternDot: { width: 9, height: 9, borderRadius: 5 },
  patternCopy: { flex: 1, lineHeight: 20 },
  intensityLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  intensityRows: { gap: 8 },
  intensityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  intensityDate: { width: 34 },
  intensityCells: { flex: 1, flexDirection: 'row', gap: 5 },
  intensityCell: { flex: 1, height: 24, borderRadius: 7 },
  intensityCellEmpty: { backgroundColor: chartColors.quiet },
  intensityAxis: { flexDirection: 'row', gap: spacing.sm },
  intensityAxisText: { flex: 1, textAlign: 'center' },
  scanLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  testCycleDates: { flexDirection: 'row', justifyContent: 'space-between' },
  metricTabs: { flexDirection: 'row', gap: spacing.xs },
  metricTab: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: chartColors.quiet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTabSelected: { backgroundColor: colors.surface.rose },
  activityBars: {
    height: 108,
    paddingTop: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chartColors.grid,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  activityBarWrap: {
    width: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  activityBar: { width: 8, borderRadius: 4 },
  activityTick: { height: 16, marginTop: 5, fontSize: 10 },
  analyteTabs: { flexDirection: 'row', gap: spacing.xs },
  analyteTab: {
    maxWidth: 126,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    justifyContent: 'center',
    backgroundColor: chartColors.quiet,
  },
  analyteTabSelected: {
    backgroundColor: colorWithOpacity(colors.brand.burgundy, 0.12),
  },
});
