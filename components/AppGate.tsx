import { ActivityIndicator, Text, View } from 'react-native';
import type { PropsWithChildren } from 'react';

import { useHealthStore } from '../lib/health-store';
import { OnboardingScreen } from './OnboardingScreen';

export function AppGate({ children }: PropsWithChildren) {
  const { ready, profile } = useHealthStore();
  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-canvas">
        <ActivityIndicator color="#D31471" />
        <Text className="mt-3 font-sf text-[14px] text-text-secondary">Открываем защищённое хранилище…</Text>
      </View>
    );
  }
  if (!profile?.onboardingCompleted) return <OnboardingScreen />;
  return children;
}
