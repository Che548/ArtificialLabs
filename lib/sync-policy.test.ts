import assert from 'node:assert/strict';
import test from 'node:test';

import { mayUseMedicalCloud } from './sync-policy';

test('medical cloud requires authentication and per-device consent', () => {
  assert.equal(
    mayUseMedicalCloud({
      authenticated: true,
      consentedOnDevice: false,
      accountPendingDeletion: false,
    }),
    false,
  );
  assert.equal(
    mayUseMedicalCloud({
      authenticated: true,
      consentedOnDevice: true,
      accountPendingDeletion: false,
    }),
    true,
  );
});

test('pending account deletion disables cloud even with consent', () => {
  assert.equal(
    mayUseMedicalCloud({
      authenticated: true,
      consentedOnDevice: true,
      accountPendingDeletion: true,
    }),
    false,
  );
});
