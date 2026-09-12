import { ConvexError } from 'convex/values';
import { updateRequired, type ClientFeature } from '../../shared/client-compatibility';

/** Call after auth/ownership checks. A protocol declaration is not authorization. */
export function requireClientProtocol(feature: ClientFeature, received: number | undefined, required: number) {
  if (!Number.isSafeInteger(required) || required < 1) throw new Error('INVALID_PROTOCOL_POLICY');
  if (!Number.isSafeInteger(received) || (received ?? 0) < required) {
    throw new ConvexError(updateRequired(feature, required));
  }
}

/** Separate rollout switch; never enabled automatically by deploying functions. */
export function requireSyncProtocol(feature: 'profileSync' | 'healthSync', received?: number) {
  if (process.env.SYNC_PROTOCOL_REQUIRED === '1') requireClientProtocol(feature, received, 1);
}
