import { describe, expect, test, vi } from 'vitest';

vi.mock('./lib/access', () => ({
  requireActiveAccount: async () => 'synthetic-user',
  requireUserId: async () => 'synthetic-user',
  getOwnedProfile: async () => null,
}));
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
  test('repeated identical saves never write or re-invalidate subscriptions', async () => {
    for (let n = 0; n < 10; n++) {
      expect(await apply({ ...input, lastMedicalSyncAt: 100 })).not.toHaveBeenCalled();
    }
  });
  test('changed fields at an equal timestamp and newer profiles still save', async () => {
    expect(await apply({ ...input, displayName: 'Earlier' })).toHaveBeenCalledOnce();
    expect(await apply({ ...input, updatedAt: 9 })).toHaveBeenCalledOnce();
  });
  test('stale fields are ignored but newer explicit consent is retained', async () => {
    expect(await apply({ ...input, updatedAt: 20 })).not.toHaveBeenCalled();
    const patch = await apply({ ...input, updatedAt: 20, consentToCloudSyncAt: 1 });
    expect(patch).toHaveBeenCalledExactlyOnceWith('synthetic-profile', { consentToCloudSyncAt: 5 });
  });
});
