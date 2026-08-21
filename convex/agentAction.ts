'use node';

import { createHash, randomBytes } from 'node:crypto';
import { RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import {
  AI_AGENT_CONTEXT_VERSION,
  AI_AGENT_LIMITS,
  type AiAgentProviderItem,
  type AiAgentSourceRef,
  type AiAgentToolCall,
  type AiAgentToolResult,
  type AiAgentStepResult,
  isAiAgentFeatureEnabled,
} from './aiAgentConfig';
import {
  AI_CHAT_MAX_MESSAGE_CHARS,
  AI_CHAT_MAX_MESSAGES,
  AI_CHAT_MAX_REQUEST_ID_CHARS,
  AI_CHAT_MAX_TRANSCRIPT_CHARS,
  AI_CHAT_RATE_LIMITS,
} from './aiChatConfig';
import { generateAgentStepWithYandex } from './ai/yandexProvider';
import {
  parseValidatedAgentContext,
  validatedAgentContextMatchesAccess,
  validatedContextSourceRefs,
} from './ai/agentContextValidation';

const role = v.union(v.literal('user'), v.literal('assistant'));
const toolName = v.union(
  v.literal('search_journal'),
  v.literal('search_tests'),
  v.literal('search_documents'),
  v.literal('search_chat_history'),
  v.literal('get_care_plan'),
);
const sourceRef = v.object({
  source: v.union(
    v.literal('journal'),
    v.literal('test'),
    v.literal('document'),
    v.literal('chat'),
    v.literal('care-plan'),
  ),
  localId: v.string(),
  label: v.string(),
  occurredAt: v.optional(v.number()),
  ageDays: v.optional(v.number()),
  stale: v.optional(v.boolean()),
  unverified: v.optional(v.boolean()),
});
const providerItem = v.object({
  type: v.literal('function_call'),
  call_id: v.string(),
  name: v.string(),
  arguments: v.string(),
});
const toolResult = v.object({
  callId: v.string(),
  name: toolName,
  output: v.string(),
  sourceRefs: v.array(sourceRef),
});

const rateLimiter = new RateLimiter(components.rateLimiter, {
  aiChatPerUser: {
    kind: 'token bucket',
    ...AI_CHAT_RATE_LIMITS.perUser,
  },
  aiChatGlobal: {
    kind: 'token bucket',
    ...AI_CHAT_RATE_LIMITS.global,
  },
});

function invalidRequestId(requestId: string) {
  return (
    requestId.length < 8 ||
    requestId.length > AI_CHAT_MAX_REQUEST_ID_CHARS ||
    !/^[A-Za-z0-9_-]+$/.test(requestId)
  );
}

function invalidMessages(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  if (messages.length === 0 || messages.length > AI_CHAT_MAX_MESSAGES)
    return true;
  if (messages.at(-1)?.role !== 'user') return true;
  let characters = 0;
  for (const message of messages) {
    if (
      message.content.length === 0 ||
      message.content.length > AI_CHAT_MAX_MESSAGE_CHARS ||
      !message.content.trim()
    )
      return true;
    characters += message.content.length;
  }
  return characters > AI_CHAT_MAX_TRANSCRIPT_CHARS;
}

function validToolArguments(call: AiAgentToolCall) {
  const keys = Object.keys(call.arguments);
  if (call.name === 'get_care_plan') return keys.length === 0;
  if (keys.some((key) => key !== 'query' && key !== 'limit')) return false;
  const query = call.arguments.query;
  const limit = call.arguments.limit;
  return (
    typeof query === 'string' &&
    query.trim().length >= 2 &&
    query.length <= 300 &&
    (limit === undefined ||
      (typeof limit === 'number' &&
        Number.isInteger(limit) &&
        limit >= 1 &&
        limit <= 12))
  );
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashArguments(value: string | Record<string, unknown>) {
  if (typeof value !== 'string') return hash(canonicalJson(value));
  try {
    return hash(canonicalJson(JSON.parse(value)));
  } catch {
    return hash(value);
  }
}

function generationInputHash(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  contextEnvelope: string,
) {
  return hash(
    canonicalJson({
      contextEnvelope,
      messages,
    }),
  );
}

async function applyRateLimit(ctx: ActionCtx, userId: Id<'users'>) {
  const perUser = await rateLimiter.limit(ctx, 'aiChatPerUser', {
    key: userId,
  });
  if (!perUser.ok)
    return {
      ok: false as const,
      code: 'RATE_LIMITED' as const,
      retryAfterMs: Math.max(0, perUser.retryAfter ?? 0),
    };
  const global = await rateLimiter.limit(ctx, 'aiChatGlobal');
  if (!global.ok)
    return {
      ok: false as const,
      code: 'RATE_LIMITED' as const,
      retryAfterMs: Math.max(0, global.retryAfter ?? 0),
    };
  return { ok: true as const };
}

function continuationId() {
  return randomBytes(18).toString('base64url');
}

async function saveToolContinuation({
  calls,
  ctx,
  previousCalls = [],
  inputHash,
  requestId,
  step,
  userId,
  usage,
}: {
  calls: AiAgentToolCall[];
  ctx: ActionCtx;
  previousCalls?: Doc<'agentRuns'>['allowedCalls'];
  inputHash: string;
  requestId: string;
  step: number;
  userId: Id<'users'>;
  usage: {
    model: string;
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}) {
  if (
    !calls.length ||
    calls.length + previousCalls.length > AI_AGENT_LIMITS.maxToolCallsPerTurn ||
    new Set([
      ...previousCalls.map((call) => call.callId),
      ...calls.map((call) => call.callId),
    ]).size !==
      previousCalls.length + calls.length ||
    calls.some((call) => !validToolArguments(call))
  )
    return null;
  const id = continuationId();
  const saved = await ctx.runMutation(internal.agent.saveContinuation, {
    userId,
    requestId,
    continuationId: id,
    step,
    allowedCalls: [
      ...previousCalls,
      ...calls.map((call) => ({
        callId: call.callId,
        name: call.name,
        argumentsHash: hashArguments(call.arguments),
        step,
      })),
    ],
    inputHash,
    model: usage.model,
    durationMs: usage.durationMs,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    expiresAt: Date.now() + AI_AGENT_LIMITS.continuationTtlMs,
  });
  return saved ? id : null;
}

async function requireGenerationAccess(ctx: ActionCtx, userId: Id<'users'>) {
  const access = await ctx.runQuery(internal.agent.generationAccess, {
    userId,
  });
  if (!access.ok) {
    if (access.reason === 'CONSENT_REQUIRED')
      return { ok: false as const, code: 'CONSENT_REQUIRED' as const };
    throw new Error(access.reason);
  }
  if (!isAiAgentFeatureEnabled())
    return { ok: false as const, code: 'FEATURE_DISABLED' as const };
  return { ok: true as const, goal: access.goal };
}

export const startInternal = internalAction({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    messages: v.array(v.object({ role, content: v.string() })),
    contextEnvelope: v.string(),
  },
  handler: async (ctx, args): Promise<AiAgentStepResult> => {
    const access = await requireGenerationAccess(ctx, args.userId);
    if (!access.ok) return access;
    const context = parseValidatedAgentContext(
      args.contextEnvelope,
      AI_AGENT_LIMITS.maxContextCharacters,
    );
    if (
      invalidRequestId(args.requestId) ||
      invalidMessages(args.messages) ||
      !context ||
      !validatedAgentContextMatchesAccess(
        context,
        access.goal,
        Date.now(),
        AI_AGENT_LIMITS.maxContextClockSkewMs,
      )
    )
      return { ok: false as const, code: 'INVALID_REQUEST' as const };
    const limited = await applyRateLimit(ctx, args.userId);
    if (!limited.ok) return limited;
    const result = await generateAgentStepWithYandex({
      contextEnvelope: args.contextEnvelope,
      messages: args.messages,
      requestId: args.requestId,
      sourceRefs: validatedContextSourceRefs(context).slice(0, 24),
    });
    const currentAccess = await requireGenerationAccess(ctx, args.userId);
    if (!currentAccess.ok) return currentAccess;
    if (result.ok && result.kind === 'provider_tool_calls') {
      const id = await saveToolContinuation({
        calls: result.calls,
        ctx,
        inputHash: generationInputHash(args.messages, args.contextEnvelope),
        requestId: args.requestId,
        step: 1,
        userId: args.userId,
        usage: result,
      });
      if (!id) return { ok: false as const, code: 'INVALID_REQUEST' as const };
      return {
        ok: true as const,
        kind: 'tool_calls' as const,
        continuationId: id,
        step: 1,
        calls: result.calls,
        providerItems: result.providerItems,
      };
    }
    return result;
  },
});

const expectedToolSource: Record<
  AiAgentToolCall['name'],
  AiAgentSourceRef['source']
> = {
  search_journal: 'journal',
  search_tests: 'test',
  search_documents: 'document',
  search_chat_history: 'chat',
  get_care_plan: 'care-plan',
};

const forbiddenToolText =
  /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:|sms:|mailto:|tel:|<\/?[A-Za-z][^>]{0,500}>|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|[^\p{L}\d-])(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}(?![\p{L}\d-])|\+\d[\d\s().-]{7,}\d|\b\d{10,15}\b)/iu;

function isToolRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyToolKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function safeToolString(value: unknown, max: number) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !forbiddenToolText.test(value)
  );
}

function optionalSafeToolString(value: unknown, max: number) {
  return value === undefined || safeToolString(value, max);
}

function finiteToolNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalFiniteToolNumber(value: unknown) {
  return value === undefined || finiteToolNumber(value);
}

function validToolItem(
  name: AiAgentToolCall['name'],
  item: Record<string, unknown>,
) {
  if (
    !safeToolString(item.sourceId, 160) ||
    !/^[A-Za-z0-9_-]{1,160}$/.test(item.sourceId as string)
  )
    return false;
  if (name === 'search_journal') {
    return (
      hasOnlyToolKeys(item, [
        'sourceId',
        'occurredAt',
        'ageDays',
        'stale',
        'warning',
        'kind',
        'label',
        'value',
        'numericValue',
        'unit',
      ]) &&
      finiteToolNumber(item.occurredAt) &&
      finiteToolNumber(item.ageDays) &&
      (item.ageDays as number) >= 0 &&
      typeof item.stale === 'boolean' &&
      optionalSafeToolString(item.warning, 300) &&
      safeToolString(item.kind, 40) &&
      optionalSafeToolString(item.label, 160) &&
      optionalSafeToolString(item.value, 700) &&
      optionalFiniteToolNumber(item.numericValue) &&
      optionalSafeToolString(item.unit, 40) &&
      ((item.ageDays as number) <= 30 ||
        (item.stale === true && safeToolString(item.warning, 300)))
    );
  }
  if (name === 'search_tests') {
    if ('values' in item) {
      return (
        hasOnlyToolKeys(item, [
          'sourceId',
          'title',
          'collectedAt',
          'status',
          'values',
        ]) &&
        optionalSafeToolString(item.title, 160) &&
        finiteToolNumber(item.collectedAt) &&
        safeToolString(item.status, 40) &&
        Array.isArray(item.values) &&
        item.values.length <= 20 &&
        item.values.every(
          (value) =>
            isToolRecord(value) &&
            hasOnlyToolKeys(value, ['name', 'value', 'unit', 'reference']) &&
            optionalSafeToolString(value.name, 100) &&
            optionalSafeToolString(value.value, 100) &&
            optionalSafeToolString(value.unit, 40) &&
            optionalSafeToolString(value.reference, 100),
        )
      );
    }
    return (
      hasOnlyToolKeys(item, [
        'sourceId',
        'testSystemKey',
        'capturedAt',
        'confirmedValue',
        'confirmedByUser',
      ]) &&
      optionalSafeToolString(item.testSystemKey, 160) &&
      finiteToolNumber(item.capturedAt) &&
      ['positive', 'negative', 'invalid'].includes(
        item.confirmedValue as string,
      ) &&
      item.confirmedByUser === true
    );
  }
  if (name === 'search_documents') {
    return (
      hasOnlyToolKeys(item, [
        'sourceId',
        'title',
        'category',
        'documentDate',
        'hasLocalFile',
        'contentAvailable',
      ]) &&
      optionalSafeToolString(item.title, 200) &&
      safeToolString(item.category, 80) &&
      finiteToolNumber(item.documentDate) &&
      typeof item.hasLocalFile === 'boolean' &&
      item.contentAvailable === false
    );
  }
  if (name === 'search_chat_history') {
    return (
      hasOnlyToolKeys(item, [
        'sourceId',
        'conversationTitle',
        'role',
        'sentAt',
        'excerpt',
      ]) &&
      optionalSafeToolString(item.conversationTitle, 160) &&
      (item.role === 'user' || item.role === 'assistant') &&
      finiteToolNumber(item.sentAt) &&
      optionalSafeToolString(item.excerpt, 900)
    );
  }
  return (
    hasOnlyToolKeys(item, [
      'sourceId',
      'title',
      'status',
      'dueAt',
      'provisional',
      'requiresClinician',
      'safetyHold',
      'rationale',
    ]) &&
    optionalSafeToolString(item.title, 160) &&
    (item.status === 'current' || item.status === 'upcoming') &&
    optionalFiniteToolNumber(item.dueAt) &&
    typeof item.provisional === 'boolean' &&
    typeof item.requiresClinician === 'boolean' &&
    typeof item.safetyHold === 'boolean' &&
    optionalSafeToolString(item.rationale, 500)
  );
}

function validToolOutputShape(result: AiAgentToolResult) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.output);
  } catch {
    return false;
  }
  if (!isToolRecord(parsed)) return false;
  const record = parsed;
  const allowedKeys =
    result.name === 'search_documents'
      ? new Set(['items', 'omitted', 'metadataOnly'])
      : new Set(['items', 'omitted']);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return false;
  if (
    !Array.isArray(record.items) ||
    record.items.length > (result.name === 'get_care_plan' ? 15 : 12) ||
    (record.omitted !== undefined &&
      (!Number.isInteger(record.omitted) ||
        typeof record.omitted !== 'number' ||
        record.omitted < 0)) ||
    (record.metadataOnly !== undefined &&
      (result.name !== 'search_documents' ||
        !safeToolString(record.metadataOnly, 300)))
  )
    return false;
  const sourceIds: string[] = [];
  for (const item of record.items) {
    if (!isToolRecord(item) || !validToolItem(result.name, item)) return false;
    const sourceId = item.sourceId;
    if (
      typeof sourceId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,160}$/.test(sourceId) ||
      sourceIds.includes(sourceId)
    )
      return false;
    sourceIds.push(sourceId);
  }
  const refIds = result.sourceRefs.map((ref) => ref.localId);
  return (
    new Set(refIds).size === refIds.length &&
    sourceIds.length === refIds.length &&
    sourceIds.every((id) => refIds.includes(id))
  );
}

export function validToolResults(results: AiAgentToolResult[]) {
  if (!results.length || results.length > AI_AGENT_LIMITS.maxToolCallsPerTurn)
    return false;
  if (new Set(results.map((result) => result.callId)).size !== results.length)
    return false;
  let characters = 0;
  for (const result of results) {
    characters += result.output.length;
    if (
      !result.output ||
      result.output.length > 4_000 ||
      result.sourceRefs.some(
        (ref) => ref.source !== expectedToolSource[result.name],
      ) ||
      result.sourceRefs.length > 24 ||
      result.sourceRefs.some(
        (ref) =>
          ref.localId.length > 160 ||
          ref.label.length > 240 ||
          forbiddenToolText.test(ref.label),
      ) ||
      !validToolOutputShape(result)
    )
      return false;
  }
  return characters <= AI_AGENT_LIMITS.maxToolResultCharacters;
}

export const continueInternal = internalAction({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    continuationId: v.string(),
    step: v.number(),
    messages: v.array(v.object({ role, content: v.string() })),
    contextEnvelope: v.string(),
    providerItems: v.array(providerItem),
    toolResults: v.array(toolResult),
  },
  handler: async (ctx, args): Promise<AiAgentStepResult> => {
    const access = await requireGenerationAccess(ctx, args.userId);
    if (!access.ok) return access;
    const context = parseValidatedAgentContext(
      args.contextEnvelope,
      AI_AGENT_LIMITS.maxContextCharacters,
    );
    if (
      invalidRequestId(args.requestId) ||
      invalidMessages(args.messages) ||
      !context ||
      !validatedAgentContextMatchesAccess(
        context,
        access.goal,
        Date.now(),
        AI_AGENT_LIMITS.maxContextClockSkewMs,
      ) ||
      args.step < 1 ||
      args.step >= AI_AGENT_LIMITS.maxSteps ||
      args.providerItems.length > AI_AGENT_LIMITS.maxProviderItems
    )
      return { ok: false as const, code: 'INVALID_REQUEST' as const };
    if (!validToolResults(args.toolResults))
      return { ok: false as const, code: 'INVALID_TOOL_RESULT' as const };

    const run: Doc<'agentRuns'> | null = await ctx.runMutation(
      internal.agent.takeContinuation,
      {
        userId: args.userId,
        continuationId: args.continuationId,
      },
    );
    if (!run || run.expiresAt < Date.now())
      return { ok: false as const, code: 'CONTINUATION_EXPIRED' as const };
    if (
      run.requestId !== args.requestId ||
      run.step !== args.step ||
      !run.inputHash ||
      run.inputHash !==
        generationInputHash(args.messages, args.contextEnvelope) ||
      run.allowedCalls.some((call) => call.step === undefined)
    )
      return { ok: false as const, code: 'INVALID_TOOL_RESULT' as const };

    const providerItems = args.providerItems as AiAgentProviderItem[];
    const results = args.toolResults as AiAgentToolResult[];
    if (
      run.allowedCalls.length !== providerItems.length ||
      run.allowedCalls.length !== results.length ||
      run.allowedCalls.some(
        (allowed: Doc<'agentRuns'>['allowedCalls'][number]) => {
          const item = providerItems.find(
            (candidate) => candidate.call_id === allowed.callId,
          );
          const result = results.find(
            (candidate) => candidate.callId === allowed.callId,
          );
          return (
            !item ||
            !result ||
            item.name !== allowed.name ||
            result.name !== allowed.name ||
            hashArguments(item.arguments) !== allowed.argumentsHash
          );
        },
      )
    )
      return { ok: false as const, code: 'INVALID_TOOL_RESULT' as const };

    const orderedProviderItems = run.allowedCalls.map((allowed) =>
      providerItems.find((candidate) => candidate.call_id === allowed.callId)!,
    );
    const orderedResults = run.allowedCalls.map((allowed) =>
      results.find((candidate) => candidate.callId === allowed.callId)!,
    );
    const toolCallSteps = Object.fromEntries(
      run.allowedCalls.map((call) => [call.callId, call.step!]),
    );

    const result = await generateAgentStepWithYandex({
      contextEnvelope: args.contextEnvelope,
      messages: args.messages,
      providerItems: orderedProviderItems,
      requestId: args.requestId,
      sourceRefs: [
        ...validatedContextSourceRefs(context),
        ...orderedResults.flatMap((item) => item.sourceRefs),
      ].slice(0, 24),
      toolCallSteps,
      toolResults: orderedResults,
    });
    const currentAccess = await requireGenerationAccess(ctx, args.userId);
    if (!currentAccess.ok) return currentAccess;
    if (result.ok && result.kind === 'provider_tool_calls') {
      const nextStep: number = args.step + 1;
      if (nextStep >= AI_AGENT_LIMITS.maxSteps)
        return { ok: false as const, code: 'INVALID_REQUEST' as const };
      const id = await saveToolContinuation({
        calls: result.calls,
        ctx,
        inputHash: run.inputHash,
        previousCalls: run.allowedCalls,
        requestId: args.requestId,
        step: nextStep,
        userId: args.userId,
        usage: {
          model: result.model,
          durationMs: run.durationMs + result.durationMs,
          inputTokens:
            (run.inputTokens ?? 0) + (result.inputTokens ?? 0) || undefined,
          outputTokens:
            (run.outputTokens ?? 0) + (result.outputTokens ?? 0) || undefined,
          totalTokens:
            (run.totalTokens ?? 0) + (result.totalTokens ?? 0) || undefined,
        },
      });
      if (!id) return { ok: false as const, code: 'INVALID_REQUEST' as const };
      return {
        ok: true as const,
        kind: 'tool_calls' as const,
        continuationId: id,
        step: nextStep,
        calls: result.calls,
        providerItems: result.providerItems,
      };
    }
    if (result.ok && result.kind === 'complete') {
      return {
        ...result,
        durationMs: run.durationMs + result.durationMs,
        inputTokens:
          (run.inputTokens ?? 0) + (result.inputTokens ?? 0) || undefined,
        outputTokens:
          (run.outputTokens ?? 0) + (result.outputTokens ?? 0) || undefined,
        totalTokens:
          (run.totalTokens ?? 0) + (result.totalTokens ?? 0) || undefined,
      };
    }
    return result;
  },
});
