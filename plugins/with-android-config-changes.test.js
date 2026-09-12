const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  configureReleaseOptimization,
  releaseOptimizationProperties,
} = require('./with-android-config-changes');

test('release optimization enables code and resource shrinking together', () => {
  assert.deepEqual(releaseOptimizationProperties, {
    'android.enableMinifyInReleaseBuilds': 'true',
    'android.enableShrinkResourcesInReleaseBuilds': 'true',
  });
});

test('optimizing preset preserves project keep rules and is idempotent', () => {
  const source = `proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"`;
  const result = configureReleaseOptimization(source);
  assert.equal(
    result,
    `proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"\n            proguardFile file("../../plugins/android-reflection.pro")`,
  );
  assert.equal(configureReleaseOptimization(result), result);
});

test('release keeps the Expo Record reflection boundary without disabling R8', () => {
  const rules = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'android-reflection.pro'), 'utf8',
  );
  assert.match(rules, /-keep class kotlin\.reflect\.\*\* \{ \*; \}/);
  assert.match(rules, /-keep class expo\.modules\.kotlin\.records\.\*\* \{ \*; \}/);
  assert.doesNotMatch(rules, /-dont(?:optimize|shrink|obfuscate)/);
});
