import type { HealthGoal, LocalProfile } from './health-types';

export function profileGoalPatch(
  goal: HealthGoal,
  cycleLength: string,
  periodDate?: number,
  pregnancyDate?: number,
  now = Date.now(),
): Partial<Omit<LocalProfile, 'updatedAt'>> | undefined {
  const validDate = (date?: number): date is number =>
    date !== undefined &&
    Number.isFinite(date) &&
    Number.isFinite(new Date(date).getTime()) &&
    date <= now;

  if (goal === 'pregnancy') {
    return validDate(pregnancyDate)
      ? { goal, pregnancyStartAt: pregnancyDate }
      : undefined;
  }
  const days = Number(cycleLength);
  if (
    !validDate(periodDate) ||
    !/^\d+$/.test(cycleLength) ||
    days < 20 ||
    days > 45
  ) {
    return undefined;
  }
  return { goal, lastPeriodStartAt: periodDate, cycleLengthDays: days };
}
