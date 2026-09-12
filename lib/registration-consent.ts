import type { RegistrationConsent } from '../shared/registration-consent';
// The read-only web demo never records consent or activates cloud/AI services.
export async function rememberRegistrationConsent(_email: string) {}
export async function pendingRegistrationConsent(): Promise<RegistrationConsent | undefined> { return undefined; }
export async function clearRegistrationConsent() {}
