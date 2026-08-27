import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type SmsEvent = { message: string };
type Subscription = { remove(): void };
type SmsRetrieverNativeModule = {
  addListener(event: 'onSmsReceived', listener: (event: SmsEvent) => void): Subscription;
  startAsync(): Promise<boolean>;
};

const nativeModule =
  Platform.OS === 'android'
    ? requireNativeModule<SmsRetrieverNativeModule>('SmsRetriever')
    : null;

export function addSmsListener(listener: (message: string) => void) {
  return nativeModule?.addListener('onSmsReceived', ({ message }) => listener(message));
}

export async function startSmsRetriever() {
  if (!nativeModule) return false;
  try {
    return await nativeModule.startAsync();
  } catch {
    return false;
  }
}
