import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { PropsWithChildren } from 'react';
import { useRef, useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';

import { useHealthStore } from '../lib/health-store';
import { OnboardingScreen } from './OnboardingScreen';

export function AppGate({
  children,
  allowEmptyProfile = false,
}: PropsWithChildren<{ allowEmptyProfile?: boolean }>) {
  const { accountDeletion, ready, profile, restoreAccount, serviceIssue } =
    useHealthStore();
  const [restoring, setRestoring] = useState(false);
  const { signOut } = useAuthActions();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutIssue, setSignOutIssue] = useState<string>();
  const signOutInFlight = useRef(false);
  const leavePendingAccount = async () => {
    if (signOutInFlight.current || restoring) return;
    signOutInFlight.current = true;
    setSigningOut(true);
    setSignOutIssue(undefined);
    try {
      await signOut();
    } catch {
      setSignOutIssue('Не удалось выйти. Разблокируйте устройство и попробуйте ещё раз.');
    } finally {
      signOutInFlight.current = false;
      setSigningOut(false);
    }
  };
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
            accessibilityState={{ disabled: restoring || signingOut }}
            disabled={restoring || signingOut}
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
          <Pressable
            testID="e2e-pending-deletion-sign-out"
            accessibilityRole="button"
            accessibilityState={{ disabled: restoring || signingOut }}
            disabled={restoring || signingOut}
            onPress={() => void leavePendingAccount()}
            className="mt-3 h-12 items-center justify-center rounded-full border border-brand-primary"
          >
            <Text className="font-sf-medium text-[16px] text-ink">
              {signingOut ? 'Выходим…' : 'Выйти из аккаунта'}
            </Text>
          </Pressable>
          {signOutIssue || serviceIssue ? (
            <Text
              accessibilityRole="alert"
              className="mt-3 font-sf text-[13px] leading-5 text-[#9A5E12]"
            >
              {signOutIssue ?? serviceIssue?.message}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }
  if (!profile?.onboardingCompleted && !allowEmptyProfile)
    return <OnboardingScreen />;
  return <View className="flex-1">{children}</View>;
}
