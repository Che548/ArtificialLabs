import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_ASSAY_PROFILE,
  DEFAULT_CARD_PROFILE,
} from '../services/scanning/profiles.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli =
  process.env.STRIPCV_CLI ??
  path.join(root, 'web-build', 'stripcv-native', 'stripcv_cli');

function runCli(request) {
  return spawnSync(cli, [], {
    cwd: root,
    input: JSON.stringify(request),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

const width = 1024;
const height = 160;
const rowStride = width * 3;
const result = runCli({
  width,
  height,
  row_stride: rowStride,
  rgb_base64: Buffer.alloc(rowStride * height, 220).toString('base64'),
  assay_profile: DEFAULT_ASSAY_PROFILE,
  card_profile: DEFAULT_CARD_PROFILE,
  options: {
    cutoff: null,
    corner_override: null,
    flip_orientation: false,
  },
});
assert.equal(result.status, 0, result.stderr);
const analysis = JSON.parse(result.stdout);
assert.equal(analysis.schema_version, '1.0');
assert.equal(analysis.algorithm_version, '0.4.1');
assert.equal(analysis.status, 'invalid');

const oversized = runCli({
  width: 1_000_000_000,
  height: 1,
  row_stride: 1,
  rgb_base64: 'AA==',
});
assert.notEqual(oversized.status, 0);
assert.match(oversized.stderr, /Declared image dimensions are too large/);

const malformedBase64 = runCli({
  width: 1,
  height: 1,
  row_stride: 3,
  rgb_base64: 'A=A=A=A=',
});
assert.notEqual(malformedBase64.status, 0);
assert.match(malformedBase64.stderr, /Invalid RGB base64 payload/);

const whitespaceBase64 = runCli({
  width: 1,
  height: 1,
  row_stride: 3,
  rgb_base64: 'AA A=',
});
assert.notEqual(whitespaceBase64.status, 0);
assert.match(whitespaceBase64.stderr, /Invalid RGB base64 payload/);

const boundaryRequest = {
  width: 1,
  height: 1,
  row_stride: 3,
  rgb_base64: 'AAAA',
  assay_profile: DEFAULT_ASSAY_PROFILE,
  card_profile: null,
  options: {},
};

const oversizedProfile = runCli({
  ...boundaryRequest,
  assay_profile: { ...DEFAULT_ASSAY_PROFILE, canonical_width: 8193 },
});
assert.notEqual(oversizedProfile.status, 0);
assert.match(oversizedProfile.stderr, /Invalid assay profile/);

const invalidCutoff = runCli({
  ...boundaryRequest,
  options: { cutoff: 1001 },
});
assert.notEqual(invalidCutoff.status, 0);
assert.match(invalidCutoff.stderr, /cutoff/);

const degenerateCorners = runCli({
  ...boundaryRequest,
  options: {
    corner_override: [
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ],
  },
});
assert.notEqual(degenerateCorners.status, 0);
assert.match(degenerateCorners.stderr, /convex quad/);

const excessivePatches = runCli({
  ...boundaryRequest,
  card_profile: {
    ...DEFAULT_CARD_PROFILE,
    patches: Array.from({ length: 257 }, (_, index) => ({
      ...DEFAULT_CARD_PROFILE.patches[0],
      id: `patch-${index}`,
    })),
  },
});
assert.notEqual(excessivePatches.status, 0);
assert.match(excessivePatches.stderr, /Invalid or incomplete card profile/);

console.log('StripCV CLI smoke test passed.');
