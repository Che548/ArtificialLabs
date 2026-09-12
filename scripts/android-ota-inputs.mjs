import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// masked-view 0.3.2's own android/build.gradle removes this manifest package
// for AGP >= 7, modifying node_modules before the native fingerprint task.
// Reproduce that exact upstream transformation in a clean Android OTA export.
export function prepareAndroidOtaInputs(root = process.cwd()) {
  const moduleRoot = path.join(root, 'node_modules/@react-native-masked-view/masked-view');
  const pkg = JSON.parse(fs.readFileSync(path.join(moduleRoot, 'package.json'), 'utf8'));
  if (pkg.version !== '0.3.2') throw new Error('MASKED_VIEW_VERSION_REQUIRES_REVIEW');
  const manifest = path.join(moduleRoot, 'android/src/main/AndroidManifest.xml');
  const source = fs.readFileSync(manifest, 'utf8');
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const original = 'fec60935b1fb50d35f4665b8701bab007748f6a15c3e195e3572572453e12999';
  const prepared = 'eda8955f968753f2adb0a492a0f6c12f5fc24e8fde47393cfa14e89d5e33697d';
  if (hash(source) === prepared) return;
  if (hash(source) !== original) throw new Error('MASKED_VIEW_MANIFEST_REQUIRES_REVIEW');
  const result = source.replace('package="org.reactnative.maskedview"', '');
  if (hash(result) !== prepared) throw new Error('MASKED_VIEW_PREPARATION_FAILED');
  fs.writeFileSync(manifest, result);
}
