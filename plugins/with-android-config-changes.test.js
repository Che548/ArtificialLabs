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
    `proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"`,
  );
  assert.equal(configureReleaseOptimization(result), result);
});
