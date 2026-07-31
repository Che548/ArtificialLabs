import type { AnalysisResult } from '../../modules/strip-cv';

export type DetectedInterpretation = 'positive' | 'negative';

/**
 * Converts a quality-approved CV result into the interpretation shown for
 * manual confirmation. When no validated cutoff is configured, StripCV leaves
 * classification empty; in that case the already quality-gated line detector
 * is used (test line present = positive, control line only = negative).
 */
export function deriveDetectedInterpretation(
  result: AnalysisResult | null,
): DetectedInterpretation | null {
  if (result?.status !== 'valid' || !result.peaks.control.detected) {
    return null;
  }

  if (result.signal.classification === 'POS') {
    return 'positive';
  }
  if (result.signal.classification === 'NEG') {
    return 'negative';
  }

  return result.peaks.test.detected ? 'positive' : 'negative';
}
