import { useAuthActions } from '@convex-dev/auth/react';
import { useAction } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { AppSheet } from './AppSheet';
import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
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
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
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
  const lock = useRef(false);
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
    <AppSheet
      title="Подтвердите почту"
      onClose={onClose}
      dismissDisabled={busy}
    >
      <Text style={styles.copy}>Введите шестизначный код из письма.</Text>
      <TextInput
        testID="login-email-code"
        accessibilityLabel="Код из письма"
        placeholder="000000"
        placeholderTextColor={colors.text.secondary}
        selectionColor={colors.brand.primary}
        autoFocus
        keyboardType="number-pad"
        {...otpAutofillProps(Platform.OS === 'ios' ? 'ios' : 'web')}
        value={code}
        maxLength={6}
        onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
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
        style={[
          styles.primary,
          (busy || expired || code.length !== 6) && styles.disabled,
        ]}
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
        <Text
          style={[
            styles.link,
            (busy || expired || now < challenge.retryAt) && styles.muted,
          ]}
        >
          {now < challenge.retryAt
            ? `Повторно через ${Math.ceil((challenge.retryAt - now) / 1000)} сек.`
            : 'Отправить код повторно'}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={onClose}
        style={styles.action}
      >
        <Text style={styles.secondaryText}>Вернуться ко входу</Text>
      </Pressable>
    </AppSheet>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    copy: { fontSize: 15, lineHeight: 21, color: colors.text.secondary },
    input: {
      backgroundColor: colors.surface.raised,
      borderRadius: 18,
      minHeight: 58,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 24,
      lineHeight: 30,
      letterSpacing: 6,
      textAlign: 'center',
      textAlignVertical: 'center',
      color: colors.text.primary,
    },
    error: { color: colors.state.error, fontSize: 14, lineHeight: 20 },
    primary: {
      backgroundColor: colors.brand.primary,
      minHeight: 52,
      paddingHorizontal: 20,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
    },
    disabled: { opacity: 0.45 },
    primaryText: {
      color: colors.text.inverse,
      fontWeight: '600',
      fontSize: 17,
    },
    action: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    link: { color: colors.brand.primary, fontSize: 15, textAlign: 'center' },
    muted: { color: colors.text.secondary },
    secondaryText: {
      color: colors.text.secondary,
      fontSize: 15,
      textAlign: 'center',
    },
  });
