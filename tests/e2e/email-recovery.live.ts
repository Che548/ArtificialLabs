import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { ConvexHttpClient } from 'convex/browser';

import { api, internal } from '../../convex/_generated/api';

const command = process.argv[2];
const backendUrl =
  process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
const statePath = 'output/e2e/email-recovery-state.json';

if (!backendUrl) throw new Error('CONVEX_SELF_HOSTED_URL is required');

type State = {
  challengeId: string;
  email: string;
  newPassword: string;
  oldPassword: string;
};

function client() {
  return new ConvexHttpClient(backendUrl!);
}

async function prepare() {
  const tag = randomUUID().replaceAll('-', '').slice(0, 16);
  const email = `2taras2006+artificiallabs-e2e-${tag}@gmail.com`;
  const oldPassword = `Old!${tag}Aa1`;
  const newPassword = `New!${tag}Bb2`;
  const result = await client().action(api.auth.signIn, {
    provider: 'password',
    params: { email, password: oldPassword, flow: 'signUp' },
  });
  assert(result.tokens?.token, 'Disposable recovery account was not created');
  const recovery = await client().action(api.passwordRecovery.request, {
    identifier: email,
  });
  assert.equal(recovery.channel, 'email');
  await mkdir('output/e2e', { recursive: true });
  await writeFile(
    statePath,
    JSON.stringify({
      challengeId: recovery.challengeId,
      email,
      newPassword,
      oldPassword,
    } satisfies State),
    { mode: 0o600 },
  );
  await chmod(statePath, 0o600);
  console.log(`Recovery email requested for disposable alias ${email}`);
}

async function complete() {
  const state = JSON.parse(await readFile(statePath, 'utf8')) as State;
  const code = process.env.E2E_RECOVERY_CODE?.trim();
  assert.match(code ?? '', /^\d{6}$/, 'E2E_RECOVERY_CODE must be six digits');
  const result = await client().action(api.passwordRecovery.complete, {
    challengeId: state.challengeId as never,
    code: code!,
    newPassword: state.newPassword,
  });
  assert.equal(result.changed, true);
  await verifyChangedPassword(state);
}

async function verifyChangedPassword(state: State) {
  await assert.rejects(
    client().action(api.auth.signIn, {
      provider: 'password',
      params: {
        email: state.email,
        password: state.oldPassword,
        flow: 'signIn',
      },
    }),
    /InvalidSecret|Invalid credentials/,
  );
  const newLogin = await client().action(api.auth.signIn, {
    provider: 'password',
    params: {
      email: state.email,
      password: state.newPassword,
      flow: 'signIn',
    },
  });
  assert(newLogin.tokens?.token, 'New password cannot sign in');
  console.log('Live email recovery completed and new password authenticated.');
}

async function cleanup() {
  assert(adminKey, 'CONVEX_SELF_HOSTED_ADMIN_KEY is required');
  const state = JSON.parse(await readFile(statePath, 'utf8')) as State;
  const admin = client();
  (admin as unknown as { setAdminAuth: (token: string) => void }).setAdminAuth(
    adminKey,
  );
  const adminMutation = admin.mutation.bind(admin) as unknown as (
    reference: unknown,
    args: { email: string },
  ) => Promise<unknown>;
  await adminMutation(internal.testing.purgeE2EAccount, { email: state.email });
  await unlink(statePath);
  console.log('Disposable email recovery account removed.');
}

async function main() {
  if (command === 'prepare') await prepare();
  else if (command === 'complete') await complete();
  else if (command === 'verify')
    await verifyChangedPassword(
      JSON.parse(await readFile(statePath, 'utf8')) as State,
    );
  else if (command === 'cleanup') await cleanup();
  else throw new Error('Expected prepare, complete, verify, or cleanup');
}

void main();
