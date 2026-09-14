import { v } from 'convex/values';
import { requireSyncProtocol, supportsRevisionSync } from './lib/clientCompatibility';
import { paginationOptsValidator } from 'convex/server';

import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireOwnedProfile } from './lib/access';
import { hasCloudConsent } from './lib/cloudConsent';
import { agentTriggerConflictFields, mergeAgentTriggerReplicas } from '../lib/agent-trigger-sync';
import {
  isAllowedCarePlanMutation,
  validateAgentTrigger,
  validateCarePlanItem,
  validateRecommendationEvent,
} from '../lib/care-plan';
import type {
  AgentTrigger,
  CarePlanItem,
  RecommendationEvent,
} from '../lib/health-types';

const common = {
  localId: v.string(),
  syncRevision: v.optional(v.number()),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
};

// Explicit bounded, owner-only lookup for native conflict review. No bulk export.
export const conflictRecords = query({
  args: { records: v.array(v.object({
    entity: v.union(v.literal('programs'), v.literal('journalEntries'), v.literal('labResults'),
      v.literal('scanResults'), v.literal('reminders'), v.literal('medicalConditions'),
      v.literal('medications'), v.literal('allergyRisks'), v.literal('documents'),
      v.literal('chatConversations'), v.literal('chatMessages'), v.literal('preferences'),
      v.literal('carePlanItems'), v.literal('agentTriggers'), v.literal('recommendationEvents')),
    localId: v.string(),
  })) },
  handler: async (ctx, { records }) => {
    if (records.length > 30 || records.some(item => item.localId.length > 200)) throw new Error('SYNC_REVIEW_LIMIT');
    const profile = await requireOwnedProfile(ctx);
    if (!await hasCloudConsent(ctx, profile.userId)) throw new Error('CLOUD_SYNC_CONSENT_REQUIRED');
    return Promise.all(records.map(async ({ entity, localId }) => {
      const table = entity === 'programs' ? 'monitoringPrograms' : entity;
      const row = await ctx.db.query(table).withIndex('by_profile_local', q => q.eq('profileId', profile._id).eq('localId', localId)).unique();
      if (!row) return { entity, localId, record: null };
      const { _id, _creationTime, profileId, ...record } = row;
      return { entity, localId, record };
    }));
  },
});
const agentSourceRef = v.object({
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
const carePlanStatus = v.union(
  v.literal('current'),
  v.literal('upcoming'),
  v.literal('completed'),
  v.literal('declined'),
  v.literal('superseded'),
);
const goal = v.union(
  v.literal('cycle'),
  v.literal('planning'),
  v.literal('pregnancy'),
);
const program = v.object({
  ...common,
  type: goal,
  title: v.string(),
  status: v.union(
    v.literal('active'),
    v.literal('paused'),
    v.literal('completed'),
  ),
  startedAt: v.number(),
});
const journal = v.object({
  ...common,
  occurredAt: v.number(),
  kind: v.union(
    v.literal('cycle'),
    v.literal('mood'),
    v.literal('energy'),
    v.literal('symptom'),
    v.literal('nutrition'),
    v.literal('activity'),
    v.literal('measurement'),
    v.literal('note'),
  ),
  label: v.string(),
  textValue: v.optional(v.string()),
  numericValue: v.optional(v.number()),
  unit: v.optional(v.string()),
  source: v.union(v.literal('manual'), v.literal('scan'), v.literal('lab')),
  sourceLocalId: v.optional(v.string()),
});
const lab = v.object({
  ...common,
  catalogKey: v.string(),
  title: v.string(),
  collectedAt: v.number(),
  confirmedAt: v.optional(v.number()),
  status: v.union(
    v.literal('normal'),
    v.literal('attention'),
    v.literal('unreviewed'),
  ),
  analytes: v.array(
    v.object({
      name: v.string(),
      value: v.string(),
      unit: v.optional(v.string()),
      reference: v.optional(v.string()),
        section: v.optional(v.string()),
    }),
  ),
  hasLocalSourceDocument: v.boolean(),
  sourceDocumentLocalId: v.optional(v.string()),
});
const scan = v.object({
  ...common,
  testSystemKey: v.string(),
  capturedAt: v.number(),
  confirmedValue: v.union(
    v.literal('positive'),
    v.literal('negative'),
    v.literal('invalid'),
  ),
  resultSource: v.union(v.literal('manual'), v.literal('stripcv')),
  confidence: v.optional(v.number()),
  qualityFlags: v.array(v.string()),
  calibrationVersion: v.optional(v.string()),
  algorithmVersion: v.string(),
  analysisStatus: v.optional(
    v.union(v.literal('valid'), v.literal('review'), v.literal('invalid')),
  ),
  signalRatio: v.optional(v.number()),
  confirmedByUser: v.boolean(),
  hasLocalImage: v.boolean(),
});
const reminder = v.object({
  ...common,
  type: v.union(
    v.literal('journal'),
    v.literal('checkup'),
    v.literal('result'),
    v.literal('system'),
  ),
  title: v.string(),
  body: v.string(),
  dueAt: v.number(),
  readAt: v.optional(v.number()),
});
const medicalCondition = v.object({
  ...common,
  title: v.string(),
  status: v.union(v.literal('active'), v.literal('resolved')),
  diagnosedAt: v.optional(v.number()),
  notes: v.optional(v.string()),
});
const medication = v.object({
  ...common,
  name: v.string(),
  dosage: v.optional(v.string()),
  frequency: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  active: v.boolean(),
  notes: v.optional(v.string()),
});
const allergyRisk = v.object({
  ...common,
  allergen: v.string(),
  reaction: v.optional(v.string()),
  severity: v.union(
    v.literal('mild'),
    v.literal('moderate'),
    v.literal('severe'),
    v.literal('unknown'),
  ),
  notes: v.optional(v.string()),
});
const document = v.object({
  ...common,
  title: v.string(),
  category: v.union(
    v.literal('lab'),
    v.literal('scan'),
    v.literal('medical'),
    v.literal('other'),
  ),
  documentDate: v.number(),
  hasLocalFile: v.boolean(),
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
  linkedLabResultLocalId: v.optional(v.string()),
  linkedCarePlanLocalId: v.optional(v.string()),
  contentIndexStatus: v.optional(
    v.union(v.literal('metadata-only'), v.literal('not-supported')),
  ),
});
const chatConversation = v.object({
  ...common,
  title: v.string(),
  createdAt: v.number(),
  lastMessageAt: v.number(),
  mode: v.optional(v.union(v.literal('chat'), v.literal('assistant'))),
});
const attachment = v.object({
  localId: v.string(),
  kind: v.union(v.literal('image'), v.literal('document')),
  name: v.string(),
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
  availableLocally: v.boolean(),
});
const chatMessage = v.object({
  ...common,
  conversationLocalId: v.string(),
  role: v.union(v.literal('user'), v.literal('assistant')),
  source: v.union(v.literal('user'), v.literal('demo'), v.literal('model')),
  text: v.string(),
  sentAt: v.number(),
  generation: v.optional(
    v.object({
      provider: v.string(),
      model: v.string(),
      responseId: v.optional(v.string()),
      inputTokens: v.optional(v.number()),
      outputTokens: v.optional(v.number()),
      totalTokens: v.optional(v.number()),
      durationMs: v.number(),
      truncated: v.boolean(),
    }),
  ),
  attachments: v.array(attachment),
  sourceRefs: v.optional(v.array(agentSourceRef)),
});
const preferences = v.object({
  ...common,
  localId: v.literal('preferences'),
  notificationsEnabled: v.boolean(),
  journalNotifications: v.boolean(),
  resultNotifications: v.boolean(),
  notificationTone: v.optional(v.union(v.literal('formal'), v.literal('cute'))),
  anonymousAnalytics: v.boolean(),
  medicalRecommendations: v.boolean(),
  agentNotifications: v.optional(v.boolean()),
  agentLastSuccessfulRunAt: v.optional(v.number()),
  language: v.literal('ru'),
  region: v.string(),
});
const carePlanItem = v.object({
  ...common,
  catalogKey: v.string(),
  title: v.string(),
  category: v.string(),
  description: v.string(),
  status: carePlanStatus,
  riskTier: v.union(
    v.literal('low'),
    v.literal('clinician'),
    v.literal('high'),
  ),
  dueAt: v.optional(v.number()),
  dueWindowStart: v.optional(v.number()),
  dueWindowEnd: v.optional(v.number()),
  performedAt: v.optional(v.number()),
  validUntil: v.optional(v.number()),
  nextDueAt: v.optional(v.number()),
  scheduleBasis: v.union(
    v.literal('clinician'),
    v.literal('user'),
    v.literal('confirmed_data'),
    v.literal('model_inference'),
  ),
  confidence: v.number(),
  provisional: v.boolean(),
  requiresClinician: v.boolean(),
  safetyHoldAt: v.optional(v.number()),
  safetyHoldReason: v.optional(v.string()),
  declinedAt: v.optional(v.number()),
  supersededAt: v.optional(v.number()),
  lastModelReplacementAt: v.optional(v.number()),
  evidenceRefs: v.array(agentSourceRef),
  rationale: v.string(),
  policyVersion: v.string(),
  catalogVersion: v.string(),
  model: v.optional(v.string()),
  illustrationKey: v.optional(v.string()),
});
const agentRuleField = v.union(
  v.literal('profile.goal'),
  v.literal('profile.ageYears'),
  v.literal('profile.postpartum'),
  v.literal('profile.pregnancy'),
  v.literal('preferences.medicalRecommendations'),
  v.literal('plan.status'),
  v.literal('plan.safetyHold'),
  v.literal('daysSince.healthEvidence'),
  v.literal('daysSince.labResult'),
  v.literal('daysSince.planUpdate'),
);
const agentRuleCondition = v.object({
  field: agentRuleField,
  operator: v.union(
    v.literal('eq'),
    v.literal('neq'),
    v.literal('in'),
    v.literal('gt'),
    v.literal('gte'),
    v.literal('lt'),
    v.literal('lte'),
    v.literal('exists'),
    v.literal('daysSince'),
  ),
  value: v.optional(
    v.union(
      v.string(),
      v.number(),
      v.boolean(),
      v.array(v.string()),
      v.array(v.number()),
    ),
  ),
  negate: v.optional(v.boolean()),
});
const agentTrigger = v.object({
  ...common,
  templateKey: v.union(
    v.literal('monthly-plan-review'),
    v.literal('data-change-review'),
    v.literal('due-window'),
  ),
  templateVersion: v.string(),
  status: v.union(
    v.literal('active'),
    v.literal('suspended'),
    v.literal('completed'),
    v.literal('expired'),
  ),
  combine: v.union(v.literal('all'), v.literal('any')),
  disengagementCombine: v.optional(v.union(v.literal('all'), v.literal('any'))),
  conditions: v.array(agentRuleCondition),
  disengagementConditions: v.array(agentRuleCondition),
  targetCarePlanLocalId: v.optional(v.string()),
  nextEvaluationAt: v.number(),
  cooldownUntil: v.optional(v.number()),
  expiresAt: v.number(),
  maxRuns: v.number(),
  runCount: v.number(),
  lastRunAt: v.optional(v.number()),
  evidenceRefs: v.array(agentSourceRef),
  policyVersion: v.string(),
});
const recommendationEvent = v.object({
  ...common,
  carePlanLocalId: v.optional(v.string()),
  triggerLocalId: v.optional(v.string()),
  type: v.union(
    v.literal('created'),
    v.literal('promoted'),
    v.literal('completed'),
    v.literal('declined'),
    v.literal('safety_hold'),
    v.literal('replaced'),
    v.literal('reviewed'),
  ),
  reasonCode: v.string(),
  beforeStatus: v.optional(carePlanStatus),
  afterStatus: v.optional(carePlanStatus),
  evidenceRefs: v.array(agentSourceRef),
  policyVersion: v.string(),
  model: v.optional(v.string()),
  occurredAt: v.number(),
});

type SyncTable =
  | 'monitoringPrograms'
  | 'journalEntries'
  | 'labResults'
  | 'scanResults'
  | 'reminders'
  | 'medicalConditions'
  | 'medications'
  | 'allergyRisks'
  | 'documents'
  | 'chatConversations'
  | 'chatMessages'
  | 'carePlanItems'
  | 'agentTriggers'
  | 'recommendationEvents'
  | 'preferences';

async function upsertLocal(
  ctx: MutationCtx,
  table: SyncTable,
  profileId: Parameters<MutationCtx['db']['get']>[0],
  item: { localId: string; updatedAt: number; [key: string]: unknown },
  revisionSync: boolean,
) {
  if (!Number.isFinite(item.updatedAt) || item.updatedAt > Date.now() + 300_000) {
    throw new Error('SYNC_CLOCK_INVALID');
  }
  const existing = await ctx.db
    .query(table)
    .withIndex('by_profile_local', (q) =>
      q.eq('profileId', profileId as never).eq('localId', item.localId),
    )
    .unique();
  if (existing && table === 'agentTriggers') {
    const existingTrigger = existing as unknown as AgentTrigger;
    const merged = mergeAgentTriggerReplicas(
      existingTrigger, item as unknown as AgentTrigger,
    );
    if (!merged) throw new Error(`AGENT_TRIGGER_IMMUTABLE fields=${agentTriggerConflictFields(existingTrigger, item as unknown as AgentTrigger).join(',')}`);
    // Use only the portable incoming record, never Convex system fields.
    item = { ...item, status: merged.status, runCount: merged.runCount,
      nextEvaluationAt: merged.nextEvaluationAt, lastRunAt: merged.lastRunAt,
      cooldownUntil: merged.cooldownUntil, updatedAt: merged.updatedAt };
    if (existingTrigger.updatedAt === item.updatedAt && existingTrigger.status === item.status &&
        existingTrigger.runCount === item.runCount && existingTrigger.nextEvaluationAt === item.nextEvaluationAt &&
        existingTrigger.lastRunAt === item.lastRunAt && existingTrigger.cooldownUntil === item.cooldownUntil) return;
    await ctx.db.patch(existing._id, item as never);
    return;
  }
  // TODO(remove-legacy-sync-compat): legacy timestamp handling is admitted only by
  // SYNC_LEGACY_COMPAT_ENABLED at syncBatch's entry guard; protocol 1 stays strict.
  if (revisionSync && existing && table !== 'recommendationEvents') {
    if (existing.deletedAt && !item.deletedAt) {
      // Planned reminders have an explicit existing re-enable lifecycle.
      if (!(table === 'reminders' && item.localId.startsWith('agent-prep_'))) throw new Error('RECORD_DELETED_REMOTELY');
    }
    if (existing.updatedAt >= item.updatedAt) {
      // An old deletion replay is harmless; active edits of a tombstone were
      // rejected above so they stay pending for explicit native review.
      if (existing.deletedAt && item.updatedAt < existing.updatedAt) return;
      const current = existing as Record<string, unknown>;
      if (Object.entries(item).some(([key, value]) => key !== 'updatedAt' && key !== 'syncRevision' && JSON.stringify(current[key]) !== JSON.stringify(value))) {
        throw new Error('RECORD_SYNC_CONFLICT');
      }
      return;
    }
  }
  if (existing && existing.updatedAt >= item.updatedAt) return;
  if (existing && table === 'recommendationEvents') return;
  if (existing && table !== 'agentTriggers') {
    const plannedReminder = table === 'reminders' && item.localId.startsWith('agent-prep_');
    const changed = (plannedReminder && existing.deletedAt !== item.deletedAt) || Object.entries(item).some(([key, value]) => key !== 'updatedAt' && key !== 'syncRevision' && JSON.stringify((existing as Record<string, unknown>)[key]) !== JSON.stringify(value));
    if (!changed) return;
    // TODO(remove-legacy-sync-compat): remove bypass after all old clients retire.
    if (revisionSync && !plannedReminder && (item.syncRevision ?? 0) !== (existing.syncRevision ?? 0)) throw new Error('RECORD_SYNC_CONFLICT');
  }
  item = { ...item, syncRevision: (existing?.syncRevision ?? 0) + 1 };
  const existingRecord = existing as
    ({ [key: string]: unknown } & { updatedAt: number }) | null;
  if (
    existingRecord &&
    table === 'carePlanItems' &&
    !isAllowedCarePlanMutation(
      existingRecord as unknown as CarePlanItem,
      item as unknown as CarePlanItem,
    )
  ) {
    throw new Error('CURRENT_PLAN_IMMUTABLE');
  }
  if (existing) {
    // Plan reconciliation reuses reminder IDs after recommendations are enabled
    // again. A missing deletedAt in a newer reminder means it is active; patch
    // otherwise preserves the old tombstone and starts a recreate/sync loop.
    const patch =
      table === 'reminders' && item.localId.startsWith('agent-prep_')
        ? { ...item, deletedAt: item.deletedAt }
        : item;
    await ctx.db.patch(existing._id, patch as never);
  } else await ctx.db.insert(table, { ...item, profileId } as never);
}

export const syncBatch = mutation({
  args: {
    protocolVersion: v.optional(v.number()),
    programs: v.array(program),
    journalEntries: v.array(journal),
    labResults: v.array(lab),
    scanResults: v.array(scan),
    reminders: v.array(reminder),
    medicalConditions: v.array(medicalCondition),
    medications: v.array(medication),
    allergyRisks: v.array(allergyRisk),
    documents: v.array(document),
    chatConversations: v.array(chatConversation),
    chatMessages: v.array(chatMessage),
    carePlanItems: v.optional(v.array(carePlanItem)),
    agentTriggers: v.optional(v.array(agentTrigger)),
    recommendationEvents: v.optional(v.array(recommendationEvent)),
    preferences: v.array(preferences),
  },
  handler: async (ctx, args) => {
    const { protocolVersion, ...batch } = args;
    const profile = await requireOwnedProfile(ctx);
    if (!(await hasCloudConsent(ctx, profile.userId)))
      throw new Error('CLOUD_SYNC_CONSENT_REQUIRED');
    requireSyncProtocol('healthSync', protocolVersion);
    const agentDataClearedAt = profile.agentDataClearedAt ?? 0;
    const carePlanItems = (batch.carePlanItems ?? []).filter(
      (item) => item.updatedAt > agentDataClearedAt,
    );
    const agentTriggers = (batch.agentTriggers ?? []).filter(
      (item) => item.updatedAt > agentDataClearedAt,
    );
    const recommendationEvents = (batch.recommendationEvents ?? []).filter(
      (item) => item.updatedAt > agentDataClearedAt,
    );
    if (
      carePlanItems.some(
        (item) =>
          !item.deletedAt && !validateCarePlanItem(item as CarePlanItem),
      ) ||
      agentTriggers.some(
        (item) =>
          !item.deletedAt && !validateAgentTrigger(item as AgentTrigger),
      ) ||
      recommendationEvents.some(
        (item) =>
          Boolean(item.deletedAt) ||
          !validateRecommendationEvent(item as RecommendationEvent),
      )
    )
      throw new Error('INVALID_AGENT_SYNC_RECORD');
    const syncRevisions: { entity: string; localId: string; revision: number }[] = [];
    for (const [entity, rows] of Object.entries({ ...batch, carePlanItems, agentTriggers, recommendationEvents })) {
      const table = (entity === 'programs' ? 'monitoringPrograms' : entity) as SyncTable;
      for (const item of rows ?? []) {
        await upsertLocal(ctx, table, profile._id, item, supportsRevisionSync(protocolVersion));
        const stored = await ctx.db.query(table).withIndex('by_profile_local', q => q.eq('profileId', profile._id).eq('localId', item.localId)).unique();
        if (stored) syncRevisions.push({ entity, localId: item.localId, revision: stored.syncRevision ?? 0 });
      }
    }
    await ctx.db.patch(profile._id, { lastMedicalSyncAt: Date.now() });
    return {
      accepted: Object.values(batch).reduce(
        (n, rows) => n + (rows?.length ?? 0),
        0,
      ),
      syncRevisions,
    };
  },
});

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireOwnedProfile(ctx);
    // Old clients keep this subscription open after another device revokes.
    // Return no medical payload rather than throwing into their React tree.
    if (!(await hasCloudConsent(ctx, profile.userId))) return {
      profile: null, programs: [], journalEntries: [], labResults: [], scanResults: [],
      reminders: [], medicalConditions: [], medications: [], allergyRisks: [],
      documents: [], chatConversations: [], chatMessages: [], carePlanItems: [],
      agentTriggers: [], recommendationEvents: [], preferences: [],
    };
    const [
      programs,
      journalEntries,
      labResults,
      scanResults,
      reminders,
      medicalConditions,
      medications,
      allergyRisks,
      documents,
      chatConversations,
      chatMessages,
      carePlanItems,
      agentTriggers,
      recommendationEvents,
      preferences,
    ] = await Promise.all([
      ctx.db
        .query('monitoringPrograms')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
      ctx.db
        .query('journalEntries')
        .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
        .order('desc')
        .take(200),
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
        .query('reminders')
        .withIndex('by_profile_due', (q) => q.eq('profileId', profile._id))
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
      ctx.db
        .query('documents')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
      ctx.db
        .query('chatConversations')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
      ctx.db
        .query('chatMessages')
        .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
        .order('desc')
        .take(500),
      ctx.db
        .query('carePlanItems')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
      ctx.db
        .query('agentTriggers')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
      ctx.db
        .query('recommendationEvents')
        .withIndex('by_profile_time', (q) => q.eq('profileId', profile._id))
        .order('desc')
        .take(500),
      ctx.db
        .query('preferences')
        .withIndex('by_profile', (q) => q.eq('profileId', profile._id))
        .collect(),
    ]);
    return {
      profile,
      programs,
      journalEntries,
      labResults,
      scanResults,
      reminders,
      medicalConditions,
      medications,
      allergyRisks,
      documents,
      chatConversations,
      chatMessages,
      ...(carePlanItems.length ? { carePlanItems } : {}),
      ...(agentTriggers.length ? { agentTriggers } : {}),
      ...(recommendationEvents.length ? { recommendationEvents } : {}),
      preferences,
    };
  },
});

export const historyPage = query({
  args: {
    entity: v.union(v.literal('journalEntries'), v.literal('labResults'), v.literal('scanResults'), v.literal('reminders'), v.literal('chatMessages'), v.literal('recommendationEvents')),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const profile = await requireOwnedProfile(ctx);
    if (!(await hasCloudConsent(ctx, profile.userId))) throw new Error('CLOUD_SYNC_CONSENT_REQUIRED');
    const options = { ...args.paginationOpts, numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)) };
    if (args.entity === 'reminders') return ctx.db.query('reminders').withIndex('by_profile_due', q => q.eq('profileId', profile._id)).order('desc').paginate(options);
    return ctx.db.query(args.entity).withIndex('by_profile_time', q => q.eq('profileId', profile._id)).order('desc').paginate(options);
  },
});

export const catalog = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('testSystems')
      .withIndex('by_status_updated', (q) => q.eq('status', 'active'))
      .order('desc')
      .take(100);
  },
});
