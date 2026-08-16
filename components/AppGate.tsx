import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { PropsWithChildren } from 'react';

import { useHealthStore } from '../lib/health-store';
import { OnboardingScreen } from './OnboardingScreen';

export function AppGate({
  children,
  allowEmptyProfile = false,
}: PropsWithChildren<{ allowEmptyProfile?: boolean }>) {
  const { accountDeletion, ready, profile, restoreAccount } = useHealthStore();
  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-canvas">
        <ActivityIndicator color="#EA4087" />
        <Text className="text-text-secondary mt-3 font-sf text-[14px]">
          Загружаем контент...
        </Text>
      </View>
    );
  }
  if (accountDeletion.pendingDeletion) {
    const deletionDate = accountDeletion.scheduledDeletionAt
      ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(
          new Date(accountDeletion.scheduledDeletionAt),
        )
      : 'через 30 дней';
    return (
      <View className="flex-1 items-center justify-center bg-surface-rose px-5">
        <View className="w-full rounded-[30px] bg-white p-6 shadow-card">
          <Text className="font-sf-semibold text-[26px] leading-8 text-ink">
            Аккаунт ожидает удаления
          </Text>
          <Text className="mt-3 font-sf text-[15px] leading-5 text-text-secondary">
            Облачные данные будут окончательно удалены {deletionDate}. До этого
            срока аккаунт можно восстановить.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void restoreAccount()}
            className="mt-5 h-12 items-center justify-center rounded-full bg-brand-primary active:opacity-70"
          >
            <Text className="font-sf-medium text-[16px] text-white">
              Восстановить аккаунт
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!profile?.onboardingCompleted && !allowEmptyProfile)
    return <OnboardingScreen />;
  return children;
}
