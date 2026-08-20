import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHealthStore } from '../lib/health-store';
import { OnboardingScreen } from './OnboardingScreen';

export function AppGate({
  children,
  allowEmptyProfile = false,
}: PropsWithChildren<{ allowEmptyProfile?: boolean }>) {
  const { accountDeletion, ready, profile, restoreAccount, serviceIssue } =
    useHealthStore();
  const [restoring, setRestoring] = useState(false);
  const insets = useSafeAreaInsets();
  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-canvas">
        <ActivityIndicator color="#EA4087" />
        <Text className="mt-3 font-sf text-[14px] text-text-secondary">
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
            accessibilityState={{ disabled: restoring }}
            disabled={restoring}
            onPress={() => {
              setRestoring(true);
              void restoreAccount().finally(() => setRestoring(false));
            }}
            className="mt-5 h-12 items-center justify-center rounded-full bg-brand-primary active:opacity-70"
          >
            {restoring ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="font-sf-medium text-[16px] text-white">
                Восстановить аккаунт
              </Text>
            )}
          </Pressable>
          {serviceIssue ? (
            <Text
              accessibilityRole="alert"
              className="mt-3 font-sf text-[13px] leading-5 text-[#9A5E12]"
            >
              {serviceIssue.message}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }
  if (!profile?.onboardingCompleted && !allowEmptyProfile)
    return <OnboardingScreen />;
  return (
    <View className="flex-1">
      {children}
      {serviceIssue && serviceIssue.kind !== 'offline' ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={{ top: Math.max(insets.top, 8) + 6 }}
          className="absolute left-3 right-3 z-50 rounded-[18px] border border-[#E9C785] bg-[#FFF7E0] px-4 py-3 shadow-card"
        >
          <Text className="font-sf-semibold text-[13px] leading-4 text-[#6D470B]">
            {serviceIssue.kind === 'server'
              ? 'Сервер временно недоступен'
              : serviceIssue.kind === 'auth'
                ? 'Нужно войти снова'
                : 'Не удалось выполнить запрос'}
          </Text>
          <Text className="mt-0.5 font-sf text-[12px] leading-4 text-[#735C38]">
            {serviceIssue.message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
