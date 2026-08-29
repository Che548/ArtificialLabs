import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authScreenUrl = new URL(
  '../../components/AuthScreen.tsx',
  import.meta.url,
);
const authBackendUrl = new URL('../../convex/auth.ts', import.meta.url);
const recoveryBackendUrl = new URL(
  '../../convex/passwordRecovery.ts',
  import.meta.url,
);

test('native auth uses phone plus password and has no OTP login call', async () => {
  const source = await readFile(authScreenUrl, 'utf8');
  assert.match(source, /signIn\(channel === 'phone' \? 'phone-password'/);
  assert.doesNotMatch(source, /signIn\(['"]phone['"]/);
  assert.match(source, /Забыли пароль\?/);
  assert.match(source, /Platform\.OS !== 'web'/);
});

test('backend keeps phone OTP login behind an explicit migration flag', async () => {
  const source = await readFile(authBackendUrl, 'utf8');
  assert.match(source, /process\.env\.SMS_LOGIN_ENABLED !== '1'/);
  assert.match(source, /SMS_LOGIN_DISABLED/);
  assert.match(source, /id: 'phone-password'/);
});

test('unknown phones are rejected before the SMS gateway call', async () => {
  const source = await readFile(recoveryBackendUrl, 'utf8');
  const rejection = source.indexOf("channel === 'sms' && !target");
  const gatewayCall = source.indexOf('await sendSmsCode(');
  assert.ok(rejection >= 0);
  assert.ok(gatewayCall > rejection);
  assert.match(source, /RECOVERY_PHONE_ACCOUNT_NOT_FOUND/);
});
