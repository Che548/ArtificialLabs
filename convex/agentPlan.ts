'use node';

import { getAuthUserId } from '@convex-dev/auth/server';
import { RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalAction } from './_generated/server';
import {
  AI_AGENT_AUTOMATION_RATE_LIMITS,
  AI_AGENT_CONTEXT_VERSION,
  AI_AGENT_LIMITS,
  type AiAgentPlanReviewResult,
  isAiAgentAutomationEnabled,
} from './aiAgentConfig';
import { generatePlanReviewWithYandex } from './ai/yandexProvider';
import { agentPlanCatalogCandidates } from '../lib/care-plan';
import {
  parseValidatedAgentContext,
  validatedAgentContextMatchesAccess,
} from './ai/agentContextValidation';

const rateLimiter = new RateLimiter(components.rateLimiter, {
  aiAgentPlanPerUser: {
    kind: 'token bucket',
    ...AI_AGENT_AUTOMATION_RATE_LIMITS.perUser,
  },
  aiAgentPlanGlobal: {
    kind: 'token bucket',
    ...AI_AGENT_AUTOMATION_RATE_LIMITS.global,
  },
});

function contextGoal(context: Record<string, unknown>) {
  const profile = context.profile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile))
    return null;
  const goal = (profile as { goal?: unknown }).goal;
  return goal === 'cycle' || goal === 'planning' || goal === 'pregnancy'
    ? goal
    : null;
}

function evidenceIds(context: Record<string, unknown>) {
  const ids = new Set<string>();
  for (const key of [
    'recentJournal',
    'confirmedTests',
    'carePlan',
    'planningSignals',
  ]) {
    const items = context[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const sourceRef = (item as { sourceRef?: unknown }).sourceRef;
      if (
        !sourceRef ||
        typeof sourceRef !== 'object' ||
        Array.isArray(sourceRef)
      )
        continue;
      const localId = (sourceRef as { localId?: unknown }).localId;
      if (typeof localId === 'string' && localId.length <= 160)
        ids.add(localId);
    }
  }
  return ids;
}

export const review = action({
  args: { requestId: v.string(), contextEnvelope: v.string() },
  handler: async (ctx, args): Promise<AiAgentPlanReviewResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    if (!isAiAgentAutomationEnabled())
      return { ok: false, code: 'FEATURE_DISABLED' };
    if (
      args.requestId.length < 8 ||
      args.requestId.length > 80 ||
      !/^[A-Za-z0-9_-]+$/.test(args.requestId)
    )
      return { ok: false, code: 'INVALID_REQUEST' };
    const context = parseValidatedAgentContext(
      args.contextEnvelope,
      AI_AGENT_LIMITS.maxContextCharacters,
    );
    if (!context) return { ok: false, code: 'INVALID_REQUEST' };
    const access = await ctx.runQuery(internal.agent.generationAccess, {
      userId,
    });
    if (!access.ok) {
      if (access.reason === 'CONSENT_REQUIRED')
        return { ok: false, code: 'CONSENT_REQUIRED' };
      throw new Error(access.reason);
    }
    if (!access.automationAccepted)
      return { ok: false, code: 'FEATURE_DISABLED' };
    if (
      !validatedAgentContextMatchesAccess(
        context,
        access.goal,
        Date.now(),
        AI_AGENT_LIMITS.maxContextClockSkewMs,
      )
    )
      return { ok: false, code: 'INVALID_REQUEST' };
    const goal = contextGoal(context);
    if (!goal || goal !== access.goal)
      return { ok: false, code: 'INVALID_REQUEST' };
    const perUser = await rateLimiter.limit(ctx, 'aiAgentPlanPerUser', {
      key: userId,
    });
    if (!perUser.ok)
      return {
        ok: false,
        code: 'RATE_LIMITED',
        retryAfterMs: Math.max(0, perUser.retryAfter ?? 0),
      };
    const global = await rateLimiter.limit(ctx, 'aiAgentPlanGlobal');
    if (!global.ok)
      return {
        ok: false,
        code: 'RATE_LIMITED',
        retryAfterMs: Math.max(0, global.retryAfter ?? 0),
      };
    const result = await generatePlanReviewWithYandex({
      candidates: agentPlanCatalogCandidates(goal).map((candidate) => ({
        key: candidate.key,
        title: candidate.title,
        category: candidate.category,
        schedulingGuidance: candidate.schedulingGuidance,
        purpose: candidate.purpose,
        riskTier: candidate.riskTier,
        requiresClinician: candidate.requiresClinician,
        riskFlags: candidate.riskFlags,
        constraints: candidate.constraints,
      })),
      contextEnvelope: args.contextEnvelope,
      requestId: args.requestId,
    });
    if (!result.ok) return result;
    const currentAccess = await ctx.runQuery(internal.agent.generationAccess, {
      userId,
    });
    if (!currentAccess.ok) {
      if (currentAccess.reason === 'CONSENT_REQUIRED')
        return { ok: false, code: 'CONSENT_REQUIRED' };
      throw new Error(currentAccess.reason);
    }
    if (!isAiAgentAutomationEnabled() || !currentAccess.automationAccepted)
      return { ok: false, code: 'FEATURE_DISABLED' };
    const allowedEvidence = evidenceIds(context);
    return {
      ...result,
      recommendations: result.recommendations.map((recommendation) => ({
        ...recommendation,
        evidenceSourceIds: recommendation.evidenceSourceIds.filter((id) =>
          allowedEvidence.has(id),
        ),
      })),
    };
  },
});

export const reviewDueSynced = internalAction({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!isAiAgentAutomationEnabled()) return { reviewed: 0, applied: 0 };
    const now = args.now ?? Date.now();
    const due = (await ctx.runQuery(internal.agent.dueSyncedAutomation, {
      now,
    })) as Array<{
      userId: Id<'users'>;
      profileId: Id<'profiles'>;
      triggerId: Id<'agentTriggers'>;
      goal: 'cycle' | 'planning' | 'pregnancy';
      contextEnvelope: string;
    }>;
    let reviewed = 0;
    let applied = 0;
    for (const item of due) {
      const perUser = await rateLimiter.limit(ctx, 'aiAgentPlanPerUser', {
        key: item.userId,
      });
      if (!perUser.ok) continue;
      const global = await rateLimiter.limit(ctx, 'aiAgentPlanGlobal');
      if (!global.ok) break;
      const requestId = `scheduled_${now}_${String(item.triggerId).slice(-12)}`;
      const result = await generatePlanReviewWithYandex({
        candidates: agentPlanCatalogCandidates(item.goal).map((candidate) => ({
          key: candidate.key,
          title: candidate.title,
          category: candidate.category,
          schedulingGuidance: candidate.schedulingGuidance,
          purpose: candidate.purpose,
          riskTier: candidate.riskTier,
          requiresClinician: candidate.requiresClinician,
          riskFlags: candidate.riskFlags,
          constraints: candidate.constraints,
        })),
        contextEnvelope: item.contextEnvelope,
        requestId,
      });
      reviewed += 1;
      if (!result.ok) continue;
      const parsedContext = parseValidatedAgentContext(
        item.contextEnvelope,
        AI_AGENT_LIMITS.maxContextCharacters,
      );
      if (!parsedContext) continue;
      const allowedEvidence = evidenceIds(parsedContext);
      const saved = await ctx.runMutation(
        internal.agent.applySyncedPlanProposal,
        {
          profileId: item.profileId,
          triggerId: item.triggerId,
          requestId,
          model: result.model,
          now,
          recommendations: result.recommendations.map((recommendation) => ({
            ...recommendation,
            evidenceSourceIds: recommendation.evidenceSourceIds.filter((id) =>
              allowedEvidence.has(id),
            ),
          })),
        },
      );
      applied += saved.applied;
    }
    return { reviewed, applied };
  },
});
