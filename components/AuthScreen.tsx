import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

export function AuthScreen() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(undefined);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 8) {
      setError('Введите email и пароль не короче 8 символов.');
      return;
    }
    const data = new FormData();
    data.append('email', normalizedEmail);
    data.append('password', password);
    data.append('flow', flow);
    setSubmitting(true);
    try {
      await signIn('password', data);
    } catch (cause) {
      console.error('Authentication failed', cause);
      setError(
        flow === 'signIn'
          ? 'Не удалось войти. Проверьте email и пароль.'
          : 'Не удалось создать аккаунт. Возможно, email уже используется.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-surface-canvas px-6">
      <View className="rounded-[30px] bg-white p-6 shadow-card">
        <Text className="font-yaro text-[34px] leading-[38px] text-brand-primary">
          сфера.
        </Text>
        <Text className="mt-2 font-sf-semibold text-[24px] leading-7 text-ink">
          {flow === 'signIn' ? 'Вход' : 'Создание аккаунта'}
        </Text>
        <Text className="mt-2 font-sf text-[15px] leading-5 text-text-secondary">
          Это прототип: подтверждение email и восстановление пароля пока не подключены.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          className="mt-6 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[16px] text-ink"
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
          secureTextEntry
          placeholder="Пароль"
          className="mt-3 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[16px] text-ink"
        />
        {error ? (
          <Text accessibilityRole="alert" className="mt-3 font-sf text-[14px] text-state-error">
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => void submit()}
          className="mt-5 h-12 items-center justify-center rounded-full bg-brand-primary active:opacity-70"
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-sf-medium text-[16px] text-white">
              {flow === 'signIn' ? 'Войти' : 'Зарегистрироваться'}
            </Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setError(undefined);
            setFlow((value) => (value === 'signIn' ? 'signUp' : 'signIn'));
          }}
          className="mt-4 items-center py-2"
        >
          <Text className="font-sf-medium text-[15px] text-brand-primary">
            {flow === 'signIn' ? 'Создать аккаунт' : 'У меня уже есть аккаунт'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
