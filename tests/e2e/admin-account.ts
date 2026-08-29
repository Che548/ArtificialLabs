import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { ConvexHttpClient } from 'convex/browser';

import { api, internal } from '../../convex/_generated/api';

const command = process.argv[2];
const backendUrl =
  process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
const statePath = 'output/e2e/admin-account.json';

if (!backendUrl) throw new Error('CONVEX_SELF_HOSTED_URL is required');
if (!adminKey) throw new Error('CONVEX_SELF_HOSTED_ADMIN_KEY is required');

type State = { email: string; password: string };

function adminClient() {
  const client = new ConvexHttpClient(backendUrl!);
  (client as unknown as { setAdminAuth: (token: string) => void }).setAdminAuth(
    adminKey!,
  );
  return client;
}

async function internalMutation(
  reference: unknown,
  args: Record<string, unknown>,
) {
  const client = adminClient();
  const call = client.mutation.bind(client) as unknown as (
    reference: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  return await call(reference, args);
}

async function setup() {
  const tag = randomUUID().replaceAll('-', '').slice(0, 16);
  const state: State = {
    email: `artificiallabs-e2e+${tag}@example.test`,
    password: `Admin!${tag}Aa1`,
  };
  const result = await new ConvexHttpClient(backendUrl!).action(
    api.auth.signIn,
    {
      provider: 'password',
      params: { ...state, flow: 'signUp' },
    },
  );
  assert(result.tokens?.token, 'E2E admin account was not created');
  await internalMutation(internal.testing.grantE2EAdmin, {
    email: state.email,
  });
  await mkdir('output/e2e', { recursive: true });
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
  await chmod(statePath, 0o600);
  console.log('Disposable E2E admin is ready.');
}

async function cleanup() {
  const state = JSON.parse(await readFile(statePath, 'utf8')) as State;
  await internalMutation(internal.testing.purgeE2EAccount, {
    email: state.email,
  });
  await unlink(statePath);
  console.log('Disposable E2E admin removed.');
}

async function main() {
  if (command === 'setup') await setup();
  else if (command === 'cleanup') await cleanup();
  else throw new Error('Expected setup or cleanup');
}

void main();
