import assert from 'node:assert/strict';
import test from 'node:test';
import { decideLearnedStrip, type LearnedStripEvidence } from './LearnedStripDecision';
import { adaptLearnedStripResult } from './LearnedStripResult';
import { DEFAULT_ASSAY_PROFILE } from '../../../services/scanning/profiles';
import { deriveDetectedInterpretation, getAnalysisDecision } from '../../../services/scanning/result-interpretation';

const evidence: LearnedStripEvidence = {
  detectorFound: true, resultLength: 56, coverage: 0.894,
  primary: [0.999, 0.001], auxiliary: [0.999, 0.012],
  spatialTest: 0.73, spatialPeaksCoincide: true,
};

test('allows a duplicate C/T point only with strong agreement and adequate coverage', () => {
  assert.equal(decideLearnedStrip(evidence).observedLineCount, 1);
  assert.equal(decideLearnedStrip({ ...evidence, coverage: 0.849 }).status, 'review');
  assert.equal(decideLearnedStrip({ ...evidence, spatialPeaksCoincide: false }).status, 'review');
  assert.equal(decideLearnedStrip({ ...evidence, spatialPeaksCoincide: undefined }).status, 'review');
  assert.equal(decideLearnedStrip({ ...evidence, auxiliary: [0.95, 0.012] }).status, 'review');
  assert.equal(decideLearnedStrip({ ...evidence, auxiliary: [0.999, 0.03] }).status, 'review');
  assert.equal(decideLearnedStrip({ ...evidence, auxiliary: [0.999, 0.99] }).status, 'review');
});

test('preserves missing-control and detector checks', () => {
  assert.equal(decideLearnedStrip({ ...evidence, primary: [0.01, 0.001] }).status, 'invalid');
  assert.equal(decideLearnedStrip({ ...evidence, detectorFound: false }).status, 'invalid');
});

test('adapter retains usable confidence and never promotes an older native review', () => {
  const raw = {
    schema_version: '1.0', algorithm_version: 'strip-reader-experimental-20260914-r2',
    width: 1000, height: 1500, elapsed_ms: 100, evidence,
    detector_proposals: [{ bbox: [300, 200, 400, 1300], confidence: 0.8 }],
    result: { observed_label: 'one_line', observed_line_count: 1, reportable: true,
      requires_user_confirmation: true, reason: 'window_readers_agree_on_coincident_peak' },
  };
  const accepted = adaptLearnedStripResult(JSON.stringify(raw), DEFAULT_ASSAY_PROFILE);
  assert.equal(accepted.status, 'valid');
  assert.equal(accepted.quality.peak_pair_confidence, 0.894);
  assert.equal(accepted.requires_user_confirmation, true);
  const old = { ...raw, algorithm_version: 'strip-reader-experimental-20260914',
    result: { observed_label: 'review', observed_line_count: null, reportable: false,
      requires_user_confirmation: false, reason: 'window_coverage_uncertain' } };
  assert.equal(adaptLearnedStripResult(JSON.stringify(old), DEFAULT_ASSAY_PROFILE).status, 'review');
});

const topology: NonNullable<LearnedStripEvidence['bandTopology']> = {
  profiles: [
    { peak: 156, left: 146, right: 164, snr: 77, controlInside: true, testInside: true },
    { peak: 153, left: 146, right: 163, snr: 53, controlInside: true, testInside: true },
  ],
  focusedPresence: [[0.99999, 0.04734], [0.99989, 0.00361]],
};
const conflicting: LearnedStripEvidence = {
  ...evidence, coverage: 0.9797, primary: [0.99999, 0.2921],
  auxiliary: [0.99987, 0.9158], spatialPeaksCoincide: false, bandTopology: topology,
};

test('resolves both same-band examples using measured band support and focused views', () => {
  assert.equal(decideLearnedStrip(conflicting).observedLineCount, 1);
  const sameCell = { ...conflicting, primary: [1, 0.00095] as const,
    auxiliary: [1, 0.2489] as const, spatialPeaksCoincide: true,
    bandTopology: { profiles: topology.profiles.map(p => ({ ...p, peak: 148, left: 139, right: 155 })),
      focusedPresence: [[1, 0.00042], [0.999999, 0.00007]] as const } };
  assert.equal(decideLearnedStrip(sameCell).observedLineCount, 1);
  assert.equal(decideLearnedStrip({ ...conflicting, bandTopology: undefined }).status, 'review');
});

test('does not merge a separate T location or weak/inconsistent physical evidence', () => {
  for (const profile of [
    { ...topology.profiles[0], testInside: false },
    { ...topology.profiles[0], controlInside: false },
    { ...topology.profiles[0], snr: 7.9 },
    { ...topology.profiles[0], snr: NaN },
    { ...topology.profiles[0], right: 190 },
    { ...topology.profiles[0], peak: 170, right: 176 },
  ]) {
    assert.equal(decideLearnedStrip({ ...conflicting,
      bandTopology: { ...topology, profiles: [profile, topology.profiles[1]] } }).status, 'review');
  }
  assert.equal(decideLearnedStrip({ ...conflicting, coverage: 0.89 }).status, 'review');
  assert.equal(decideLearnedStrip({ ...conflicting, primary: [0.05, 0.01] }).status, 'invalid');
  assert.equal(decideLearnedStrip({ ...conflicting, primary: [0.8, 0.01] }).status, 'review');
  assert.equal(decideLearnedStrip({ ...conflicting, resultLength: 15 }).status, 'invalid');
  assert.equal(decideLearnedStrip({ ...conflicting, bandTopology: {
    ...topology, focusedPresence: [[0.999, 0.03], [0.999, 0.2]],
  } }).status, 'review');
});

test('band resolution preserves established two-line counts and validates adapter confidence', () => {
  assert.equal(decideLearnedStrip({ ...conflicting, primary: [0.99, 0.99],
    auxiliary: [0.99, 0.99] }).observedLineCount, 2);
  const raw = {
    schema_version: '1.0', algorithm_version: 'strip-reader-experimental-20260914-r3',
    width: 1075, height: 1280, elapsed_ms: 100, evidence: conflicting,
    detector_proposals: [{ bbox: [300, 200, 500, 1200], confidence: 0.84 }],
    result: { observed_label: 'one_line', observed_line_count: 1, reportable: true,
      requires_user_confirmation: true, reason: 'band_topology_confirms_single_line' },
  };
  const accepted = adaptLearnedStripResult(JSON.stringify(raw), DEFAULT_ASSAY_PROFILE);
  assert.equal(accepted.status, 'valid');
  assert.equal(accepted.quality.peak_pair_confidence, 1 - 0.04734);
  assert.equal(getAnalysisDecision(accepted), 'reportable');
  assert.equal(deriveDetectedInterpretation(accepted), 'negative');
  assert.equal(accepted.signal.value, null);
  assert.throws(() => adaptLearnedStripResult(JSON.stringify({ ...raw,
    evidence: { ...conflicting, bandTopology: { ...topology, profiles: [] } },
  }), DEFAULT_ASSAY_PROFILE));
  assert.throws(() => adaptLearnedStripResult(JSON.stringify({ ...raw,
    algorithm_version: 'strip-reader-experimental-20260914-r2',
  }), DEFAULT_ASSAY_PROFILE));
  const review = { ...raw, result: { ...raw.result, observed_label: 'review',
    observed_line_count: null, reportable: false, requires_user_confirmation: false } };
  assert.equal(adaptLearnedStripResult(JSON.stringify(review), DEFAULT_ASSAY_PROFILE).status, 'review');
});

test('assesses coverage on the same focused windows when background reduces full-window coverage', () => {
  const e: LearnedStripEvidence = { ...conflicting, coverage: 0.8445,
    bandTopology: { ...topology, focusedCoverage: [0.965, 0.971] } };
  assert.equal(decideLearnedStrip(e).observedLineCount, 1);
  for (const focusedCoverage of [undefined, [], [0.965], [0.965, 0.89], [NaN, 0.99]]) {
    assert.equal(decideLearnedStrip({ ...e, bandTopology: { ...topology, focusedCoverage } }).status, 'review');
  }
  assert.equal(decideLearnedStrip({ ...e, primary: [0.05, 0.01] }).observedLineCount, null);
});

const recovered: LearnedStripEvidence = {
  ...evidence, coverage: 0.0001, primary: [0.0001, 0.0001], auxiliary: [0.0001, 0.0001],
  independentWindow: {
    boundedWindow: true, paperWidthPx: 39, axisResidualPx: 0.3,
    orientationContrast: 0.5, whiteFraction: 0.3, boundaryFractions: [0.3, 0.4],
    bandScores: [0.994, 0.0006], extraBandScore: 0.003,
  },
};
test('recovers a failed crop with independently bounded geometry and local band evidence', () => {
  assert.equal(decideLearnedStrip(recovered).observedLineCount, 1);
  for (const change of [
    { boundedWindow: false }, { axisResidualPx: 8 }, { bandScores: [0.1, 0.99] as const },
    { bandScores: [0.99, 0.3] as const }, { extraBandScore: 0.99 },
    { orientationContrast: NaN }, { boundaryFractions: [0, 0.8] },
  ]) {
    assert.notEqual(decideLearnedStrip({ ...recovered,
      independentWindow: { ...recovered.independentWindow!, ...change } }).status, 'count');
  }
  assert.equal(decideLearnedStrip({ ...recovered, coverage: 0.95 }).status, 'invalid');
  assert.equal(decideLearnedStrip({ ...recovered, detectorFound: false }).status, 'invalid');
  assert.equal(decideLearnedStrip({ ...recovered, primary: [NaN, 0] }).status, 'review');
  const two: LearnedStripEvidence = { ...evidence, coverage: 0.99, primary: [0.99, 0.99],
    auxiliary: [0.99, 0.99], independentWindow: recovered.independentWindow };
  assert.equal(decideLearnedStrip(two).observedLineCount, 2);
});
test('R4 adapter uses local evidence and rejects its use by older native versions', () => {
  const raw = {
    schema_version: '1.0', algorithm_version: 'strip-reader-experimental-20260914-r4',
    width: 1920, height: 1080, elapsed_ms: 100, evidence: recovered,
    detector_proposals: [{ bbox: [519, 483, 1585, 552], confidence: 0.8 }],
    result: { observed_label: 'one_line', observed_line_count: 1, reportable: true,
      requires_user_confirmation: true, reason: 'independent_window_local_bands' },
  };
  const a = adaptLearnedStripResult(JSON.stringify(raw), DEFAULT_ASSAY_PROFILE);
  assert.equal(a.status, 'valid');
  assert.equal(getAnalysisDecision(a), 'reportable');
  assert.equal(a.quality.peak_pair_confidence, 0.994);
  assert.equal(a.peaks.control.detected, true);
  for (const algorithm_version of ['strip-reader-experimental-20260914-r2', 'strip-reader-experimental-20260914-r3']) {
    assert.throws(() => adaptLearnedStripResult(JSON.stringify({ ...raw, algorithm_version }), DEFAULT_ASSAY_PROFILE));
  }
});

const localOnly: LearnedStripEvidence = {
  ...evidence, coverage: 0.95, spatialPeaksCoincide: false,
  localBands: { bandScores: [0.999, 0.03], extraBandScore: 0.15 },
};
test('uses local pixel evidence to resolve a coordinate-only veto with unchanged consensus and coverage', () => {
  assert.equal(decideLearnedStrip(localOnly).reason, 'local_bands_confirm_single_line');
  assert.equal(decideLearnedStrip(localOnly).observedLineCount, 1);
  for (const localBands of [
    undefined, { bandScores: [0.8, 0.03] as const, extraBandScore: 0.15 },
    { bandScores: [0.999, 0.11] as const, extraBandScore: 0.15 },
    { bandScores: [0.999, 0.03] as const, extraBandScore: 0.9 },
    { bandScores: [NaN, 0.03] as const, extraBandScore: 0.15 },
  ]) assert.notEqual(decideLearnedStrip({ ...localOnly, localBands }).status, 'count');
  for (const changed of [
    { coverage: 0.84 }, { auxiliary: [0.99, 0.5] as const },
    { primary: [0.05, 0.01] as const }, { detectorFound: false }, { resultLength: 15 },
  ]) assert.notEqual(decideLearnedStrip({ ...localOnly, ...changed }).status, 'count');
  assert.equal(decideLearnedStrip({ ...localOnly, primary: [0.99, 0.99],
    auxiliary: [0.99, 0.99] }).observedLineCount, 2);
});
const localRaw = {
  schema_version: '1.0', algorithm_version: 'strip-reader-experimental-20260914-r5',
  width: 1000, height: 1500, elapsed_ms: 100, evidence: localOnly,
  detector_proposals: [{ bbox: [300, 200, 400, 1300], confidence: 0.8 }],
  result: { observed_label: 'one_line', observed_line_count: 1, reportable: true,
    requires_user_confirmation: true, reason: 'local_bands_confirm_single_line' },
};
test('R5 local evidence remains reportable through the app adapter with calibrated input confidence', () => {
  const a = adaptLearnedStripResult(JSON.stringify(localRaw), DEFAULT_ASSAY_PROFILE);
  assert.equal(a.status, 'valid');
  assert.equal(a.quality.peak_pair_confidence, 0.95);
  assert.equal(a.quality.local_line_evidence_used, 1);
  assert.equal(a.quality.independent_geometry_used, 0);
  assert.equal(getAnalysisDecision(a), 'reportable');
  assert.equal(deriveDetectedInterpretation(a), 'negative');
  assert.equal(a.signal.value, null);
});
test('older native versions cannot claim new local evidence and reviews stay reviews', () => {
  for (const algorithm_version of ['strip-reader-experimental-20260914-r3', 'strip-reader-experimental-20260914-r4']) {
    assert.throws(() => adaptLearnedStripResult(JSON.stringify({ ...localRaw, algorithm_version }), DEFAULT_ASSAY_PROFILE));
  }
  const raw = { ...localRaw, result: { ...localRaw.result, observed_label: 'review',
    observed_line_count: null, reportable: false, requires_user_confirmation: false } };
  assert.equal(adaptLearnedStripResult(JSON.stringify(raw), DEFAULT_ASSAY_PROFILE).status, 'review');
});

const uncertainAux: LearnedStripEvidence = {
  ...localOnly, primary: [0.999, 0.001], auxiliary: [0.999, 0.6],
  localBands: { bandScores: [0.999, 0.002], extraBandScore: 0.15 },
  uncertainAuxiliary: true,
};
test('R6 resolves auxiliary uncertainty only with two strong absence estimates', () => {
  const result = decideLearnedStrip(uncertainAux);
  assert.equal(result.observedLineCount, 1);
  assert.equal(result.reason, 'local_bands_resolve_auxiliary_uncertainty');
  for (const change of [
    { uncertainAuxiliary: undefined }, { coverage: 0.849 },
    { detectorFound: false }, { resultLength: 15 },
    { primary: [0.98, 0.001] as const }, { primary: [0.999, 0.021] as const },
    { auxiliary: [0.899, 0.6] as const }, { auxiliary: [0.999, 0.9] as const },
    { primary: [NaN, 0.001] as const },
    { localBands: undefined },
    { localBands: { bandScores: [0.989, 0.001] as const, extraBandScore: 0.1 } },
    { localBands: { bandScores: [0.999, 0.021] as const, extraBandScore: 0.1 } },
    { localBands: { bandScores: [0.999, 0.001] as const, extraBandScore: 0.9 } },
  ]) assert.notEqual(decideLearnedStrip({ ...uncertainAux, ...change }).status, 'count', JSON.stringify(change));
  assert.equal(decideLearnedStrip({ ...uncertainAux, primary: [0.999, 0.99],
    auxiliary: [0.999, 0.99] }).observedLineCount, 2);
});
const uncertainRaw = {
  ...localRaw, algorithm_version: 'strip-reader-experimental-20260914-r6',
  evidence: uncertainAux,
  result: { ...localRaw.result, reason: 'local_bands_resolve_auxiliary_uncertainty' },
};
test('R6 adapter retains original uncertain probabilities while using corroborated confidence', () => {
  const result = adaptLearnedStripResult(JSON.stringify(uncertainRaw), DEFAULT_ASSAY_PROFILE);
  assert.equal(getAnalysisDecision(result), 'reportable');
  assert.equal(result.observed_line_count, 1);
  assert.equal(result.quality.peak_pair_confidence, 0.95);
  assert.equal(result.quality.learned_auxiliary_test_probability, 0.6);
  assert.equal(result.quality.auxiliary_uncertainty_resolved, 1);
  assert.equal(result.requires_user_confirmation, true);
  assert.equal(result.signal.value, null);
});
test('R6 flag cannot promote older binaries, uncorroborated counts, or native reviews', () => {
  for (const version of ['r4', 'r5']) {
    assert.throws(() => adaptLearnedStripResult(JSON.stringify({ ...uncertainRaw,
      algorithm_version: 'strip-reader-experimental-20260914-' + version }), DEFAULT_ASSAY_PROFILE));
  }
  assert.throws(() => adaptLearnedStripResult(JSON.stringify({ ...uncertainRaw,
    evidence: { ...uncertainAux, auxiliary: [0.999, 0.95] } }), DEFAULT_ASSAY_PROFILE));
  const reviewed = { ...uncertainRaw, result: { ...uncertainRaw.result,
    observed_label: 'review', observed_line_count: null, reportable: false,
    requires_user_confirmation: false } };
  assert.equal(adaptLearnedStripResult(JSON.stringify(reviewed), DEFAULT_ASSAY_PROFILE).status, 'review');
});
