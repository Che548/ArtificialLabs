/** Frozen count policy for strip-reader-experimental-20260914.
 * Inputs are model probabilities after sigmoid, never physical-strip labels.
 * Native inference is not connected yet; this is the shared result contract.
 */
export type LearnedStripEvidence = {
  detectorFound: boolean;
  resultLength: number;
  coverage: number;
  primary: readonly [number, number];
  auxiliary: readonly [number, number];
  spatialTest: number;
};

export type LearnedStripDecision = {
  status: 'count' | 'review' | 'invalid';
  observedLineCount: 1 | 2 | null;
  reason: string;
  requiresUserConfirmation: boolean;
  algorithmVersion: 'strip-reader-experimental-20260914';
};

export function decideLearnedStrip(e: LearnedStripEvidence): LearnedStripDecision {
  const result = (status: LearnedStripDecision['status'], reason: string, count: 1 | 2 | null = null): LearnedStripDecision => ({
    status, reason, observedLineCount: count, requiresUserConfirmation: count !== null,
    algorithmVersion: 'strip-reader-experimental-20260914',
  });
  if (!e.detectorFound) return result('invalid', 'detector_no_proposal');
  const probabilities = [e.coverage, ...e.primary, ...e.auxiliary, e.spatialTest];
  if (!Number.isFinite(e.resultLength) || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)) {
    return result('review', 'invalid_model_evidence');
  }
  if (e.resultLength < 16) return result('invalid', 'result_region_degenerate');
  if (e.coverage < 0.9) return result('review', 'window_coverage_uncertain');
  const [control, test] = e.primary;
  if (control <= 0.1) return result('invalid', 'control_absent');
  if (control < 0.9) return result('review', 'control_uncertain');
  if (test > 0.1 && test < 0.9) return result('review', 'test_uncertain');
  const count = test >= 0.9 ? 2 : 1;
  const [auxControl, auxTest] = e.auxiliary;
  if (auxControl < 0.9 || (count === 2 ? auxTest < 0.9 : auxTest > 0.1)) {
    return result('review', 'readers_do_not_confidently_agree');
  }
  if (count === 1 && e.spatialTest > 0.1) return result('review', 'spatial_test_absence_not_confirmed');
  return result('count', count === 1 ? 'window_readers_and_spatial_absence_agree' : 'readers_agree', count);
}
