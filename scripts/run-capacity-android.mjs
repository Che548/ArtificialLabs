import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { assertConsistentAdbServer, localMetroLaunchAsset, nativeQaScenarios, OCR_MATRIX_FIXTURES } from './native-qa-config.mjs';
import { splitAndroidResumeFlow } from './android-resume-flow.mjs';

process.umask(0o077);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sdk = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const adb = join(sdk, 'platform-tools/adb');
const avd = process.env.E2E_ANDROID_AVD;
const gpu = process.env.E2E_ANDROID_GPU ?? 'host';
if (!['host', 'auto', 'software', 'swiftshader', 'swangle'].includes(gpu)) throw new Error('Unsupported QA emulator GPU mode.');
const deviceState = process.env.E2E_ANDROID_DEVICE_STATE;
if (deviceState !== undefined && !/^[0-9]+$/.test(deviceState)) throw new Error('Invalid QA device state.');
if (process.env.E2E_QA_FOLD_TRANSITION === '1' && !['0', '2'].includes(deviceState)) throw new Error('Fold transition requires starting state 0 or 2.');
if (process.env.E2E_DISPOSABLE_EMULATOR !== '1' || !avd || !/^[\w-]+$/.test(avd)) throw new Error('Specify a disposable E2E_ANDROID_AVD explicitly.');
const apk = '/Users/taras/.codex/worktrees/eb0c/ArtificialLabs/android/app/build/outputs/apk/debug/app-debug.apk';
const fixture = '/Users/taras/.codex/worktrees/eb0c/ArtificialLabs/output/pdf/document-ocr/two-pages.pdf';
if (!existsSync(apk) || !existsSync(fixture)) throw new Error('Build the local Android package and generate synthetic fixtures first.');
const connected = spawnSync(adb, ['devices'], { encoding: 'utf8' });
if (connected.status !== 0 || connected.stdout.trim().split('\n').length > 1) throw new Error('ADB must be healthy with no other devices connected.');
const adbServer = spawnSync(adb, ['server-status'], { encoding: 'utf8', timeout: 10000 });
const adbClient = spawnSync(adb, ['version'], { encoding: 'utf8', timeout: 10000 });
if (adbServer.status !== 0 || adbClient.status !== 0) throw new Error('Cannot verify ADB client/server versions before QA.');
assertConsistentAdbServer(adb, adbClient.stdout, adbServer.stdout);
const simulators = JSON.parse(spawnSync('xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }).stdout);
if (Object.values(simulators.devices).flat().some(item => item.state === 'Booted')) throw new Error('Stop iOS simulators before this sequential Android run.');
const serial = 'emulator-5564';
const app = 'engineering.brainwaves.sfera';
const report = join(root, 'output/e2e/capacity/android');
mkdirSync(report, { recursive: true }); chmodSync(report, 0o700);
const log = openSync(join(report, 'runner-private.log'), 'w', 0o600);
const tag = randomUUID().replaceAll('-', '').slice(0, 12);
const temporaryFixture = `/data/local/tmp/sfera-ocr-${tag}.pdf`;
const env = { ...process.env, PATH: `${join(sdk, 'platform-tools')}:${process.env.PATH}`, ANDROID_HOME: sdk,
  MAESTRO_CLI_NO_ANALYTICS: 'true', MAESTRO_DISABLE_UPDATE_CHECK: 'true',
  CI: '1', EXPO_PUBLIC_E2E_MODE: '1', MAESTRO_APP_ID: app, E2E_ALLOW_TRANSPORT_FAULTS: '1',
  E2E_EMAIL: `artificiallabs-e2e+${tag}-native@example.test`, E2E_PASSWORD: `E2e${tag}Aa1`, E2E_REPORT_DIR: report,
  E2E_CONVEX_PROXY_PORT: '3350', E2E_CONVEX_SITE_PROXY_PORT: '3351',
  EXPO_PUBLIC_E2E_ANDROID_CONVEX_URL: 'http://10.0.2.2:3350',
  EXPO_PACKAGER_PROXY_URL: 'http://10.0.2.2:8083',
  EXPO_PUBLIC_CONVEX_URL: process.env.CONVEX_SELF_HOSTED_URL,
  EXPO_PUBLIC_E2E_DOCUMENT_FIXTURE_ANDROID_URI: `file:///data/user/0/${app}/files/e2e/document.pdf`,
};
env.EXPO_PUBLIC_E2E_EMAIL = env.E2E_EMAIL;
delete env.E2E_CONVEX_TLS_CERT; delete env.E2E_CONVEX_TLS_KEY;
let emulator, metro, proxy;
const temporaryFlows = [];
function command(bin, args, timeout = 120000) {
  const result = spawnSync(bin, args, { cwd: root, env, stdio: ['ignore', log, log], timeout, detached: bin.endsWith('/maestro') });
  if (result.status !== 0) throw new Error(`${bin} failed (exit=${result.status}, signal=${result.signal ?? 'none'}, error=${result.error?.code ?? 'none'}); inspect the private E2E log.`);
}
function device(args) { command(adb, ['-s', serial, ...args]); }
try {
  if (env.E2E_OCR_MATRIX_ONLY !== '1') command(process.execPath, ['--import', 'tsx', 'tests/e2e/prepare-native-fixture.ts']);
  console.log('Booting one read-only Android emulator; original AVD data will not be overwritten.');
  emulator = spawn(join(sdk, 'emulator/emulator'), ['-avd', avd, '-port', '5564', '-read-only', '-no-snapshot-load', '-no-snapshot-save', '-no-window', '-no-audio', '-memory', '2048', '-cores', '2', '-gpu', gpu], { env, stdio: ['ignore', log, log] });
  let booted = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (emulator.exitCode !== null) throw new Error('Android emulator exited before boot.');
    const boot = spawnSync(adb, ['-s', serial, 'shell', 'getprop', 'sys.boot_completed'], { encoding: 'utf8', timeout: 3000 });
    if (boot.status === 0 && boot.stdout.trim() === '1') { booted = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!booted) throw new Error('Android emulator boot timed out.');
  if (deviceState !== undefined) {
    const supported = spawnSync(adb, ['-s', serial, 'shell', 'cmd', 'device_state', 'print-states-simple'], { encoding: 'utf8', timeout: 10000 });
    if (supported.status !== 0 || !supported.stdout.trim().split(/\s*,\s*/).includes(deviceState)) throw new Error('Requested device state is not supported by this AVD.');
    device(['shell', 'cmd', 'device_state', 'state', deviceState]);
    const current = spawnSync(adb, ['-s', serial, 'shell', 'cmd', 'device_state', 'print-state'], { encoding: 'utf8', timeout: 10000 });
    if (current.status !== 0 || current.stdout.trim() !== deviceState) throw new Error('Emulator did not enter the requested state.');
  }
  // Changing a Fold posture may put the active display to sleep.
  device(['shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000']);
  device(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  device(['shell', 'wm', 'dismiss-keyguard']);
  spawnSync(adb, ['-s', serial, 'uninstall', app], { stdio: 'ignore', timeout: 30000 });
  device(['install', '-r', apk]);
  if (env.E2E_ANDROID_DOCUMENT_DRIVER === 'adb') {
    command(process.execPath, ['scripts/build-android-ui-driver.mjs']);
    device(['push', join(root, 'output/builds/android-ui-driver/driver.jar'), '/data/local/tmp/sfera-ui-driver.jar']);
  }
  device(['shell', 'settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1']);
  // Keep app network traffic independent of the ADB test-driver transport.
  // The Android emulator's reserved host alias reaches loopback-only servers.
  device(['push', fixture, temporaryFixture]);
  device(['shell', 'run-as', app, 'mkdir', '-p', 'files/e2e']);
  device(['shell', 'run-as', app, 'cp', temporaryFixture, 'files/e2e/document.pdf']);
  device(['shell', 'run-as', app, 'chmod', '600', 'files/e2e/document.pdf']);
  device(['shell', 'rm', '-f', temporaryFixture]);
  if (env.E2E_OCR_MATRIX_ONLY === '1') {
    device(['shell', 'run-as', app, 'mkdir', '-p', 'files/e2e/ocr-matrix']);
    for (const name of OCR_MATRIX_FIXTURES) {
      device(['push', join(root, 'output/pdf/document-ocr', name), temporaryFixture]);
      device(['shell', 'run-as', app, 'cp', temporaryFixture, `files/e2e/ocr-matrix/${name}`]);
      device(['shell', 'run-as', app, 'chmod', '600', `files/e2e/ocr-matrix/${name}`]);
      device(['shell', 'rm', '-f', temporaryFixture]);
    }
    env.E2E_OCR_MATRIX_URI = `file:///data/user/0/${app}/files/e2e/ocr-matrix/`;
    env.E2E_OCR_MATRIX_APP_ID = app;
  }
  proxy = spawn(process.execPath, ['--import', 'tsx', 'scripts/capacity-proxy.mjs'], { cwd: root, env, detached: true, stdio: ['ignore', log, log] });
  metro = spawn('npx', ['expo', 'start', '--dev-client', '--localhost', '--port', '8083', '--scheme', 'private-expo', '--max-workers', '2'], { cwd: root, env, detached: true, stdio: ['ignore', log, log] });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try { ready = (await fetch('http://127.0.0.1:8083/status')).ok && (await fetch('http://127.0.0.1:3350/__e2e_proxy_health')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('QA Metro/proxy did not become ready.');
  // Android's boot property can precede guest-network readiness. Keep this
  // precondition bounded and require the actual HTTP status, not any "204".
  let guestReady = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const guestProbe = spawnSync(adb, ['-s', serial, 'shell', "printf 'GET /__e2e_proxy_health HTTP/1.0\\r\\n\\r\\n' | toybox nc -w 5 10.0.2.2 3350"], { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 });
    guestReady = guestProbe.status === 0 && /^HTTP\/1\.[01] 204\b/m.test(guestProbe.stdout);
    if (guestReady) break;
    console.log(`Guest proxy readiness pending (attempt ${attempt + 1}/5, ADB exit ${guestProbe.status ?? 'timeout'}).`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!guestReady) throw new Error('The emulator cannot reach the local QA proxy via its host alias.');
  console.log('Warming Android manifest and its exact local launch asset.');
  const response = await fetch('http://127.0.0.1:8083/', { headers: { 'expo-platform': 'android', accept: 'application/expo+json' }, signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw new Error('Android manifest failed.');
  const bundle = await fetch(localMetroLaunchAsset(await response.json(), 8083, true), { signal: AbortSignal.timeout(300000) });
  if (!bundle.ok) throw new Error('Android bundle failed.');
  await bundle.arrayBuffer();
  device(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'private-expo://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8083', app]);
  if (env.E2E_OCR_MATRIX_ONLY === '1') {
    command(process.execPath, ['scripts/document-ocr-native-matrix.mjs'], 720000);
    console.log('Android native OCR fixture matrix passed.');
  } else {
    for (const phase of ['android-ocr-auth', ...nativeQaScenarios(env.E2E_QA_SCENARIOS), 'capacity-sync']) {
      console.log(`Android QA phase: ${phase}`);
      await fetch('http://127.0.0.1:3350/__capacity_reset',{method:'POST'});
      if (phase === 'document-ocr' && env.E2E_ANDROID_DOCUMENT_DRIVER === 'adb') {
        command(process.execPath, ['scripts/android-document-ui-qa.mjs'], 540000);
      } else if (phase === 'chat-keyboard' || phase === 'chat-conversation') {
        const runtime = join(root, '.maestro/runtime');
        mkdirSync(runtime, { recursive: true, mode: 0o700 });
        const split = splitAndroidResumeFlow(readFileSync(join(root, `.maestro/${phase}.yml`), 'utf8'), join(root, '.maestro'));
        for (const step of ['before', 'after']) {
          const flow = join(runtime, `${tag}-${phase}-${step}.yml`);
          temporaryFlows.push(flow);
          writeFileSync(flow, split[step], { mode: 0o600 });
          if (step === 'after') device(['shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`, '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER']);
          command(join(homedir(), '.maestro/bin/maestro'), ['--device', serial, 'test', flow, '--test-output-dir', join(report, 'artifacts'), '--env', `MAESTRO_APP_ID=${app}`], 240000);
        }
      } else {
        command(join(homedir(), '.maestro/bin/maestro'), ['--device', serial, 'test', `.maestro/${phase}.yml`, '--test-output-dir', join(report, 'artifacts'), '--env', `MAESTRO_APP_ID=${app}`, '--env', `E2E_PASSWORD=${env.E2E_PASSWORD}`], 360000);
      }
      writeFileSync(join(report, phase+'-network.json'), JSON.stringify(await fetch('http://127.0.0.1:3350/__capacity').then(r=>r.json()),null,2),{mode:0o600});
      console.log(`Android QA passed: ${phase}`);
    }
    if (env.E2E_QA_FOLD_TRANSITION === '1') {
      if (!['0', '2'].includes(deviceState)) throw new Error('Fold transition requires a verified starting state 0 or 2.');
      const runFoldPhase = phase => command(join(homedir(), '.maestro/bin/maestro'), ['--device', serial, 'test', `.maestro/${phase}.yml`, '--test-output-dir', join(report, 'artifacts')], 180000);
      runFoldPhase('fold-draft-before');
      const nextState = deviceState === '0' ? '2' : '0';
      device(['shell', 'cmd', 'device_state', 'state', nextState]);
      const current = spawnSync(adb, ['-s', serial, 'shell', 'cmd', 'device_state', 'print-state'], { encoding: 'utf8', timeout: 10000 });
      if (current.status !== 0 || current.stdout.trim() !== nextState) throw new Error('Fold transition did not reach requested posture.');
      device(['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
      device(['shell', 'wm', 'dismiss-keyguard']);
      runFoldPhase('fold-draft-after');
      console.log(`Android QA passed: live Fold transition ${deviceState} to ${nextState}`);
    }
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
  // Capture the failing disposable device before teardown. Never export these
  // private logs; they may include generated fixture credentials.
  if (emulator) {
    const screenshot = spawnSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 10000, maxBuffer: 16 * 1024 * 1024 });
    // Multi-display screencap can prepend a warning before the PNG payload.
    const pngStart = screenshot.stdout?.indexOf(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ?? -1;
    if (screenshot.status === 0 && pngStart >= 0) writeFileSync(join(report, 'failure-before-cleanup.png'), screenshot.stdout.subarray(pngStart), { mode: 0o600 });
    const deviceLog = spawnSync(adb, ['-s', serial, 'logcat', '-d', '-t', '1000'], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    if (deviceLog.status === 0) writeFileSync(join(report, 'failure-device-private.log'), deviceLog.stdout, { mode: 0o600 });
  }
}
finally {
  for (const flow of temporaryFlows) try { unlinkSync(flow); } catch {}
  try { command(process.execPath, ['--import', 'tsx', 'tests/e2e/native-account.ts', 'cleanup']); console.log('Exact disposable account cleanup passed.'); }
  catch { console.error('Disposable account cleanup requires attention.'); process.exitCode = 1; }
  if (metro) try { process.kill(-metro.pid, 'SIGTERM'); } catch {}
  proxy?.kill('SIGTERM');
  if (emulator) {
    spawnSync(adb, ['-s', serial, 'shell', 'rm', '-f', temporaryFixture], { stdio: 'ignore', timeout: 10000 });
    if (env.E2E_ANDROID_DOCUMENT_DRIVER === 'adb') {
      spawnSync(adb, ['-s', serial, 'shell', 'rm', '-f', '/data/local/tmp/sfera-ui-driver.jar', '/data/local/tmp/sfera-document-ui.xml'], { stdio: 'ignore', timeout: 10000 });
    }
    spawnSync(adb, ['-s', serial, 'uninstall', app], { stdio: 'ignore', timeout: 30000 });
    spawnSync(adb, ['-s', serial, 'reverse', '--remove-all'], { stdio: 'ignore', timeout: 10000 });
    spawnSync(adb, ['-s', serial, 'emu', 'kill'], { stdio: 'ignore', timeout: 10000 });
    emulator.kill('SIGTERM');
  }
}
