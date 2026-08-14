import { v } from 'convex/values';

import { internalMutation } from './_generated/server';
import { permanentlyDeleteUser } from './account';

const E2E_EMAIL = /^artificiallabs-e2e\+[a-z0-9-]{8,80}@example\.test$/;

export const purgeE2EAccount = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!E2E_EMAIL.test(normalizedEmail)) {
      throw new Error('E2E_EMAIL_REQUIRED');
    }
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', normalizedEmail))
      .unique();
    if (!user) return { deleted: false };
    await permanentlyDeleteUser(ctx, user._id);
    return { deleted: true };
  },
});
