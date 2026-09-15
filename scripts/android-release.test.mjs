import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('Android counters and upload receipts fail closed', () => {
  execFileSync('ruby', ['-I', 'scripts', '-r', 'android-release-policy', '-e', `
    p = AndroidReleasePolicy
    raise unless p.next_code([6, '12', 9], '2') == 13
    raise unless p.next_code([], '3') == 7
    [ ['bad'], [2100000000] ].each do |codes|
      begin; p.next_code(codes, 1); raise 'accepted'; rescue RuntimeError => e; raise if e.message == 'accepted'; end
    end
    d = {'schema'=>1,'platform'=>'android','tag'=>'v1.0.3','sha'=>'a'*40,'app_version'=>'1.0.0','package'=>p::PACKAGE,'track'=>'internal','build'=>13,'state'=>'reserved'}
    p.validate_receipt(d, 'v1.0.3', 'a'*40, '1.0.0')
    raise unless p.resume(d,nil) == :upload
    ['sha','track','app_version'].each do |key|
      begin; p.validate_receipt(d.merge(key=>'wrong'),'v1.0.3','a'*40,'1.0.0'); raise 'accepted'; rescue RuntimeError => e; raise if e.message == 'accepted'; end
    end
    begin; p.resume(d,'b'*64); raise 'accepted'; rescue RuntimeError=>e; raise if e.message=='accepted'; end
    d.merge!('state'=>'upload_attempted','sha256'=>'b'*64)
    raise unless p.resume(d,'b'*64)==:existing
    [nil,'c'*64].each do |hash|
      begin; p.resume(d,hash); raise 'accepted'; rescue RuntimeError=>e; raise if e.message=='accepted'; end
    end
  `], { stdio: 'pipe' });
});
test('Android release is test-gated, internal-only and secret-gated', () => {
  const workflow = readFileSync('.github/workflows/ios-public-beta.yml', 'utf8').split('  android-internal:')[1];
  assert.match(workflow, /needs: validate/);
  assert.match(workflow, /if: vars.ANDROID_INTERNAL_ENABLED == '1'/);
  assert.match(workflow, /environment: google-play-internal/);
  assert.match(workflow, /SFERA_RELEASE_VERSION: '1\.0\.0'/);
  assert.match(workflow, /verify-android-release.mjs/);
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(workflow, /upload-artifact|promote|production|open.testing/);
  const script = readFileSync('scripts/android-internal-release.rb', 'utf8');
  assert.match(script, /update_edit_track\(package, edit.id, 'internal', track\)/);
  assert.ok(script.indexOf("data['state'] = 'upload_attempted'") < script.indexOf('api.upload_edit_bundle'));
  assert.match(script, /remote.sha256.downcase == data\['sha256'\]/);
});
test('Expo Android store configuration uses explicit version/code and rejects E2E', async () => {
  const { buildSync } = await import('esbuild');
  const { runInNewContext } = await import('node:vm');
  const js = buildSync({ entryPoints: ['app.config.ts'], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
  const config = env => {
    const module = { exports: {} };
    runInNewContext(js, { module, exports: module.exports, process: { env } });
    return module.exports.default({ config: {} });
  };
  const env = { SFERA_ANDROID_PLAY_STORE: '1', SFERA_ANDROID_VERSION_CODE: '13', SFERA_RELEASE_VERSION: '1.0.0' };
  const value = config(env);
  assert.equal(value.version, '1.0.0');
  assert.equal(value.android.versionCode, 13);
  assert.equal(value.android.package, 'engineering.brainwaves.sfera');
  assert.equal(value.runtimeVersion.policy, 'fingerprint');
  for (const code of ['', '0', '1\n', '2100000001']) assert.throws(() => config({ ...env, SFERA_ANDROID_VERSION_CODE: code }));
  assert.throws(() => config({ ...env, EXPO_PUBLIC_E2E_MODE: '1' }));
});
