import assert from 'node:assert/strict';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

const url = process.env.CONVEX_SELF_HOSTED_URL;
if (url !== 'https://artificiallabs-convex.bebra42.ru') throw new Error('Use the approved E2E backend');
const guest = new ConvexHttpClient(url, { logger: false });
async function denied(work: () => Promise<unknown>) {
  try { await work(); } catch (error) {
    assert(String(error).includes('UNAUTHENTICATED'), 'Expected auth denial, not missing function or provider failure');
    return;
  }
  throw new Error('Guest operation was unexpectedly allowed');
}
async function main() {
  await denied(() => guest.query(api.documentInterpretation.status, {}));
  await denied(() => guest.mutation(api.documentInterpretation.setConsent, { policyVersion: 'guest-test', accepted: true }));
  await denied(() => guest.action(api.documentInterpretation.generate, { requestId: 'synthetic-guest-contract', policyVersion: 'guest-test', text: 'Synthetic guest request; no health data.' }));
  console.log('Document guest contract: 3/3 denied before any provider request.');
}
main().catch(() => { console.error('Document guest contract failed; no request data logged.'); process.exitCode = 1; });
