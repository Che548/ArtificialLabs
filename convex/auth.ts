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

const PhoneProvider = Phone({
  maxAge: 5 * 60,
  generateVerificationToken: async () => generateSixDigitCode(),
  sendVerificationRequest: async ({ identifier, token, expires }, ctx) => {
    const currentUserId = await getAuthUserId(ctx);
    if (currentUserId === null && process.env.SMS_LOGIN_ENABLED !== '1') {
      throw new Error('SMS_LOGIN_DISABLED');
    }
    const normalized = normalizeRussianPhone(identifier);
    if (identifier !== normalized) throw new Error('SMS_PHONE_INVALID');
    await sendPhoneVerification(ctx as any, normalized, token, expires);
  },
});

const PhonePasswordProvider = ConvexCredentials({
  id: 'phone-password',
  authorize: async (params, ctx) => {
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
    return { userId: retrieved.user._id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, PhonePasswordProvider, PhoneProvider],
  signIn: { maxFailedAttempsPerHour: 5 },
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      const { emailVerified, phoneVerified, ...profile } = args.profile;
      const currentUserId = await getAuthUserId(ctx);
      let userId = args.existingUserId;
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
        return userId;
      }
      return await ctx.db.insert('users', userData);
    },
  },
});
