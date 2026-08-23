import {
  cycleDateFromKey,
  cycleDateKey,
  isMenstruationJournalEntry,
} from './cycle-insights';
import type { JournalEntry, LocalProfile } from './health-types';

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export type HealthInsightCycleSegment = {
  start: Date;
  end: Date;
  dailyIntensity: Map<string, number>;
  cycleLength?: number;
};

export function menstruationIntensity(entry: JournalEntry) {
  const value = entry.textValue?.toLocaleLowerCase('ru-RU') ?? '';
  if (value.includes('обильн')) return 3;
  if (value.includes('умерен')) return 2;
  if (value.includes('слаб')) return 1;
  return 0;
}

export function buildHealthInsightCycles(
  entries: readonly JournalEntry[],
  profile: LocalProfile | null,
) {
  const menstruationByDay = new Map<string, number>();
  entries.filter(isMenstruationJournalEntry).forEach((entry) => {
    const key = cycleDateKey(entry.occurredAt);
    menstruationByDay.set(
      key,
      Math.max(menstruationByDay.get(key) ?? 0, menstruationIntensity(entry)),
    );
  });

  const days = [...menstruationByDay]
    .flatMap(([key, intensity]) => {
      const date = cycleDateFromKey(key);
      return date ? [{ key, intensity, date }] : [];
    })
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const cycles: HealthInsightCycleSegment[] = [];

  days.forEach((day) => {
    const current = cycles.at(-1);
    if (
      !current ||
      day.date.getTime() - current.end.getTime() > DAY_IN_MILLISECONDS * 1.5
    ) {
      cycles.push({
        start: day.date,
        end: day.date,
        dailyIntensity: new Map([[day.key, day.intensity]]),
      });
      return;
    }
    current.end = day.date;
    current.dailyIntensity.set(day.key, day.intensity);
  });

  cycles.forEach((cycle, index) => {
    const next = cycles[index + 1];
    if (!next) return;
    const length = Math.round(
      (next.start.getTime() - cycle.start.getTime()) / DAY_IN_MILLISECONDS,
    );
    if (length >= 21 && length <= 45) cycle.cycleLength = length;
  });

  if (!cycles.length && profile?.lastPeriodStartAt) {
    const start = cycleDateFromKey(cycleDateKey(profile.lastPeriodStartAt));
    if (start) cycles.push({ start, end: start, dailyIntensity: new Map() });
  }

  return cycles;
}
