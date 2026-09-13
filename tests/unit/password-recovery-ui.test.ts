import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

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

// Execute the actual component handlers with controlled promises, without a
// React re-render between taps. This reproduces the state-only locking gap.
async function recoveryHarness() {
  const source = await readFile(authScreenUrl, 'utf8');
  const ast = ts.createSourceFile('AuthScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers: Record<string, string> = {};
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
        ['requestRecoveryCode', 'finishRecovery'].includes(node.name.text)) {
      handlers[node.name.text] = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(Object.keys(handlers).length, 2);
  const calls = { request: 0, complete: 0, signIn: 0, authenticated: 0 };
  const loginLock = { current: false };
  const gate = () => {
    let resolve!: (value?: any) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const request = gate(), complete = gate(), login = gate();
  const busy: boolean[] = [];
  const noop = () => {};
  const context = {
    loginLock, setSubmitting: (value: boolean) => busy.push(value), setError: noop,
    setRecoveryCode: noop, channel: 'email', normalizedIdentifier: 'qa@example.test',
    Platform: { OS: 'ios' }, setRecoveryChallengeId: noop, setRecoveryExpiresAt: noop,
    setPhoneRetryAt: noop, setRecoveryStep: noop, recoveryError: () => 'safe error',
    console: { error: noop }, recoveryChallengeId: 'synthetic-challenge',
    recoveryCode: '123456', password: 'synthetic-password', FormData,
    getRandomBytes: (length: number) => new Uint8Array(length), cancelRecovery: noop,
    parseLoginEmailChallenge: () => null, setEmailChallenge: noop,
    setPassword: noop, setPasswordConfirmation: noop, setFlow: noop,
    onAuthenticated: () => { calls.authenticated++; },
    requestPasswordRecovery: () => { calls.request++; return request.promise; },
    completePasswordRecovery: () => { calls.complete++; return complete.promise; },
    signIn: () => { calls.signIn++; return login.promise; },
  };
  const js = ts.transpileModule(
    `return { requestRecoveryCode: ${handlers.requestRecoveryCode}, finishRecovery: ${handlers.finishRecovery} };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const bound = new Function(...Object.keys(context), js)(...Object.values(context)) as {
    requestRecoveryCode: () => Promise<void>; finishRecovery: () => Promise<void>;
  };
  return { ...bound, calls, loginLock, request, complete, login, busy };
}

test('request/resend and completion share a synchronous lock before any re-render', async () => {
  const h = await recoveryHarness();
  const first = h.requestRecoveryCode();
  await h.requestRecoveryCode();
  await h.finishRecovery();
  assert.deepEqual(h.calls, { request: 1, complete: 0, signIn: 0, authenticated: 0 });
  assert.equal(h.loginLock.current, true);
  h.request.resolve({ challengeId: 'synthetic', expiresAt: 1, retryAt: 1 });
  await first;
  assert.equal(h.loginLock.current, false);
  assert.deepEqual(h.busy, [true, false]);
});

test('completion keeps the lock through automatic sign-in and authenticates once', async () => {
  const h = await recoveryHarness();
  const first = h.finishRecovery();
  await h.finishRecovery();
  assert.equal(h.calls.complete, 1);
  assert.equal(h.calls.signIn, 0);
  h.complete.resolve({ changed: true });
  await Promise.resolve();
  assert.equal(h.calls.signIn, 1);
  await h.requestRecoveryCode();
  await h.finishRecovery();
  assert.equal(h.calls.request, 0);
  assert.equal(h.calls.complete, 1);
  h.login.resolve();
  await first;
  assert.equal(h.calls.authenticated, 1);
  assert.equal(h.loginLock.current, false);
});

for (const stage of ['request', 'complete', 'login'] as const) {
  test(`releases the lock after ${stage} failure`, async () => {
    const h = await recoveryHarness();
    const first = stage === 'request' ? h.requestRecoveryCode() : h.finishRecovery();
    if (stage === 'login') { h.complete.resolve(); await Promise.resolve(); }
    h[stage].reject(new Error('synthetic failure'));
    await first;
    assert.equal(h.loginLock.current, false);
    assert.equal(h.calls.authenticated, 0);
    assert.deepEqual(h.busy, [true, false]);
    // A later intentional attempt is not permanently blocked.
    if (stage === 'request') await h.requestRecoveryCode();
    else await h.finishRecovery();
    assert.equal(stage === 'request' ? h.calls.request : h.calls.complete, 2);
  });
}
