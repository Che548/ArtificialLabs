import { describe, expect, it } from 'vitest';

import {
  evaluateSmsLimit,
  generateSixDigitCode,
  normalizeClientIp,
  normalizeRussianPhone,
} from '../../convex/lib/sms';

describe('SMS auth primitives', () => {
  it.each([
    ['89991234567', '+79991234567'],
    ['79991234567', '+79991234567'],
    ['+7 (999) 123-45-67', '+79991234567'],
  ])('normalizes Russian numbers', (input, expected) => {
    expect(normalizeRussianPhone(input)).toBe(expected);
  });

  it('rejects non-Russian or malformed numbers', () => {
    expect(() => normalizeRussianPhone('+14155552671')).toThrow(
      'SMS_PHONE_INVALID',
    );
    expect(() => normalizeRussianPhone('123')).toThrow('SMS_PHONE_INVALID');
  });

  it('keeps IPv4 and truncates IPv6 to /64', () => {
    expect(normalizeClientIp('192.0.2.4')).toBe('192.0.2.4');
    expect(normalizeClientIp('2001:db8:abcd:12::7')).toBe(
      '2001:db8:abcd:12::/64',
    );
    expect(normalizeClientIp('::ffff:192.0.2.4')).toBe('192.0.2.4');
    expect(() => normalizeClientIp(null)).toThrow('SMS_IP_UNAVAILABLE');
  });

  it('applies five and thirty minute cooldowns and a rolling day limit', () => {
    const now = 1_800_000_000_000;
    expect(evaluateSmsLimit([], [], now)).toMatchObject({
      allowed: true,
      remaining: 3,
    });
    expect(evaluateSmsLimit([now - 60_000], [], now)).toMatchObject({
      allowed: false,
      reason: 'SMS_COOLDOWN',
      retryAt: now + 4 * 60_000,
    });
    expect(
      evaluateSmsLimit([now - 31 * 60_000], [now - 31 * 60_000], now),
    ).toMatchObject({
      allowed: true,
      remaining: 2,
    });
    expect(
      evaluateSmsLimit(
        [now - 40 * 60_000, now - 10 * 60_000],
        [now - 40 * 60_000, now - 10 * 60_000],
        now,
      ),
    ).toMatchObject({ allowed: false, reason: 'SMS_COOLDOWN' });
    expect(
      evaluateSmsLimit(
        [now - 23 * 60 * 60_000, now - 2 * 60 * 60_000, now - 60 * 60_000],
        [],
        now,
      ),
    ).toMatchObject({
      allowed: false,
      reason: 'SMS_RATE_LIMITED',
      remaining: 0,
    });
  });

  it('generates a six digit decimal OTP', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(generateSixDigitCode()).toMatch(/^\d{6}$/);
    }
  });
});
