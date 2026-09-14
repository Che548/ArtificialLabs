/** Manual-only. Synthetic fixture + disposable account; no OTP, mail or real documents. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { api, internal } from '../../convex/_generated/api';
import { OCR_MODEL, OCR_POLICY_VERSION } from '../../shared/document-ocr';

async function main() {
  const url = process.env.CONVEX_SELF_HOSTED_URL;
  const site = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
  const key = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;
  assert.equal(url, 'https://artificiallabs-convex.bebra42.ru');
  assert.equal(site, 'https://artificiallabs-convex-site.bebra42.ru');
  assert(key);
  const image = readFileSync('output/e2e/ocr/native-synthetic.jpg').toString(
    'base64',
  );
  const email = `artificiallabs-e2e+${randomUUID()}-native@example.test`;
  const client = new ConvexHttpClient(url, { logger: false });
  const admin = new ConvexHttpClient(url, { logger: false });
  (admin as unknown as { setAdminAuth(token: string): void }).setAdminAuth(key);
  const mutation = admin.mutation.bind(admin) as unknown as (
    ref: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  let userId: string | undefined;
  try {
    const auth = await client.action(api.auth.signIn, {
      provider: 'password',
      params: { email, password: `Qa1!${randomUUID()}`, flow: 'signUp' },
    });
    assert(auth.tokens?.token);
    client.setAuth(auth.tokens.token);
    const viewer = await client.query(api.profile.viewer, {});
    userId = viewer.userId;
    await client.mutation(api.profile.save, {
      displayName: 'Synthetic OCR',
      goal: 'planning',
      onboardingCompleted: true,
      consentToCloudSyncAt: Date.now(),
      updatedAt: Date.now(),
    });
    const status = await client.query(api.documentOcr.status, {});
    assert(status.enabled);
    const request = {
      jobId: `job_${randomUUID()}`,
      requestId: `request_${randomUUID()}`,
      page: 1,
      pages: 1,
      policyVersion: OCR_POLICY_VERSION,
      image,
    };
    const post = async (token?: string) => {
      const r = await fetch(`${site}/document-ocr/page`, {
        method: 'POST',
        signal: AbortSignal.timeout(110000),
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
      });
      return r.json();
    };
    assert.equal((await post()).ok, false);
    assert.equal((await post(auth.tokens.token)).code, 'OCR_CONSENT_REQUIRED');
    await client.mutation(api.documentOcr.setConsent, {
      accepted: true,
      policyVersion: OCR_POLICY_VERSION,
    });
    const result = await post(auth.tokens.token);
    assert.equal(result.ok, true, result.code);
    assert.equal(result.model, OCR_MODEL);
    assert(result.result.text.includes('1,25'));
    assert(
      result.result.rows.some((row: { value: string }) => row.value === '1,25'),
    );
    assert.equal((await post(auth.tokens.token)).code, 'OCR_ALREADY_SUBMITTED');
    for (const fixture of ['variants', 'blank']) {
      request.jobId = `job_${randomUUID()}`;
      request.requestId = `request_${randomUUID()}`;
      request.image = readFileSync(
        `output/e2e/ocr/native-${fixture}.jpg`,
      ).toString('base64');
      const page = await post(auth.tokens.token);
      assert.equal(page.ok, true, page.code);
      if (fixture === 'blank') {
        assert.equal(page.result.text.trim(), '');
        assert.equal(page.result.rows.length, 0);
        assert.equal(page.result.dates.length, 0);
      } else {
        const values = page.result.rows.map(
          (row: { value: string }) => row.value,
        );
        for (const value of ['negative', 'отрицательно', '<0,10', '≥2.50'])
          assert(values.includes(value));
        assert(page.result.dates.includes('2026-09-11'));
        assert(page.result.dates.includes('2026-09-12'));
      }
    }
    await client.mutation(api.documentOcr.setConsent, {
      accepted: false,
      policyVersion: OCR_POLICY_VERSION,
    });
    assert.equal((await post(auth.tokens.token)).code, 'OCR_CONSENT_REQUIRED');
    console.log(
      'Live Qwen OCR: exact model, bilingual/qualitative/inequality values, mixed dates, blank page, auth/consent and duplicates passed.',
    );
  } finally {
    if (userId) await mutation(internal.documentOcr.purgeForUser, { userId });
    await mutation(internal.testing.purgeE2EAccount, { email });
    console.log('Exact disposable OCR account and metadata cleanup completed.');
  }
}
void main().catch(() => {
  console.error('Live OCR verification failed (details withheld).');
  process.exitCode = 1;
});
