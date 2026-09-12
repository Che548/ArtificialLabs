import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const env = {
  ...process.env,
  CI: '1',
  EXPO_PUBLIC_E2E_MODE: '1',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  SKIP_BUNDLING: '1',
  RCT_NO_LAUNCH_PACKAGER: '1',
};
// A Metro E2E package must not inherit store identity or OTA signing overrides.
delete env.SFERA_IOS_APP_STORE;
delete env.EXPO_OTA_CODE_SIGNING_CERTIFICATE;
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Local OCR build failed: ${command}`);
}
run('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install', '--skip-dependency-update', 'react,react-native']);
run('pod', ['install', '--project-directory=ios']);
run('xcodebuild', [
  '-workspace', 'ios/sfera.xcworkspace', '-scheme', 'sfera', '-configuration', 'Debug',
  '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator',
  '-derivedDataPath', join(root, 'output/builds/document-ocr/app-ios'), '-jobs', '2',
  // Simulator ad-hoc signing preserves Keychain entitlements. Disabling code
  // signing entirely makes SecureStore fail even though the app can launch.
  'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'ARCHS=arm64', 'ONLY_ACTIVE_ARCH=YES',
]);
