export type ResendQuotaSnapshot = {
  dailyUsed: number;
  dailyLimit: number;
  dailySent?: number;
  dailyReceived?: number;
  dailyResetsAt?: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlySent?: number;
  monthlyReceived?: number;
  monthlyResetsAt?: number;
};

export type ResendUsageResult =
  | { snapshot: ResendQuotaSnapshot; errorCode?: never }
  | { snapshot?: never; errorCode: string };

const RESEND_TIMEOUT_MS = 12_000;

const safeCount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;

const safeTimestamp = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

export function parseResendUsage(
  payload: unknown,
): ResendQuotaSnapshot | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const emails = (payload as { emails?: unknown }).emails;
  if (!emails || typeof emails !== 'object') return undefined;
  const daily = (emails as { daily?: unknown }).daily;
  const monthly = (emails as { monthly?: unknown }).monthly;
  if (
    !daily ||
    typeof daily !== 'object' ||
    !monthly ||
    typeof monthly !== 'object'
  ) {
    return undefined;
  }
  const dailyRecord = daily as Record<string, unknown>;
  const monthlyRecord = monthly as Record<string, unknown>;
  const dailyUsed = safeCount(dailyRecord.used);
  const dailyLimit = safeCount(dailyRecord.limit);
  const monthlyUsed = safeCount(monthlyRecord.used);
  const monthlyLimit = safeCount(monthlyRecord.limit);
  if (
    dailyUsed === undefined ||
    dailyLimit === undefined ||
    monthlyUsed === undefined ||
    monthlyLimit === undefined ||
    dailyLimit === 0 ||
    monthlyLimit === 0
  ) {
    return undefined;
  }
  return {
    dailyUsed,
    dailyLimit,
    dailySent: safeCount(dailyRecord.sent),
    dailyReceived: safeCount(dailyRecord.received),
    dailyResetsAt: safeTimestamp(dailyRecord.resets_at),
    monthlyUsed,
    monthlyLimit,
    monthlySent: safeCount(monthlyRecord.sent),
    monthlyReceived: safeCount(monthlyRecord.received),
    monthlyResetsAt: safeTimestamp(monthlyRecord.resets_at),
  };
}

export function parseResendQuotaHeader(value: string | null) {
  const match = value?.match(/^\s*(\d+)(?:\s*\/\s*(\d+))?\s*$/);
  if (!match) return {};
  const used = Number(match[1]);
  const limit = match[2] ? Number(match[2]) : undefined;
  return {
    used: Number.isSafeInteger(used) ? used : undefined,
    limit:
      limit !== undefined && Number.isSafeInteger(limit) ? limit : undefined,
  };
}

export async function retrieveResendUsage(
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<ResendUsageResult> {
  if (!apiKey) return { errorCode: 'RESEND_NOT_CONFIGURED' };
  try {
    const response = await fetcher('https://api.resend.com/usage', {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'user-agent': 'ArtificialLabs-Convex/1.0',
      },
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { errorCode: 'RESEND_USAGE_FORBIDDEN' };
      }
      if (response.status === 429) {
        return { errorCode: 'RESEND_RATE_LIMITED' };
      }
      return { errorCode: 'RESEND_USAGE_UNAVAILABLE' };
    }
    const snapshot = parseResendUsage(await response.json().catch(() => null));
    return snapshot
      ? { snapshot }
      : { errorCode: 'RESEND_USAGE_INVALID_RESPONSE' };
  } catch (error) {
    return {
      errorCode:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'RESEND_USAGE_TIMEOUT'
          : 'RESEND_USAGE_UNAVAILABLE',
    };
  }
}
