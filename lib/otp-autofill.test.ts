import assert from 'node:assert/strict';
import test from 'node:test';

import { otpAutofillProps } from './otp-autofill';

test('uses the Android SMS OTP autofill hint', () => {
  assert.deepEqual(otpAutofillProps('android'), {
    autoComplete: 'sms-otp',
    importantForAutofill: 'yes',
  });
});

test('uses the native iOS one-time-code content type', () => {
  assert.deepEqual(otpAutofillProps('ios'), {
    textContentType: 'oneTimeCode',
  });
});

test('keeps the standard autocomplete hint on web', () => {
  assert.deepEqual(otpAutofillProps('web'), {
    autoComplete: 'one-time-code',
  });
});
