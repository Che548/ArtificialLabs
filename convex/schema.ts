import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const goal = v.union(
  v.literal('cycle'),
  v.literal('planning'),
  v.literal('pregnancy'),
);
const syncState = {
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
const carePlanRiskTier = v.union(
  v.literal('low'),
  v.literal('clinician'),
  v.literal('high'),
);
const scheduleBasis = v.union(
  v.literal('clinician'),
  v.literal('user'),
  v.literal('confirmed_data'),
  v.literal('model_inference'),
);
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
const agentRuleOperator = v.union(
  v.literal('eq'),
  v.literal('neq'),
  v.literal('in'),
  v.literal('gt'),
  v.literal('gte'),
  v.literal('lt'),
  v.literal('lte'),
  v.literal('exists'),
  v.literal('daysSince'),
);
const agentRuleCondition = v.object({
  field: agentRuleField,
  operator: agentRuleOperator,
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

export default defineSchema({
  ...authTables,
  profiles: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    goal,
    onboardingCompleted: v.boolean(),
    phone: v.optional(v.string()),
    birthDate: v.optional(v.number()),
    heightCm: v.optional(v.number()),
    weightKg: v.optional(v.number()),
    postpartum: v.optional(v.boolean()),
    postContraception: v.optional(v.boolean()),
    pregnancyStartAt: v.optional(v.number()),
    lastPeriodStartAt: v.optional(v.number()),
    cycleLengthDays: v.optional(v.number()),
    timezoneOffsetMinutes: v.optional(v.number()),
    consentToCloudSyncAt: v.optional(v.number()),
    lastMedicalSyncAt: v.optional(v.number()),
    agentDataClearedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
  accountStates: defineTable({
    userId: v.id('users'),
    deletionRequestedAt: v.optional(v.number()),
    scheduledDeletionAt: v.optional(v.number()),
    restoredAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_scheduled_deletion', ['scheduledDeletionAt']),
  aiChatConsents: defineTable({
    userId: v.id('users'),
    provider: v.literal('yandex-ai-studio'),
    policyVersion: v.string(),
    acceptedAt: v.number(),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
  aiAgentConsents: defineTable({
    userId: v.id('users'),
    provider: v.literal('yandex-ai-studio'),
    policyVersion: v.string(),
    scopes: v.array(
      v.union(
        v.literal('profile'),
        v.literal('journal'),
        v.literal('tests'),
        v.literal('documents'),
        v.literal('chats'),
        v.literal('care_plan'),
      ),
    ),
    acceptedAt: v.number(),
    automationAccepted: v.optional(v.boolean()),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),
  agentRuns: defineTable({
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
    inputHash: v.optional(v.string()),
    model: v.string(),
    durationMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user_continuation', ['userId', 'continuationId'])
    .index('by_expiry', ['expiresAt']),
  monitoringPrograms: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    type: goal,
    title: v.string(),
    status: v.union(
      v.literal('active'),
      v.literal('paused'),
      v.literal('completed'),
    ),
    startedAt: v.number(),
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  journalEntries: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
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
  })
    .index('by_profile_time', ['profileId', 'occurredAt'])
    .index('by_profile_local', ['profileId', 'localId']),
  labResults: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
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
  })
    .index('by_profile_time', ['profileId', 'collectedAt'])
    .index('by_profile_local', ['profileId', 'localId']),
  scanResults: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    testSystemKey: v.string(),
    capturedAt: v.number(),
    confirmedValue: v.union(
      v.literal('positive'),
      v.literal('negative'),
      v.literal('invalid'),
    ),
    resultSource: v.optional(
      v.union(v.literal('manual'), v.literal('stripcv')),
    ),
    confidence: v.optional(v.union(v.number(), v.literal('manual'))),
    qualityFlags: v.array(v.string()),
    calibrationVersion: v.optional(v.string()),
    algorithmVersion: v.string(),
    analysisStatus: v.optional(
      v.union(v.literal('valid'), v.literal('review'), v.literal('invalid')),
    ),
    signalRatio: v.optional(v.number()),
    confirmedByUser: v.optional(v.boolean()),
    hasLocalImage: v.boolean(),
  })
    .index('by_profile_time', ['profileId', 'capturedAt'])
    .index('by_profile_local', ['profileId', 'localId']),
  reminders: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
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
  })
    .index('by_profile_due', ['profileId', 'dueAt'])
    .index('by_profile_local', ['profileId', 'localId']),
  medicalConditions: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    title: v.string(),
    status: v.union(v.literal('active'), v.literal('resolved')),
    diagnosedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  medications: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    name: v.string(),
    dosage: v.optional(v.string()),
    frequency: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    active: v.boolean(),
    notes: v.optional(v.string()),
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  allergyRisks: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    allergen: v.string(),
    reaction: v.optional(v.string()),
    severity: v.union(
      v.literal('mild'),
      v.literal('moderate'),
      v.literal('severe'),
      v.literal('unknown'),
    ),
    notes: v.optional(v.string()),
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  documents: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
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
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  chatConversations: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    title: v.string(),
    createdAt: v.number(),
    lastMessageAt: v.number(),
    mode: v.optional(v.union(v.literal('chat'), v.literal('assistant'))),
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  chatMessages: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
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
    attachments: v.array(
      v.object({
        localId: v.string(),
        kind: v.union(v.literal('image'), v.literal('document')),
        name: v.string(),
        mimeType: v.optional(v.string()),
        size: v.optional(v.number()),
        availableLocally: v.boolean(),
      }),
    ),
    sourceRefs: v.optional(v.array(agentSourceRef)),
  })
    .index('by_profile_time', ['profileId', 'sentAt'])
    .index('by_profile_local', ['profileId', 'localId']),
  preferences: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    notificationsEnabled: v.boolean(),
    journalNotifications: v.boolean(),
    resultNotifications: v.boolean(),
    notificationTone: v.optional(
      v.union(v.literal('formal'), v.literal('cute')),
    ),
    anonymousAnalytics: v.boolean(),
    medicalRecommendations: v.boolean(),
    agentNotifications: v.optional(v.boolean()),
    agentLastSuccessfulRunAt: v.optional(v.number()),
    language: v.literal('ru'),
    region: v.string(),
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  carePlanItems: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    catalogKey: v.string(),
    title: v.string(),
    category: v.string(),
    description: v.string(),
    status: carePlanStatus,
    riskTier: carePlanRiskTier,
    dueAt: v.optional(v.number()),
    dueWindowStart: v.optional(v.number()),
    dueWindowEnd: v.optional(v.number()),
    performedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    nextDueAt: v.optional(v.number()),
    scheduleBasis,
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
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  agentTriggers: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
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
    disengagementCombine: v.optional(
      v.union(v.literal('all'), v.literal('any')),
    ),
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
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId'])
    .index('by_profile_next_evaluation', ['profileId', 'nextEvaluationAt'])
    .index('by_status_next_evaluation', ['status', 'nextEvaluationAt'])
    .index('by_next_evaluation', ['nextEvaluationAt']),
  recommendationEvents: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
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
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId'])
    .index('by_profile_time', ['profileId', 'occurredAt']),
  testSystems: defineTable({
    key: v.string(),
    name: v.string(),
    testKind: v.union(v.literal('pregnancy'), v.literal('ovulation')),
    resultType: v.literal('qualitative'),
    publishedCalibrationVersion: v.optional(v.string()),
    active: v.boolean(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
  calibrationVersions: defineTable({
    testSystemKey: v.string(),
    version: v.string(),
    status: v.union(
      v.literal('draft'),
      v.literal('published'),
      v.literal('retired'),
    ),
    algorithmVersion: v.string(),
    instructions: v.array(v.string()),
    checksum: v.string(),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_system_version', ['testSystemKey', 'version']),
});
