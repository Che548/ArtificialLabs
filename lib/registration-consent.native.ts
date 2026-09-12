import * as SecureStore from 'expo-secure-store';
import { REGISTRATION_CONSENT_VERSION, type RegistrationConsent } from '../shared/registration-consent';

const key = 'sfera.registration-consent.v1';
export async function rememberRegistrationConsent(email: string) {
  const receipt: RegistrationConsent = { email: email.trim().toLowerCase(), acceptedAt: Date.now(), version: REGISTRATION_CONSENT_VERSION };
  await SecureStore.setItemAsync(key, JSON.stringify(receipt), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
export async function pendingRegistrationConsent(): Promise<RegistrationConsent | undefined> {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return undefined;
  try {
    const receipt = JSON.parse(raw);
    if (typeof receipt.email === 'string' && typeof receipt.acceptedAt === 'number' && typeof receipt.version === 'string') return receipt;
  } catch { /* Invalid local metadata must not enable anything. */ }
  await clearRegistrationConsent();
  return undefined;
}
export async function clearRegistrationConsent() { await SecureStore.deleteItemAsync(key); }
