import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArchiveIdentity, validateArchiveRuntime } from './ios-archive-policy.mjs';

const info = { CFBundleShortVersionString: '1.2.3', CFBundleVersion: '42', CFBundleIdentifier: 'engineering.brainwaves.sfera' };
const entitlements = { 'com.apple.developer.team-identifier': '6HZGXYF43L', 'application-identifier': '6HZGXYF43L.engineering.brainwaves.sfera', 'get-task-allow': false };
const updates = { EXUpdatesEnabled: true, EXUpdatesRuntimeVersion: '1234567890abcdef' };
test('archive version and native build must both match the tag reservation', () => {
  assert.doesNotThrow(() => validateArchiveIdentity(info, '1.2.3', '42'));
  for (const [version, build] of [['1.2.4', '42'], ['1.2.3', '43'], ['', '42'], ['1.2.3', '']]) {
    assert.throws(() => validateArchiveIdentity(info, version, build));
  }
  assert.throws(() => validateArchiveIdentity({ ...info, CFBundleIdentifier: 'com.anonymous.privateexpo' }, '1.2.3', '42'));
});
test('wrong signing identity and development entitlements are rejected', () => {
  assert.equal(validateArchiveRuntime(entitlements, updates), updates.EXUpdatesRuntimeVersion);
  for (const change of [{ 'com.apple.developer.team-identifier': 'OTHER' }, { 'application-identifier': 'OTHER.app' }, { 'get-task-allow': true }]) {
    assert.throws(() => validateArchiveRuntime({ ...entitlements, ...change }, updates));
  }
});
test('runtime remains a fingerprint and anti-bricking must remain enabled', () => {
  for (const runtime of ['1.2.3', undefined, '1234567890abcdef\n']) {
    assert.throws(() => validateArchiveRuntime(entitlements, { ...updates, EXUpdatesRuntimeVersion: runtime }));
  }
  for (const change of [{ EXUpdatesEnabled: false }, { EXUpdatesEnabled: 'true' }, { EXUpdatesDisableAntiBrickingMeasures: true }]) {
    assert.throws(() => validateArchiveRuntime(entitlements, { ...updates, ...change }));
  }
});
test('SDK 54 file sentinel requires the actual signed fingerprint resource', () => {
  const fromFile = { ...updates, EXUpdatesRuntimeVersion: 'file:fingerprint' };
  const hash = 'a'.repeat(40);
  assert.equal(validateArchiveRuntime(entitlements, fromFile, hash), hash);
  for (const invalid of [undefined, '', 'file:fingerprint', '1.0.1', hash + '\n']) {
    assert.throws(() => validateArchiveRuntime(entitlements, fromFile, invalid));
  }
  assert.throws(() => validateArchiveRuntime(entitlements, { ...fromFile, EXUpdatesEnabled: false }, hash));
});
