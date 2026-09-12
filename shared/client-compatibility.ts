/** Feature protocols, independent of native build numbers and OTA fingerprints. */
export const clientProtocols = { profileSync: 1, healthSync: 1, emailVerification: 1 } as const;
export type ClientFeature = keyof typeof clientProtocols;
export type ClientUpdateRequired = {
  code: 'CLIENT_UPDATE_REQUIRED';
  feature: ClientFeature;
  requiredProtocol: number;
};

export function updateRequired(feature: ClientFeature, requiredProtocol: number): ClientUpdateRequired {
  return { code: 'CLIENT_UPDATE_REQUIRED', feature, requiredProtocol };
}

/** Only return allowlisted metadata, never arbitrary server payloads. */
export function readUpdateRequired(error: unknown, depth = 0): ClientUpdateRequired | undefined {
  if (depth > 4 || error == null) return;
  if (typeof error === 'object') {
    const value = error as Record<string, unknown>;
    if (value.code === 'CLIENT_UPDATE_REQUIRED' && typeof value.feature === 'string' &&
      Object.hasOwn(clientProtocols, value.feature) && Number.isSafeInteger(value.requiredProtocol) &&
      (value.requiredProtocol as number) > 0) {
      return updateRequired(value.feature as ClientFeature, value.requiredProtocol as number);
    }
    return readUpdateRequired(value.data, depth + 1) ?? readUpdateRequired(value.cause, depth + 1) ?? readUpdateRequired(value.message, depth + 1);
  }
  if (typeof error !== 'string') return;
  try {
    const parsed: unknown = JSON.parse(error);
    if (parsed !== error) {
      const result = readUpdateRequired(parsed, depth + 1);
      if (result) return result;
    }
  } catch { /* Existing auth errors are strings, not structured JSON. */ }
  if (/\bCONTACT_CLIENT_UPDATE_REQUIRED\b/.test(error)) return updateRequired('emailVerification', 1);
}
