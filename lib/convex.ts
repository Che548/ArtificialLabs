import { ConvexReactClient } from 'convex/react';
import { Platform } from 'react-native';

const e2eConvexUrl = Platform.select({
  ios: process.env.EXPO_PUBLIC_E2E_IOS_CONVEX_URL,
  android: process.env.EXPO_PUBLIC_E2E_ANDROID_CONVEX_URL,
});
const convexUrl =
  process.env.EXPO_PUBLIC_E2E_MODE === '1' && e2eConvexUrl
    ? e2eConvexUrl
    : process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error(
    'Missing EXPO_PUBLIC_CONVEX_URL. Copy .env.example to .env.local and configure the Convex deployment URL.',
  );
}

export const convex = new ConvexReactClient(convexUrl);
