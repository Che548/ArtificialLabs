import type { LabResult } from './health-types';

/** A checked transcription is usable evidence without classifying it as normal. */
export function isReviewedLabResult(result: LabResult, now = Date.now()) {
  if (result.deletedAt) return false;
  return result.status !== 'unreviewed' || (
    typeof result.confirmedAt === 'number' &&
    Number.isFinite(result.confirmedAt) &&
    result.confirmedAt > 0 && result.confirmedAt <= now &&
    result.analytes.length > 0 &&
    result.analytes.every(row => row.name.trim() && row.value.trim())
  );
}
