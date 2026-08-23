import type { JournalEntry, LocalProfile } from './health-types';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const DEFAULT_PERIOD_LENGTH_DAYS = 5;
const MIN_CYCLE_LENGTH_DAYS = 21;
const MAX_CYCLE_LENGTH_DAYS = 45;

export type FertilityProbability = 'high' | 'low' | 'medium' | 'unknown';
export type CycleForecastKind =
  'fertile' | 'menstruation' | 'neutral' | 'ovulation' | 'upcoming';

export type PeriodRun = {
  endAt: number;
  lengthDays: number;
  startAt: number;
};

export type CycleHistory = {
  cycleLengthDays: number;
  latestPeriodStartAt: number;
  observedCycleLengths: number[];
  periodDateKeys: ReadonlySet<string>;
  periodLengthDays: number;
  periodRuns: PeriodRun[];
  source: 'journal' | 'profile';
};

export type CycleDayInsight = {
  cycleDay: number;
  delayDays: number;
  fertileEndAt: number;
  fertileStartAt: number;
  kind: CycleForecastKind;
  nextOvulationAt: number;
  ovulationDay: number;
  probability: Exclude<FertilityProbability, 'unknown'>;
};

export function cycleDateKey(value: Date | number) {
  const date = typeof value === 'number' ? new Date(value) : value;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function daySerial(value: Date | number) {
  const date = typeof value === 'number' ? new Date(value) : value;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function localNoonFromSerial(serial: number) {
  const utc = new Date(serial);
  return new Date(
    utc.getUTCFullYear(),
    utc.getUTCMonth(),
    utc.getUTCDate(),
    12,
  ).getTime();
}

function dateKeySerial(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return undefined;
  return Date.UTC(year, month, day);
}

export function cycleDateFromKey(key: string) {
  const serial = dateKeySerial(key);
  return serial === undefined
    ? undefined
    : new Date(localNoonFromSerial(serial));
}

function addCalendarDays(timestamp: number, days: number) {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    12,
  ).getTime();
}

function isConfiguredCycleLength(value?: number): value is number {
  return (
    Number.isInteger(value) &&
    value! >= MIN_CYCLE_LENGTH_DAYS &&
    value! <= MAX_CYCLE_LENGTH_DAYS
  );
}

export function isMenstruationJournalEntry(entry: JournalEntry) {
  if (entry.deletedAt || entry.kind !== 'cycle') return false;
  const label = entry.label.toLocaleLowerCase('ru-RU');
  const value = entry.textValue?.toLocaleLowerCase('ru-RU') ?? '';
  const describesMenstruation =
    label.includes('менструа') || label.includes('месячн');
  const explicitlyAbsent =
    value.includes('нет менструа') || value.includes('без менструа');
  return describesMenstruation && !explicitlyAbsent;
}

export function periodDateKeysFromJournal(entries: readonly JournalEntry[]) {
  return new Set(
    entries
      .filter(isMenstruationJournalEntry)
      .map((entry) => cycleDateKey(entry.occurredAt)),
  );
}

function periodRunsFromKeys(periodDateKeys: ReadonlySet<string>) {
  const serials = [...periodDateKeys]
    .map(dateKeySerial)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const runs: PeriodRun[] = [];

  for (const serial of serials) {
    const current = runs[runs.length - 1];
    if (current && serial - daySerial(current.endAt) === DAY_IN_MILLISECONDS) {
      current.endAt = localNoonFromSerial(serial);
      current.lengthDays += 1;
    } else {
      const timestamp = localNoonFromSerial(serial);
      runs.push({ endAt: timestamp, lengthDays: 1, startAt: timestamp });
    }
  }

  return runs;
}

export function createCycleHistory({
  cycleLengthDays,
  lastPeriodStartAt,
  periodDateKeys,
}: {
  cycleLengthDays?: number;
  lastPeriodStartAt?: number;
  periodDateKeys: ReadonlySet<string>;
}): CycleHistory | null {
  const periodRuns = periodRunsFromKeys(periodDateKeys);
  const observedCycleLengths = periodRuns
    .slice(1)
    .map((run, index) =>
      Math.round(
        (daySerial(run.startAt) - daySerial(periodRuns[index].startAt)) /
          DAY_IN_MILLISECONDS,
      ),
    )
    .filter(
      (length) =>
        length >= MIN_CYCLE_LENGTH_DAYS && length <= MAX_CYCLE_LENGTH_DAYS,
    );
  const journalCycleLength = observedCycleLengths.length
    ? Math.round(
        observedCycleLengths.reduce((sum, length) => sum + length, 0) /
          observedCycleLengths.length,
      )
    : undefined;
  const configuredCycleLength = isConfiguredCycleLength(cycleLengthDays)
    ? cycleLengthDays
    : undefined;
  const latestRun = periodRuns[periodRuns.length - 1];
  const profileStart = lastPeriodStartAt
    ? new Date(lastPeriodStartAt).setHours(12, 0, 0, 0)
    : undefined;
  const latestPeriodStartAt = Math.max(
    latestRun?.startAt ?? Number.NEGATIVE_INFINITY,
    profileStart ?? Number.NEGATIVE_INFINITY,
  );

  if (!Number.isFinite(latestPeriodStartAt)) return null;

  return {
    cycleLengthDays: journalCycleLength ?? configuredCycleLength ?? 28,
    latestPeriodStartAt,
    observedCycleLengths,
    periodDateKeys,
    periodLengthDays:
      latestRun && latestRun.startAt === latestPeriodStartAt
        ? Math.min(10, latestRun.lengthDays)
        : DEFAULT_PERIOD_LENGTH_DAYS,
    periodRuns,
    source: latestRun?.startAt === latestPeriodStartAt ? 'journal' : 'profile',
  };
}

export function cycleHistoryFromHealthData(
  profile: LocalProfile | null | undefined,
  entries: readonly JournalEntry[],
) {
  return createCycleHistory({
    cycleLengthDays: profile?.cycleLengthDays,
    lastPeriodStartAt: profile?.lastPeriodStartAt,
    periodDateKeys: periodDateKeysFromJournal(entries),
  });
}

export function cycleDayInsight(
  date: Date,
  history: CycleHistory,
  now = new Date(),
): CycleDayInsight {
  const difference = Math.floor(
    (daySerial(date) - daySerial(history.latestPeriodStartAt)) /
      DAY_IN_MILLISECONDS,
  );
  const projectedCycleDay =
    (((difference % history.cycleLengthDays) + history.cycleLengthDays) %
      history.cycleLengthDays) +
    1;
  const ovulationDay = Math.max(10, Math.min(21, history.cycleLengthDays - 14));
  const fertileStartDay = Math.max(1, ovulationDay - 5);
  const fertileEndDay = Math.min(history.cycleLengthDays, ovulationDay + 1);
  const actualPeriod = history.periodDateKeys.has(cycleDateKey(date));
  const expectedPeriod = projectedCycleDay <= history.periodLengthDays;
  const cycleStartAt = addCalendarDays(
    date.getTime(),
    -(projectedCycleDay - 1),
  );
  const thisCycleFertileStartAt = addCalendarDays(
    cycleStartAt,
    fertileStartDay - 1,
  );
  const thisCycleFertileEndAt = addCalendarDays(
    cycleStartAt,
    fertileEndDay - 1,
  );
  const fertileWindowHasPassed =
    daySerial(thisCycleFertileEndAt) < daySerial(date);
  const fertileStartAt = fertileWindowHasPassed
    ? addCalendarDays(thisCycleFertileStartAt, history.cycleLengthDays)
    : thisCycleFertileStartAt;
  const fertileEndAt = fertileWindowHasPassed
    ? addCalendarDays(thisCycleFertileEndAt, history.cycleLengthDays)
    : thisCycleFertileEndAt;
  const thisCycleOvulationAt = addCalendarDays(cycleStartAt, ovulationDay - 1);
  const nextOvulationAt =
    daySerial(thisCycleOvulationAt) >= daySerial(date)
      ? thisCycleOvulationAt
      : addCalendarDays(thisCycleOvulationAt, history.cycleLengthDays);
  const highProbability =
    projectedCycleDay >= Math.max(fertileStartDay, ovulationDay - 2) &&
    projectedCycleDay <= fertileEndDay;
  const mediumProbability =
    projectedCycleDay >= fertileStartDay && projectedCycleDay <= fertileEndDay;
  const latestStartDifference = Math.floor(
    (daySerial(now) - daySerial(history.latestPeriodStartAt)) /
      DAY_IN_MILLISECONDS,
  );
  const isToday = cycleDateKey(date) === cycleDateKey(now);
  const delayDays = isToday
    ? Math.max(0, latestStartDifference - history.cycleLengthDays)
    : 0;
  const cycleDay = delayDays ? latestStartDifference + 1 : projectedCycleDay;
  const probability = delayDays
    ? 'low'
    : highProbability
      ? 'high'
      : mediumProbability
        ? 'medium'
        : 'low';
  const kind: CycleForecastKind = delayDays
    ? 'neutral'
    : actualPeriod || expectedPeriod
      ? 'menstruation'
      : projectedCycleDay === ovulationDay
        ? 'ovulation'
        : mediumProbability
          ? 'fertile'
          : projectedCycleDay >= history.cycleLengthDays - 2
            ? 'upcoming'
            : 'neutral';

  return {
    cycleDay,
    delayDays,
    fertileEndAt,
    fertileStartAt,
    kind,
    nextOvulationAt,
    ovulationDay,
    probability,
  };
}

export function averageCycleLength(history: CycleHistory) {
  const values = history.observedCycleLengths;
  if (!values.length) return undefined;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

export function cycleLengthVariation(history: CycleHistory) {
  const values = history.observedCycleLengths;
  if (values.length < 2) return undefined;
  return Math.max(...values) - Math.min(...values);
}
