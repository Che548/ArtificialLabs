import { beforeEach, expect, test, vi } from 'vitest';
const storage = vi.hoisted(() => ({ value: undefined as string | undefined, options: undefined as unknown }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  getItemAsync: vi.fn(async () => storage.value ?? null),
  setItemAsync: vi.fn(async (_key: string, value: string, options: unknown) => { storage.value = value; storage.options = options; }),
  deleteItemAsync: vi.fn(async () => { storage.value = undefined; }),
}));
import { rememberRegistrationConsent, pendingRegistrationConsent, clearRegistrationConsent } from './registration-consent.native';
import { REGISTRATION_CONSENT_VERSION } from '../shared/registration-consent';
beforeEach(() => { storage.value = undefined; storage.options = undefined; });
test('the device receipt persists across verification reads until explicitly consumed', async () => {
  await rememberRegistrationConsent(' New@Example.test ');
  const first = await pendingRegistrationConsent();
  expect(first).toMatchObject({ email: 'new@example.test', version: REGISTRATION_CONSENT_VERSION });
  expect(storage.options).toEqual({ keychainAccessible: 99 });
  expect(await pendingRegistrationConsent()).toEqual(first);
  await clearRegistrationConsent();
  expect(await pendingRegistrationConsent()).toBeUndefined();
});
test('missing and corrupt local metadata never become an accepted choice', async () => {
  expect(await pendingRegistrationConsent()).toBeUndefined();
  for (const raw of ['{', 'null', '{}', '{"email":1,"acceptedAt":2,"version":"x"}']) {
    storage.value = raw;
    expect(await pendingRegistrationConsent()).toBeUndefined();
    expect(storage.value).toBeUndefined();
  }
});
