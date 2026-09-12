import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';

const sdk = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const out = resolve('output/builds/android-ui-driver');
mkdirSync(out, { recursive: true, mode: 0o700 });
const android = join(sdk, 'platforms/android-36/android.jar');
const uia = join(sdk, 'platforms/android-36/uiautomator.jar');
const junit = join(sdk, 'platforms/android-36/optional/android.test.base.jar');
for (const [bin, args] of [
  ['javac', ['-source', '8', '-target', '8', '-cp', [android, uia, junit].join(':'), '-d', out, 'scripts/android-ui/NativeUiDump.java']],
  [join(sdk, 'build-tools/36.0.0/d8'), ['--lib', android, '--classpath', uia, '--classpath', junit, '--output', join(out, 'driver.jar'), join(out, 'sfera/qa/NativeUiDump.class')]],
]) {
  const result = spawnSync(bin, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Disposable Android UI driver build failed');
}
