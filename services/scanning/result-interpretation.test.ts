import assert from 'node:assert/strict';
import test from 'node:test';

import type { AnalysisResult } from '../../modules/strip-cv/src/StripCv.types.ts';
import {
  deriveDetectedInterpretation,
  getAnalysisDecision,
  getAnalysisConfidence,
  isHighConfidenceAnalysis,
} from './result-interpretation.ts';

function result(
  status: AnalysisResult['status'],
  controlDetected: boolean,
  testDetected: boolean,
  classification: AnalysisResult['signal']['classification'] = null,
): AnalysisResult {
  return {
    status,
    peaks: {
      control: { detected: controlDetected },
      test: { detected: testDetected },
    },
    signal: { classification },
  } as AnalysisResult;
}

test('derives positive and negative from quality-approved detected lines', () => {
  assert.equal(
    deriveDetectedInterpretation(result('valid', true, true)),
    'positive',
  );
  assert.equal(
    deriveDetectedInterpretation(result('valid', true, false)),
    'negative',
  );
});

test('honors an explicit trusted StripCV classification', () => {
  assert.equal(
    deriveDetectedInterpretation(result('valid', true, false, 'POS')),
    'positive',
  );
  assert.equal(
    deriveDetectedInterpretation(result('valid', true, true, 'NEG')),
    'negative',
  );
});

test('never interprets review, invalid, or missing-control results', () => {
  assert.equal(
    deriveDetectedInterpretation(result('review', true, true)),
    null,
  );
  assert.equal(
    deriveDetectedInterpretation(result('invalid', true, true)),
    null,
  );
  assert.equal(
    deriveDetectedInterpretation(result('valid', false, true)),
    null,
  );
  assert.equal(isHighConfidenceAnalysis(result('valid', false, true)), false);
});

test('uses locator confidence when no line-pair confidence is available', () => {
  const scan = {
    ...result('valid', true, false),
    quality: {
      locator_confidence: 0.82,
      peak_pair_confidence: 0,
    },
  } as AnalysisResult;

  assert.equal(getAnalysisConfidence(scan), 0.82);
  assert.equal(isHighConfidenceAnalysis(scan), true);
});

test('does not report a low-confidence or review result', () => {
  const lowConfidence = {
    ...result('valid', true, true),
    quality: {
      locator_confidence: 0.9,
      peak_pair_confidence: 0.61,
    },
  } as AnalysisResult;
  const review = {
    ...result('review', true, true),
    quality: {
      locator_confidence: 0.9,
      peak_pair_confidence: 0.9,
    },
  } as AnalysisResult;

  assert.equal(isHighConfidenceAnalysis(lowConfidence), false);
  assert.equal(isHighConfidenceAnalysis(review), false);
});

test('centralizes reportable, review, and retake decisions', () => {
  const reportable = {
    ...result('valid', true, true),
    quality: { peak_pair_confidence: 0.9, locator_confidence: 0.9 },
  } as AnalysisResult;
  const review = {
    ...result('valid', true, true),
    quality: { peak_pair_confidence: 0.61, locator_confidence: 0.9 },
  } as AnalysisResult;

  assert.equal(getAnalysisDecision(reportable), 'reportable');
  assert.equal(getAnalysisDecision(review), 'review');
  assert.equal(getAnalysisDecision(result('review', true, true)), 'review');
  assert.equal(getAnalysisDecision(result('invalid', true, true)), 'retake');
  assert.equal(getAnalysisDecision(result('valid', false, true)), 'retake');
  assert.equal(getAnalysisDecision(null), 'retake');
  assert.equal(getAnalysisDecision(reportable, 'analysis failed'), 'retake');
});
