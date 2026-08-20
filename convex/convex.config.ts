import rateLimiter from '@convex-dev/rate-limiter/convex.config.js';
import pushNotifications from '@convex-dev/expo-push-notifications/convex.config.js';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(rateLimiter);
app.use(pushNotifications);

export default app;
