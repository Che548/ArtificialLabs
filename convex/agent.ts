import { v } from 'convex/values';

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  AI_AGENT_CONSENT_POLICY_VERSION,
  AI_AGENT_CONSENT_PROVIDER,
  AI_AGENT_CONTEXT_VERSION,
  AI_AGENT_SCOPES,
  isAiAgentAutomationEnabled,
  isAiAgentFeatureEnabled,
  isAiAgentProviderConfigured,
} from './aiAgentConfig';
import { requireActiveAccount, requireOwnedProfile } from './lib/access';
import {
  AGENT_POLICY_VERSION,
  agentPlanCatalogCandidates,
  completedCarePlanBlocksModelRecommendation,
  validateCarePlanItem,
  validateAgentTrigger,
} from '../lib/care-plan';
import { ANALYSIS_CATALOG_VERSION } from '../lib/analysis-catalog';
import type {
  AgentSourceRef,
  AgentTrigger,
  CarePlanItem,
  RecommendationEvent,
} from '../lib/health-types';

const scope = v.union(
  v.literal('profile'),
  v.literal('journal'),
  v.literal('tests'),
  v.literal('documents'),
  v.literal('chats'),
  v.literal('care_plan'),
);

function hasCurrentConsent(
  consent: {
    provider: string;
    policyVersion: string;
    scopes: string[];
    revokedAt?: number;
  } | null,
) {
  return Boolean(
    consent &&
    consent.provider === AI_AGENT_CONSENT_PROVIDER &&
    consent.policyVersion === AI_AGENT_CONSENT_POLICY_VERSION &&
    !consent.revokedAt &&
    AI_AGENT_SCOPES.every((item) => consent.scopes.includes(item)),
  );
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    const consent = await ctx.db
      .query('aiAgentConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    return {
      enabled: isAiAgentFeatureEnabled(),
      automationEnabled: isAiAgentAutomationEnabled(),
      providerConfigured: isAiAgentProviderConfigured(),
      policyVersion: AI_AGENT_CONSENT_POLICY_VERSION,
      consentAccepted: hasCurrentConsent(consent),
      automationAccepted:
        hasCurrentConsent(consent) && consent?.automationAccepted === true,
      acceptedAt: hasCurrentConsent(consent) ? consent?.acceptedAt : undefined,
      scopes: AI_AGENT_SCOPES,
    };
  },
});

export async function acceptAgentConsentForUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: { policyVersion: string; scopes: string[] },
) {
  const uniqueScopes = [...new Set(args.scopes)];
  if (
    args.policyVersion !== AI_AGENT_CONSENT_POLICY_VERSION ||
    uniqueScopes.length !== AI_AGENT_SCOPES.length ||
    !AI_AGENT_SCOPES.every((item) => uniqueScopes.includes(item))
  )
    throw new Error('INVALID_AGENT_CONSENT');
  const existing = await ctx.db
    .query('aiAgentConsents')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  const acceptedAt = Date.now();
  const value = {
    provider: AI_AGENT_CONSENT_PROVIDER,
    policyVersion: AI_AGENT_CONSENT_POLICY_VERSION,
    scopes: [...AI_AGENT_SCOPES],
    acceptedAt,
    automationAccepted: existing?.automationAccepted ?? false,
    revokedAt: undefined,
    updatedAt: acceptedAt,
  };
  if (existing) await ctx.db.patch(existing._id, value);
  else await ctx.db.insert('aiAgentConsents', { ...value, userId });
  return { policyVersion: AI_AGENT_CONSENT_POLICY_VERSION, acceptedAt };
}

export const acceptConsent = mutation({
  args: { policyVersion: v.string(), scopes: v.array(scope) },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
    return acceptAgentConsentForUser(ctx, userId, args);
  },
});

export const setAutomation = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
    const consent = await ctx.db
      .query('aiAgentConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (!hasCurrentConsent(consent)) throw new Error('CONSENT_REQUIRED');
    if (args.enabled && !isAiAgentAutomationEnabled())
      throw new Error('FEATURE_DISABLED');
    const updatedAt = Date.now();
    await ctx.db.patch(consent!._id, {
      automationAccepted: args.enabled,
      updatedAt,
    });
    return { enabled: args.enabled, updatedAt };
  },
});

async function deleteRunsForUser(ctx: MutationCtx, userId: Id<'users'>) {
  const runs = await ctx.db
    .query('agentRuns')
    .filter((q) => q.eq(q.field('userId'), userId))
    .collect();
  for (const run of runs) await ctx.db.delete(run._id);
}

export const revokeConsent = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    return revokeAgentConsentForUser(ctx, userId);
  },
});

export async function revokeAgentConsentForUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
) {
  const consent = await ctx.db
    .query('aiAgentConsents')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  const revokedAt = Date.now();
  if (consent)
    await ctx.db.patch(consent._id, {
      automationAccepted: false,
      revokedAt,
      updatedAt: revokedAt,
    });
  await deleteRunsForUser(ctx, userId);
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  if (profile) {
    const preferences = await ctx.db
      .query('preferences')
      .withIndex('by_profile_local', (q) =>
        q.eq('profileId', profile._id).eq('localId', 'preferences'),
      )
      .unique();
    if (preferences)
      await ctx.db.patch(preferences._id, {
        medicalRecommendations: false,
        agentNotifications: false,
        agentLastSuccessfulRunAt: undefined,
        updatedAt: revokedAt,
      });
    const triggers = await ctx.db
      .query('agentTriggers')
      .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
      .collect();
    for (const trigger of triggers) {
      if (trigger.status === 'active')
        await ctx.db.patch(trigger._id, {
          status: 'suspended',
          updatedAt: revokedAt,
        });
    }
    const reminders = await ctx.db
      .query('reminders')
      .withIndex('by_profile_due', (q) => q.eq('profileId', profile._id))
      .collect();
    for (const reminder of reminders) {
      if (!reminder.deletedAt && reminder.localId.startsWith('agent-prep_'))
        await ctx.db.patch(reminder._id, {
          deletedAt: revokedAt,
          updatedAt: revokedAt,
        });
    }
  }
  return { revoked: Boolean(consent), revokedAt };
}

export const clearMyData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireActiveAccount(ctx);
    const profile = await requireOwnedProfile(ctx);
    const clearedAt = Date.now();
    let deleted = 0;
    for (const table of [
      'carePlanItems',
      'agentTriggers',
      'recommendationEvents',
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    const agentReminders = await ctx.db
      .query('reminders')
      .withIndex('by_profile_due', (q) => q.eq('profileId', profile._id))
      .collect();
    for (const reminder of agentReminders) {
      if (!reminder.localId.startsWith('agent-prep_')) continue;
      await ctx.db.delete(reminder._id);
      deleted += 1;
    }
    const consent = await ctx.db
      .query('aiAgentConsents')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (consent) {
      await ctx.db.delete(consent._id);
      deleted += 1;
    }
    await deleteRunsForUser(ctx, userId);
    const preferences = await ctx.db
      .query('preferences')
      .withIndex('by_profile_local', (q) =>
        q.eq('profileId', profile._id).eq('localId', 'preferences'),
      )
      .unique();
    if (preferences) {
      await ctx.db.patch(preferences._id, {
        medicalRecommendations: false,
        agentNotifications: false,
        agentLastSuccessfulRunAt: undefined,
        updatedAt: clearedAt,
      });
    }
    await ctx.db.patch(profile._id, { agentDataClearedAt: clearedAt });
    return { deleted, clearedAt };
  },
});

export const generationAccess = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query('accountStates')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (state?.scheduledDeletionAt)
      return {
        ok: false as const,
        reason: 'ACCOUNT_PENDING_DELETION' as const,
      };
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (!profile?.onboardingCompleted)
      return { ok: false as const, reason: 'PROFILE_REQUIRED' as const };
    const consent = await ctx.db
      .query('aiAgentConsents')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .unique();
    if (!hasCurrentConsent(consent))
      return { ok: false as const, reason: 'CONSENT_REQUIRED' as const };
    return {
      ok: true as const,
      goal: profile.goal,
      automationAccepted: consent?.automationAccepted === true,
    };
  },
});

export const saveContinuation = internalMutation({
  args: {
    userId: v.id('users'),
    requestId: v.string(),
    continuationId: v.string(),
    step: v.number(),
    allowedCalls: v.array(
      v.object({
        callId: v.string(),
        name: v.string(),
        argumentsHash: v.string(),
        step: v.optional(v.number()),
      }),
    ),
    inputHash: v.string(),
    model: v.string(),
    durationMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (!isAiAgentFeatureEnabled()) return false;
    const [state, profile, consent] = await Promise.all([
      ctx.db
        .query('accountStates')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .unique(),
      ctx.db
        .query('profiles')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .unique(),
      ctx.db
        .query('aiAgentConsents')
        .withIndex('by_user', (q) => q.eq('userId', args.userId))
        .unique(),
    ]);
    if (
      state?.scheduledDeletionAt ||
      !profile?.onboardingCompleted ||
      !hasCurrentConsent(consent)
    )
      return false;
    const now = Date.now();
    await ctx.db.insert('agentRuns', {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const takeContinuation = internalMutation({
  args: { userId: v.id('users'), continuationId: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query('agentRuns')
      .withIndex('by_user_continuation', (q) =>
        q.eq('userId', args.userId).eq('continuationId', args.continuationId),
      )
      .unique();
    if (!run) return null;
    await ctx.db.delete(run._id);
    return run;
  },
});

export const purgeExpiredRuns = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const expired = await ctx.db
      .query('agentRuns')
      .withIndex('by_expiry', (q) => q.lte('expiresAt', now))
      .take(100);
    for (const run of expired) await ctx.db.delete(run._id);
    return { deleted: expired.length };
  },
});

function safeContextText(value: string | undefined, max = 500) {
  return value
    ?.normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(
      /(?:[a-z][a-z0-9+.-]*:\/\/|www\.|data:)[^\s]+/gi,
      '[ссылка скрыта]',
    )
    .replace(/<\/?[A-Za-z][^>]{0,500}>/g, '[разметка скрыта]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[контакт скрыт]')
    .replace(
      /(^|[^\p{L}\d-])(?:[\p{L}\d-]+\.)+[\p{L}]{2,63}(?![\p{L}\d-])/giu,
      '$1[ссылка скрыта]',
    )
    .replace(/(?:sms:|mailto:|tel:)[^\s]+/gi, '[контакт скрыт]')
    .replace(/\+\d[\d\s().-]{7,}\d/g, '[контакт скрыт]')
    .replace(/\b\d{10,15}\b/g, '[контакт скрыт]')
    .replace(/\/(?:private|var|users)\/[^\s]*/gi, '[путь скрыт]')
    .trim()
    .slice(0, max);
}

export const dueSyncedAutomation = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    if (!isAiAgentAutomationEnabled()) return [];
    const triggers = await ctx.db
      .query('agentTriggers')
      .withIndex('by_status_next_evaluation', (q) =>
        q.eq('status', 'active').lte('nextEvaluationAt', args.now),
      )
      // Provider execution remains bounded by the transactional global and
      // per-user rate limits in the scheduled action.
      .take(100);
    const results = [];
    const cutoff = args.now - 30 * 24 * 60 * 60_000;
    for (const trigger of triggers) {
      if (
        trigger.deletedAt ||
        !validateAgentTrigger(trigger as unknown as AgentTrigger) ||
        trigger.status !== 'active' ||
        trigger.expiresAt <= args.now ||
        (trigger.cooldownUntil ?? 0) > args.now ||
        trigger.runCount >= trigger.maxRuns
      )
        continue;
      const profile = await ctx.db.get(trigger.profileId);
      if (
        !profile?.consentToCloudSyncAt ||
        !profile.lastMedicalSyncAt ||
        args.now - profile.lastMedicalSyncAt > 7 * 24 * 60 * 60_000
      )
        continue;
      const [state, consent, preferences] = await Promise.all([
        ctx.db
          .query('accountStates')
          .withIndex('by_user', (q) => q.eq('userId', profile.userId))
          .unique(),
        ctx.db
          .query('aiAgentConsents')
          .withIndex('by_user', (q) => q.eq('userId', profile.userId))
          .unique(),
        ctx.db
          .query('preferences')
          .withIndex('by_profile_local', (q) =>
            q.eq('profileId', profile._id).eq('localId', 'preferences'),
          )
          .unique(),
      ]);
      if (
        state?.scheduledDeletionAt ||
        !hasCurrentConsent(consent) ||
        consent?.automationAccepted !== true ||
        !preferences ||
        preferences.deletedAt ||
        !preferences.medicalRecommendations ||
        args.now - preferences.updatedAt > 7 * 24 * 60 * 60_000
      )
        continue;
      const [
        journals,
        tests,
        scans,
        plans,
        conditions,
        medications,
        allergies,
      ] = await Promise.all([
        ctx.db
          .query('journalEntries')
          .withIndex('by_profile_time', (q) =>
            q.eq('profileId', profile._id).gte('occurredAt', cutoff),
          )
          .order('desc')
          .take(101),
        ctx.db
          .query('labResults')
          .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
          .order('desc')
          .take(61),
        ctx.db
          .query('scanResults')
          .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
          .order('desc')
          .take(61),
        ctx.db
          .query('carePlanItems')
          .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
          .collect(),
        ctx.db
          .query('medicalConditions')
          .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
          .collect(),
        ctx.db
          .query('medications')
          .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
          .collect(),
        ctx.db
          .query('allergyRisks')
          .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
          .collect(),
      ]);
      const activeConditions = conditions
        .filter((item) => !item.deletedAt && item.status === 'active')
        .sort((left, right) => right.updatedAt - left.updatedAt);
      const activeMedications = medications
        .filter((item) => !item.deletedAt && item.active)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      const activeAllergies = allergies
        .filter((item) => !item.deletedAt)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      const confirmedLabIds = new Set(
        tests
          .filter((item) => !item.deletedAt && item.status !== 'unreviewed')
          .map((item) => item.localId),
      );
      const confirmedScanIds = new Set(
        scans
          .filter((item) => !item.deletedAt && item.confirmedByUser === true)
          .map((item) => item.localId),
      );
      const recentJournals = journals.filter(
        (item) =>
          !item.deletedAt &&
          item.occurredAt <= args.now &&
          (item.source !== 'lab' ||
            Boolean(
              item.sourceLocalId && confirmedLabIds.has(item.sourceLocalId),
            )) &&
          (item.source !== 'scan' ||
            Boolean(
              item.sourceLocalId && confirmedScanIds.has(item.sourceLocalId),
            )),
      );
      const latestEvidenceAt = Math.max(
        profile.updatedAt,
        ...[
          ...recentJournals,
          ...tests.filter((item) => item.status !== 'unreviewed'),
          ...scans.filter((item) => item.confirmedByUser),
          ...plans,
          ...conditions,
          ...medications,
          ...allergies,
        ]
          .filter((item) => !item.deletedAt)
          .map((item) => item.updatedAt),
      );
      if (
        trigger.templateKey === 'data-change-review' &&
        latestEvidenceAt <=
          (trigger.lastRunAt ?? preferences.agentLastSuccessfulRunAt ?? 0)
      )
        continue;
      if (trigger.templateKey === 'monthly-plan-review' && trigger.lastRunAt) {
        if (
          sameLocalMonth(
            trigger.lastRunAt,
            args.now,
            profile.timezoneOffsetMinutes ?? 0,
          )
        )
          continue;
      }
      if (trigger.templateKey === 'due-window') {
        const target = plans.find(
          (item) => item.localId === trigger.targetCarePlanLocalId,
        );
        if (
          !target ||
          target.deletedAt ||
          target.status !== 'upcoming' ||
          target.safetyHoldAt ||
          (target.dueWindowStart ?? target.dueAt ?? Infinity) > args.now
        )
          continue;
      }
      const confirmedTests = [
        ...tests
          .filter(
            (item) =>
              !item.deletedAt &&
              item.status !== 'unreviewed' &&
              item.collectedAt <= args.now,
          )
          .map((item) => ({
            sourceRef: {
              source: 'test' as const,
              localId: item.localId,
              label: safeContextText(item.title, 160) ?? 'Результат анализа',
              occurredAt: item.collectedAt,
            },
            title: safeContextText(item.title, 160) ?? 'Результат анализа',
            collectedAt: item.collectedAt,
            values: item.analytes
              .slice(0, 12)
              .map((analyte) =>
                [
                  safeContextText(analyte.name, 100),
                  safeContextText(analyte.value, 100),
                  safeContextText(analyte.unit, 40),
                ]
                  .filter(Boolean)
                  .join(' '),
              ),
          })),
        ...scans
          .filter(
            (item) =>
              !item.deletedAt &&
              item.confirmedByUser === true &&
              item.capturedAt <= args.now,
          )
          .map((item) => ({
            sourceRef: {
              source: 'test' as const,
              localId: item.localId,
              label:
                safeContextText(item.testSystemKey, 160) ??
                'Подтверждённый домашний тест',
              occurredAt: item.capturedAt,
            },
            title:
              safeContextText(item.testSystemKey, 160) ??
              'Подтверждённый домашний тест',
            collectedAt: item.capturedAt,
            values: [`Подтверждённый результат: ${item.confirmedValue}`],
          })),
      ].sort((left, right) => right.collectedAt - left.collectedAt);
      const activePlans = plans.filter(
        (item) =>
          !item.deletedAt &&
          (item.status === 'current' || item.status === 'upcoming'),
      );
      const envelope = {
        version: AI_AGENT_CONTEXT_VERSION,
        generatedAt: args.now,
        profile: {
          ageYears: profile.birthDate
            ? Math.max(
                0,
                Math.floor(
                  (args.now - profile.birthDate) /
                    (365.2425 * 24 * 60 * 60_000),
                ),
              )
            : undefined,
          goal: profile.goal,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          postpartum: profile.postpartum,
          postContraception: profile.postContraception,
          pregnancyWeeks:
            profile.pregnancyStartAt && profile.pregnancyStartAt <= args.now
              ? Math.max(
                  0,
                  Math.floor(
                    (args.now - profile.pregnancyStartAt) /
                      (7 * 24 * 60 * 60_000),
                  ),
                )
              : undefined,
          lastPeriodAgeDays:
            profile.lastPeriodStartAt && profile.lastPeriodStartAt <= args.now
              ? Math.max(
                  0,
                  Math.floor(
                    (args.now - profile.lastPeriodStartAt) / (24 * 60 * 60_000),
                  ),
                )
              : undefined,
          cycleLengthDays: profile.cycleLengthDays,
          conditions: activeConditions.slice(0, 12).map((item) => ({
            title: safeContextText(item.title, 160),
            notes: safeContextText(item.notes, 300),
          })),
          medications: activeMedications.slice(0, 12).map((item) => ({
            name: safeContextText(item.name, 160),
            dosage: safeContextText(item.dosage, 120),
            frequency: safeContextText(item.frequency, 120),
          })),
          allergies: activeAllergies.slice(0, 12).map((item) => ({
            allergen: safeContextText(item.allergen, 160),
            reaction: safeContextText(item.reaction, 200),
            severity: item.severity,
          })),
        },
        recentJournal: recentJournals.slice(0, 20).map((item) => ({
          sourceRef: {
            source: 'journal',
            localId: item.localId,
            label: safeContextText(item.label, 160) ?? 'Запись дневника',
            occurredAt: item.occurredAt,
            ageDays: Math.max(
              0,
              Math.floor((args.now - item.occurredAt) / (24 * 60 * 60_000)),
            ),
            stale: false,
          },
          kind: item.kind,
          label: safeContextText(item.label, 160),
          value: safeContextText(item.textValue, 600),
        })),
        confirmedTests: confirmedTests.slice(0, 20),
        carePlan: activePlans.slice(0, 15).map((item) => ({
          sourceRef: {
            source: 'care-plan',
            localId: item.localId,
            label: safeContextText(item.title, 160) ?? 'Пункт плана',
            occurredAt: item.dueAt ?? item.updatedAt,
          },
          title: safeContextText(item.title, 160),
          status: item.status,
          dueAt: item.dueAt,
          provisional: item.provisional,
          safetyHold: Boolean(item.safetyHoldAt),
        })),
        omitted: {
          profile:
            Math.max(0, activeConditions.length - 12) +
            Math.max(0, activeMedications.length - 12) +
            Math.max(0, activeAllergies.length - 12),
          journal: Math.max(0, recentJournals.length - 20),
          tests: Math.max(0, confirmedTests.length - 20),
          carePlan: Math.max(0, activePlans.length - 15),
        },
      };
      while (JSON.stringify(envelope).length > 24_000) {
        if (envelope.recentJournal.length > 1) {
          envelope.recentJournal.pop();
          envelope.omitted.journal += 1;
        } else if (envelope.confirmedTests.length > 1) {
          envelope.confirmedTests.pop();
          envelope.omitted.tests += 1;
        } else if (envelope.carePlan.length > 1) {
          envelope.carePlan.pop();
          envelope.omitted.carePlan += 1;
        } else {
          const profileLists = [
            envelope.profile.conditions,
            envelope.profile.medications,
            envelope.profile.allergies,
          ].sort((left, right) => right.length - left.length);
          if (!profileLists[0]?.length) break;
          profileLists[0].pop();
          envelope.omitted.profile += 1;
        }
      }
      const contextEnvelope = JSON.stringify(envelope);
      if (contextEnvelope.length > 24_000) continue;
      results.push({
        userId: profile.userId,
        profileId: profile._id,
        triggerId: trigger._id,
        goal: profile.goal,
        contextEnvelope,
      });
    }
    return results;
  },
});

const planRecommendation = v.object({
  catalogKey: v.string(),
  monthOffset: v.number(),
  confidence: v.number(),
  rationale: v.string(),
  evidenceSourceIds: v.array(v.string()),
});

const DAY_MS = 24 * 60 * 60_000;

function calendarPartsAt(timestamp: number, timezoneOffsetMinutes = 0) {
  const local = new Date(timestamp - timezoneOffsetMinutes * 60_000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth() };
}

function localCalendarTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  timezoneOffsetMinutes = 0,
) {
  return (
    Date.UTC(year, month, day, hour, 0, 0, 0) + timezoneOffsetMinutes * 60_000
  );
}

function scheduledPlanDueAt(
  now: number,
  monthOffset: number,
  current: boolean,
  timezoneOffsetMinutes = 0,
) {
  const { year, month } = calendarPartsAt(now, timezoneOffsetMinutes);
  return current
    ? localCalendarTimestamp(year, month + 1, 0, 18, timezoneOffsetMinutes)
    : localCalendarTimestamp(
        year,
        month + Math.max(1, monthOffset),
        15,
        18,
        timezoneOffsetMinutes,
      );
}

function sameLocalMonth(
  left: number,
  right: number,
  timezoneOffsetMinutes = 0,
) {
  const leftParts = calendarPartsAt(left, timezoneOffsetMinutes);
  const rightParts = calendarPartsAt(right, timezoneOffsetMinutes);
  return (
    leftParts.year === rightParts.year && leftParts.month === rightParts.month
  );
}

function portableCarePlan(item: CarePlanItem) {
  const {
    _id: _id,
    _creationTime: _creationTime,
    profileId: _profileId,
    ...portable
  } = item as CarePlanItem & {
    _id?: unknown;
    _creationTime?: number;
    profileId?: unknown;
  };
  return portable;
}

function scheduledEvent({
  afterStatus,
  beforeStatus,
  carePlanLocalId,
  evidenceRefs,
  localId,
  model,
  now,
  reasonCode,
  triggerLocalId,
  type,
}: {
  afterStatus?: CarePlanItem['status'];
  beforeStatus?: CarePlanItem['status'];
  carePlanLocalId: string;
  evidenceRefs: AgentSourceRef[];
  localId: string;
  model: string;
  now: number;
  reasonCode: string;
  triggerLocalId: string;
  type: RecommendationEvent['type'];
}): RecommendationEvent {
  return {
    localId,
    carePlanLocalId,
    triggerLocalId,
    type,
    reasonCode,
    beforeStatus,
    afterStatus,
    evidenceRefs: evidenceRefs.map((ref) => ({ ...ref, label: ref.source })),
    policyVersion: AGENT_POLICY_VERSION,
    model,
    occurredAt: now,
    updatedAt: now,
  };
}

export const applySyncedPlanProposal = internalMutation({
  args: {
    profileId: v.id('profiles'),
    triggerId: v.id('agentTriggers'),
    requestId: v.string(),
    model: v.string(),
    now: v.number(),
    recommendations: v.array(planRecommendation),
  },
  handler: async (ctx, args) => {
    if (!isAiAgentAutomationEnabled()) return { applied: 0 };
    const [profile, trigger, existing, preferences] = await Promise.all([
      ctx.db.get(args.profileId),
      ctx.db.get(args.triggerId),
      ctx.db
        .query('carePlanItems')
        .withIndex('by_profile', (q) => q.eq('profileId', args.profileId))
        .collect(),
      ctx.db
        .query('preferences')
        .withIndex('by_profile_local', (q) =>
          q.eq('profileId', args.profileId).eq('localId', 'preferences'),
        )
        .unique(),
    ]);
    if (
      !profile ||
      !trigger ||
      trigger.profileId !== args.profileId ||
      !validateAgentTrigger(trigger as unknown as AgentTrigger) ||
      trigger.status !== 'active' ||
      trigger.expiresAt <= args.now ||
      (trigger.cooldownUntil ?? 0) > args.now ||
      trigger.runCount >= trigger.maxRuns ||
      trigger.nextEvaluationAt > args.now ||
      !preferences?.medicalRecommendations ||
      args.now - preferences.updatedAt > 7 * DAY_MS ||
      !profile.consentToCloudSyncAt ||
      !profile.lastMedicalSyncAt ||
      args.now - profile.lastMedicalSyncAt > 7 * 24 * 60 * 60_000
    )
      return { applied: 0 };
    const [
      state,
      consent,
      journals,
      tests,
      scans,
      conditions,
      medications,
      allergies,
    ] = await Promise.all([
      ctx.db
        .query('accountStates')
        .withIndex('by_user', (q) => q.eq('userId', profile.userId))
        .unique(),
      ctx.db
        .query('aiAgentConsents')
        .withIndex('by_user', (q) => q.eq('userId', profile.userId))
        .unique(),
      ctx.db
        .query('journalEntries')
        .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
        .order('desc')
        .take(100),
      ctx.db
        .query('labResults')
        .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
        .order('desc')
        .take(100),
      ctx.db
        .query('scanResults')
        .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
        .order('desc')
        .take(100),
      ctx.db
        .query('medicalConditions')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
      ctx.db
        .query('medications')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
      ctx.db
        .query('allergyRisks')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
    ]);
    if (
      state?.scheduledDeletionAt ||
      !hasCurrentConsent(consent) ||
      consent?.automationAccepted !== true
    )
      return { applied: 0 };
    const confirmedLabIds = new Set(
      tests
        .filter((item) => !item.deletedAt && item.status !== 'unreviewed')
        .map((item) => item.localId),
    );
    const confirmedScanIds = new Set(
      scans
        .filter((item) => !item.deletedAt && item.confirmedByUser === true)
        .map((item) => item.localId),
    );
    const eligibleJournals = journals.filter(
      (item) =>
        !item.deletedAt &&
        item.occurredAt <= args.now &&
        (item.source !== 'lab' ||
          Boolean(
            item.sourceLocalId && confirmedLabIds.has(item.sourceLocalId),
          )) &&
        (item.source !== 'scan' ||
          Boolean(
            item.sourceLocalId && confirmedScanIds.has(item.sourceLocalId),
          )),
    );
    const latestEvidenceAt = Math.max(
      profile.updatedAt,
      ...[
        ...eligibleJournals,
        ...tests.filter((item) => item.status !== 'unreviewed'),
        ...scans.filter((item) => item.confirmedByUser),
        ...existing,
        ...conditions,
        ...medications,
        ...allergies,
      ]
        .filter((item) => !item.deletedAt)
        .map((item) => item.updatedAt),
    );
    const timezoneOffsetMinutes = profile.timezoneOffsetMinutes ?? 0;
    if (
      (trigger.templateKey === 'data-change-review' &&
        latestEvidenceAt <=
          (trigger.lastRunAt ?? preferences.agentLastSuccessfulRunAt ?? 0)) ||
      (trigger.templateKey === 'monthly-plan-review' &&
        trigger.lastRunAt !== undefined &&
        sameLocalMonth(trigger.lastRunAt, args.now, timezoneOffsetMinutes))
    )
      return { applied: 0 };
    const allowed = new Map(
      agentPlanCatalogCandidates(profile.goal).map((item) => [item.key, item]),
    );
    const active = existing.filter(
      (item) =>
        !item.deletedAt &&
        (item.status === 'current' || item.status === 'upcoming'),
    );
    if (trigger.templateKey === 'due-window') {
      const target = active.find(
        (item) => item.localId === trigger.targetCarePlanLocalId,
      );
      if (
        !target ||
        target.status !== 'upcoming' ||
        target.safetyHoldAt ||
        (target.dueWindowStart ?? target.dueAt ?? Infinity) > args.now
      )
        return { applied: 0 };
    }
    const keys = new Set(active.map((item) => item.catalogKey));
    const declined = new Set(
      existing
        .filter(
          (item) =>
            !item.deletedAt &&
            item.status === 'declined' &&
            item.declinedAt &&
            args.now - item.declinedAt < 90 * 24 * 60 * 60_000,
        )
        .map((item) => item.catalogKey),
    );
    const goalRef: AgentSourceRef = {
      source: 'care-plan',
      localId: `profile-goal-${profile.goal}`,
      label: 'care-plan',
    };
    const evidence = new Map<string, AgentSourceRef>([
      [goalRef.localId, goalRef],
    ]);
    for (const item of eligibleJournals)
      evidence.set(item.localId, {
        source: 'journal',
        localId: item.localId,
        label: safeContextText(item.label, 160) ?? 'Запись дневника',
        occurredAt: item.occurredAt,
      });
    for (const item of tests.filter(
      (row) =>
        !row.deletedAt &&
        row.status !== 'unreviewed' &&
        row.collectedAt <= args.now,
    ))
      evidence.set(item.localId, {
        source: 'test',
        localId: item.localId,
        label: safeContextText(item.title, 160) ?? 'Результат анализа',
        occurredAt: item.collectedAt,
      });
    for (const item of scans.filter(
      (row) =>
        !row.deletedAt &&
        row.confirmedByUser === true &&
        row.capturedAt <= args.now,
    ))
      evidence.set(item.localId, {
        source: 'test',
        localId: item.localId,
        label:
          safeContextText(item.testSystemKey, 160) ??
          'Подтверждённый домашний тест',
        occurredAt: item.capturedAt,
      });
    for (const item of existing.filter((row) => !row.deletedAt))
      evidence.set(item.localId, {
        source: 'care-plan',
        localId: item.localId,
        label: safeContextText(item.title, 160) ?? 'Пункт плана',
        occurredAt: item.dueAt ?? item.updatedAt,
      });

    const recommendations = args.recommendations.flatMap(
      (recommendation, index, all) => {
        const entry = allowed.get(recommendation.catalogKey);
        const rationale = safeContextText(recommendation.rationale, 700);
        if (
          !entry ||
          declined.has(entry.key) ||
          all.findIndex(
            (candidate) => candidate.catalogKey === recommendation.catalogKey,
          ) !== index ||
          !Number.isInteger(recommendation.monthOffset) ||
          recommendation.monthOffset < 0 ||
          recommendation.monthOffset > 4 ||
          !Number.isFinite(recommendation.confidence) ||
          recommendation.confidence < 0 ||
          recommendation.confidence > 1 ||
          !rationale
        )
          return [];
        const refs = recommendation.evidenceSourceIds
          .map((id) => evidence.get(id))
          .filter((ref): ref is AgentSourceRef => Boolean(ref))
          .slice(0, 8);
        return [{ recommendation, entry, rationale, refs }];
      },
    );
    let currentCount = active.filter(
      (item) => item.status === 'current',
    ).length;
    let upcomingCount = active.filter(
      (item) => item.status === 'upcoming',
    ).length;
    const stagedItems: CarePlanItem[] = [];
    const stagedEvents: RecommendationEvent[] = [];
    const promotedIds = new Set<string>();
    const desiredKeys = new Set(recommendations.map((item) => item.entry.key));
    const unused = recommendations.filter(
      (item) =>
        !keys.has(item.entry.key) && item.recommendation.monthOffset > 0,
    );
    let sequence = 0;

    const currentMonthEnd = scheduledPlanDueAt(
      args.now,
      0,
      true,
      timezoneOffsetMinutes,
    );
    for (const original of active
      .filter((item) => {
        const entry = allowed.get(item.catalogKey);
        return Boolean(
          item.status === 'upcoming' &&
          !item.safetyHoldAt &&
          (item.dueAt ?? Infinity) <= currentMonthEnd &&
          entry?.riskTier === 'low' &&
          !entry.requiresClinician &&
          entry.riskFlags.length === 0,
        );
      })
      .sort(
        (left, right) => (left.dueAt ?? Infinity) - (right.dueAt ?? Infinity),
      )) {
      if (currentCount >= 5) break;
      const promoted: CarePlanItem = {
        ...(original as unknown as CarePlanItem),
        status: 'current',
        updatedAt: args.now,
      };
      if (!validateCarePlanItem(promoted)) continue;
      stagedItems.push(promoted);
      stagedEvents.push(
        scheduledEvent({
          localId: `recommendation-event_${args.requestId}_p${sequence}`,
          carePlanLocalId: original.localId,
          triggerLocalId: trigger.localId,
          type: 'promoted',
          reasonCode: 'DUE_WINDOW_REACHED',
          beforeStatus: 'upcoming',
          afterStatus: 'current',
          evidenceRefs: promoted.evidenceRefs,
          model: args.model,
          now: args.now,
        }),
      );
      promotedIds.add(original.localId);
      currentCount += 1;
      upcomingCount -= 1;
      sequence += 1;
    }

    for (const original of active
      .filter(
        (item) =>
          !promotedIds.has(item.localId) &&
          item.status === 'upcoming' &&
          item.scheduleBasis === 'model_inference' &&
          !desiredKeys.has(item.catalogKey) &&
          args.now - (item.lastModelReplacementAt ?? 0) >= 30 * DAY_MS,
      )
      .sort((left, right) => left.confidence - right.confidence)) {
      const candidateIndex = unused.findIndex(
        ({ entry, recommendation, refs }) =>
          Boolean(
            recommendation.confidence > original.confidence &&
            !completedCarePlanBlocksModelRecommendation(
              existing as unknown as CarePlanItem[],
              entry.key,
              scheduledPlanDueAt(
                args.now,
                recommendation.monthOffset,
                false,
                timezoneOffsetMinutes,
              ),
            ) &&
            refs.some(
              (ref) =>
                (ref.source === 'journal' || ref.source === 'test') &&
                (ref.occurredAt ?? 0) > original.updatedAt,
            ),
          ),
      );
      if (candidateIndex < 0) continue;
      const [{ entry, recommendation, rationale, refs }] = unused.splice(
        candidateIndex,
        1,
      );
      const superseded: CarePlanItem = {
        ...(original as unknown as CarePlanItem),
        status: 'superseded',
        supersededAt: args.now,
        lastModelReplacementAt: args.now,
        updatedAt: args.now,
      };
      const dueAt = scheduledPlanDueAt(
        args.now,
        recommendation.monthOffset,
        false,
        timezoneOffsetMinutes,
      );
      const replacement: CarePlanItem = {
        localId: `care-plan_${args.requestId}_r${sequence}`,
        catalogKey: entry.key,
        title: entry.title,
        category: entry.category,
        description: entry.specimen,
        status: 'upcoming',
        riskTier: entry.riskTier,
        dueAt,
        dueWindowStart: dueAt - 14 * DAY_MS,
        dueWindowEnd: dueAt + 14 * DAY_MS,
        scheduleBasis: 'model_inference',
        confidence: recommendation.confidence,
        provisional: true,
        requiresClinician: entry.requiresClinician,
        lastModelReplacementAt: args.now,
        evidenceRefs: (refs.length ? refs : [goalRef]).map((ref) => ({
          ...ref,
          label: ref.source,
        })),
        rationale,
        policyVersion: AGENT_POLICY_VERSION,
        catalogVersion: ANALYSIS_CATALOG_VERSION,
        model: args.model,
        illustrationKey: entry.illustrationKey,
        updatedAt: args.now,
      };
      if (!validateCarePlanItem(replacement)) continue;
      stagedItems.push(superseded, replacement);
      stagedEvents.push(
        scheduledEvent({
          localId: `recommendation-event_${args.requestId}_rs${sequence}`,
          carePlanLocalId: original.localId,
          triggerLocalId: trigger.localId,
          type: 'replaced',
          reasonCode: 'NEW_EVIDENCE_SUPPORTED_BETTER_CANDIDATE',
          beforeStatus: 'upcoming',
          afterStatus: 'superseded',
          evidenceRefs: refs,
          model: args.model,
          now: args.now,
        }),
        scheduledEvent({
          localId: `recommendation-event_${args.requestId}_rn${sequence}`,
          carePlanLocalId: replacement.localId,
          triggerLocalId: trigger.localId,
          type: 'created',
          reasonCode: 'SYNCED_MODEL_REPLACEMENT_VALIDATED',
          afterStatus: 'upcoming',
          evidenceRefs: replacement.evidenceRefs,
          model: args.model,
          now: args.now,
        }),
      );
      keys.delete(original.catalogKey);
      keys.add(entry.key);
      sequence += 1;
    }

    for (const { entry, recommendation, rationale, refs } of recommendations) {
      if (keys.has(entry.key)) continue;
      const current =
        recommendation.monthOffset === 0 &&
        (refs.length === 0 || refs.some((ref) => ref.source === 'test')) &&
        entry.riskTier === 'low' &&
        !entry.requiresClinician &&
        !entry.riskFlags.length &&
        currentCount < 5;
      if (!current && upcomingCount >= 10) continue;
      const dueAt = scheduledPlanDueAt(
        args.now,
        recommendation.monthOffset,
        current,
        timezoneOffsetMinutes,
      );
      const duplicateCompletion = completedCarePlanBlocksModelRecommendation(
        existing as unknown as CarePlanItem[],
        entry.key,
        dueAt,
      );
      if (duplicateCompletion) continue;
      const localId = `care-plan_${args.requestId}_n${sequence}`;
      const plan: CarePlanItem = {
        localId,
        catalogKey: entry.key,
        title: entry.title,
        category: entry.category,
        description: entry.specimen,
        status: current ? 'current' : 'upcoming',
        riskTier: entry.riskTier,
        dueAt,
        dueWindowStart: current ? args.now : dueAt - 14 * DAY_MS,
        dueWindowEnd: dueAt + 14 * DAY_MS,
        scheduleBasis: 'model_inference',
        confidence: recommendation.confidence,
        provisional: true,
        requiresClinician: entry.requiresClinician,
        evidenceRefs: (refs.length ? refs : [goalRef]).map((ref) => ({
          ...ref,
          label: ref.source,
        })),
        rationale,
        policyVersion: AGENT_POLICY_VERSION,
        catalogVersion: ANALYSIS_CATALOG_VERSION,
        model: args.model,
        illustrationKey: entry.illustrationKey,
        updatedAt: args.now,
      };
      if (!validateCarePlanItem(plan)) continue;
      stagedItems.push(plan);
      stagedEvents.push(
        scheduledEvent({
          localId: `recommendation-event_${args.requestId}_n${sequence}`,
          carePlanLocalId: localId,
          triggerLocalId: trigger.localId,
          type: 'created',
          reasonCode: 'SYNCED_MODEL_PLAN_PROPOSAL_VALIDATED',
          afterStatus: plan.status,
          evidenceRefs: plan.evidenceRefs,
          model: args.model,
          now: args.now,
        }),
      );
      if (current) currentCount += 1;
      else upcomingCount += 1;
      keys.add(entry.key);
      sequence += 1;
    }

    if (
      currentCount < 1 ||
      currentCount > 5 ||
      upcomingCount < 5 ||
      upcomingCount > 10
    )
      return { applied: 0 };

    for (const item of stagedItems) {
      const existingItem = existing.find(
        (candidate) => candidate.localId === item.localId,
      );
      const portable = portableCarePlan(item);
      if (existingItem) await ctx.db.patch(existingItem._id, portable);
      else
        await ctx.db.insert('carePlanItems', {
          ...portable,
          profileId: args.profileId,
        });
    }
    for (const event of stagedEvents)
      await ctx.db.insert('recommendationEvents', {
        ...event,
        profileId: args.profileId,
      });

    const { year, month } = calendarPartsAt(args.now, timezoneOffsetMinutes);
    const nextRunAt = localCalendarTimestamp(
      year,
      month + 1,
      15,
      12,
      timezoneOffsetMinutes,
    );
    const runCount = trigger.runCount + 1;
    const completed =
      runCount >= trigger.maxRuns ||
      nextRunAt >= trigger.expiresAt ||
      (trigger.templateKey === 'monthly-plan-review' &&
        sameLocalMonth(nextRunAt, trigger.expiresAt, timezoneOffsetMinutes));
    await ctx.db.patch(trigger._id, {
      status: completed ? 'completed' : 'active',
      runCount,
      lastRunAt: args.now,
      nextEvaluationAt: completed ? trigger.nextEvaluationAt : nextRunAt,
      cooldownUntil:
        trigger.templateKey === 'monthly-plan-review' && !completed
          ? args.now + 25 * DAY_MS
          : undefined,
      updatedAt: args.now,
    });
    await ctx.db.patch(preferences._id, {
      agentLastSuccessfulRunAt: args.now,
      updatedAt: args.now,
    });
    return { applied: stagedItems.length };
  },
});
