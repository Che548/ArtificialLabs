import { decideLearnedStrip, hasCoincidentSingleLineEvidence, type LearnedStripEvidence } from './LearnedStripDecision';
import type { AnalysisResult, AssayProfile, PeakMetrics } from './StripCv.types';

type NativeReaderResult = {
  schema_version: string;
  algorithm_version: string;
  width: number;
  height: number;
  elapsed_ms: number;
  evidence?: LearnedStripEvidence;
  detector_proposals: { bbox: number[]; confidence: number }[];
  result: {
    observed_label: 'one_line' | 'two_line' | 'review' | 'invalid';
    observed_line_count: 1 | 2 | null;
    reportable: boolean;
    requires_user_confirmation: boolean;
    reason: string;
  };
};

// The count reader does not measure photometric peak area, SNR or a T/C ratio.
// Legacy peak fields stay zero; quality.peak_measurements_available declares this.
const peak = (detected: boolean): PeakMetrics => ({
  detected, position: 0, height: 0, prominence: 0, snr: 0, fwhm: 0, area: 0,
});

export function adaptLearnedStripResult(json: string, assay: AssayProfile): AnalysisResult {
  const raw = JSON.parse(json) as NativeReaderResult;
  const value = raw?.result;
  if (raw?.schema_version !== '1.0' || !['strip-reader-experimental-20260914', 'strip-reader-experimental-20260914-r2', 'strip-reader-experimental-20260914-r3', 'strip-reader-experimental-20260914-r4', 'strip-reader-experimental-20260914-r5', 'strip-reader-experimental-20260914-r6'].includes(raw.algorithm_version) ||
      !value || !['one_line', 'two_line', 'review', 'invalid'].includes(value.observed_label) ||
      typeof value.reason !== 'string' || typeof value.reportable !== 'boolean' ||
      !Number.isFinite(raw.width) || !Number.isFinite(raw.height) || raw.width < 2 || raw.height < 2 ||
      !Number.isFinite(raw.elapsed_ms) || raw.elapsed_ms < 0) {
    throw new Error('The local strip reader returned an unsupported result.');
  }
  const evidence = raw.evidence;
  if (evidence && (!Array.isArray(evidence.primary) || evidence.primary.length !== 2 ||
                  !Array.isArray(evidence.auxiliary) || evidence.auxiliary.length !== 2 ||
                  typeof evidence.detectorFound !== 'boolean' ||
                  (evidence.spatialPeaksCoincide !== undefined && typeof evidence.spatialPeaksCoincide !== 'boolean'))) {
    throw new Error('The local strip reader returned invalid evidence.');
  }
  // Native R3+ supply measured band evidence; R4+ independent geometry; R5 local absence. Older
  // binaries retain their original decisions, including every review result.
  const checked = evidence ? decideLearnedStrip({
    ...evidence,
    bandTopology: /-r[3456]$/.test(raw.algorithm_version) ? evidence.bandTopology : undefined,
    independentWindow: /-r[456]$/.test(raw.algorithm_version) ? evidence.independentWindow : undefined,
    localBands: /-r[56]$/.test(raw.algorithm_version) ? evidence.localBands : undefined,
    uncertainAuxiliary: raw.algorithm_version.endsWith('-r6') ? evidence.uncertainAuxiliary : undefined,
  }) : null;
  const count = value.observed_label === 'one_line' ? 1 : value.observed_label === 'two_line' ? 2 : null;
  if (value.reportable !== (count !== null) || value.observed_line_count !== count ||
      (value.reportable && (!value.requires_user_confirmation || checked?.status !== 'count' || checked.observedLineCount !== count))) {
    throw new Error('The local strip reader returned inconsistent count evidence.');
  }
  const primary = evidence?.primary ?? [0, 0];
  const auxiliary = evidence?.auxiliary ?? [0, 0];
  const resolvedWindow = checked?.reason === 'independent_window_local_bands';
  const resolvedUncertainty = checked?.reason === 'local_bands_resolve_auxiliary_uncertainty';
  const resolvedLocal = checked?.reason === 'local_bands_confirm_single_line' || resolvedUncertainty;
  const localScores = resolvedWindow ? evidence!.independentWindow!.bandScores :
    resolvedLocal ? evidence!.localBands!.bandScores : null;
  const resolvedBand = checked?.reason === 'band_topology_confirms_single_line';
  const confidence = value.reportable && resolvedLocal && localScores && evidence
    ? Math.min(localScores[0], 1 - localScores[1], primary[0], auxiliary[0],
      1 - primary[1], resolvedUncertainty ? 1 : 1 - auxiliary[1], evidence.coverage)
    : value.reportable && localScores
    ? Math.min(localScores[0], count === 2 ? localScores[1] : 1 - localScores[1])
    : value.reportable && evidence && resolvedBand
    ? Math.min(evidence.coverage >= 0.9 ? evidence.coverage : Math.min(...evidence.bandTopology!.focusedCoverage!), primary[0],
      ...evidence.bandTopology!.focusedPresence.flatMap(p => [p[0], 1 - p[1]]))
    : value.reportable && evidence
    ? Math.min(primary[0], auxiliary[0], evidence.coverage,
      count === 2 ? primary[1] : 1 - primary[1],
      count === 2 ? auxiliary[1] : 1 - auxiliary[1],
      count === 1 && !hasCoincidentSingleLineEvidence(evidence) ? 1 - evidence.spatialTest : 1)
    : 0;
  const finite = (n: number | undefined) => Number.isFinite(n) ? n! : 0;
  return {
    schema_version: '1.0', algorithm_version: raw.algorithm_version,
    assay_profile: { id: assay.id, version: assay.version },
    status: value.reportable ? 'valid' : value.observed_label === 'invalid' ? 'invalid' : 'review',
    observed_line_count: count, requires_user_confirmation: value.reportable,
    reason_codes: [value.reason, 'learned_count_only'], calibration_mode: 'none',
    geometry: {
      mode: 'learned_detector_box', corners: [], homography: [], manually_corrected: false,
      calibration_tile: { detected: false, corners: [], homography: [] },
    },
    quality: {
      peak_pair_confidence: confidence,
      locator_confidence: finite(raw.detector_proposals?.[0]?.confidence),
      learned_control_probability: finite(localScores?.[0] ?? primary[0]), learned_test_probability: finite(localScores?.[1] ?? primary[1]),
      independent_geometry_used: resolvedWindow ? 1 : 0,
      local_line_evidence_used: resolvedLocal ? 1 : 0,
      auxiliary_uncertainty_resolved: resolvedUncertainty ? 1 : 0,
      learned_auxiliary_control_probability: finite(auxiliary[0]),
      learned_auxiliary_test_probability: finite(auxiliary[1]),
      learned_coverage_probability: finite(evidence?.coverage), peak_measurements_available: 0,
    },
    profile: { x: [], raw: [], baseline: [], corrected: [] },
    peaks: { control: peak((localScores?.[0] ?? primary[0]) >= .9), test: peak(count === 2 && value.reportable) },
    signal: {
      metric: 'test_control_peak_area_ratio', value: null, cutoff: null,
      cutoff_source: 'none', positive_when: 'gte', classification: null,
    },
    artifacts: { source_width: raw.width, source_height: raw.height },
    timings_ms: { total: raw.elapsed_ms },
  };
}
