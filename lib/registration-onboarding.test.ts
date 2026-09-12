import { beforeEach, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../convex/schema';
import { api } from '../convex/_generated/api';

const fixture = vi.hoisted(() => ({
  stored: undefined as string | undefined,
  apply: vi.fn(), cloud: vi.fn(), preferences: vi.fn(), condition: vi.fn(), complete: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
  getItemAsync: async () => fixture.stored ?? null,
  setItemAsync: async (_key: string, value: string) => { fixture.stored = value; },
  deleteItemAsync: async () => { fixture.stored = undefined; },
}));
vi.mock('./registration-consent', async () => import('./registration-consent.native'));
vi.mock('convex/react', () => ({ useMutation: () => fixture.apply }));
vi.mock('./health-store', () => ({ useHealthStore: () => ({
  setCloudSyncEnabled: fixture.cloud, savePreferences: fixture.preferences,
  saveMedicalCondition: fixture.condition, completeOnboarding: fixture.complete,
}) }));
vi.mock('../design-system/onboarding-flow', () => ({ OnboardingPreviewFlow: () => null }));
import { OnboardingScreen } from '../components/OnboardingScreen';
import { pendingRegistrationConsent, rememberRegistrationConsent } from './registration-consent.native';
const modules = import.meta.glob('../convex/**/*.ts');
const profile = {
  anonymousAnalytics: false, cloudSyncEnabled: false, medicalRecommendations: false,
  medicalConditions: [], birthYear: 1995,
};
const finish = () => OnboardingScreen().props.onComplete(profile);
beforeEach(() => { fixture.stored = undefined; vi.resetAllMocks(); });

test('pending device choice survives absent authentication and is consumed only after authenticated onboarding', async () => {
  const t = convexTest(schema, modules);
  await rememberRegistrationConsent('onboarding@example.test');
  const receipt = await pendingRegistrationConsent();
  fixture.apply.mockImplementation(args => t.mutation(api.registrationConsent.accept, args));
  await expect(finish()).rejects.toThrow('UNAUTHENTICATED');
  expect(fixture.cloud).not.toHaveBeenCalled();
  expect(await pendingRegistrationConsent()).toEqual(receipt);
  const userId = await t.run(ctx => ctx.db.insert('users', { email: receipt!.email }));
  const authenticated = t.withIdentity({ subject: `${userId}|fixture` });
  fixture.apply.mockImplementation(args => authenticated.mutation(api.registrationConsent.accept, args));
  await expect(finish()).rejects.toThrow('REGISTRATION_EMAIL_VERIFICATION_REQUIRED');
  expect(fixture.cloud).not.toHaveBeenCalled();
  expect(await pendingRegistrationConsent()).toEqual(receipt);
  await t.run(ctx => ctx.db.patch(userId, { emailVerificationTime: Date.now() }));
  await finish();
  expect(fixture.cloud).toHaveBeenCalledExactlyOnceWith(true);
  expect(fixture.preferences).toHaveBeenCalledWith(expect.objectContaining({ anonymousAnalytics: false, medicalRecommendations: true }));
  expect(fixture.complete).toHaveBeenCalledOnce();
  expect(await pendingRegistrationConsent()).toBeUndefined();
  expect(await t.run(ctx => ctx.db.query('aiChatConsents').collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query('aiAgentConsents').collect())).toHaveLength(1);
});

test('login/recovery onboarding without a registration choice cannot grant consent', async () => {
  await finish();
  expect(fixture.apply).not.toHaveBeenCalled();
  expect(fixture.cloud).toHaveBeenCalledExactlyOnceWith(false);
  expect(fixture.preferences).toHaveBeenCalledWith({ anonymousAnalytics: false, medicalRecommendations: false, agentNotifications: false });
});

test('a failed local completion retains the receipt and retry does not duplicate grants', async () => {
  const t = convexTest(schema, modules);
  await rememberRegistrationConsent('retry@example.test');
  const userId = await t.run(ctx => ctx.db.insert('users', { email: 'retry@example.test', emailVerificationTime: Date.now() }));
  const client = t.withIdentity({ subject: `${userId}|fixture` });
  fixture.apply.mockImplementation(args => client.mutation(api.registrationConsent.accept, args));
  fixture.complete.mockRejectedValueOnce(new Error('Synthetic local failure')).mockResolvedValue(undefined);
  await expect(finish()).rejects.toThrow('Synthetic local failure');
  expect(await pendingRegistrationConsent()).toBeDefined();
  await finish();
  expect(await pendingRegistrationConsent()).toBeUndefined();
  expect(await t.run(ctx => ctx.db.query('aiChatConsents').collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query('aiAgentConsents').collect())).toHaveLength(1);
});
