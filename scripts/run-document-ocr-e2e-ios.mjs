import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertUnsignedQaManifestCompatible, localMetroLaunchAsset, nativeQaScenarios, OCR_MATRIX_FIXTURES } from './native-qa-config.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.umask(0o077);
const device = process.env.E2E_IOS_DEVICE;
if (!device || process.env.E2E_DISPOSABLE_SIMULATOR !== '1') throw new Error('An explicitly disposable iOS simulator is required.');
const app = join(root, 'output/builds/document-ocr/app-ios/Build/Products/Debug-iphonesimulator/sfera.app');
if (!existsSync(join(app, 'Info.plist'))) throw new Error('Build the local iOS package first.');
const nativeConfig = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Expo.plist')], { encoding: 'utf8' });
if (nativeConfig.status !== 0) throw new Error('Cannot inspect the local iOS update configuration.');
assertUnsignedQaManifestCompatible(JSON.parse(nativeConfig.stdout));
const signature = spawnSync('/usr/bin/codesign', ['--verify', app], { stdio: 'ignore' });
if (signature.status !== 0) throw new Error('Local iOS package signature is invalid; rebuild with the QA build script before testing SecureStore.');
const fixture = join(root, 'output/pdf/document-ocr/two-pages.pdf');
if (!existsSync(fixture)) throw new Error('Generate the synthetic document fixtures first.');
const report = join(root, 'output/e2e/document-ocr-ios');
mkdirSync(report, { recursive: true });
chmodSync(report, 0o700);
const privateLog = openSync(join(report, 'runner-private.log'), 'w', 0o600);
const devices = JSON.parse(spawnSync('xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }).stdout);
const inventory = Object.values(devices.devices).flat();
if (!inventory.find(item => item.udid === device && /QA/.test(item.name))) throw new Error('Device must be a dedicated QA simulator.');
if (inventory.some(item => item.state === 'Booted' && item.udid !== device)) throw new Error('Stop other simulators before this sequential test.');
const adb = join(process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk'), 'platform-tools/adb');
if (existsSync(adb)) {
  const connected = spawnSync(adb, ['devices'], { encoding: 'utf8', timeout: 10000 });
  if (connected.status !== 0 || connected.stdout.trim().split('\n').length > 1) throw new Error('Stop Android devices and ensure healthy ADB before this sequential iOS test.');
}
const tag = randomUUID().replaceAll('-', '').slice(0, 12);
const env = { ...process.env, E2E_EMAIL: `artificiallabs-e2e+${tag}-native@example.test`, E2E_PASSWORD: `E2e${tag}Aa1`, E2E_REPORT_DIR: report,
  MAESTRO_CLI_NO_ANALYTICS: 'true', MAESTRO_DISABLE_UPDATE_CHECK: 'true',
  CI: '1', EXPO_PUBLIC_E2E_MODE: '1', E2E_ALLOW_TRANSPORT_FAULTS: '1', E2E_CONVEX_PROXY_PORT: '3350', E2E_CONVEX_SITE_PROXY_PORT: '3351', E2E_CONVEX_IOS_PROXY_PORT: '3352',
  EXPO_PUBLIC_E2E_IOS_CONVEX_URL: 'https://localhost:3352', EXPO_PUBLIC_CONVEX_URL: process.env.CONVEX_SELF_HOSTED_URL,
};
env.EXPO_PUBLIC_E2E_EMAIL = env.E2E_EMAIL;
const cert = mkdtempSync(join(tmpdir(), 'sfera-ocr-e2e-cert-'));
env.E2E_CONVEX_TLS_CERT = join(cert, 'localhost.crt');
env.E2E_CONVEX_TLS_KEY = join(cert, 'localhost.key');
let metro, proxy;
function command(bin, args, timeout = 120000) {
  const result = spawnSync(bin, args, { cwd: root, env, stdio: ['ignore', privateLog, privateLog], timeout });
  if (result.status !== 0) throw new Error(`${bin} failed; inspect the private E2E log.`);
}
try {
  if (env.E2E_OCR_MATRIX_ONLY !== '1') command(process.execPath, ['--import', 'tsx', 'tests/e2e/prepare-native-fixture.ts']);
  console.log('Booting the single disposable QA simulator and installing the local package.');
  if (!inventory.find(item => item.udid === device && item.state === 'Booted')) command('xcrun', ['simctl', 'boot', device]);
  command('xcrun', ['simctl', 'bootstatus', device, '-b']);
  spawnSync('xcrun', ['simctl', 'uninstall', device, 'com.anonymous.privateexpo'], { stdio: 'ignore' });
  command('xcrun', ['simctl', 'install', device, app]);
  command('xcrun', ['simctl', 'keychain', device, 'reset']);
  command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-subj', '/CN=Sfera OCR Local E2E', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', env.E2E_CONVEX_TLS_KEY, '-out', env.E2E_CONVEX_TLS_CERT]);
  chmodSync(env.E2E_CONVEX_TLS_KEY, 0o600);
  command('xcrun', ['simctl', 'keychain', device, 'add-root-cert', env.E2E_CONVEX_TLS_CERT]);
  console.log('Local package and QA trust configuration are ready.');
  const container = spawnSync('xcrun', ['simctl', 'get_app_container', device, 'com.anonymous.privateexpo', 'data'], { encoding: 'utf8' }).stdout.trim();
  if (!container.startsWith('/Users/') || !container.includes('/CoreSimulator/Devices/')) throw new Error('Unexpected QA app container');
  const importedFixture = join(container, 'Documents/e2e-document.pdf');
  copyFileSync(fixture, importedFixture); chmodSync(importedFixture, 0o600);
  env.EXPO_PUBLIC_E2E_DOCUMENT_FIXTURE_IOS_URI = `file://${importedFixture}`;
  if (env.E2E_OCR_MATRIX_ONLY === '1') {
    const directory = join(container, 'Documents/ocr-matrix');
    mkdirSync(directory, { mode: 0o700 });
    for (const name of OCR_MATRIX_FIXTURES) {
      const destination = join(directory, name);
      copyFileSync(join(root, 'output/pdf/document-ocr', name), destination);
      chmodSync(destination, 0o600);
    }
    env.E2E_OCR_MATRIX_URI = `file://${directory}/`;
    env.E2E_OCR_MATRIX_APP_ID = 'com.anonymous.privateexpo';
  }
  proxy = spawn(process.execPath, ['--import', 'tsx', 'scripts/convex-e2e-proxy.ts'], { cwd: root, env, stdio: ['ignore', privateLog, privateLog] });
  metro = spawn('npx', ['expo', 'start', '--dev-client', '--localhost', '--port', '8083', '--scheme', 'private-expo', '--max-workers', '2'], { cwd: root, env, detached: true, stdio: ['ignore', privateLog, privateLog] });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try { ready = (await fetch('http://localhost:8083/status')).ok && (await fetch('http://localhost:3350/__e2e_proxy_health')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('QA Metro/proxy did not become ready');
  // The launcher fetches the manifest first. Warming a guessed bundle URL does
  // not warm fingerprint generation or the actual Hermes transform profile.
  console.log('Warming local iOS manifest and its exact launch asset.');
  const manifestResponse = await fetch('http://127.0.0.1:8083/', {
    headers: { 'expo-platform': 'ios', accept: 'application/expo+json,application/json' },
    signal: AbortSignal.timeout(300000),
  });
  if (!manifestResponse.ok) throw new Error('QA Metro manifest failed');
  const manifest = await manifestResponse.json();
  const launchAsset = localMetroLaunchAsset(manifest, 8083);
  const bundle = await fetch(launchAsset, { signal: AbortSignal.timeout(300000) });
  if (!bundle.ok) throw new Error('QA Metro bundle failed');
  await bundle.arrayBuffer();
  // Complete the fresh app launch separately from URL dispatch. Asking the
  // simulator to cold-launch via openurl can time out before the app receives
  // the local Metro link, despite bootstatus having completed successfully.
  command('xcrun', ['simctl', 'launch', device, 'com.anonymous.privateexpo']);
  command('xcrun', ['simctl', 'openurl', device, 'private-expo://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8083']);
  if (env.E2E_OCR_MATRIX_ONLY === '1') {
    command(process.execPath, ['scripts/document-ocr-native-matrix.mjs'], 720000);
    console.log('iOS native OCR fixture matrix passed.');
  } else {
    for (const phase of ['ios-ocr-auth', ...nativeQaScenarios(env.E2E_QA_SCENARIOS)]) {
      console.log(`iOS QA phase: ${phase}`);
      command(join(homedir(), '.maestro/bin/maestro'), ['--device', device, 'test', `.maestro/${phase}.yml`, '--debug-output', join(report, 'maestro'), '--test-output-dir', join(report, 'artifacts'), '--env', `E2E_PASSWORD=${env.E2E_PASSWORD}`], 360000);
      console.log(`iOS QA passed: ${phase}`);
    }
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  try { command(process.execPath, ['--import', 'tsx', 'tests/e2e/native-account.ts', 'cleanup']); console.log('Exact disposable account cleanup passed.'); }
  catch { console.error('Disposable account cleanup requires attention.'); process.exitCode = 1; }
  if (metro) try { process.kill(-metro.pid, 'SIGTERM'); } catch {}
  proxy?.kill('SIGTERM');
  spawnSync('xcrun', ['simctl', 'uninstall', device, 'com.anonymous.privateexpo'], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'keychain', device, 'reset'], { stdio: 'ignore' });
  spawnSync('xcrun', ['simctl', 'shutdown', device], { stdio: 'ignore' });
  rmSync(cert, { recursive: true });
}
