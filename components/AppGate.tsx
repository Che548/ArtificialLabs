import { fontStyle } from '../lib/font-style';
import { useAppTheme } from '../lib/theme';
import Svg, { Path } from 'react-native-svg';
import { DailySymptomsPrompt } from './DailySymptomsPrompt';
import { ActivityIndicator, Alert, Pressable, Text, View, ScrollView } from 'react-native';
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
  const { colors } = useAppTheme();
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.canvas }}>
        <ActivityIndicator color={colors.brand.primary} />
        <Text style={{ marginTop: 12, color: colors.text.secondary, fontSize: 14 }}>Загружаем…</Text>
      </View>
    );
  }
  if (accountDeletion.pendingDeletion) {
    const deletionDate = accountDeletion.scheduledDeletionAt
      ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(accountDeletion.scheduledDeletionAt))
      : 'через 30 дней';
    const disabled = restoring || signingOut;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.surface.canvas }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 64 }}>
        <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', backgroundColor: colors.surface.raised, borderRadius: 30, padding: 24, gap: 20 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.surface.rose, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none"><Path d="M20 7v5h-5M20 12a8 8 0 1 0-2.3 5.7M20 12a8 8 0 0 0-13.6-5.7" stroke={colors.brand.primary} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </View>
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={{ ...fontStyle('SFProDisplay-Semibold'), fontSize: 27, lineHeight: 32, color: colors.text.primary }}>Восстановить аккаунт</Text>
            <Text style={{ ...fontStyle('SFProDisplay-Regular'), fontSize: 16, lineHeight: 23, color: colors.text.secondary }}>Удаление запланировано на {deletionDate}. До этой даты можно вернуть доступ и сохранить данные.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => {
            setRestoring(true);
            void restoreAccount().finally(() => setRestoring(false));
          }} style={({ pressed }) => ({ minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: colors.brand.primary, opacity: pressed || disabled ? 0.65 : 1 })}>
            {restoring ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ ...fontStyle('SFProDisplay-Semibold'), fontSize: 17, color: '#FFFFFF' }}>Восстановить доступ</Text>}
          </Pressable>
          <Pressable testID="e2e-pending-deletion-sign-out" accessibilityRole="button" disabled={disabled} onPress={() => Alert.alert('Выйти из аккаунта?', 'Восстановить доступ можно при следующем входе.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Выйти', style: 'destructive', onPress: () => void leavePendingAccount() }])} style={{ minHeight: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.canvas }}>
            <Text style={{ ...fontStyle('SFProDisplay-Medium'), fontSize: 16, color: colors.text.primary }}>{signingOut ? 'Выходим…' : 'Выйти из аккаунта'}</Text>
          </Pressable>
          {signOutIssue || serviceIssue ? <Text accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, color: colors.state.error }}>{signOutIssue ?? serviceIssue?.message}</Text> : null}
        </View>
      </ScrollView>
    );
  }
  if (!profile?.onboardingCompleted && !allowEmptyProfile)
    return <OnboardingScreen />;
  return <View className="flex-1"><DailySymptomsPrompt>{children}</DailySymptomsPrompt></View>;
}
