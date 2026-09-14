import assert from 'node:assert/strict';
import test from 'node:test';
import { decideLearnedStrip, type LearnedStripEvidence } from './LearnedStripDecision';
import { adaptLearnedStripResult } from './LearnedStripResult';
import { DEFAULT_ASSAY_PROFILE } from '../../../services/scanning/profiles';

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
