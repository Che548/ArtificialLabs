import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery, mutation, query } from './_generated/server';
import {
  AI_CHAT_CONSENT_POLICY_VERSION,
  AI_CHAT_CONSENT_PROVIDER,
  type AiChatGenerateResult,
  isAiChatFeatureEnabled,
} from './aiChatConfig';
import { requireActiveAccount } from './lib/access';

const generationRole = v.union(v.literal('user'), v.literal('assistant'));

export const generate = action({
  args: {
    requestId: v.string(),
    messages: v.array(v.object({ role: generationRole, content: v.string() })),
  },
  handler: async (ctx, args): Promise<AiChatGenerateResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    return await ctx.runAction(internal.chatAction.generateInternal, {
      ...args,
      userId,
    });
  },
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    const consent = await ctx.db
      .query('aiChatConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const consentAccepted = Boolean(
      consent &&
      consent.provider === AI_CHAT_CONSENT_PROVIDER &&
      consent.policyVersion === AI_CHAT_CONSENT_POLICY_VERSION &&
      !consent.revokedAt,
    );

    return {
      enabled: isAiChatFeatureEnabled(),
      policyVersion: AI_CHAT_CONSENT_POLICY_VERSION,
      consentAccepted,
      acceptedAt: consentAccepted ? consent?.acceptedAt : undefined,
    };
  },
});

export const acceptConsent = mutation({
  args: { policyVersion: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
    if (args.policyVersion !== AI_CHAT_CONSENT_POLICY_VERSION) {
      throw new Error('INVALID_POLICY_VERSION');
    }

    const existing = await ctx.db
      .query('aiChatConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const acceptedAt = Date.now();
    const value = {
      provider: AI_CHAT_CONSENT_PROVIDER,
      policyVersion: AI_CHAT_CONSENT_POLICY_VERSION,
      acceptedAt,
      revokedAt: undefined,
      updatedAt: acceptedAt,
    };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert('aiChatConsents', { ...value, userId });

    return {
      policyVersion: AI_CHAT_CONSENT_POLICY_VERSION,
      acceptedAt,
    };
  },
});

export const revokeConsent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    const existing = await ctx.db
      .query('aiChatConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (!existing?.revokedAt) {
      const revokedAt = Date.now();
      if (existing) {
        await ctx.db.patch(existing._id, {
          revokedAt,
          updatedAt: revokedAt,
        });
      }
      return { revoked: Boolean(existing), revokedAt };
    }
    return { revoked: true, revokedAt: existing.revokedAt };
  },
});

export const generationAccess = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const accountState = await ctx.db
      .query('accountStates')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (accountState?.scheduledDeletionAt) {
      return {
        ok: false as const,
        reason: 'ACCOUNT_PENDING_DELETION' as const,
      };
    }

    const consent = await ctx.db
      .query('aiChatConsents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    const consentAccepted = Boolean(
      consent &&
      consent.provider === AI_CHAT_CONSENT_PROVIDER &&
      consent.policyVersion === AI_CHAT_CONSENT_POLICY_VERSION &&
      !consent.revokedAt,
    );
    if (!consentAccepted) {
      return { ok: false as const, reason: 'CONSENT_REQUIRED' as const };
    }

    return { ok: true as const };
  },
});
