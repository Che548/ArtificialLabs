import type { TokenStorage } from '@convex-dev/auth/react';
import * as SecureStore from 'expo-secure-store';

export const authTokenStorage: TokenStorage = {
  getItem: async (key) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      // Auth state must fail closed. A temporarily unreadable or invalidated
      // credential should show the sign-in screen instead of rejecting the
      // provider's startup effect and terminating the app.
      console.warn('Stored authentication state could not be read', error);
      return null;
    }
  },
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
