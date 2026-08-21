import { v } from 'convex/values';

import { mutation } from './_generated/server';

export const catalog = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    if (!process.env.SEED_SECRET || secret !== process.env.SEED_SECRET) {
      throw new Error('FORBIDDEN');
    }
    const now = Date.now();
    for (const system of [
      { key: 'pregnancy-strip', name: 'Тест на беременность', testKind: 'pregnancy' as const },
      { key: 'ovulation-strip', name: 'Тест на овуляцию', testKind: 'ovulation' as const },
    ]) {
      const existing = await ctx.db.query('testSystems').withIndex('by_key', (q) => q.eq('key', system.key)).unique();
      const patch = {
        ...system,
        manufacturer: 'ArtificialLabs',
        description: '',
        format: 'strip',
        status: 'active' as const,
        compatibleAlgorithmVersions: [],
        active: true,
        updatedAt: now,
      };
      if (existing) await ctx.db.patch(existing._id, patch);
      else await ctx.db.insert('testSystems', {
        ...patch,
        resultType: 'qualitative',
        createdAt: now,
      });
    }
    return { seeded: 2 };
  },
});
