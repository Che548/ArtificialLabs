import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('beta delivery handles Apple ordering and draft receipt retries', () => {
  execFileSync('ruby', ['scripts/ios-beta-delivery.test.rb'], { stdio: 'pipe' });
});

const workflow = readFileSync('.github/workflows/ios-public-beta.yml', 'utf8');
const lanes = readFileSync('fastlane/Fastfile', 'utf8');
test('release upload is gated by complete verification, never PR or main push', () => {
  assert.match(workflow, /tags: \['v\*'\]/);
  assert.doesNotMatch(workflow, /pull_request|branches:|continue-on-error/);
  assert.match(workflow, /needs: validate/);
  assert.match(workflow, /environment: ios-public-beta/);
  for (const command of ['npm test', 'npm run verify', 'npm run test:strip-cv',
    'npm run test:admin-ui', 'npm run test:contacts:ui', 'npm run test:document-ui', 'npm run test:chat-feedback:web']) {
    assert.ok(workflow.slice(0, workflow.indexOf('  testflight:')).includes(command));
  }
  assert.doesNotMatch(workflow, /ota-release|promote-production|e2e:sms|supply|deliver_to_app_store/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.ok(workflow.indexOf('node scripts/prepare-document-ocr.mjs') < workflow.indexOf('node scripts/package-document-ocr-ios.mjs'));
  assert.ok(workflow.indexOf('node scripts/package-document-ocr-ios.mjs') < workflow.indexOf('npx expo prebuild'));
});
test('no upload before current tag check and IPA verification', () => {
  const finalCheck = workflow.lastIndexOf('run: node scripts/ios-release-tag.mjs');
  assert.ok(finalCheck < workflow.indexOf('run: bundle exec fastlane ios deliver_beta'));
  const delivery = lanes.slice(lanes.indexOf('lane :deliver_beta'));
  assert.ok(delivery.indexOf('verify-ios-beta-archive.mjs') < delivery.indexOf('upload_to_testflight'));
  assert.ok(delivery.indexOf("data['state'] = 'upload_attempted'") < delivery.indexOf('upload_to_testflight'));
  assert.match(delivery, /Previous upload is unresolved/);
  assert.match(lanes, /Build exists without this workflow upload receipt/);
  assert.match(delivery, /reject_unrecorded_build\(build, data\)/);
  assert.match(delivery, /distribute_external: true/);
  assert.match(delivery, /notify_external_testers: true/);
  assert.doesNotMatch(workflow, /upload-artifact/);
});
test('signing is fail-closed, separately cleaned, version not rewritten by export', () => {
  assert.match(workflow, /IOS_BETA_ENABLED/);
  for (const key of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_KEY_P8_BASE64',
    'IOS_DISTRIBUTION_P12_BASE64', 'IOS_DISTRIBUTION_P12_PASSWORD', 'IOS_PROFILE_BASE64']) {
    assert.ok(workflow.includes(`secrets.${key}`));
  }
  assert.match(lanes, /manageAppVersionAndBuildNumber: false/);
  assert.match(lanes, /ensure\s+begin\s+delete_keychain/);
  assert.match(lanes, /Refusing to overwrite a different pre-existing profile/);
  assert.ok(lanes.indexOf('FileUtils.cp(profile, profile_destination)') < lanes.indexOf('installed_profile = profile_destination'));
  assert.match(lanes, /public_link_enabled/);
  assert.doesNotMatch(lanes, /create_beta_group|submit_for_review: true/);
});
