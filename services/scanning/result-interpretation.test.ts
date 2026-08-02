import assert from 'node:assert/strict';
import test from 'node:test';

import type { AnalysisResult } from '../../modules/strip-cv/src/StripCv.types.ts';
import { deriveDetectedInterpretation } from './result-interpretation.ts';

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
});
