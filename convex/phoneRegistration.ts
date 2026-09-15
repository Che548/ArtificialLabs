import { getAuthUserId, createAccount } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { action, internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  contactError,
  contactHash,
  contactLimit,
} from './lib/contactVerification';
import {
  generateSixDigitCode,
  normalizeClientIp,
  normalizeRussianPhone,
} from './lib/sms';
import { sendSmsCode } from './smsAuth';
import { countAccount } from './lib/accountCounts';

const platform = v.union(v.literal('ios'), v.literal('android'));
const TTL = 5 * 60_000;
function validToken(token: string) {
  if (token.length !== 64 || !/^[a-f0-9]{64}$/.test(token)) contactError('INVALID_CODE');
}
async function available(ctx: QueryCtx | MutationCtx, phone: string) {
  const users = await ctx.db
    .query('users')
    .withIndex('phone', (q) => q.eq('phone', phone))
    .take(2);
  const accounts = await ctx.db
    .query('authAccounts')
    .withIndex('providerAndAccountId', (q) =>
      q.eq('provider', 'phone').eq('providerAccountId', phone),
    )
    .take(1);
  // Never merge a signup into another account, including an unfinished legacy one.
  if (users.length || accounts.length) contactError('PHONE_UNAVAILABLE');
}

export const reserve = internalMutation({
  args: {
    phone: v.string(),
    tokenHash: v.string(),
    codeHash: v.string(),
    generation: v.string(),
    ipHash: v.string(),
    challengeId: v.optional(v.id('phoneRegistrationChallenges')),
  },
  handler: async (ctx, args) => {
    if (await getAuthUserId(ctx)) return contactError('SIGN_OUT_REQUIRED');
    const phone = normalizeRussianPhone(args.phone);
    await available(ctx, phone);
    const old = args.challengeId ? await ctx.db.get(args.challengeId) : null;
    if (
      args.challengeId &&
      (!old ||
        old.phone !== phone ||
        old.tokenHash !== args.tokenHash ||
        old.status === 'verified' ||
        old.status === 'consumed' ||
        old.failedAttempts >= 5)
    )
      return contactError('INVALID_CODE');
    if (old && old.retryAt > Date.now()) return contactError('RATE_LIMITED');
    await contactLimit(
      ctx,
      [`signup:ip:${args.ipHash}`, `signup:phone:${await contactHash(phone)}`],
      3,
      TTL,
    );
    const values = {
      phone,
      tokenHash: args.tokenHash,
      codeHash: args.codeHash,
      generation: args.generation,
      status: 'sending' as const,
      failedAttempts: old?.failedAttempts ?? 0,
      expiresAt: Date.now() + TTL,
      retryAt: Date.now() + TTL,
      purgeAt: Date.now() + 86400000,
    };
    const challengeId =
      old?._id ?? (await ctx.db.insert('phoneRegistrationChallenges', values));
    if (old) await ctx.db.replace(old._id, values);
    return {
      challengeId,
      expiresAt: values.expiresAt,
      retryAt: values.retryAt,
    };
  },
});
export const delivery = internalMutation({
  args: {
    challengeId: v.id('phoneRegistrationChallenges'),
    generation: v.string(),
    ok: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (row?.generation === args.generation && row.status === 'sending')
      await ctx.db.patch(row._id, { status: args.ok ? 'pending' : 'failed' });
  },
});
export const request = action({
  args: {
    phone: v.string(),
    token: v.string(),
    platform,
    challengeId: v.optional(v.id('phoneRegistrationChallenges')),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    challengeId: Id<'phoneRegistrationChallenges'>;
    expiresAt: number;
    retryAt: number;
    deliveryFailed: boolean;
  }> => {
    validToken(args.token);
    const phone = normalizeRussianPhone(args.phone),
      generation = crypto.randomUUID(),
      code = generateSixDigitCode();
    const metadata = await ctx.meta.getRequestMetadata();
    const result = await ctx.runMutation(internal.phoneRegistration.reserve, {
      phone,
      generation,
      tokenHash: await contactHash(`signup-token:${args.token}`),
      codeHash: await contactHash(`signup-code:${generation}:${code}`),
      ipHash: await contactHash(`signup-ip:${normalizeClientIp(metadata.ip)}`),
      challengeId: args.challengeId,
    });
    let ok = false;
    try {
      await sendSmsCode(ctx, phone, code, new Date(result.expiresAt), {
        platform: args.platform,
        purpose: 'phone-verification',
      });
      ok = true;
    } catch {
      /* Do not log gateway data, number or OTP. Existing SMS limits still apply. */
    }
    await ctx.runMutation(internal.phoneRegistration.delivery, {
      challengeId: result.challengeId,
      generation,
      ok,
    });
    return { ...result, deliveryFailed: !ok };
  },
});
export const ticket = internalQuery({
  args: {
    challengeId: v.id('phoneRegistrationChallenges'),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (!row || row.tokenHash !== args.tokenHash || row.expiresAt <= Date.now())
      return contactError('INVALID_CODE');
    return row;
  },
});
export const verifyCode = internalMutation({
  args: {
    challengeId: v.id('phoneRegistrationChallenges'),
    tokenHash: v.string(),
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.challengeId);
    if (
      !row ||
      row.tokenHash !== args.tokenHash ||
      row.expiresAt <= Date.now() ||
      row.failedAttempts >= 5
    )
      return { verified: false };
    if (row.status === 'verified') return { verified: true }; // Same device's lost-response retry.
    if (row.status !== 'pending') return { verified: false };
    if (row.codeHash !== args.codeHash) {
      await ctx.db.patch(row._id, { failedAttempts: row.failedAttempts + 1 });
      return { verified: false };
    }
    await available(ctx, row.phone);
    await ctx.db.patch(row._id, {
      status: 'verified',
      codeHash: '',
      expiresAt: Date.now() + 10 * 60_000,
    });
    return { verified: true };
  },
});
export const confirm = action({
  args: {
    challengeId: v.id('phoneRegistrationChallenges'),
    token: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args): Promise<{ verified: true }> => {
    validToken(args.token);
    if (args.code.length !== 6 || !/^\d{6}$/.test(args.code)) return contactError('INVALID_CODE');
    const tokenHash = await contactHash(`signup-token:${args.token}`);
    const row = await ctx.runQuery(internal.phoneRegistration.ticket, {
      challengeId: args.challengeId,
      tokenHash,
    });
    const result = await ctx.runMutation(
      internal.phoneRegistration.verifyCode,
      {
        challengeId: row._id,
        tokenHash,
        codeHash: await contactHash(
          `signup-code:${row.generation}:${args.code}`,
        ),
      },
    );
    if (!result.verified) return contactError('INVALID_CODE');
    return { verified: true };
  },
});

// Called only from the credentials provider; password hashing belongs to Convex Auth.
export async function finishPhoneRegistration(ctx: any, params: any) {
  const token = String(params.token ?? ''),
    password = String(params.password ?? '');
  validToken(token);
  if (password.length < 8 || password.length > 1024)
    return contactError('INVALID_PASSWORD');
  if (await getAuthUserId(ctx)) return contactError('SIGN_OUT_REQUIRED');
  const tokenHash = await contactHash(`signup-token:${token}`);
  const row = await ctx.runQuery(internal.phoneRegistration.ticket, {
    challengeId: params.challengeId,
    tokenHash,
  });
  if (row.status !== 'verified' && row.status !== 'consumed')
    return contactError('INVALID_CODE');
  const result = await createAccount(ctx, {
    provider: 'password',
    account: { id: `phone-registration:${row._id}`, secret: password },
    profile: {
      phone: row.phone,
      registrationChallenge: row._id,
      registrationTokenHash: tokenHash,
    } as any,
    shouldLinkViaEmail: false,
    shouldLinkViaPhone: false,
  });
  if (result.user.phone !== row.phone || !result.user.phoneVerificationTime)
    return contactError('INVALID_CODE');
  return { userId: result.user._id };
}

// Runs INSIDE Convex Auth's account-creation transaction: no partial user/account.
export async function createPhoneRegistrationUser(
  ctx: MutationCtx,
  profile: any,
) {
  const row = await ctx.db.get(
    profile.registrationChallenge as Id<'phoneRegistrationChallenges'>,
  );
  if (
    !row ||
    row.status !== 'verified' ||
    row.expiresAt <= Date.now() ||
    row.tokenHash !== profile.registrationTokenHash ||
    row.phone !== profile.phone ||
    (await getAuthUserId(ctx))
  )
    return contactError('INVALID_CODE');
  await available(ctx, row.phone);
  const userId = await ctx.db.insert('users', {
    phone: row.phone,
    phoneVerificationTime: Date.now(),
  });
  await countAccount(ctx, userId);
  await ctx.db.patch(row._id, { status: 'consumed', userId, codeHash: '' });
  return userId;
}
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('phoneRegistrationChallenges')
      .withIndex('by_expiry', (q) => q.lt('purgeAt', Date.now()))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.phoneRegistration.cleanup, {});
  },
});
