export const SMS_CODE_TTL_SECONDS = 5 * 60;
export const SMS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SMS_RETENTION_MS = 48 * 60 * 60 * 1000;
export const SMS_MAX_SENDS = 3;

export type SmsLimitState = {
  allowed: boolean;
  remaining: number;
  retryAt?: number;
  reason?: 'SMS_COOLDOWN' | 'SMS_RATE_LIMITED';
};

export function normalizeRussianPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const national =
    digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))
      ? digits.slice(1)
      : digits;
  if (national.length !== 10 || !national.startsWith('9')) {
    throw new Error('SMS_PHONE_INVALID');
  }
  return `+7${national}`;
}

function parseIpv4(value: string): string | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) => Number(part));
  if (
    bytes.some(
      (byte, index) =>
        !Number.isInteger(byte) ||
        byte < 0 ||
        byte > 255 ||
        String(byte) !== parts[index],
    )
  ) {
    return null;
  }
  return bytes.join('.');
}

function expandIpv6(value: string): number[] | null {
  const mappedIndex = value.lastIndexOf(':');
  if (value.includes('.') && mappedIndex >= 0) {
    const ipv4 = parseIpv4(value.slice(mappedIndex + 1));
    if (!ipv4) return null;
    const bytes = ipv4.split('.').map(Number);
    value = `${value.slice(0, mappedIndex)}:${(
      (bytes[0] << 8) |
      bytes[1]
    ).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = value.toLowerCase().split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
  ) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

export function normalizeClientIp(value: string | null): string {
  if (!value) throw new Error('SMS_IP_UNAVAILABLE');
  const unwrapped = value.trim().replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(unwrapped);
  if (ipv4) return ipv4;
  const mapped = unwrapped.match(/^(?:::)?ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) {
    const mappedIpv4 = parseIpv4(mapped[1]);
    if (mappedIpv4) return mappedIpv4;
  }
  const ipv6 = expandIpv6(unwrapped);
  if (!ipv6) throw new Error('SMS_IP_UNAVAILABLE');
  return `${ipv6
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}

export function evaluateSmsLimit(
  phoneAttempts: number[],
  ipAttempts: number[],
  now: number,
): SmsLimitState {
  const windowStart = now - SMS_WINDOW_MS;
  const phone = phoneAttempts.filter((at) => at > windowStart).sort();
  const ip = ipAttempts.filter((at) => at > windowStart).sort();
  const count = Math.max(phone.length, ip.length);
  const remaining = Math.max(
    0,
    Math.min(SMS_MAX_SENDS - phone.length, SMS_MAX_SENDS - ip.length),
  );
  if (phone.length >= SMS_MAX_SENDS || ip.length >= SMS_MAX_SENDS) {
    const retryAt = Math.max(phone[0] ?? 0, ip[0] ?? 0) + SMS_WINDOW_MS;
    return { allowed: false, remaining, retryAt, reason: 'SMS_RATE_LIMITED' };
  }
  const delay = count === 1 ? 5 * 60 * 1000 : count === 2 ? 30 * 60 * 1000 : 0;
  const latest = Math.max(phone.at(-1) ?? 0, ip.at(-1) ?? 0);
  if (delay > 0 && latest + delay > now) {
    return {
      allowed: false,
      remaining,
      retryAt: latest + delay,
      reason: 'SMS_COOLDOWN',
    };
  }
  return { allowed: true, remaining };
}

export async function hmacSha256(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function generateSixDigitCode() {
  const rejectionLimit = 0x1_0000_0000 - (0x1_0000_0000 % 1_000_000);
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample);
  while (sample[0] >= rejectionLimit);
  return String(sample[0] % 1_000_000).padStart(6, '0');
}
