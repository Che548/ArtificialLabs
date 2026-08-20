export const AI_CHAT_CONSENT_PROVIDER = 'yandex-ai-studio' as const;
export const AI_CHAT_CONSENT_POLICY_VERSION =
  '2026-08-20-yandex-ai-studio-v1' as const;

export const AI_CHAT_MAX_MESSAGES = 20;
export const AI_CHAT_MAX_TRANSCRIPT_CHARS = 24_000;
export const AI_CHAT_MAX_MESSAGE_CHARS = 8_000;
export const AI_CHAT_MAX_REQUEST_ID_CHARS = 80;

export const AI_CHAT_RATE_LIMITS = {
  perUser: { rate: 5, period: 60_000, capacity: 2 },
  global: { rate: 60, period: 60_000, capacity: 8 },
} as const;

export type AiChatFailureCode =
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'CONTENT_FILTERED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'FEATURE_DISABLED';

export type AiChatGenerateResult =
  | {
      ok: true;
      reply: string;
      provider: 'yandex-ai-studio';
      model: string;
      responseId?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      durationMs: number;
      truncated: boolean;
    }
  | {
      ok: false;
      code: AiChatFailureCode;
      retryAfterMs?: number;
    };

export function isAiChatFeatureEnabled() {
  return process.env.AI_CHAT_ENABLED?.trim().toLowerCase() === 'true';
}
