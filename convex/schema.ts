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
    consentToCloudSyncAt: v.optional(v.number()),
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
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
  chatConversations: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    title: v.string(),
    createdAt: v.number(),
    lastMessageAt: v.number(),
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
  })
    .index('by_profile_time', ['profileId', 'sentAt'])
    .index('by_profile_local', ['profileId', 'localId']),
  preferences: defineTable({
    profileId: v.id('profiles'),
    ...syncState,
    notificationsEnabled: v.boolean(),
    journalNotifications: v.boolean(),
    resultNotifications: v.boolean(),
    anonymousAnalytics: v.boolean(),
    medicalRecommendations: v.boolean(),
    language: v.literal('ru'),
    region: v.string(),
  })
    .index('by_profile', ['profileId'])
    .index('by_profile_local', ['profileId', 'localId']),
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
