import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';

export const backfillCatalog = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const systems = await ctx.db.query('testSystems').paginate({
      numItems: 50,
      cursor: cursor ?? null,
      maximumRowsRead: 60,
      maximumBytesRead: 256_000,
    });
    for (const system of systems.page) {
      await ctx.db.patch(system._id, {
        manufacturer: system.manufacturer ?? 'Не указан',
        description: system.description ?? '',
        format: system.format ?? 'strip',
        status: system.status ?? (system.active ? 'active' : 'draft'),
        compatibleAlgorithmVersions: system.compatibleAlgorithmVersions ?? [],
        createdAt: system.createdAt ?? system._creationTime,
      });
    }
    if (!systems.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.adminMigrations.backfillCatalog,
        {
          cursor: systems.continueCursor,
        },
      );
    }
    return { updated: systems.page.length, done: systems.isDone };
  },
});
