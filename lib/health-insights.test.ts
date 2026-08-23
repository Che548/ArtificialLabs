import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHealthInsightCycles,
  menstruationIntensity,
} from './health-insights';
import type { JournalEntry, LocalProfile } from './health-types';

function entry(
  date: Date,
  textValue: string,
  overrides: Partial<JournalEntry> = {},
): JournalEntry {
  return {
    kind: 'cycle',
    label: 'Менструация',
    localId: `${date.getTime()}-${textValue}`,
    occurredAt: date.getTime(),
    source: 'manual',
    textValue,
    updatedAt: date.getTime(),
    ...overrides,
  };
}

test('health insight cycles use real calendar marks without inventing intensity', () => {
  const entries = [
    entry(new Date(2026, 7, 1, 12), 'Отмечено в календаре'),
    entry(new Date(2026, 7, 2, 12), 'Отмечено в календаре'),
    entry(new Date(2026, 7, 3, 12), 'Нет менструации'),
    entry(new Date(2026, 7, 29, 12), 'Умеренная менструация'),
    entry(new Date(2026, 7, 30, 12), 'Слабая менструация'),
  ];

  const cycles = buildHealthInsightCycles(entries, null);

  assert.equal(cycles.length, 2);
  assert.equal(cycles[0].cycleLength, 28);
  assert.equal(cycles[0].dailyIntensity.get('2026-7-1'), 0);
  assert.equal(cycles[1].dailyIntensity.get('2026-7-29'), 2);
  assert.equal(cycles[1].dailyIntensity.get('2026-7-30'), 1);
});

test('health insight cycles fall back to the configured period start only when needed', () => {
  const start = new Date(2026, 7, 11, 9).getTime();
  const profile: LocalProfile = {
    displayName: 'Пользователь',
    goal: 'cycle',
    lastPeriodStartAt: start,
    onboardingCompleted: true,
    updatedAt: start,
  };

  const [cycle] = buildHealthInsightCycles([], profile);

  assert.ok(cycle);
  assert.equal(cycle.start.getDate(), 11);
  assert.equal(cycle.dailyIntensity.size, 0);
});

test('menstruation intensity is parsed only from an explicit journal answer', () => {
  const date = new Date(2026, 7, 1, 12);
  assert.equal(menstruationIntensity(entry(date, 'Обильная менструация')), 3);
  assert.equal(menstruationIntensity(entry(date, 'Отмечено в календаре')), 0);
});
