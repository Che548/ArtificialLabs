import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireActiveAccount } from './lib/access';
import { matchesNewRegistration } from '../shared/registration-consent';
import { AI_CHAT_CONSENT_PROVIDER, AI_CHAT_CONSENT_POLICY_VERSION } from './aiChatConfig';
import { AI_AGENT_CONSENT_PROVIDER, AI_AGENT_CONSENT_POLICY_VERSION, AI_AGENT_SCOPES, isAiAgentAutomationEnabled } from './aiAgentConfig';

/** Apply an explicit registration choice only to its newly created owner.
 * Both grants are atomic. This endpoint never reads/returns medical content or
 * invokes the provider, and cannot migrate old accounts or undo a revocation.
 */
export const accept = mutation({
  args: { email: v.optional(v.string()), phone: v.optional(v.string()), acceptedAt: v.number(), version: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
    const user = await ctx.db.get(userId);
    const now = Date.now();
    if (!user || (args.email?.length ?? 0) > 254 || !matchesNewRegistration(args, user, now)) return { accepted: false, automation: false };
    // A legacy-compatible session is not itself proof of email verification.
    // Fail before any grant so onboarding retains its pending device receipt.
    if (args.phone ? !user.phoneVerificationTime : !user.emailVerificationTime)
      throw new Error(args.phone ? 'REGISTRATION_PHONE_VERIFICATION_REQUIRED' : 'REGISTRATION_EMAIL_VERIFICATION_REQUIRED');
    const chat = await ctx.db.query('aiChatConsents').withIndex('by_user', q => q.eq('userId', userId)).unique();
    const agent = await ctx.db.query('aiAgentConsents').withIndex('by_user', q => q.eq('userId', userId)).unique();
    if (chat?.revokedAt || agent?.revokedAt || chat?.userEnabled === false) return { accepted: false, automation: false };
    // A retry must preserve the original consent time and later preferences.
    const automation = agent ? agent.automationAccepted === true : isAiAgentAutomationEnabled();
    const chatValue = { userId, provider: AI_CHAT_CONSENT_PROVIDER, policyVersion: AI_CHAT_CONSENT_POLICY_VERSION,
      acceptedAt: chat?.acceptedAt ?? args.acceptedAt, userEnabled: true, updatedAt: now };
    const agentValue = { userId, provider: AI_AGENT_CONSENT_PROVIDER, policyVersion: AI_AGENT_CONSENT_POLICY_VERSION,
      scopes: [...AI_AGENT_SCOPES], acceptedAt: agent?.acceptedAt ?? args.acceptedAt, automationAccepted: automation, updatedAt: now };
    if (chat) await ctx.db.patch(chat._id, chatValue); else await ctx.db.insert('aiChatConsents', chatValue);
    if (agent) await ctx.db.patch(agent._id, agentValue); else await ctx.db.insert('aiAgentConsents', agentValue);
    return { accepted: true, automation };
  },
});
