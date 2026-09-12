import { AI_CHAT_CONSENT_POLICY_VERSION } from '../convex/aiChatConfig';
import { AI_AGENT_CONSENT_POLICY_VERSION } from '../convex/aiAgentConfig';

// Bump the registration revision whenever its disclosure/scopes change.
export const REGISTRATION_CONSENT_VERSION = `2026-09-12-registration-v1:${AI_CHAT_CONSENT_POLICY_VERSION}:${AI_AGENT_CONSENT_POLICY_VERSION}`;
export const REGISTRATION_CONSENT_TTL = 24 * 60 * 60 * 1000;
export type RegistrationConsent = { email: string; acceptedAt: number; version: string };

export function matchesNewRegistration(consent: RegistrationConsent, user: { email?: string; _creationTime: number }, now: number) {
  return consent.version === REGISTRATION_CONSENT_VERSION &&
    Number.isFinite(consent.acceptedAt) && consent.acceptedAt <= now &&
    now - consent.acceptedAt <= REGISTRATION_CONSENT_TTL &&
    user.email?.trim().toLowerCase() === consent.email.trim().toLowerCase() &&
    user._creationTime >= consent.acceptedAt - 60_000 &&
    user._creationTime <= consent.acceptedAt + 5 * 60_000;
}
