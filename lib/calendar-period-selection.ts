import { cycleDateKey } from './cycle-insights';

/** New selection adds five calendar days; an existing selection removes just that day. */
export function toggleCalendarPeriodDays(
  current: ReadonlySet<string>,
  date: Date,
): Set<string> {
  const next = new Set(current);
  const key = cycleDateKey(date);
  if (next.has(key)) {
    next.delete(key);
    return next;
  }
  for (let offset = 0; offset < 5; offset += 1) {
    next.add(
      cycleDateKey(
        new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate() + offset,
          12,
        ),
      ),
    );
  }
  return next;
}
