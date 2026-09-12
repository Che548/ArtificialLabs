import { useAuthActions } from '@convex-dev/auth/react';
import { useAction } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { otpAutofillProps } from '../lib/otp-autofill';

export type LoginEmailChallenge = {
  challengeId: Id<'contactVerificationChallenges'>;
  token: string;
  retryAt: number;
  expiresAt: number;
  deliveryFailed?: boolean;
};
export function parseLoginEmailChallenge(
  error: unknown,
  token: string,
): LoginEmailChallenge | null {
  const data = (error as { data?: unknown })?.data;
  let value: any = data;
  if (!value || typeof value !== 'object') {
    const message = String(error);
    if (!message.includes('EMAIL_VERIFICATION_REQUIRED')) return null;
    const challengeId = message.match(
      /"challengeId"\s*:\s*"([a-zA-Z0-9]+)"/,
    )?.[1];
    const retryAt = Number(message.match(/"retryAt"\s*:\s*(\d+)/)?.[1]);
    const expiresAt = Number(message.match(/"expiresAt"\s*:\s*(\d+)/)?.[1]);
    value = {
      code: 'EMAIL_VERIFICATION_REQUIRED',
      challengeId,
      retryAt,
      expiresAt,
      deliveryFailed: /"deliveryFailed"\s*:\s*true/.test(message),
    };
  }
  if (
    value.code !== 'EMAIL_VERIFICATION_REQUIRED' ||
    typeof value.challengeId !== 'string' ||
    !Number.isFinite(value.retryAt) ||
    !Number.isFinite(value.expiresAt)
  )
    return null;
  return {
    challengeId: value.challengeId as LoginEmailChallenge['challengeId'],
    token,
    retryAt: value.retryAt,
    expiresAt: value.expiresAt,
    deliveryFailed: value.deliveryFailed === true,
  };
}
export function contactMessage(error: unknown) {
  const message = String(error);
  if (message.includes('INVALID_PASSWORD')) return 'Неверный текущий пароль.';
  if (message.includes('PHONE_UNAVAILABLE'))
    return 'Этот номер недоступен. Укажите другой.';
  if (message.includes('SAME_PHONE')) return 'Укажите новый номер телефона.';
  if (message.includes('INVALID_CODE')) return 'Код неверный или истёк.';
  if (message.includes('REAUTHENTICATE'))
    return 'Начните заново и подтвердите пароль.';
  if (message.includes('RATE_LIMITED'))
    return 'Повторная отправка пока недоступна. Попробуйте позже.';
  return 'Не удалось выполнить запрос. Проверьте подключение и попробуйте позже.';
}
export function LoginEmailVerification({
  initial,
  onClose,
  onDone,
}: {
  initial: LoginEmailChallenge;
  onClose: () => void;
  onDone: () => void;
}) {
  const { signIn } = useAuthActions();
  const resend = useAction(api.emailVerification.resend);
  const [challenge, setChallenge] = useState(initial),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  const [error, setError] = useState(
    initial.deliveryFailed
      ? 'Письмо пока не отправлено. Повторите отправку после таймера.'
      : '',
  );
  const lock = useRef(false),
    insets = useSafeAreaInsets();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const run = async (again: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (again) {
        const result = await resend({
          challengeId: challenge.challengeId,
          token: challenge.token,
        });
        setChallenge({ ...result, token: challenge.token });
        setCode('');
        setNow(Date.now());
        if (result.deliveryFailed)
          setError(
            'Письмо пока не отправлено. Повторите отправку после таймера.',
          );
      } else {
        await signIn('password', {
          flow: 'email-verification',
          challengeId: challenge.challengeId,
          token: challenge.token,
          code,
        });
        setCode('');
        onDone();
      }
    } catch (cause) {
      setError(contactMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const expired = now >= challenge.expiresAt;
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.sheet,
            {
              marginTop: insets.top + 12,
              paddingBottom: Math.max(20, insets.bottom),
            },
          ]}
          accessibilityViewIsModal
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={styles.title}>
              Подтвердите email
            </Text>
            <Text style={styles.copy}>
              Введите код из письма на почту аккаунта. Без подтверждения вход не
              завершён.
            </Text>
            <TextInput
              testID="login-email-code"
              accessibilityLabel="Код из письма"
              autoFocus
              keyboardType="number-pad"
              {...otpAutofillProps(Platform.OS === 'ios' ? 'ios' : 'web')}
              value={code}
              maxLength={6}
              onChangeText={(value) =>
                setCode(value.replace(/\D/g, '').slice(0, 6))
              }
              editable={!busy}
              style={styles.input}
            />
            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            {expired && (
              <Text style={styles.error}>
                Срок кода истёк. Вернитесь ко входу и начните заново.
              </Text>
            )}
            <Pressable
              testID="login-email-confirm"
              accessibilityRole="button"
              disabled={busy || expired || code.length !== 6}
              onPress={() => void run(false)}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>
                {busy ? 'Подождите…' : 'Подтвердить'}
              </Text>
            </Pressable>
            <Pressable
              testID="login-email-resend"
              accessibilityRole="button"
              disabled={busy || expired || now < challenge.retryAt}
              onPress={() => void run(true)}
              style={styles.action}
            >
              <Text style={styles.link}>
                {now < challenge.retryAt
                  ? `Повторно через ${Math.ceil((challenge.retryAt - now) / 1000)} сек.`
                  : 'Отправить код повторно'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={styles.action}
            >
              <Text style={styles.link}>Вернуться ко входу</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#0006',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '95%',
    backgroundColor: '#fff5f1',
    padding: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  title: { fontSize: 24, fontWeight: '600', color: '#302b2d' },
  copy: { fontSize: 15, color: '#736e6c', marginVertical: 16 },
  input: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    color: '#302b2d',
  },
  error: { color: '#b9233e', marginTop: 12 },
  primary: {
    backgroundColor: '#ea4087',
    padding: 16,
    borderRadius: 18,
    marginTop: 16,
    alignItems: 'center',
  },
  primaryText: { color: 'white', fontWeight: '600', fontSize: 16 },
  action: { paddingVertical: 16 },
  link: { color: '#ea4087', fontSize: 16 },
});
