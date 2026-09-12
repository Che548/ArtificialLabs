import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api, internal } from '../../convex/_generated/api';
import { assertNativeQaDeployment } from '../../scripts/native-qa-config.mjs';

let step = 'environment';

async function main() {
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const key = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  assert.equal(url, 'https://artificiallabs-convex.bebra42.ru');
  assert(
    key &&
      password &&
      email &&
      /^artificiallabs-e2e\+[a-f0-9]{12}-native@example\.test$/.test(email),
  );
  // Read-only capability check BEFORE signup: a concurrent deployment must not
  // turn a missing server function into an authentication or emulator failure.
  step = 'deployment';
  const spec = execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../node_modules/convex/bin/main.js', import.meta.url),
      ),
      'function-spec',
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assertNativeQaDeployment(JSON.parse(spec));
  const client = new ConvexHttpClient(url, { logger: false });
  // Explicit legacy fixture creation; no ticket, email delivery or real mailbox.
  // The actual native test signs in with normal current-client semantics.
  step = 'create';
  const result = await client.action(api.auth.signIn, {
    provider: 'password',
    params: { email, password, flow: 'signUp' },
  });
  assert(result.tokens?.token);
  client.setAuth(result.tokens.token);
  step = 'viewer';
  const viewer = await client.query(api.profile.viewer, {});
  assert.equal(viewer.email, email);
  const admin = new ConvexHttpClient(url, { logger: false });
  (admin as unknown as { setAdminAuth(key: string): void }).setAdminAuth(key);
  const mutate = admin.mutation.bind(admin) as unknown as (
    fn: unknown,
    args: { email: string; userId: typeof viewer.userId },
  ) => Promise<unknown>;
  step = 'prepare';
  await mutate(internal.testing.prepareVerifiedNativeFixture, {
    email,
    userId: viewer.userId,
  });
  console.log(
    'Exact synthetic native login fixture prepared (not email delivery E2E).',
  );
}
main().catch((error) => {
  const known =
    [
      'NATIVE_QA_DEPLOYMENT_MISMATCH',
      'UNAUTHENTICATED',
      'EMAIL_VERIFICATION_REQUIRED',
      'NATIVE_FIXTURE_EMAIL_REQUIRED',
      'FRESH_NATIVE_FIXTURE_REQUIRED',
      'EMPTY_NATIVE_FIXTURE_REQUIRED',
      'Too many',
      'Rate limit',
      'Could not find',
      'fetch failed',
      'ArgumentValidationError',
    ].find((code) => String(error).includes(code)) ?? 'unclassified';
  console.error(
    `Synthetic native fixture preparation failed at ${step} (${known}); exact cleanup is required.`,
  );
  process.exitCode = 1;
});
