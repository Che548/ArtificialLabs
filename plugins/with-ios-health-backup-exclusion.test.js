const assert = require('node:assert/strict');
const { test } = require('node:test');
const { excludeHealthBackup } = require('./with-ios-health-backup-exclusion');

test('protects Documents before React starts and is idempotent', () => {
  const source = 'func start() {\n    let delegate = ReactNativeDelegate()\n}';
  const patched = excludeHealthBackup(source);
  assert.ok(patched.includes('values.isExcludedFromBackup = true'));
  assert.ok(patched.indexOf('setResourceValues') < patched.indexOf('let delegate'));
  assert.ok(patched.includes('for: .documentDirectory'));
  assert.equal(excludeHealthBackup(patched), patched);
});

test('fails closed when native template changes', () => {
  assert.throws(() => excludeHealthBackup('unknown template'), /Unsupported AppDelegate/);
});
