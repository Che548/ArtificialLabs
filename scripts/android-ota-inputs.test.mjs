import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareAndroidOtaInputs } from './android-ota-inputs.mjs';

test('clean OTA reproduces the native Gradle input and is idempotent; unknown inputs fail closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sfera-ota-input-test-'));
  const moduleRoot = path.join(root, 'node_modules/@react-native-masked-view/masked-view');
  const manifest = path.join(moduleRoot, 'android/src/main/AndroidManifest.xml');
  try {
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(path.join(moduleRoot, 'package.json'), JSON.stringify({ version: '0.3.2' }));
    fs.writeFileSync(manifest, '<manifest package="org.reactnative.maskedview" xmlns:android="http://schemas.android.com/apk/res/android">\n</manifest>\n');
    prepareAndroidOtaInputs(root);
    const prepared = fs.readFileSync(manifest, 'utf8');
    assert.ok(!prepared.includes('package='));
    prepareAndroidOtaInputs(root);
    assert.equal(fs.readFileSync(manifest, 'utf8'), prepared);
    fs.writeFileSync(manifest, '<manifest/>');
    assert.throws(() => prepareAndroidOtaInputs(root), /MANIFEST_REQUIRES_REVIEW/);
    assert.equal(fs.readFileSync(manifest, 'utf8'), '<manifest/>');
    fs.writeFileSync(path.join(moduleRoot, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    assert.throws(() => prepareAndroidOtaInputs(root), /VERSION_REQUIRES_REVIEW/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
