import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSingleFlightRunner,
  synchronizeMedicalCloud,
  type CloudOutboxRow,
} from './cloud-sync';
import type { LocalProfile } from './health-types';

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
