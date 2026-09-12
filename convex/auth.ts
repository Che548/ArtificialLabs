import { Password } from '@convex-dev/auth/providers/Password';
import { Phone } from '@convex-dev/auth/providers/Phone';
import { ConvexCredentials } from '@convex-dev/auth/providers/ConvexCredentials';
import {
  convexAuth,
  getAuthUserId,
  retrieveAccount,
} from '@convex-dev/auth/server';

import { internal } from './_generated/api';
import { generateSixDigitCode, normalizeRussianPhone } from './lib/sms';
import { sendPhoneVerification } from './smsAuth';
import { countAccount, uncountAccount } from './lib/accountCounts';
import { finishEmailLogin, requireEmailForLogin } from './emailVerification';
import { normalizeEmail } from './emailChange';
import type { Id } from './_generated/dataModel';

const basePassword = Password({ profile: params => ({ email: normalizeEmail(String(params.email ?? '')) }), validatePasswordRequirements: password => {
  if (password.length < 8 || password.length > 1024) throw new Error('Invalid password length');
} });
// ConvexCredentials stores the implementation in `options`; overriding only the
// outer `authorize` would be overwritten when Convex Auth materializes providers.
const passwordOptions = (basePassword as any).options;
export const VerifiedPasswordProvider: ReturnType<typeof ConvexCredentials> = ConvexCredentials({ ...passwordOptions, authorize: async (params: any, ctx: any): Promise<{ userId: Id<'users'>; sessionId?: Id<'authSessions'> } | null> => {
  if (params.flow === 'email-verification') return finishEmailLogin(ctx, params);
  const result = await passwordOptions.authorize(params, ctx);
  if (result) await requireEmailForLogin(ctx, result.userId, params.emailTicketToken);
  return result;
} });

const PhoneProvider = Phone({
  maxAge: 5 * 60,
  generateVerificationToken: async () => generateSixDigitCode(),
  sendVerificationRequest: async ({ identifier, token, expires }, ctx) => {
    const currentUserId = await getAuthUserId(ctx);
    if (currentUserId === null && (process.env.SMS_LOGIN_ENABLED !== '1' || process.env.EMAIL_VERIFICATION_REQUIRED === '1')) {
      throw new Error('SMS_LOGIN_DISABLED');
    }
    const normalized = normalizeRussianPhone(identifier);
    if (identifier !== normalized) throw new Error('SMS_PHONE_INVALID');
    await sendPhoneVerification(ctx as any, normalized, token, expires);
  },
});

export const PhonePasswordProvider: ReturnType<typeof ConvexCredentials> = ConvexCredentials({
  id: 'phone-password',
  authorize: async (params, ctx): Promise<{ userId: Id<'users'> }> => {
    const phone = normalizeRussianPhone(String(params.phone ?? ''));
    const password = String(params.password ?? '');
    if (password.length < 8) throw new Error('Invalid credentials');
    const resolved = await ctx.runQuery(
      internal.passwordRecovery.resolvePasswordIdentifier,
      { identifier: phone, channel: 'sms' },
    );
    if (!resolved?.passwordProviderAccountId) {
      throw new Error('Invalid credentials');
    }
    const retrieved = await retrieveAccount(ctx, {
      provider: 'password',
      account: {
        id: resolved.passwordProviderAccountId,
        secret: password,
      },
    });
    if (!retrieved || retrieved.user._id !== resolved.userId) {
      throw new Error('Invalid credentials');
    }
    await requireEmailForLogin(ctx, retrieved.user._id, params.emailTicketToken);
    return { userId: retrieved.user._id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [VerifiedPasswordProvider, PhonePasswordProvider, PhoneProvider],
  signIn: { maxFailedAttempsPerHour: 5 },
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      const { emailVerified, phoneVerified, ...profile } = args.profile;
      const currentUserId = await getAuthUserId(ctx);
      let userId = args.existingUserId;
      if (args.provider.id === 'phone' && args.type === 'verification') {
        const existing = userId ? await (ctx.db as any).get(userId) : null;
        if (existing?.phoneVerificationTime && existing.phone !== profile.phone) throw new Error('PHONE_CHANGE_PASSWORD_REQUIRED');
        if (!currentUserId && process.env.EMAIL_VERIFICATION_REQUIRED === '1') throw new Error('SMS_LOGIN_DISABLED');
      }
      const linkingRecoveredPhonePassword =
        args.provider.id === 'password' &&
        (args as any).shouldLinkViaPhone === true &&
        typeof profile.phone === 'string';
      if (linkingRecoveredPhonePassword) {
        const phone = normalizeRussianPhone(String(profile.phone));
        const verifiedOwner = await (ctx.db as any)
          .query('users')
          .withIndex('phone', (q: any) => q.eq('phone', phone))
          .filter((q: any) =>
            q.neq(q.field('phoneVerificationTime'), undefined),
          )
          .unique();
        if (!verifiedOwner) throw new Error('Invalid recovery account');
        userId = verifiedOwner._id;
      }
      const linkingUnverifiedPhone =
        args.provider.id === 'phone' &&
        args.type === 'phone' &&
        currentUserId !== null;

      if (linkingUnverifiedPhone) {
        const phone = normalizeRussianPhone(String(profile.phone ?? ''));
        const currentUser = await (ctx.db as any).get(currentUserId);
        if (currentUser?.phoneVerificationTime) {
          throw new Error('PHONE_CHANGE_PASSWORD_REQUIRED');
        }
        const verifiedOwner = await (ctx.db as any)
          .query('users')
          .withIndex('phone', (q: any) => q.eq('phone', phone))
          .filter((q: any) =>
            q.neq(q.field('phoneVerificationTime'), undefined),
          )
          .unique();
        if (verifiedOwner && verifiedOwner._id !== currentUserId) {
          throw new Error('SMS_PHONE_ALREADY_IN_USE');
        }
        if (args.existingUserId && args.existingUserId !== currentUserId) {
          const [accounts, sessions, medicalProfile] = await Promise.all([
            (ctx.db as any)
              .query('authAccounts')
              .withIndex('userIdAndProvider', (q: any) =>
                q.eq('userId', args.existingUserId),
              )
              .take(2),
            (ctx.db as any)
              .query('authSessions')
              .withIndex('userId', (q: any) =>
                q.eq('userId', args.existingUserId),
              )
              .take(1),
            (ctx.db as any)
              .query('profiles')
              .withIndex('by_user', (q: any) =>
                q.eq('userId', args.existingUserId),
              )
              .unique(),
          ]);
          if (
            accounts.length === 1 &&
            accounts[0].provider === 'phone' &&
            sessions.length === 0 &&
            !medicalProfile
          ) {
            await uncountAccount(ctx, args.existingUserId);
            await ctx.db.delete(args.existingUserId);
          }
        }
        userId = currentUserId;
      }

      const userData = {
        ...(emailVerified ? { emailVerificationTime: Date.now() } : {}),
        ...(phoneVerified ? { phoneVerificationTime: Date.now() } : {}),
        ...profile,
        ...(linkingUnverifiedPhone ? { phone: undefined } : {}),
      };
      if (userId) {
        await ctx.db.patch(userId, userData);
        await countAccount(ctx, userId);
        return userId;
      }
      const created = await ctx.db.insert('users', userData);
      await countAccount(ctx, created);
      return created;
    },
  },
});
