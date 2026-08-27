export const DIAGNOSTICS_TAP_COUNT = 3;
export const DIAGNOSTICS_TAP_WINDOW_MS = 2_000;

export function registerDiagnosticsTap(
  previousTaps: readonly number[],
  now: number,
) {
  const taps = [
    ...previousTaps.filter(
      (timestamp) => now - timestamp <= DIAGNOSTICS_TAP_WINDOW_MS,
    ),
    now,
  ];
  return {
    shouldOpen: taps.length >= DIAGNOSTICS_TAP_COUNT,
    taps: taps.length >= DIAGNOSTICS_TAP_COUNT ? [] : taps,
  };
}
