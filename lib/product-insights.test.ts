import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCompletionScore,
  carePlanProgress,
  homeDashboardForGoal,
  journalProgressForDay,
  latestCarePlanDueAt,
  pregnancyWeekFromStart,
} from './product-insights';

test('analysis score follows completed current plans', () => {
  assert.equal(calculateCompletionScore([], new Set()), 0);
  assert.equal(calculateCompletionScore(['a', 'b'], new Set()), 0);
  assert.equal(calculateCompletionScore(['a', 'b'], new Set(['a'])), 50);
  assert.equal(
    calculateCompletionScore(['a', 'b', 'c'], new Set(['a', 'c'])),
    67,
  );
  assert.equal(calculateCompletionScore(['a'], new Set(['future'])), 0);
});

test('journal progress counts distinct real sections for the selected day', () => {
  const now = new Date(2026, 7, 23, 12).getTime();
  const base = {
    localId: 'journal',
    occurredAt: now,
    label: 'Запись',
    source: 'manual' as const,
    updatedAt: now,
  };
  const progress = journalProgressForDay([
    { ...base, kind: 'mood', localId: 'mood', textValue: 'Спокойно' },
    { ...base, kind: 'mood', localId: 'mood-2', textValue: 'Радость' },
    { ...base, kind: 'energy', localId: 'energy', textValue: 'Много энергии' },
    {
      ...base,
      kind: 'nutrition',
      localId: 'deleted',
      deletedAt: now,
      textValue: 'Удалено',
    },
  ]);

  assert.equal(progress.completed, 2);
  assert.equal(progress.total, 7);
  assert.equal(progress.status, 'Начало положено');
});

test('care plan progress uses the actual active and completed plan', () => {
  const base = {
    catalogKey: 'cbc',
    category: 'Анализы',
    confidence: 1,
    description: 'Описание',
    dueAt: Date.now(),
    evidenceRefs: [],
    localId: 'plan',
    provisional: false,
    rationale: 'Основание',
    requiresClinician: false,
    riskTier: 'low' as const,
    scheduleBasis: 'confirmed_data' as const,
    title: 'ОАК',
    updatedAt: Date.now(),
  };
  const progress = carePlanProgress([
    { ...base, status: 'completed' as const },
    { ...base, localId: 'current', status: 'current' as const },
    { ...base, localId: 'declined', status: 'declined' as const },
  ]);

  assert.equal(progress.completed, 1);
  assert.equal(progress.total, 2);
  assert.equal(progress.status, 'Есть прогресс');
});

test('care plan deadline comes from the actual latest dated item', () => {
  assert.equal(
    latestCarePlanDueAt([
      { dueAt: 100 },
      { dueAt: undefined },
      { dueAt: 300 },
      { dueAt: 200 },
    ]),
    300,
  );
  assert.equal(latestCarePlanDueAt([{ dueAt: undefined }]), undefined);
});

test('home dashboard and pregnancy week never invent pregnancy state', () => {
  const now = new Date(2026, 7, 23, 12).getTime();
  assert.equal(homeDashboardForGoal('pregnancy'), 'pregnancy');
  assert.equal(homeDashboardForGoal('planning'), 'cycle');
  assert.equal(homeDashboardForGoal('cycle'), 'cycle');
  assert.equal(pregnancyWeekFromStart(undefined, now), undefined);
  assert.equal(pregnancyWeekFromStart(now + 1, now), undefined);
  assert.equal(
    pregnancyWeekFromStart(now - 8 * 7 * 24 * 60 * 60 * 1000, now),
    9,
  );
});
