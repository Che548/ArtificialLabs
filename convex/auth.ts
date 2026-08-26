import { Password } from '@convex-dev/auth/providers/Password';
import { Phone } from '@convex-dev/auth/providers/Phone';
import { convexAuth, getAuthUserId } from '@convex-dev/auth/server';

import { generateSixDigitCode, normalizeRussianPhone } from './lib/sms';
import { sendPhoneVerification } from './smsAuth';

const PhoneProvider = Phone({
  maxAge: 5 * 60,
  generateVerificationToken: async () => generateSixDigitCode(),
  sendVerificationRequest: async ({ identifier, token, expires }, ctx) => {
    const normalized = normalizeRussianPhone(identifier);
    if (identifier !== normalized) throw new Error('SMS_PHONE_INVALID');
    await sendPhoneVerification(ctx as any, normalized, token, expires);
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, PhoneProvider],
  signIn: { maxFailedAttempsPerHour: 5 },
  callbacks: {
    createOrUpdateUser: async (ctx, args) => {
      const { emailVerified, phoneVerified, ...profile } = args.profile;
      const currentUserId = await getAuthUserId(ctx);
      let userId = args.existingUserId;
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
