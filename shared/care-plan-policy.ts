/** Shared by provider schemas, local planning and server validation. */
export const CARE_PLAN_LIMITS = Object.freeze({ current: 3, upcoming: 5 });

export function withinCarePlanLimits(current: number, upcoming: number) {
  return (
    Number.isInteger(current) &&
    Number.isInteger(upcoming) &&
    current >= 0 &&
    upcoming >= 0 &&
    current <= CARE_PLAN_LIMITS.current &&
    upcoming <= CARE_PLAN_LIMITS.upcoming
  );
}

/** Old accepted plans are not truncated when policy limits decrease. */
export function withinCarePlanGrowthLimits(
  current: number,
  upcoming: number,
  previous: { current: number; upcoming: number },
) {
  return (
    Number.isInteger(current) &&
    Number.isInteger(upcoming) &&
    current >= 0 &&
    upcoming >= 0 &&
    current <= Math.max(previous.current, CARE_PLAN_LIMITS.current) &&
    upcoming <= Math.max(previous.upcoming, CARE_PLAN_LIMITS.upcoming)
  );
}
