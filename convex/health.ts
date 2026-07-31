import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireOwnedProfile } from './lib/access';

const common = {
  localId: v.string(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
};
const goal = v.union(v.literal('planning'), v.literal('pregnancy'));
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
  source: v.union(
    v.literal('manual'),
    v.literal('scan'),
    v.literal('lab'),
  ),
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
  confidence: v.literal('manual'),
  qualityFlags: v.array(v.string()),
  calibrationVersion: v.optional(v.string()),
  algorithmVersion: v.literal('manual-v1'),
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

type SyncTable =
  | 'monitoringPrograms'
  | 'journalEntries'
  | 'labResults'
  | 'scanResults'
  | 'reminders';

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
  },
  handler: async (ctx, batch) => {
    const profile = await requireOwnedProfile(ctx);
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
    return { accepted: Object.values(batch).reduce((n, rows) => n + rows.length, 0) };
  },
});

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireOwnedProfile(ctx);
    const [programs, journalEntries, labResults, scanResults, reminders] =
      await Promise.all([
        ctx.db.query('monitoringPrograms').withIndex('by_profile', (q) => q.eq('profileId', profile._id)).collect(),
        ctx.db.query('journalEntries').withIndex('by_profile_time', (q) => q.eq('profileId', profile._id)).order('desc').take(200),
        ctx.db.query('labResults').withIndex('by_profile_time', (q) => q.eq('profileId', profile._id)).order('desc').take(100),
        ctx.db.query('scanResults').withIndex('by_profile_time', (q) => q.eq('profileId', profile._id)).order('desc').take(100),
        ctx.db.query('reminders').withIndex('by_profile_due', (q) => q.eq('profileId', profile._id)).order('desc').take(100),
      ]);
    return { profile, programs, journalEntries, labResults, scanResults, reminders };
  },
});

export const catalog = query({
  args: {},
  handler: async (ctx) => {
    const systems = await ctx.db.query('testSystems').collect();
    return systems.filter((system) => system.active);
  },
});
