import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getConfig } from '@expo/config';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

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
  for (const file of ['App.tsx', 'app/_layout.tsx', 'app/scan.tsx', 'app/design-system.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /require\([^)]*SF-Pro/);
  }
});

test('App Store identity is explicit and legacy development remains separate', () => {
  const original = process.env.SFERA_IOS_APP_STORE;
  const originalE2E = process.env.EXPO_PUBLIC_E2E_MODE;
  try {
    delete process.env.SFERA_IOS_APP_STORE;
    delete process.env.EXPO_PUBLIC_E2E_MODE;
    assert.equal(getConfig(process.cwd()).exp.ios?.bundleIdentifier, 'com.anonymous.privateexpo');
    process.env.SFERA_IOS_APP_STORE = '1';
    const release = getConfig(process.cwd()).exp;
    assert.equal(release.ios?.bundleIdentifier, 'engineering.brainwaves.sfera');
    assert.equal(release.ios?.appleTeamId, '6HZGXYF43L');
    assert.equal(release.ios?.buildNumber, '2');
    assert.equal(release.android?.package, 'engineering.brainwaves.sfera');
    process.env.EXPO_PUBLIC_E2E_MODE = '1';
    assert.throws(() => getConfig(process.cwd()), /must not enable E2E/);
  } finally {
    if (original === undefined) delete process.env.SFERA_IOS_APP_STORE;
    else process.env.SFERA_IOS_APP_STORE = original;
    if (originalE2E === undefined) delete process.env.EXPO_PUBLIC_E2E_MODE;
    else process.env.EXPO_PUBLIC_E2E_MODE = originalE2E;
  }
});
