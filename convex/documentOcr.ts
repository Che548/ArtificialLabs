import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireActiveAccount } from './lib/access';
import { getAuthUserId } from '@convex-dev/auth/server';
import { hasCloudConsent } from './lib/cloudConsent';
import { OCR_MODEL, OCR_POLICY_VERSION } from '../shared/document-ocr';

const configured = () =>
  process.env.AI_DOCUMENT_OCR_ENABLED === '1' &&
  process.env.YANDEX_DOCUMENT_OCR_MODEL === OCR_MODEL;
async function access(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  // HTTP actions propagate the caller identity to internal mutations. Never
  // borrow another session's consent via the retained profile timestamp.
  if (await getAuthUserId(ctx) !== userId) throw new Error('OCR_ACCOUNT_UNAVAILABLE');
  const user = await ctx.db.get(userId);
  const state = await ctx.db
    .query('accountStates')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  const consent = await ctx.db
    .query('documentOcrConsents')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (!user || state?.scheduledDeletionAt)
    throw new Error('OCR_ACCOUNT_UNAVAILABLE');
  if (!configured()) throw new Error('OCR_SERVICE_DISABLED');
  if (!(await hasCloudConsent(ctx, userId)))
    throw new Error('OCR_CLOUD_SYNC_REQUIRED');
  if (
    !consent ||
    consent.revokedAt ||
    consent.policyVersion !== OCR_POLICY_VERSION
  )
    throw new Error('OCR_CONSENT_REQUIRED');
  return consent;
}
export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    const consent = await ctx.db
      .query('documentOcrConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    return {
      enabled: configured(),
      model: OCR_MODEL,
      policyVersion: OCR_POLICY_VERSION,
      accepted:
        !!consent &&
        !consent.revokedAt &&
        consent.policyVersion === OCR_POLICY_VERSION,
      acceptedAt: consent?.acceptedAt,
    };
  },
});
export const setConsent = mutation({
  args: { accepted: v.boolean(), policyVersion: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
    if (args.policyVersion !== OCR_POLICY_VERSION)
      throw new Error('OCR_CONSENT_VERSION');
    if (args.accepted && !configured()) throw new Error('OCR_SERVICE_DISABLED');
    const old = await ctx.db
      .query('documentOcrConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const value = {
      userId,
      policyVersion: args.policyVersion,
      acceptedAt: args.accepted ? Date.now() : (old?.acceptedAt ?? 0),
      revokedAt: args.accepted ? undefined : Date.now(),
    };
    if (old) await ctx.db.replace(old._id, value);
    else if (args.accepted) await ctx.db.insert('documentOcrConsents', value);
  },
});
export const reserve = internalMutation({
  args: {
    userId: v.id('users'),
    jobId: v.string(),
    requestId: v.string(),
    page: v.number(),
    pages: v.number(),
    policyVersion: v.string(),
  },
  handler: async (ctx, args) => {
    await access(ctx, args.userId);
    if (
      args.policyVersion !== OCR_POLICY_VERSION ||
      !Number.isInteger(args.pages) ||
      args.pages < 1 ||
      args.pages > 20 ||
      !Number.isInteger(args.page) ||
      args.page < 1 ||
      args.page > args.pages ||
      ![args.jobId, args.requestId].every((id) => /^[\w-]{8,160}$/.test(id))
    )
      throw new Error('OCR_INVALID_REQUEST');
    let job = await ctx.db
      .query('documentOcrJobs')
      .withIndex('by_user_job', (q) =>
        q.eq('userId', args.userId).eq('jobId', args.jobId),
      )
      .unique();
    if (!job) {
      const configuredLimit = Number(process.env.DOCUMENT_OCR_DAILY_JOBS ?? 8);
      const limit =
        Number.isInteger(configuredLimit) && configuredLimit > 0
          ? Math.min(configuredLimit, 100)
          : 8;
      const recent = await ctx.db
        .query('documentOcrJobs')
        .withIndex('by_user_created', (q) =>
          q.eq('userId', args.userId).gte('createdAt', Date.now() - 86400000),
        )
        .take(limit);
      if (recent.length >= limit) throw new Error('OCR_RATE_LIMITED');
      const id = await ctx.db.insert('documentOcrJobs', {
        userId: args.userId,
        jobId: args.jobId,
        pageCount: args.pages,
        createdAt: Date.now(),
        attempts: [],
      });
      job = (await ctx.db.get(id))!;
    }
    if (job.pageCount !== args.pages) throw new Error('OCR_INVALID_REQUEST');
    if (job.attempts.some((a) => a.requestId === args.requestId))
      throw new Error('OCR_ALREADY_SUBMITTED');
    if (job.attempts.filter((a) => a.page === args.page).length >= 3)
      throw new Error('OCR_PAGE_ATTEMPTS_EXHAUSTED');
    if (
      job.attempts.some(
        (a) => a.status === 'pending' && a.at + 120000 > Date.now(),
      )
    )
      throw new Error('OCR_BUSY');
    await ctx.db.patch(job._id, {
      attempts: [
        ...job.attempts,
        {
          requestId: args.requestId,
          page: args.page,
          at: Date.now(),
          status: 'pending' as const,
        },
      ],
    });
    return job._id;
  },
});
export const finish = internalMutation({
  args: {
    userId: v.id('users'),
    id: v.id('documentOcrJobs'),
    requestId: v.string(),
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job || job.userId !== args.userId)
      throw new Error('OCR_ACCOUNT_UNAVAILABLE');
    await ctx.db.patch(job._id, {
      attempts: job.attempts.map((a) =>
        a.requestId === args.requestId
          ? {
              ...a,
              status: args.success
                ? ('complete' as const)
                : ('failed' as const),
            }
          : a,
      ),
    });
    // Check again after inference: revoked/deleted accounts receive no late OCR content.
    await access(ctx, args.userId);
  },
});
export const purgeForUser = internalMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const consent = await ctx.db
      .query('documentOcrConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (consent) await ctx.db.delete(consent._id);
    const jobs = await ctx.db
      .query('documentOcrJobs')
      .withIndex('by_user_created', (q) => q.eq('userId', userId))
      .take(128);
    for (const job of jobs) await ctx.db.delete(job._id);
    if (jobs.length === 128)
      await ctx.scheduler.runAfter(0, internal.documentOcr.purgeForUser, {
        userId,
      });
  },
});

/** Re-check the caller before the next transient provider stage. No content is an argument. */
export const assertAccess = internalQuery({
  args: {userId:v.id('users')},
  handler: async (ctx,{userId}) => {await access(ctx,userId);return null;},
});
