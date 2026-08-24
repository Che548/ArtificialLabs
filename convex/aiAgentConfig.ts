export const AI_AGENT_CONSENT_PROVIDER = 'yandex-ai-studio' as const;
export const AI_AGENT_CONSENT_POLICY_VERSION =
  '2026-08-20-yandex-health-assistant-v1' as const;
export const AI_AGENT_CONTEXT_VERSION = '2026-08-20-v1' as const;

export const AI_AGENT_SCOPES = [
  'profile',
  'journal',
  'tests',
  'documents',
  'chats',
  'care_plan',
] as const;

export type AiAgentScope = (typeof AI_AGENT_SCOPES)[number];

export const AI_AGENT_LIMITS = {
  maxContextCharacters: 24_000,
  maxToolResultCharacters: 12_000,
  maxProviderItems: 4,
  maxToolCallsPerTurn: 4,
  maxSteps: 3,
  continuationTtlMs: 2 * 60_000,
  maxContextClockSkewMs: 10 * 60_000,
  // Hidden reasoning counts toward this budget. Leave enough room for the
  // strict function call after deliberation; the plan prompt keeps the visible
  // proposal itself to a compact 6-item default.
  maxPlanOutputTokens: 6_500,
} as const;

export const AI_AGENT_AUTOMATION_RATE_LIMITS = {
  // Foreground and scheduled reviews use separate per-user buckets so the
  // hourly cloud job cannot consume the phone's interactive planning quota.
  foregroundPerUser: { rate: 6, period: 60 * 60_000, capacity: 3 },
  scheduledPerUser: { rate: 1, period: 60 * 60_000, capacity: 1 },
  global: { rate: 120, period: 60 * 60_000, capacity: 20 },
} as const;

export type AiAgentFailureCode =
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'CONTENT_FILTERED'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'FEATURE_DISABLED'
  | 'CONTINUATION_EXPIRED'
  | 'INVALID_TOOL_RESULT';

export type AiAgentSourceRef = {
  source: 'journal' | 'test' | 'document' | 'chat' | 'care-plan';
  localId: string;
  label: string;
  occurredAt?: number;
  ageDays?: number;
  stale?: boolean;
  unverified?: boolean;
};

export type AiAgentToolCall = {
  callId: string;
  name:
    | 'search_journal'
    | 'search_tests'
    | 'search_documents'
    | 'search_chat_history'
    | 'get_care_plan';
  arguments: Record<string, unknown>;
};

export type AiAgentProviderItem = {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
};

export type AiAgentToolResult = {
  callId: string;
  name: AiAgentToolCall['name'];
  output: string;
  sourceRefs: AiAgentSourceRef[];
};

export type AiAgentStepResult =
  | {
      ok: true;
      kind: 'complete';
      reply: string;
      provider: 'yandex-ai-studio';
      model: string;
      responseId?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      durationMs: number;
      truncated: boolean;
      sourceRefs: AiAgentSourceRef[];
    }
  | {
      ok: true;
      kind: 'tool_calls';
      continuationId: string;
      step: number;
      calls: AiAgentToolCall[];
      providerItems: AiAgentProviderItem[];
    }
  | {
      ok: false;
      code: AiAgentFailureCode;
      retryAfterMs?: number;
    };

export type AiAgentPlanRecommendation = {
  catalogKey: string;
  monthOffset: 0 | 1 | 2 | 3 | 4;
  confidence: number;
  rationale: string;
  evidenceSourceIds: string[];
};

export type AiAgentPlanReviewResult =
  | {
      ok: true;
      recommendations: AiAgentPlanRecommendation[];
      provider: 'yandex-ai-studio' | 'server-catalog';
      model: string;
      durationMs: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }
  | {
      ok: false;
      code: AiAgentFailureCode;
      retryAfterMs?: number;
    };

export function isAiAgentFeatureEnabled() {
  return process.env.AI_AGENT_ENABLED?.trim().toLowerCase() === 'true';
}

export function isAiAgentAutomationEnabled() {
  return (
    isAiAgentFeatureEnabled() &&
    process.env.AI_AGENT_AUTOMATION_ENABLED?.trim().toLowerCase() === 'true'
  );
}

export function isAiAgentProviderConfigured() {
  return Boolean(
    process.env.YANDEX_AI_API_KEY?.trim() &&
    process.env.YANDEX_AI_FOLDER_ID?.trim() &&
    process.env.YANDEX_AI_MODEL?.trim(),
  );
}
