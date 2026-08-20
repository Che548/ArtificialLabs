'use node';

import { RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import { internalAction } from './_generated/server';
import {
  AI_CHAT_MAX_MESSAGE_CHARS,
  AI_CHAT_MAX_MESSAGES,
  AI_CHAT_MAX_REQUEST_ID_CHARS,
  AI_CHAT_MAX_TRANSCRIPT_CHARS,
  AI_CHAT_RATE_LIMITS,
  isAiChatFeatureEnabled,
} from './aiChatConfig';
import { generateWithYandex } from './ai/yandexProvider';

const role = v.union(v.literal('user'), v.literal('assistant'));

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

function invalidRequest(
  requestId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  if (
    requestId.length < 8 ||
    requestId.length > AI_CHAT_MAX_REQUEST_ID_CHARS ||
    !/^[A-Za-z0-9_-]+$/.test(requestId)
  ) {
    return true;
  }
  if (messages.length === 0 || messages.length > AI_CHAT_MAX_MESSAGES)
    return true;
  if (messages.at(-1)?.role !== 'user') return true;

  let totalCharacters = 0;
  for (const message of messages) {
    const length = message.content.length;
    if (
      length === 0 ||
      length > AI_CHAT_MAX_MESSAGE_CHARS ||
      message.content.trim().length === 0
    ) {
      return true;
    }
    totalCharacters += length;
  }
  return totalCharacters > AI_CHAT_MAX_TRANSCRIPT_CHARS;
}

export const generateInternal = internalAction({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    messages: v.array(v.object({ role, content: v.string() })),
  },
  handler: async (ctx, args) => {
    const access = await ctx.runQuery(internal.chat.generationAccess, {
      userId: args.userId,
    });
    if (!access.ok) {
      if (access.reason === 'CONSENT_REQUIRED') {
        return { ok: false as const, code: 'CONSENT_REQUIRED' as const };
      }
      throw new Error(access.reason);
    }
    if (!isAiChatFeatureEnabled()) {
      return { ok: false as const, code: 'FEATURE_DISABLED' as const };
    }
    if (invalidRequest(args.requestId, args.messages)) {
      return { ok: false as const, code: 'INVALID_REQUEST' as const };
    }

    const perUser = await rateLimiter.limit(ctx, 'aiChatPerUser', {
      key: args.userId,
    });
    if (!perUser.ok) {
      return {
        ok: false as const,
        code: 'RATE_LIMITED' as const,
        retryAfterMs: Math.max(0, perUser.retryAfter ?? 0),
      };
    }
    const global = await rateLimiter.limit(ctx, 'aiChatGlobal');
    if (!global.ok) {
      return {
        ok: false as const,
        code: 'RATE_LIMITED' as const,
        retryAfterMs: Math.max(0, global.retryAfter ?? 0),
      };
    }

    return await generateWithYandex({
      capabilities: [],
      messages: args.messages,
      requestId: args.requestId,
    });
  },
});
