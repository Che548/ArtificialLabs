// Explicit portable fields only. No account, consent, or server metadata.
export const profileFields = ['displayName', 'goal', 'onboardingCompleted', 'phone', 'birthDate', 'heightCm', 'weightKg', 'postpartum', 'postContraception', 'pregnancyStartAt', 'lastPeriodStartAt', 'cycleLengthDays', 'timezoneOffsetMinutes'] as const;

export function mergeProfileFields(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
  base?: Record<string, unknown>,
) {
  const patch: Record<string, unknown> = {};
  for (const key of profileFields) {
    const next = incoming[key];
    if (base && Object.is(next, base[key])) continue;
    if (Object.is(next, current[key])) continue;
    if (!base || !Object.is(current[key], base[key])) {
      throw new Error('PROFILE_SYNC_CONFLICT');
    }
    patch[key] = next;
  }
  return patch;
}

export function sameProfileFields(a: Record<string, unknown>, b: Record<string, unknown>) {
  return profileFields.every(key => Object.is(a[key], b[key]));
}

export function portableProfile(value: Record<string, unknown>) {
  return Object.fromEntries([...profileFields, 'updatedAt'].map(key => [key, value[key]]));
}
