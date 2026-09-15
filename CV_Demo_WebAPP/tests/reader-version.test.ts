import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPECTED_READER_VERSION, matchesCurrentReader } from '../lib/reader-version';

test('web accepts only the R6 reader packaged in the installed app', () => {
  assert.equal(EXPECTED_READER_VERSION, 'strip-reader-experimental-20260914-r6');
  assert.equal(matchesCurrentReader(JSON.stringify({ algorithm_version: EXPECTED_READER_VERSION })), true);
  for (const algorithm_version of ['strip-reader-experimental-20260914-r5', 'strip-reader-experimental-20260914-r7', '', null]) {
    assert.equal(matchesCurrentReader(JSON.stringify({ algorithm_version })), false);
  }
  for (const output of ['invalid JSON', 'null', '{}']) assert.equal(matchesCurrentReader(output), false);
});
