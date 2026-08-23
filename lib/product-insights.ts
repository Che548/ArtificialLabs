import type {
  CarePlanItem,
  HealthGoal,
  JournalEntry,
  JournalKind,
} from './health-types';

const MAX_PREGNANCY_WEEK = 42;
const WEEK_IN_MILLISECONDS = 7 * 24 * 60 * 60 * 1000;

export function homeDashboardForGoal(goal?: HealthGoal) {
  return goal === 'pregnancy' ? 'pregnancy' : 'cycle';
}

export function pregnancyWeekFromStart(
  pregnancyStartAt?: number,
  now = Date.now(),
) {
  if (
    !Number.isFinite(pregnancyStartAt) ||
    pregnancyStartAt === undefined ||
    pregnancyStartAt > now
  )
    return undefined;
  return Math.min(
    MAX_PREGNANCY_WEEK,
    Math.max(
      1,
      Math.floor((now - pregnancyStartAt) / WEEK_IN_MILLISECONDS) + 1,
    ),
  );
}

export function calculateCompletionScore(
  plannedIds: readonly string[],
  completedIds: ReadonlySet<string>,
) {
  if (plannedIds.length === 0) return 0;
  const completed = plannedIds.filter((id) => completedIds.has(id)).length;
  return Math.round((completed / plannedIds.length) * 100);
}

const JOURNAL_PROGRESS_KINDS: readonly JournalKind[] = [
  'cycle',
  'mood',
  'energy',
  'symptom',
  'nutrition',
  'activity',
  'measurement',
];

function localDayStart(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

export function journalProgressForDay(
  entries: readonly JournalEntry[],
  timestamp = Date.now(),
) {
  const start = localDayStart(timestamp);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const completedKinds = new Set(
    entries
      .filter(
        (entry) =>
          !entry.deletedAt &&
          entry.occurredAt >= start &&
          entry.occurredAt < end.getTime() &&
          JOURNAL_PROGRESS_KINDS.includes(entry.kind),
      )
      .map((entry) => entry.kind),
  );
  const completed = completedKinds.size;
  const total = JOURNAL_PROGRESS_KINDS.length;
  const status =
    completed === 0
      ? 'Нет записей сегодня'
      : completed === total
        ? 'День заполнен'
        : completed >= 4
          ? 'Хорошая заполненность'
          : 'Начало положено';

  return { completed, status, total };
}

export function carePlanProgress(items: readonly CarePlanItem[]) {
  const tracked = items.filter(
    (item) =>
      !item.deletedAt &&
      item.status !== 'declined' &&
      item.status !== 'superseded',
  );
  const completed = tracked.filter(
    (item) => item.status === 'completed',
  ).length;
  const total = tracked.length;
  const status =
    total === 0
      ? 'План пока пуст'
      : completed === total
        ? 'План выполнен'
        : completed === 0
          ? 'Ещё не начато'
          : completed / total >= 0.67
            ? 'Хороший прогресс'
            : 'Есть прогресс';

  return { completed, status, total };
}

export function latestCarePlanDueAt(
  items: readonly Pick<CarePlanItem, 'dueAt'>[],
) {
  const deadlines = items
    .map((item) => item.dueAt)
    .filter((value): value is number => Number.isFinite(value));
  return deadlines.length ? Math.max(...deadlines) : undefined;
}
