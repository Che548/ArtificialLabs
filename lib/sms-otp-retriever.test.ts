import assert from 'node:assert/strict';
import test from 'node:test';

import { extractSixDigitOtp } from './sms-otp-parser';

test('extracts a six-digit code without exposing the rest of the SMS', () => {
  assert.equal(
    extractSixDigitOtp(
      '<#> Sfera code: 123456\n@artificiallabs.bebra42.ru #123456 Y4QO6pOIVxj',
    ),
    '123456',
  );
});

test('ignores messages without an isolated six-digit code', () => {
  assert.equal(extractSixDigitOtp('Reference 1234567'), undefined);
  assert.equal(extractSixDigitOtp('No verification code'), undefined);
});
