import assert from 'node:assert/strict';

import { ConvexHttpClient } from 'convex/browser';

import { api } from '../../convex/_generated/api';

const backendUrl =
  process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL;
const phone = process.env.SMS_E2E_PHONE;

async function main() {
  if (!backendUrl) throw new Error('CONVEX_SELF_HOSTED_URL is required');
  if (!phone) throw new Error('SMS_E2E_PHONE is required');

  const client = new ConvexHttpClient(backendUrl);
  const status = await client.action(api.smsAuth.status, { phone });
  assert(status.allowed, status.reason ?? 'SMS delivery is not currently allowed');
  const result = await client.action(api.auth.signIn, {
    provider: 'phone',
    params: { phone },
  });
  assert.equal(result.started, true);
  console.log('Live SMS gateway accepted the protected delivery request.');
}

void main();
