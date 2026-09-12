import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSingleFlightRunner,
  sanitizeCloudRecord,
  synchronizeMedicalCloud,
  utf8ByteLength,
  type CloudOutboxRow,
} from './cloud-sync';
import type { LocalProfile } from './health-types';
import { createEmptySnapshot } from './health-types';
import { reconcileCarePlan } from './care-plan';

test('a rejected rule keeps its outbox row but does not block ordinary records', async () => {
  const snapshot = createEmptySnapshot();
  snapshot.profile = { displayName: 'Synthetic', goal: 'cycle', onboardingCompleted: true, updatedAt: 1 };
  snapshot.preferences = [{ localId: 'preferences', medicalRecommendations: true, updatedAt: 1, notificationsEnabled: false, journalNotifications: false, resultNotifications: false, notificationTone: 'formal', anonymousAnalytics: false, language: 'ru', region: 'RU' }];
  const agentRow: CloudOutboxRow = { id: 2, entity: 'agentTriggers', payload: reconcileCarePlan(snapshot).triggers[0] };
  let pending = [agentRow, row];
  let rejectRule = true;
  const acknowledged: number[] = [];
  const run = () => synchronizeMedicalCloud({ profile, saveProfile: async () => {},
    loadPendingOutbox: async () => pending,
    pushBatch: async (batch) => { if (batch.agentTriggers.length && rejectRule) throw new Error('AGENT_TRIGGER_IMMUTABLE'); },
    acknowledge: async (ids) => { acknowledged.push(...ids); pending = pending.filter((entry) => !ids.includes(entry.id)); },
  });
  await assert.rejects(run(), /AGENT_TRIGGER_IMMUTABLE/);
  assert.deepEqual(acknowledged, [row.id]);
  assert.deepEqual(pending, [agentRow]);
  rejectRule = false;
  await run();
  assert.deepEqual(acknowledged, [row.id, agentRow.id]);
  assert.deepEqual(pending, []);
});

const profile: LocalProfile = {
  displayName: 'Test',
  goal: 'planning',
  onboardingCompleted: true,
  updatedAt: 100,
};

const row: CloudOutboxRow = {
  id: 1,
  entity: 'documents',
  payload: {
    localId: 'document-1',
    title: 'Local document',
    category: 'medical',
    documentDate: 100,
    hasLocalFile: true,
    localFileUri: 'file:///private/document.pdf',
    updatedAt: 100,
  },
};

test('counts upload estimates as UTF-8 bytes', () => {
  assert.equal(utf8ByteLength('ASCII'), 5);
  assert.equal(utf8ByteLength('сфера'), Buffer.byteLength('сфера', 'utf8'));
  assert.equal(utf8ByteLength('🩷'), Buffer.byteLength('🩷', 'utf8'));
});

test('document cloud records strip accidental OCR draft fields as well as local paths', () => {
  const result = sanitizeCloudRecord('documents', {
    ...row.payload, ocrDraft: { text: 'synthetic private draft' }, extractedText: 'synthetic OCR',
    documentExtraction: { pages: [] }, editedText: 'synthetic reviewed draft', pages: [{ text: 'synthetic page' }], unexpectedSecret: 'synthetic-not-a-secret',
  });
  for (const key of ['ocrDraft', 'extractedText', 'documentExtraction', 'editedText', 'pages', 'localFileUri', 'unexpectedSecret']) assert.equal(key in result, false);
  assert.equal(result.localId, 'document-1');
});

test('syncs profile before outbox and acknowledges only accepted rows', async () => {
  const calls: string[] = [];
  let pending = [row];
  const pushed = await synchronizeMedicalCloud({
    profile,
    consentedAt: 99,
    saveProfile: async (value) => {
      calls.push('profile');
      assert.equal(value.consentToCloudSyncAt, 99);
    },
    loadPendingOutbox: async () => pending,
    pushBatch: async (batch) => {
      calls.push('outbox');
      assert.equal(
        JSON.stringify(batch.documents).includes('file:///'),
        false,
      );
    },
    acknowledge: async (ids) => {
      calls.push('acknowledge');
      assert.deepEqual(ids, [1]);
      pending = [];
    },
  });

  assert.equal(pushed, 1);
  assert.deepEqual(calls, ['profile', 'outbox', 'acknowledge']);
});

test('keeps outbox pending after failure and retries it', async () => {
  let pending = [row];
  let attempts = 0;
  let acknowledgements = 0;
  const run = () =>
    synchronizeMedicalCloud({
      profile,
      saveProfile: async () => undefined,
      loadPendingOutbox: async () => pending,
      pushBatch: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
      },
      acknowledge: async () => {
        acknowledgements += 1;
        pending = [];
      },
    });

  await assert.rejects(run(), /temporary failure/);
  assert.equal(acknowledgements, 0);
  assert.equal(pending.length, 1);
  await run();
  assert.equal(acknowledgements, 1);
  assert.equal(pending.length, 0);
});

test('single-flight shares one active synchronization', async () => {
  const runSingleFlight = createSingleFlightRunner();
  let executions = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const task = async () => {
    executions += 1;
    await gate;
    return 7;
  };

  const first = runSingleFlight(task);
  const second = runSingleFlight(task);
  assert.equal(first, second);
  assert.equal(executions, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [7, 7]);
});
