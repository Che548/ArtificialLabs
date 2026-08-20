import { PushNotifications } from '@convex-dev/expo-push-notifications';
import { v } from 'convex/values';

import { components } from './_generated/api';
import { mutation, query } from './_generated/server';
import { requireActiveAccount, requireUserId } from './lib/access';
import { getNotificationCopy } from '../shared/notification-copy';

const push = new PushNotifications<string>(components.pushNotifications);
const tone = v.union(v.literal('formal'), v.literal('cute'));

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await push.getStatusForUser(ctx, { userId });
  },
});

export const registerToken = mutation({
  args: { pushToken: v.string() },
  handler: async (ctx, { pushToken }) => {
    const userId = await requireActiveAccount(ctx);
    if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(pushToken)) {
      throw new Error('INVALID_EXPO_PUSH_TOKEN');
    }
    await push.recordToken(ctx, { userId, pushToken });
    await push.unpauseNotificationsForUser(ctx, { userId });
    return { registered: true };
  },
});

export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const userId = await requireActiveAccount(ctx);
    if (enabled) {
      await push.unpauseNotificationsForUser(ctx, { userId });
    } else {
      await push.pauseNotificationsForUser(ctx, { userId });
    }
    return { enabled };
  },
});

export const sendTest = mutation({
  args: { tone },
  handler: async (ctx, args) => {
    const userId = await requireActiveAccount(ctx);
    const copy = getNotificationCopy('journalDaily', args.tone);
    const notificationId = await push.sendPushNotification(ctx, {
      userId,
      allowUnregisteredTokens: true,
      notification: {
        title: copy.title,
        body: copy.body,
        sound: 'default',
        data: { eventKey: 'journalDaily', url: copy.route },
      },
    });
    return { queued: notificationId !== null };
  },
});
