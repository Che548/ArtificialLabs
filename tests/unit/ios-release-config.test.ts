import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getConfig } from '@expo/config';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nativeTabTopInset } from '../../lib/native-tab-insets';
import { localAccountDeletionState } from '../../lib/account-deletion-state';

test('changing accounts clears the previous local deletion state', () => {
  assert.deepEqual(localAccountDeletionState(200, 100), { expired: false, pending: true, deadline: 200 });
  for (const deadline of [undefined, 0, NaN]) {
    assert.deepEqual(localAccountDeletionState(deadline, 100), { expired: false, pending: false, deadline: undefined });
  }
  assert.deepEqual(localAccountDeletionState(100, 100), { expired: true, pending: false, deadline: undefined });
  const store = readFileSync('lib/health-store.tsx', 'utf8');
  const startup = store.slice(store.indexOf('void initializeLocalDatabase()'), store.indexOf('}, [cachedUserId'));
  assert.ok(startup.indexOf('claimLocalDatabaseOwner') < startup.indexOf('reloadDevicePreferences'));
  assert.match(store, /setLocalDeletionPending\(deletion.pending\)/);
  const gate = readFileSync('components/AppGate.tsx', 'utf8');
  assert.match(gate, /e2e-pending-deletion-sign-out/);
  const exit = gate.slice(gate.indexOf('const leavePendingAccount'), gate.indexOf('if \(!ready\)'));
  assert.match(exit, /signOutInFlight.current/);
  assert.match(exit, /await signOut\(\)/);
  assert.doesNotMatch(exit, /restoreAccount\(|clearLocalHealthData\(|Alert\./);
});

test('native tab inset changes only regular-width modern iPads', () => {
  assert.equal(nativeTabTopInset(24, 1032, true), 88);
  assert.equal(nativeTabTopInset(24, 1376, true), 88);
  assert.equal(nativeTabTopInset(100, 1032, true), 100);
  assert.equal(nativeTabTopInset(24, 500, true), 24);
  assert.equal(nativeTabTopInset(47, 428, false), 47);
  assert.equal(nativeTabTopInset(24, 1032, false), 24);
});

test('iOS uses system weights without changing other platform families', () => {
  const source = readFileSync('lib/font-style.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  for (const platform of ['ios', 'android', 'web']) {
    const exports: any = {};
    runInNewContext(compiled, {
      exports,
      require: () => ({ Platform: { OS: platform } }),
    });
    for (const [weight, value] of Object.entries({ Regular: '400', Medium: '500', Semibold: '600', Bold: '700' })) {
      const family = `SFProDisplay-${weight}`;
      assert.deepEqual(JSON.parse(JSON.stringify(exports.fontStyle(family))),
        platform === 'ios' ? {fontFamily: 'System', fontWeight: value} : {fontFamily: family});
    }
    assert.equal(exports.fontStyle('Comfortaa-Regular').fontFamily, 'Comfortaa-Regular');
  }
});

test('iOS asset configuration excludes SF Pro while Android retains its fonts', () => {
  const config = getConfig(process.cwd()).exp;
  const fontPlugin = config.plugins?.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-font') as [string, any];
  assert.equal(fontPlugin[1].fonts, undefined);
  assert.deepEqual(fontPlugin[1].ios.fonts, ['./assets/fonts/Comfortaa-Regular.ttf']);
  assert.equal(fontPlugin[1].android.fonts.length, 5);
  assert.doesNotMatch(JSON.stringify(fontPlugin), /Yaro/);
  assert.match(readFileSync('lib/font-license.ts', 'utf8'), /SIL OPEN FONT LICENSE/);
  assert.doesNotMatch(readFileSync('lib/bundled-fonts.ts', 'utf8'), /Yaro/);
  assert.doesNotMatch(readFileSync('lib/bundled-fonts.ios.ts', 'utf8'), /require\([^)]*SF-Pro/);
  for (const file of ['App.tsx', 'app/_layout.tsx', 'app/scan.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /require\([^)]*SF-Pro/);
  }
});

test('App Store identity is explicit and legacy development remains separate', () => {
  const original = process.env.SFERA_IOS_APP_STORE;
  const originalE2E = process.env.EXPO_PUBLIC_E2E_MODE;
  const originalVersion = process.env.SFERA_RELEASE_VERSION;
  const originalBuild = process.env.SFERA_IOS_BUILD_NUMBER;
  try {
    delete process.env.SFERA_IOS_APP_STORE;
    delete process.env.EXPO_PUBLIC_E2E_MODE;
    assert.equal(getConfig(process.cwd()).exp.ios?.bundleIdentifier, 'com.anonymous.privateexpo');
    process.env.SFERA_IOS_APP_STORE = '1';
    delete process.env.SFERA_RELEASE_VERSION;
    delete process.env.SFERA_IOS_BUILD_NUMBER;
    assert.throws(() => getConfig(process.cwd()), /require explicit release/);
    process.env.SFERA_RELEASE_VERSION = '1.2.3';
    process.env.SFERA_IOS_BUILD_NUMBER = '42';
    const release = getConfig(process.cwd()).exp;
    assert.equal(release.ios?.bundleIdentifier, 'engineering.brainwaves.sfera');
    assert.equal(release.ios?.appleTeamId, '6HZGXYF43L');
    assert.equal(release.ios?.buildNumber, '42');
    assert.equal(release.version, '1.2.3');
    assert.equal(release.android?.package, 'engineering.brainwaves.sfera');
    for (const version of ['1.2.3\n', '01.2.3', '1.2.3-beta']) {
      process.env.SFERA_RELEASE_VERSION = version;
      assert.throws(() => getConfig(process.cwd()), /Invalid SFERA_RELEASE_VERSION/);
    }
    process.env.SFERA_RELEASE_VERSION = '1.2.3';
    for (const build of ['42\n', '0', '01', '-1']) {
      process.env.SFERA_IOS_BUILD_NUMBER = build;
      assert.throws(() => getConfig(process.cwd()), /Invalid SFERA_IOS_BUILD_NUMBER/);
    }
    process.env.SFERA_IOS_BUILD_NUMBER = '42';
    process.env.EXPO_PUBLIC_E2E_MODE = '1';
    assert.throws(() => getConfig(process.cwd()), /must not enable E2E/);
  } finally {
    if (original === undefined) delete process.env.SFERA_IOS_APP_STORE;
    else process.env.SFERA_IOS_APP_STORE = original;
    if (originalE2E === undefined) delete process.env.EXPO_PUBLIC_E2E_MODE;
    else process.env.EXPO_PUBLIC_E2E_MODE = originalE2E;
    if (originalVersion === undefined) delete process.env.SFERA_RELEASE_VERSION;
    else process.env.SFERA_RELEASE_VERSION = originalVersion;
    if (originalBuild === undefined) delete process.env.SFERA_IOS_BUILD_NUMBER;
    else process.env.SFERA_IOS_BUILD_NUMBER = originalBuild;
  }
});
