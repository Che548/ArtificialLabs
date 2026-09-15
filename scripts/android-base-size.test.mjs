import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAndroidBaseSize } from './android-base-size.mjs';
const row = (name, bytes) => `-rw-r--r--  2.0 unx 999999 bx ${bytes} defN 26-Sep-15 12:00 ${name}`;
test('counts compressed base entries, excluding metadata', () => {
  assert.deepEqual(checkAndroidBaseSize([row('base/assets/a', 100), row('base/lib/x.so', 200), row('BUNDLE-METADATA/map', 999999999)].join('\n')), { bytes: 300, entries: 2 });
});
test('rejects oversized or missing base before uploading', () => {
  assert.throws(() => checkAndroidBaseSize(row('base/assets/a', 480000001)), /exceeds/);
  assert.throws(() => checkAndroidBaseSize(''), /Missing/);
  assert.throws(() => checkAndroidBaseSize(row('base/assets/a', 'bad')), /Invalid/);
});
