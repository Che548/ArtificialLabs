import type { RegistrationConsent } from '../shared/registration-consent';
// The read-only web demo never records consent or activates cloud/AI services.
export async function rememberRegistrationConsent(_identifier: string, _channel: 'email' | 'phone' = 'email') {}
export async function pendingRegistrationConsent(): Promise<RegistrationConsent | undefined> { return undefined; }
export async function clearRegistrationConsent() {}
