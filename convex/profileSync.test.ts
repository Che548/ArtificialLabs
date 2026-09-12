import { describe, expect, test, vi } from 'vitest';

vi.mock('./lib/access', () => ({
  requireActiveAccount: async () => 'synthetic-user',
  requireUserId: async () => 'synthetic-user',
  getOwnedProfile: async () => null,
}));
vi.mock('./lib/cloudConsent', () => ({ recordCloudReceipt: async () => {}, cloudSession: async () => ({}) }));
import { save } from './profile';

const input = { displayName: 'Synthetic', goal: 'cycle', onboardingCompleted: true, updatedAt: 10, consentToCloudSyncAt: 5 };

async function apply(existing: Record<string, unknown>, patchInput = input) {
  const patch = vi.fn();
  const ctx = { db: {
    get: async () => ({}),
    query: () => ({ withIndex: () => ({ unique: async () => ({ _id: 'synthetic-profile', ...existing }) }) }),
    patch,
  } };
  // Exercise the actual mutation handler: no live data or network involved.
  const handler = (save as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
  await handler(ctx, patchInput);
  return patch;
}

describe('profile subscription convergence', () => {
  test('two devices with different consent receipt times converge', async () => {
    let current: Record<string, unknown> = { ...input, consentToCloudSyncAt: 1 };
    let writes = 0;
    for (const consentToCloudSyncAt of [5, 1, 5, 1, 5, 1]) {
      const patch = await apply(current, { ...input, consentToCloudSyncAt });
      for (const [, fields] of patch.mock.calls) {
        current = { ...current, ...fields };
        writes += 1;
      }
    }
    expect(current.consentToCloudSyncAt).toBe(5);
    expect(writes).toBe(1);
  });
  test('repeated identical saves never write or re-invalidate subscriptions', async () => {
    for (let n = 0; n < 10; n++) {
      expect(await apply({ ...input, lastMedicalSyncAt: 100 })).not.toHaveBeenCalled();
    }
  });
  test('changed fields at an equal timestamp and newer profiles still save', async () => {
    await expect(apply({ ...input, displayName: 'Earlier' })).rejects.toThrow('PROFILE_SYNC_CONFLICT');
    expect(await apply({ ...input, updatedAt: 9 })).toHaveBeenCalledOnce();
  });
  test('stale fields are ignored but newer explicit consent is retained', async () => {
    expect(await apply({ ...input, updatedAt: 20 })).not.toHaveBeenCalled();
    const patch = await apply({ ...input, updatedAt: 20, consentToCloudSyncAt: 1 });
    expect(patch).toHaveBeenCalledExactlyOnceWith('synthetic-profile', { consentToCloudSyncAt: 5 });
  });
});
