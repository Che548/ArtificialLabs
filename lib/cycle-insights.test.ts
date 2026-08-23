import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCycleHistory,
  cycleDateKey,
  cycleDayInsight,
  cycleLengthVariation,
  isMenstruationJournalEntry,
  periodDateKeysFromJournal,
} from './cycle-insights';
import type { JournalEntry } from './health-types';

function entry(
  date: Date,
  textValue: string,
  overrides: Partial<JournalEntry> = {},
): JournalEntry {
  return {
    kind: 'cycle',
    label: 'Менструация',
    localId: cycleDateKey(date),
    occurredAt: date.getTime(),
    source: 'manual',
    textValue,
    updatedAt: date.getTime(),
    ...overrides,
  };
}

test('menstruation journal entries exclude explicit no-period answers', () => {
  const date = new Date(2026, 7, 1, 12);
  assert.equal(
    isMenstruationJournalEntry(entry(date, 'Умеренная менструация')),
    true,
  );
  assert.equal(
    isMenstruationJournalEntry(entry(date, 'Нет менструации')),
    false,
  );
  assert.equal(
    isMenstruationJournalEntry(
      entry(date, 'Умеренная', { deletedAt: Date.now() }),
    ),
    false,
  );
});

test('cycle history uses persisted period runs and observed lengths', () => {
  const starts = [
    new Date(2026, 5, 1, 12),
    new Date(2026, 5, 29, 12),
    new Date(2026, 6, 28, 12),
  ];
  const entries = starts.flatMap((start) =>
    Array.from({ length: 4 }, (_, offset) => {
      const date = new Date(start);
      date.setDate(date.getDate() + offset);
      return entry(date, 'Умеренная менструация');
    }),
  );
  const history = createCycleHistory({
    cycleLengthDays: 30,
    periodDateKeys: periodDateKeysFromJournal(entries),
  });

  assert.ok(history);
  assert.equal(history.cycleLengthDays, 29);
  assert.deepEqual(history.observedCycleLengths, [28, 29]);
  assert.equal(history.periodLengthDays, 4);
  assert.equal(cycleLengthVariation(history), 1);
});

test('cycle insight changes fertility and menstruation states with the date', () => {
  const start = new Date(2026, 7, 1, 12);
  const history = createCycleHistory({
    cycleLengthDays: 28,
    lastPeriodStartAt: start.getTime(),
    periodDateKeys: new Set(),
  });
  assert.ok(history);

  const period = cycleDayInsight(new Date(2026, 7, 3, 12), history);
  const fertile = cycleDayInsight(new Date(2026, 7, 12, 12), history);
  const ovulation = cycleDayInsight(new Date(2026, 7, 14, 12), history);

  assert.equal(period.kind, 'menstruation');
  assert.equal(fertile.kind, 'fertile');
  assert.equal(fertile.probability, 'high');
  assert.equal(ovulation.kind, 'ovulation');
});

test('today reports a delayed period without inventing a new period start', () => {
  const start = new Date(2026, 5, 1, 12);
  const now = new Date(2026, 6, 2, 12);
  const history = createCycleHistory({
    cycleLengthDays: 28,
    lastPeriodStartAt: start.getTime(),
    periodDateKeys: new Set(),
  });
  assert.ok(history);

  const insight = cycleDayInsight(now, history, now);
  assert.equal(insight.cycleDay, 32);
  assert.equal(insight.delayDays, 3);
  assert.equal(insight.kind, 'neutral');
  assert.equal(insight.probability, 'low');
});
