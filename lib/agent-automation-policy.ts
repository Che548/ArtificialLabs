export const AGENT_STABLE_CONNECTION_MS = 30_000;
export const AGENT_BACKGROUND_MINIMUM_INTERVAL_MINUTES = 15;
export const AGENT_RETRY_DELAYS_MS = [
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
] as const;

export function mayScheduleAgentCatchUp({
  enabled,
  inFlight,
  isKnown,
  isOffline,
}: {
  enabled: boolean;
  inFlight: boolean;
  isKnown: boolean;
  isOffline: boolean;
}) {
  return enabled && isKnown && !isOffline && !inFlight;
}
