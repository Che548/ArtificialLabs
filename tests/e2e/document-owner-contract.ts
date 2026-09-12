import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { api, internal } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { DOCUMENT_INTERPRETATION_POLICY_VERSION as policyVersion } from '../../shared/document-interpretation';

async function main() {
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const key = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  assert.equal(url, 'https://artificiallabs-convex.bebra42.ru');
  assert(key);
  const admin = new ConvexHttpClient(url, { logger: false });
  (admin as unknown as { setAdminAuth(value: string): void }).setAdminAuth(key);
  const mutate = admin.mutation.bind(admin) as unknown as (
    fn: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  const created: string[] = [];
  async function denied(work: () => Promise<unknown>, expected: RegExp) {
    try {
      await work();
    } catch (error) {
      assert(expected.test(String(error)), 'Unexpected denial category');
      return;
    }
    throw new Error('Operation unexpectedly allowed');
  }
  try {
    const accounts: { client: ConvexHttpClient; id: Id<'users'> }[] = [];
    for (let i = 0; i < 2; i++) {
      const tag = randomBytes(6).toString('hex');
      const email = `artificiallabs-e2e+${tag}-native@example.test`;
      created.push(email);
      const client = new ConvexHttpClient(url, { logger: false });
      const result = await client.action(api.auth.signIn, {
        provider: 'password',
        params: {
          email,
          password: `Qa1!${randomBytes(24).toString('hex')}`,
          flow: 'signUp',
        },
      });
      assert(result.tokens?.token);
      client.setAuth(result.tokens.token);
      const viewer = await client.query(api.profile.viewer, {});
      await mutate(internal.testing.prepareVerifiedNativeFixture, {
        email,
        userId: viewer.userId,
      });
      accounts.push({ client, id: viewer.userId });
    }
    for (const account of accounts) {
      const status = await account.client.query(
        api.documentInterpretation.status,
        {},
      );
      assert.deepEqual(Object.keys(status).sort(), [
        'accepted',
        'enabled',
        'policyVersion',
      ]);
      assert.deepEqual(status, {
        accepted: false,
        enabled: false,
        policyVersion,
      });
      // Test disabled generation BEFORE consent; a flag race cannot authorize AI.
      await denied(
        () =>
          account.client.action(api.documentInterpretation.generate, {
            requestId: 'synthetic-owner-contract',
            policyVersion,
            text: 'Synthetic contract only. No health data.',
          }),
        /DOCUMENT_SERVICE_DISABLED/,
      );
      await denied(
        () =>
          account.client.mutation(api.documentInterpretation.setConsent, {
            policyVersion,
            accepted: true,
          }),
        /DOCUMENT_SERVICE_DISABLED/,
      );
    }
    await denied(
      () =>
        accounts[0].client.query(
          makeFunctionReference<'query'>('documentInterpretation:status'),
          { userId: accounts[1].id },
        ),
      /extra field|ArgumentValidationError/,
    );
    await denied(
      () =>
        accounts[0].client.action(
          makeFunctionReference<'action'>(
            'documentInterpretationAction:generate',
          ),
          {
            userId: accounts[1].id,
            requestId: 'synthetic-owner-contract',
            policyVersion,
            text: 'Synthetic denied request.',
          },
        ),
      /public function|internal/,
    );
    console.log(
      'Document live contract passed: bounded status, disabled provider/consent, foreign identity rejected and internal action inaccessible.',
    );
  } finally {
    let failed = false;
    for (const email of created) {
      try {
        await mutate(internal.testing.purgeE2EAccount, { email });
      } catch {
        failed = true;
      }
    }
    assert(!failed, 'Exact contract account cleanup requires attention');
    console.log(
      `Exact cleanup of ${created.length} synthetic contract target(s) passed.`,
    );
  }
}
main().catch(() => {
  console.error(
    'Document live contract failed; no credentials or request data logged.',
  );
  process.exitCode = 1;
});
