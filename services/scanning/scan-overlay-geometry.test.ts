import assert from 'node:assert/strict';
import test from 'node:test';

import type { AnalysisResult } from '../../modules/strip-cv';
import { DEFAULT_ASSAY_PROFILE, DEFAULT_CARD_PROFILE } from './profiles.ts';
import { getScanOverlayGeometry } from './scan-overlay-geometry.ts';

const configuration = {
  assayProfile: DEFAULT_ASSAY_PROFILE,
  cardProfile: DEFAULT_CARD_PROFILE,
  cutoff: null,
  source: 'bundled',
  product: {
    label: 'Test',
    batch: 'Test',
    expiresAt: '—',
  },
} as const;

const result = {
  geometry: {
    corners: [
      [0, 0],
      [1023, 0],
      [1023, 159],
      [0, 159],
    ],
    homography: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    calibration_tile: {
      detected: true,
      corners: [
        [20, 20],
        [80, 20],
        [80, 80],
        [20, 80],
      ],
      homography: [],
    },
  },
  peaks: {
    control: { detected: true, position: 0.1 },
    test: { detected: true, position: 0.2 },
  },
} as AnalysisResult;

test('maps legacy StripCV geometry and detected peaks to the result image', () => {
  const geometry = getScanOverlayGeometry(
    result,
    configuration,
    { width: 1024, height: 160 },
    { width: 1024, height: 160 },
  );

  assert.deepEqual(geometry.strip?.[0], { x: 0, y: 0 });
  assert.deepEqual(geometry.strip?.[2], { x: 1023, y: 159 });
  assert.deepEqual(geometry.calibrationTile?.[0], { x: 20, y: 20 });
  assert.ok(geometry.controlWindow);
  assert.ok(geometry.testWindow);
  assert.ok(geometry.controlPeak);
  assert.ok(geometry.testPeak);
  assert.equal(geometry.controlPeak?.[0].x, 0.439 * 1023);
  assert.equal(geometry.testPeak?.[0].x, 0.498 * 1023);
});

test('compensates for cover cropping when mapping source-image boxes', () => {
  const geometry = getScanOverlayGeometry(
    result,
    configuration,
    { width: 1024, height: 160 },
    { width: 160, height: 160 },
  );

  assert.deepEqual(geometry.strip?.[0], { x: -432, y: 0 });
  assert.deepEqual(geometry.strip?.[1], { x: 591, y: 0 });
});
