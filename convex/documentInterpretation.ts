import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { action, internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { requireActiveAccount } from './lib/access';
import {
  DOCUMENT_INTERPRETATION_POLICY_VERSION,
  validateDocumentInterpretationRequest,
} from '../shared/document-interpretation';

const enabled = () => process.env.AI_DOCUMENT_INTERPRETATION_ENABLED === '1';
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    const consent = await ctx.db
      .query('documentInterpretationConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    return {
      enabled: enabled(),
      policyVersion: DOCUMENT_INTERPRETATION_POLICY_VERSION,
      accepted: Boolean(
        consent &&
        !consent.revokedAt &&
        consent.policyVersion === DOCUMENT_INTERPRETATION_POLICY_VERSION,
      ),
    };
  },
});
export const setConsent = mutation({
  args: { policyVersion: v.string(), accepted: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
    if (args.policyVersion !== DOCUMENT_INTERPRETATION_POLICY_VERSION)
      throw new Error('DOCUMENT_CONSENT_VERSION');
    if (args.accepted && !enabled())
      throw new Error('DOCUMENT_SERVICE_DISABLED');
    const existing = await ctx.db
      .query('documentInterpretationConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const value = {
      userId,
      policyVersion: args.policyVersion,
      acceptedAt: args.accepted ? Date.now() : (existing?.acceptedAt ?? 0),
      revokedAt: args.accepted ? undefined : Date.now(),
    };
    if (existing) await ctx.db.replace(existing._id, value);
    else if (args.accepted)
      await ctx.db.insert('documentInterpretationConsents', value);
  },
});
export const generate = action({
  args: { requestId: v.string(), text: v.string(), policyVersion: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; reply?: string; code?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    validateDocumentInterpretationRequest(args.requestId, args.text);
    return ctx.runAction(internal.documentInterpretationAction.generate, {
      ...args,
      userId,
    });
  },
});
export const reserve = internalMutation({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    policyVersion: v.string(),
  },
  handler: async (ctx, args) => {
    if (!enabled()) throw new Error('DOCUMENT_SERVICE_DISABLED');
    const user = await ctx.db.get(args.userId);
    const state = await ctx.db
      .query('accountStates')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (!user || state?.scheduledDeletionAt)
      throw new Error('ACCOUNT_UNAVAILABLE');
    const consent = await ctx.db
      .query('documentInterpretationConsents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (
      args.policyVersion !== DOCUMENT_INTERPRETATION_POLICY_VERSION ||
      !consent ||
      consent.revokedAt ||
      consent.policyVersion !== args.policyVersion
    )
      throw new Error('DOCUMENT_CONSENT_REQUIRED');
    const previous = await ctx.db
      .query('documentInterpretationRequests')
      .withIndex('by_user_request', (q) =>
        q.eq('userId', args.userId).eq('requestId', args.requestId),
      )
      .unique();
    if (previous) throw new Error('DOCUMENT_ALREADY_SUBMITTED');
    const recent = await ctx.db
      .query('documentInterpretationRequests')
      .withIndex('by_user_created', (q) =>
        q.eq('userId', args.userId).gte('createdAt', Date.now() - 86_400_000),
      )
      .take(8);
    if (recent.length >= 8) throw new Error('DOCUMENT_RATE_LIMITED');
    return ctx.db.insert('documentInterpretationRequests', {
      userId: args.userId,
      requestId: args.requestId,
      createdAt: Date.now(),
      status: 'pending',
    });
  },
});
export const finish = internalMutation({
  args: {
    id: v.id('documentInterpretationRequests'),
    userId: v.id('users'),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== args.userId)
      throw new Error('DOCUMENT_REQUEST_NOT_FOUND');
    if (row.status === 'pending')
      await ctx.db.patch(row._id, {
        status: args.success ? 'complete' : 'failed',
      });
  },
});
export const purgeForUser = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const consent = await ctx.db
      .query('documentInterpretationConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (consent) await ctx.db.delete(consent._id);
    const rows = await ctx.db
      .query('documentInterpretationRequests')
      .withIndex('by_user_created', (q) => q.eq('userId', userId))
      .take(128);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 128)
      await ctx.scheduler.runAfter(
        0,
        internal.documentInterpretation.purgeForUser,
        { userId },
      );
  },
});
