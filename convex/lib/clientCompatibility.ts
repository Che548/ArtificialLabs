import { ConvexError } from 'convex/values';
import { updateRequired, type ClientFeature } from '../../shared/client-compatibility';

/** Capability negotiation only; never use it to bypass ownership or consent. */
export function supportsRevisionSync(received?: number) {
  return Number.isSafeInteger(received) && (received ?? 0) >= 1;
}

// TODO(remove-legacy-sync-compat): temporary bridge for ALL pre-protocol clients.
// SYNC_LEGACY_COMPAT_ENABLED is server-only: absent/1 keeps protocol 0 working;
// 0 rejects protocol 0 before writes. Disable only after verified updates reach
// every supported client. Then remove all remove-legacy-sync-compat markers/branches.
export function legacySyncCompatibilityEnabled() {
  return process.env.SYNC_LEGACY_COMPAT_ENABLED !== '0';
}

/** Call after auth/ownership checks. A protocol declaration is not authorization. */
export function requireClientProtocol(feature: ClientFeature, received: number | undefined, required: number) {
  if (!Number.isSafeInteger(required) || required < 1) throw new Error('INVALID_PROTOCOL_POLICY');
  if (!Number.isSafeInteger(received) || (received ?? 0) < required) {
    throw new ConvexError(updateRequired(feature, required));
  }
}

/** Separate rollout switch; never enabled automatically by deploying functions. */
export function requireSyncProtocol(feature: 'profileSync' | 'healthSync', received?: number) {
  if (!legacySyncCompatibilityEnabled() || process.env.SYNC_PROTOCOL_REQUIRED === '1') {
    requireClientProtocol(feature, received, 1);
  }
}
