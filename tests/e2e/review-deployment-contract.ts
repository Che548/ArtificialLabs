import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { internal } from '../../convex/_generated/api';

// Read-only deployment verification. Capture CLI output in memory and emit only
// aggregate success: no identities, password hashes, tokens or audit reasons.
function cli(args: string[]) {
  return execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../node_modules/convex/bin/main.js', import.meta.url),
      ),
      ...args,
    ],
    {
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}
async function main() {
  assert.equal(
    process.env.CONVEX_SELF_HOSTED_URL,
    'https://artificiallabs-convex.bebra42.ru',
  );
  assert(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY);
  for (const flag of [
    'EMAIL_VERIFICATION_REQUIRED',
    'EMAIL_VERIFICATION_ALLOW_LEGACY',
  ]) {
    assert.equal(
      cli(['env', 'get', flag]).trim(),
      '1',
      'Unexpected verification rollout flag',
    );
  }
  const exceptions = JSON.parse(
    cli(['data', 'reviewLoginExceptions', '--limit', '3', '--format', 'json']),
  );
  // Fail closed if there are unexpected entries rather than scanning users.
  assert.equal(
    exceptions.length,
    2,
    'Review directory changed; manual inspection required',
  );
  assert.deepEqual(exceptions.map((row: any) => row.store).sort(), [
    'apple',
    'google',
  ]);
  const audits = JSON.parse(
    cli(['data', 'reviewLoginAudit', '--limit', '20', '--format', 'json']),
  );
  const client = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL!, {
    logger: false,
  });
  (client as unknown as { setAdminAuth(key: string): void }).setAdminAuth(
    process.env.CONVEX_SELF_HOSTED_ADMIN_KEY!,
  );
  const query = client.query.bind(client) as unknown as (
    fn: unknown,
    args: unknown,
  ) => Promise<any>;
  for (const row of exceptions) {
    assert.equal(row.active, true);
    const state = await query(internal.emailVerification.loginState, {
      userId: row.userId,
    });
    assert.equal(state.user._id, row.userId);
    assert.equal(state.user.email, row.email, 'Review email binding changed');
    assert.equal(state.required, false, 'Review login is unexpectedly gated');
    assert(
      audits.some(
        (audit: any) =>
          audit.userId === row.userId &&
          audit.store === row.store &&
          audit.operation === 'grant',
      ),
      'Review grant audit missing',
    );
  }
  console.log(
    'Rollout flags match; two active, email-bound, audited store review exceptions verified. No sign-in or writes performed.',
  );
}
main().catch(() => {
  console.error(
    'Review deployment contract failed; private details suppressed.',
  );
  process.exitCode = 1;
});
