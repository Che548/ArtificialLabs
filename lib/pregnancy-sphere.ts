/** Sizes are in the Today screen's 402-point design canvas. */
export const PREGNANCY_SPHERE_SIZES = [280, 296, 312, 328] as const;
export const PREGNANCY_SPHERE_MOTION_PADDING = 16;

export function pregnancySphereSize(week: number) {
  const safeWeek = Number.isFinite(week) ? Math.max(1, week) : 1;
  return PREGNANCY_SPHERE_SIZES[Math.min(3, Math.floor((safeWeek - 1) / 10))];
}

export function pregnancySphereStageHeight(headerTop: number) {
  // Reserve the largest sphere plus its full motion envelope at every week:
  // changing weeks must not move the carousel or the cards below it.
  return Math.max(
    423,
    headerTop +
      48 +
      16 +
      PREGNANCY_SPHERE_SIZES[3] +
      PREGNANCY_SPHERE_MOTION_PADDING * 2 +
      12,
  );
}
