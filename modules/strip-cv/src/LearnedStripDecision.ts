export type IndependentWindowEvidence = {
  boundedWindow: boolean;
  paperWidthPx: number;
  axisResidualPx: number;
  orientationContrast: number;
  whiteFraction: number;
  boundaryFractions: readonly number[];
  bandScores: readonly [number, number];
  extraBandScore: number;
};

/** Count policy for strip-reader-experimental-20260914-r6.
 * Inputs combine model probabilities and measured band support, never physical-strip labels.
 */
export type BandTopologyEvidence = {
  profiles: readonly { peak: number; left: number; right: number; snr: number;
    controlInside: boolean; testInside: boolean }[];
  focusedPresence: readonly (readonly [number, number])[];
  focusedCoverage?: readonly number[];
};

export type LearnedStripEvidence = {
  detectorFound: boolean;
  resultLength: number;
  coverage: number;
  primary: readonly [number, number];
  auxiliary: readonly [number, number];
  spatialTest: number;
  spatialPeaksCoincide?: boolean;
  bandTopology?: BandTopologyEvidence;
  independentWindow?: IndependentWindowEvidence;
  localBands?: { bandScores: readonly [number, number]; extraBandScore: number };
  uncertainAuxiliary?: boolean;
};

export type LearnedStripDecision = {
  status: 'count' | 'review' | 'invalid';
  observedLineCount: 1 | 2 | null;
  reason: string;
  requiresUserConfirmation: boolean;
  algorithmVersion: 'strip-reader-experimental-20260914-r6';
};

// The point model sometimes assigns C and T to the same heatmap cell.
// Treat that duplicate as one band only when both window readers strongly agree.
export function hasCoincidentSingleLineEvidence(e: LearnedStripEvidence): boolean {
  return e.spatialPeaksCoincide === true &&
    e.primary[0] >= 0.99 && e.auxiliary[0] >= 0.99 &&
    e.primary[1] <= 0.02 && e.auxiliary[1] <= 0.02;
}

// Resolve a reader conflict only when both point heads refer to the same measured
// dye band, and two crops with less surrounding background confirm control only.
export function hasBandTopologySingleLineEvidence(e: LearnedStripEvidence): boolean {
  const band = e.bandTopology;
  const covered = e.coverage >= 0.9 || (Array.isArray(band?.focusedCoverage) &&
    band.focusedCoverage.length === 2 && band.focusedCoverage.every(q => Number.isFinite(q) && q >= 0.9 && q <= 1));
  if (!e.detectorFound || !Number.isFinite(e.resultLength) || e.resultLength < 16 ||
      !covered || e.coverage < 0 || e.coverage > 1 || !Number.isFinite(e.coverage) ||
      e.primary[0] < 0.9 || e.primary[0] > 1 || !Number.isFinite(e.primary[0]) ||
      !band || !Array.isArray(band.profiles) || band.profiles.length !== 2 ||
      !Array.isArray(band.focusedPresence) || band.focusedPresence.length !== 2) return false;
  return band.profiles.every(p => p && p.controlInside === true && p.testInside === true &&
    [p.peak, p.left, p.right, p.snr].every(Number.isFinite) && p.snr >= 8 &&
    p.left >= 24 && p.right <= 358 && p.peak >= p.left && p.peak <= p.right &&
    p.right - p.left + 1 >= 3 && p.right - p.left + 1 <= 40) &&
    Math.abs(band.profiles[0].peak - band.profiles[1].peak) <= 8 &&
    band.focusedPresence.every(p => Array.isArray(p) && p.length === 2 &&
      p.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && p[0] >= 0.9 && p[1] <= 0.1);
}

// A failed original crop may be replaced by independently bounded paper geometry.
// The shared local reader supplies spatial evidence inside that complete window.
export function independentWindowCount(e: LearnedStripEvidence): 1 | 2 | null {
  const w = e.independentWindow;
  if (!e.detectorFound || !Number.isFinite(e.coverage) || e.coverage < 0 || e.coverage >= 0.85 ||
      !w || w.boundedWindow !== true || !Array.isArray(w.bandScores) || w.bandScores.length !== 2 ||
      !Array.isArray(w.boundaryFractions) || w.boundaryFractions.length !== 2 ||
      ![w.paperWidthPx, w.axisResidualPx, w.orientationContrast, w.whiteFraction,
        ...w.boundaryFractions, ...w.bandScores, w.extraBandScore].every(Number.isFinite) ||
      w.paperWidthPx < 8 || w.axisResidualPx < 0 || w.axisResidualPx > 0.12 * w.paperWidthPx ||
      w.orientationContrast < 0.15 || w.whiteFraction < 0.15 || w.whiteFraction > 1 ||
      w.boundaryFractions.some(x => x < 0.04 || x > 1) ||
      [...w.bandScores, w.extraBandScore].some(x => x < 0 || x > 1) ||
      w.bandScores[0] < 0.9 || w.extraBandScore >= 0.9) return null;
  return w.bandScores[1] >= 0.9 ? 2 : w.bandScores[1] <= 0.1 ? 1 : null;
}

export function hasLocalSingleLineEvidence(e: LearnedStripEvidence): boolean {
  const local = e.localBands;
  return !!local && Array.isArray(local.bandScores) && local.bandScores.length === 2 &&
    [...local.bandScores, local.extraBandScore].every(x => Number.isFinite(x) && x >= 0 && x <= 1) &&
    local.bandScores[0] >= 0.9 && local.bandScores[1] <= 0.1 && local.extraBandScore < 0.9;
}

export function hasStrongLocalAbsenceAgainstUncertainAuxiliary(e: LearnedStripEvidence): boolean {
  return e.uncertainAuxiliary === true && hasLocalSingleLineEvidence(e) &&
    e.primary[0] >= 0.99 && e.primary[1] <= 0.02 && e.auxiliary[0] >= 0.9 &&
    e.auxiliary[1] > 0.1 && e.auxiliary[1] < 0.9 &&
    e.localBands!.bandScores[0] >= 0.99 && e.localBands!.bandScores[1] <= 0.02;
}

function decideConsensus(e: LearnedStripEvidence): LearnedStripDecision {
  const result = (status: LearnedStripDecision['status'], reason: string, count: 1 | 2 | null = null): LearnedStripDecision => ({
    status, reason, observedLineCount: count, requiresUserConfirmation: count !== null,
    algorithmVersion: 'strip-reader-experimental-20260914-r6',
  });
  if (!e.detectorFound) return result('invalid', 'detector_no_proposal');
  const probabilities = [e.coverage, ...e.primary, ...e.auxiliary, e.spatialTest];
  if (!Number.isFinite(e.resultLength) || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)) {
    return result('review', 'invalid_model_evidence');
  }
  if (e.resultLength < 16) return result('invalid', 'result_region_degenerate');
  if (e.coverage < 0.85) return result('review', 'window_coverage_uncertain');
  const [control, test] = e.primary;
  if (control <= 0.1) return result('invalid', 'control_absent');
  if (control < 0.9) return result('review', 'control_uncertain');
  if (test > 0.1 && test < 0.9) return result('review', 'test_uncertain');
  const count = test >= 0.9 ? 2 : 1;
  const [auxControl, auxTest] = e.auxiliary;
  if (auxControl < 0.9 || (count === 2 ? auxTest < 0.9 : auxTest > 0.1)) {
    return result('review', 'readers_do_not_confidently_agree');
  }
  if (count === 1 && e.spatialTest > 0.1) {
    if (!hasCoincidentSingleLineEvidence(e)) return result('review', 'spatial_test_absence_not_confirmed');
    return result('count', 'window_readers_agree_on_coincident_peak', 1);
  }
  return result('count', count === 1 ? 'window_readers_and_spatial_absence_agree' : 'readers_agree', count);
}

export function decideLearnedStrip(e: LearnedStripEvidence): LearnedStripDecision {
  const base = decideConsensus(e);
  if (base.status === 'review' && base.reason !== 'invalid_model_evidence' &&
      hasBandTopologySingleLineEvidence(e)) {
    return { ...base, status: 'count', observedLineCount: 1,
      requiresUserConfirmation: true, reason: 'band_topology_confirms_single_line' };
  }
  if (base.reason === 'spatial_test_absence_not_confirmed' && hasLocalSingleLineEvidence(e)) {
    return { ...base, status: 'count', observedLineCount: 1,
      requiresUserConfirmation: true, reason: 'local_bands_confirm_single_line' };
  }
  if (base.reason === 'readers_do_not_confidently_agree' &&
      hasStrongLocalAbsenceAgainstUncertainAuxiliary(e)) {
    return { ...base, status: 'count', observedLineCount: 1,
      requiresUserConfirmation: true, reason: 'local_bands_resolve_auxiliary_uncertainty' };
  }
  if (base.status !== 'count' && base.reason !== 'invalid_model_evidence') {
    const count = independentWindowCount(e);
    if (count !== null) return { ...base, status: 'count', observedLineCount: count,
      requiresUserConfirmation: true, reason: 'independent_window_local_bands' };
  }
  return base;
}
