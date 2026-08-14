import type { AnalysisResult } from '../../modules/strip-cv';

export type DetectedInterpretation = 'positive' | 'negative';
export type AnalysisDecision = 'reportable' | 'review' | 'retake';

// The native pipeline uses the same locator threshold when it promotes a
// capture from review to valid. Keep the UI confirmation gate aligned with
// that contract instead of accepting a merely detected line.
export const REPORTABLE_CONFIDENCE_THRESHOLD = 0.65;

export function getAnalysisConfidence(result: AnalysisResult | null): number {
  const pairConfidence = result?.quality?.peak_pair_confidence ?? 0;
  const locatorConfidence = result?.quality?.locator_confidence ?? 0;
  const candidate = pairConfidence > 0 ? pairConfidence : locatorConfidence;
  const confidence = Number.isFinite(candidate) ? candidate : 0;

  return Math.max(0, Math.min(1, confidence));
}

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

export function isHighConfidenceAnalysis(
  result: AnalysisResult | null,
): boolean {
  return (
    result?.status === 'valid' &&
    deriveDetectedInterpretation(result) !== null &&
    getAnalysisConfidence(result) >= REPORTABLE_CONFIDENCE_THRESHOLD
  );
}

/**
 * Applies the single UI safety gate shared by the live camera and result
 * screens. Review results stay distinguishable from hard retakes, but neither
 * state is reportable.
 */
export function getAnalysisDecision(
  result: AnalysisResult | null,
  error: string | null = null,
): AnalysisDecision {
  if (
    error ||
    !result ||
    result.status === 'invalid' ||
    !result.peaks.control.detected
  ) {
    return 'retake';
  }
  if (result.status !== 'valid' || !isHighConfidenceAnalysis(result)) {
    return 'review';
  }
  return 'reportable';
}
