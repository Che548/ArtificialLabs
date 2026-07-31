import { ActivityIndicator, Text, View } from 'react-native';
import type { PropsWithChildren } from 'react';

import { useHealthStore } from '../lib/health-store';
import { OnboardingScreen } from './OnboardingScreen';

export function AppGate({
  children,
  allowEmptyProfile = false,
}: PropsWithChildren<{ allowEmptyProfile?: boolean }>) {
  const { ready, profile } = useHealthStore();
  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-canvas">
        <ActivityIndicator color="#D31471" />
        <Text className="text-text-secondary mt-3 font-sf text-[14px]">
          Открываем защищённое хранилище…
        </Text>
      </View>
    );
  }
  if (!profile?.onboardingCompleted && !allowEmptyProfile)
    return <OnboardingScreen />;
  return children;
}
