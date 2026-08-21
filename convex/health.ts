import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireOwnedProfile } from './lib/access';
import {
  isAllowedAgentTriggerMutation,
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
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
};
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
) {
  const existing = await ctx.db
    .query(table)
    .withIndex('by_profile_local', (q) =>
      q.eq('profileId', profileId as never).eq('localId', item.localId),
    )
    .unique();
  if (existing && existing.updatedAt >= item.updatedAt) return;
  if (existing && table === 'recommendationEvents') return;
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
  if (
    existingRecord &&
    table === 'agentTriggers' &&
    !isAllowedAgentTriggerMutation(
      existingRecord as unknown as AgentTrigger,
      item as unknown as AgentTrigger,
    )
  )
    throw new Error('AGENT_TRIGGER_IMMUTABLE');
  if (existing) await ctx.db.patch(existing._id, item as never);
  else await ctx.db.insert(table, { ...item, profileId } as never);
}

export const syncBatch = mutation({
  args: {
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
  handler: async (ctx, batch) => {
    const profile = await requireOwnedProfile(ctx);
    if (
      !profile.consentToCloudSyncAt &&
      ((batch.carePlanItems?.length ?? 0) > 0 ||
        (batch.agentTriggers?.length ?? 0) > 0 ||
        (batch.recommendationEvents?.length ?? 0) > 0)
    )
      throw new Error('CLOUD_SYNC_CONSENT_REQUIRED');
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
    for (const item of batch.programs)
      await upsertLocal(ctx, 'monitoringPrograms', profile._id, item);
    for (const item of batch.journalEntries)
      await upsertLocal(ctx, 'journalEntries', profile._id, item);
    for (const item of batch.labResults)
      await upsertLocal(ctx, 'labResults', profile._id, item);
    for (const item of batch.scanResults)
      await upsertLocal(ctx, 'scanResults', profile._id, item);
    for (const item of batch.reminders)
      await upsertLocal(ctx, 'reminders', profile._id, item);
    for (const item of batch.medicalConditions)
      await upsertLocal(ctx, 'medicalConditions', profile._id, item);
    for (const item of batch.medications)
      await upsertLocal(ctx, 'medications', profile._id, item);
    for (const item of batch.allergyRisks)
      await upsertLocal(ctx, 'allergyRisks', profile._id, item);
    for (const item of batch.documents)
      await upsertLocal(ctx, 'documents', profile._id, item);
    for (const item of batch.chatConversations)
      await upsertLocal(ctx, 'chatConversations', profile._id, item);
    for (const item of batch.chatMessages)
      await upsertLocal(ctx, 'chatMessages', profile._id, item);
    for (const item of carePlanItems)
      await upsertLocal(ctx, 'carePlanItems', profile._id, item);
    for (const item of agentTriggers)
      await upsertLocal(ctx, 'agentTriggers', profile._id, item);
    for (const item of recommendationEvents)
      await upsertLocal(ctx, 'recommendationEvents', profile._id, item);
    for (const item of batch.preferences)
      await upsertLocal(ctx, 'preferences', profile._id, item);
    await ctx.db.patch(profile._id, { lastMedicalSyncAt: Date.now() });
    return {
      accepted: Object.values(batch).reduce(
        (n, rows) => n + (rows?.length ?? 0),
        0,
      ),
    };
  },
});

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireOwnedProfile(ctx);
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

export const catalog = query({
  args: {},
  handler: async (ctx) => {
    const systems = await ctx.db.query('testSystems').collect();
    return systems.filter((system) => system.active);
  },
});
