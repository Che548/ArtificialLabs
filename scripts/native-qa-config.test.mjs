import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { hermesQaExpression } from './hermes-qa-expression.mjs';
import { assertConsistentAdbServer, assertNativeQaDeployment, NATIVE_QA_REQUIRED_FUNCTIONS, assertUnsignedQaManifestCompatible, localMetroLaunchAsset, nativeQaScenarios } from './native-qa-config.mjs';

test('rejects stale or wrong deployments before creating native QA accounts', () => {
  const spec = {
    url: 'https://artificiallabs-convex.bebra42.ru',
    functions: NATIVE_QA_REQUIRED_FUNCTIONS.map(identifier => ({ identifier })),
  };
  assert.doesNotThrow(() => assertNativeQaDeployment(spec));
  for (const missing of NATIVE_QA_REQUIRED_FUNCTIONS) {
    assert.throws(() => assertNativeQaDeployment({ ...spec, functions: spec.functions.filter(fn => fn.identifier !== missing) }), /NATIVE_QA_DEPLOYMENT_MISMATCH/);
  }
  for (const invalid of [null, {}, { ...spec, url: 'https://other.example' }, { ...spec, functions: null }]) {
    assert.throws(() => assertNativeQaDeployment(invalid), /NATIVE_QA_DEPLOYMENT_MISMATCH/);
  }
});

test('requires matching SDK ADB client/server binary and version before transport QA', () => {
  const path = '/sdk/platform-tools/adb';
  const server = 'version: "37.0.0"\nexecutable_absolute_path: "/sdk/platform-tools/adb"\n';
  assert.doesNotThrow(() => assertConsistentAdbServer(path, 'Version 37.0.0-build', server));
  assert.throws(() => assertConsistentAdbServer(path, 'Version 36.0.2-build', server));
  assert.throws(() => assertConsistentAdbServer('/other/adb', 'Version 37.0.0-build', server));
  assert.throws(() => assertConsistentAdbServer(path, 'Version 37.0.0-build', ''));
});

test('rejects OTA-signed native packages before booting QA simulator', () => {
  assert.throws(() => assertUnsignedQaManifestCompatible({ EXUpdatesCodeSigningCertificate: 'public certificate' }), /requires signed OTA/);
  assert.doesNotThrow(() => assertUnsignedQaManifestCompatible({ EXUpdatesEnabled: true }));
});

test('native phases are bounded and transport checks include their synthetic conversation prerequisite', () => {
  assert.deepEqual(nativeQaScenarios('native-connection'), ['chat-conversation', 'native-connection']);
  assert.deepEqual(nativeQaScenarios('document-ocr'), ['document-ocr']);
  assert.throws(() => nativeQaScenarios('../../unknown'));
});

test('inspector QA lowers async syntax and preserves arguments without runtime imports', async () => {
  const context = {};
  const argument = 'file:///synthetic/"quoted"/ocr-matrix/';
  const expression = hermesQaExpression(async function (value) {
    globalThis.qaResult = await Promise.resolve(value);
  }, argument);
  assert.doesNotMatch(expression, /\basync\s+function|\brequire\(|\bimport\b/);
  assert.equal(runInNewContext(expression, context), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.qaResult, argument);
});
test('warms the exact local launch asset, including transform profile', () => {
  const url = 'http://127.0.0.1:8083/entry.bundle?unstable_transformProfile=hermes-stable';
  assert.equal(localMetroLaunchAsset({ launchAsset: { url } }, 8083).href, url);
});
test('emulator host alias requires explicit opt-in and rewrites only to loopback', () => {
  const manifest = { launchAsset: { url: 'http://10.0.2.2:8083/a?profile=hermes' } };
  assert.throws(() => localMetroLaunchAsset(manifest, 8083));
  assert.equal(localMetroLaunchAsset(manifest, 8083, true).href, 'http://127.0.0.1:8083/a?profile=hermes');
  assert.throws(() => localMetroLaunchAsset(manifest, 8081, true));
});
test('does not follow remote, credentialed, wrong-port or missing launch assets', () => {
  for (const url of ['https://example.org/entry.bundle', 'http://localhost:8081/a', 'http://user:pass@localhost:8083/a', 'file:///tmp/a', undefined]) {
    assert.throws(() => localMetroLaunchAsset({ launchAsset: { url } }, 8083));
  }
});
