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
  if (raw?.schema_version !== '1.0' || !['strip-reader-experimental-20260914', 'strip-reader-experimental-20260914-r2'].includes(raw.algorithm_version) ||
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
  const checked = evidence ? decideLearnedStrip(evidence) : null;
  const count = value.observed_label === 'one_line' ? 1 : value.observed_label === 'two_line' ? 2 : null;
  if (value.reportable !== (count !== null) || value.observed_line_count !== count ||
      (value.reportable && (!value.requires_user_confirmation || checked?.status !== 'count' || checked.observedLineCount !== count))) {
    throw new Error('The local strip reader returned inconsistent count evidence.');
  }
  const primary = evidence?.primary ?? [0, 0];
  const auxiliary = evidence?.auxiliary ?? [0, 0];
  const confidence = value.reportable && evidence
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
      learned_control_probability: finite(primary[0]), learned_test_probability: finite(primary[1]),
      learned_coverage_probability: finite(evidence?.coverage), peak_measurements_available: 0,
    },
    profile: { x: [], raw: [], baseline: [], corrected: [] },
    peaks: { control: peak(primary[0] >= .9), test: peak(count === 2 && value.reportable) },
    signal: {
      metric: 'test_control_peak_area_ratio', value: null, cutoff: null,
      cutoff_source: 'none', positive_when: 'gte', classification: null,
    },
    artifacts: { source_width: raw.width, source_height: raw.height },
    timings_ms: { total: raw.elapsed_ms },
  };
}
