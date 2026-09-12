import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, CI: '1', EXPO_PUBLIC_E2E_MODE: '1',
  ANDROID_HOME: process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk') };
delete env.EXPO_OTA_CODE_SIGNING_CERTIFICATE;
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Local Android OCR build failed: ${command}`);
}
run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--skip-dependency-update', 'react,react-native']);
// This is a local arm64 emulator build, not an all-ABI store artifact.
run('./gradlew', [':app:assembleDebug', '-PreactNativeArchitectures=arm64-v8a', '--max-workers=2'], join(root, 'android'));
