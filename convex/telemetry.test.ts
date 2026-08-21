import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const setup = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
async function user(t: ReturnType<typeof convexTest>, email: string) {
  const userId = await t.run((ctx) => ctx.db.insert('users', { email }));
  return {
    userId,
    client: t.withIdentity({ subject: `${userId}|telemetry-test`, email }),
  };
}
const event = () => ({
  eventId: 'telemetry_event_0001',
  kind: 'cv_processed' as const,
  occurredAt: Date.now(),
  platform: 'ios' as const,
  osMajor: '26',
  appVersion: '1.0.0',
  algorithmVersion: 'stripcv-1',
  testSystemKey: 'ovulation-strip',
  durationMs: 120,
  outcome: 'success' as const,
  qualityFlags: ['well-lit'],
});

describe('privacy-safe telemetry', () => {
  test('requires opt-in, deduplicates and materializes bounded batches', async () => {
    const t = setup();
    const account = await user(t, 'telemetry@example.test');
    await expect(
      account.client.mutation(api.telemetry.ingest, { events: [event()] }),
    ).rejects.toThrow('ANALYTICS_CONSENT_REQUIRED');
    await account.client.mutation(api.telemetry.setConsent, { enabled: true });
    await expect(
      account.client.mutation(api.telemetry.ingest, { events: [event()] }),
    ).resolves.toEqual({ accepted: 1, duplicates: 0 });
    await expect(
      account.client.mutation(api.telemetry.ingest, { events: [event()] }),
    ).resolves.toEqual({ accepted: 0, duplicates: 1 });
    await t.mutation(internal.telemetry.processBatch, {});
    const buckets = await t.run((ctx) =>
      ctx.db.query('analyticsBuckets').collect(),
    );
    expect(buckets.find((row) => row.scope === 'global')).toMatchObject({
      processed: 1,
      successes: 1,
      errors: 0,
    });
    const raw = await t.run((ctx) => ctx.db.query('telemetryEvents').collect());
    expect(JSON.stringify(raw)).not.toContain(account.userId);
  });

  test('rejects PII-shaped dimensions and stops after consent is revoked', async () => {
    const t = setup();
    const account = await user(t, 'privacy@example.test');
    await account.client.mutation(api.telemetry.setConsent, { enabled: true });
    await expect(
      account.client.mutation(api.telemetry.ingest, {
        events: [
          {
            ...event(),
            eventId: 'telemetry_event_0002',
            lotNumber: 'file:///private/photo.jpg',
          },
        ],
      }),
    ).rejects.toThrow('INVALID_TELEMETRY_DIMENSION');
    await account.client.mutation(api.telemetry.setConsent, { enabled: false });
    await expect(
      account.client.mutation(api.telemetry.ingest, {
        events: [{ ...event(), eventId: 'telemetry_event_0003' }],
      }),
    ).rejects.toThrow('ANALYTICS_CONSENT_REQUIRED');
  });

  test('never processes more than fifty raw events per transaction', async () => {
    const t = setup();
    const account = await user(t, 'batch@example.test');
    await account.client.mutation(api.telemetry.setConsent, { enabled: true });
    const events = Array.from({ length: 120 }, (_, index) => ({
      ...event(),
      eventId: `telemetry_batch_${String(index).padStart(4, '0')}`,
    }));
    for (let offset = 0; offset < events.length; offset += 50) {
      await account.client.mutation(api.telemetry.ingest, {
        events: events.slice(offset, offset + 50),
      });
    }
    await expect(
      t.mutation(internal.telemetry.processBatch, {}),
    ).resolves.toMatchObject({ processed: 50, remaining: true });
    await expect(
      t.mutation(internal.telemetry.processBatch, {}),
    ).resolves.toMatchObject({ processed: 50, remaining: true });
    await expect(
      t.mutation(internal.telemetry.processBatch, {}),
    ).resolves.toMatchObject({ processed: 20, remaining: false });
  });
});
