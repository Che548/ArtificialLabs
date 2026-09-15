import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { colors as defaultThemeColors } from '../design-system/tokens';
import { LegalDocumentsModal } from './LegalDocumentsModal';
import type { LegalDocumentSelection } from '../lib/legal-documents';
import { BrandLogo } from './BrandLogo';
import { fontStyle } from '../lib/font-style';
import { getRandomBytes } from 'expo-crypto';
import { LoginEmailVerification, parseLoginEmailChallenge, type LoginEmailChallenge } from './LoginEmailVerification';
import { useAuthActions } from '@convex-dev/auth/react';
import { useAction } from 'convex/react';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { SegmentedSwitcher } from '../design-system/components';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useConnectivity } from '../lib/connectivity';
import { otpAutofillProps } from '../lib/otp-autofill';
import { classifyServiceIssue } from '../lib/service-errors';
import { UpdateRequiredNotice } from './UpdateRequiredNotice';
import { listenForSmsOtp, startSmsRetriever } from '../lib/sms-otp-retriever';
import { rememberRegistrationConsent, clearRegistrationConsent } from '../lib/registration-consent';

type AuthChannel = 'email' | 'phone';
type AuthFlow = 'signIn' | 'signUp';

function phoneSignupError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : '';
  if (message.includes('PHONE_UNAVAILABLE')) return 'Номер недоступен для регистрации. Попробуйте войти или восстановить пароль.';
  if (message.includes('RATE_LIMIT') || message.includes('SMS_COOLDOWN')) return 'Слишком много запросов. Повторите позже.';
  if (message.includes('INVALID_CODE')) return 'Код неверен или подтверждение истекло. Проверьте код либо начните заново.';
  if (message.includes('INVALID_PASSWORD')) return 'Пароль должен содержать от 8 до 1024 символов.';
  return 'Не удалось завершить регистрацию. Проверьте соединение и повторите попытку.';
}

const authChannelOptions: Array<{ value: AuthChannel; label: string }> = [
  { value: 'email', label: 'Почта' },
  { value: 'phone', label: 'Телефон' },
];

const designWidth = 402;
const designHeight = 874;
const devLoginEnabled = __DEV__;
const e2eMode = process.env.EXPO_PUBLIC_E2E_MODE === '1';
const e2eEmail = process.env.EXPO_PUBLIC_E2E_EMAIL;

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (value.trimStart().startsWith('+7')) {
    return `+7${digits.slice(1, 11)}`;
  }
  if (digits.length > 10 && (digits[0] === '7' || digits[0] === '8')) {
    return `${digits[0]}${digits.slice(1, 11)}`;
  }
  return digits.slice(0, 10);
}

function canonicalPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  return digits.length === 11 && (digits[0] === '7' || digits[0] === '8')
    ? `+7${digits.slice(1)}`
    : value;
}

function recoveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('RECOVERY_RATE_LIMITED')) {
    return 'Слишком много попыток. Попробуйте позже.';
  }
  if (message.includes('RECOVERY_IDENTIFIER_INVALID')) {
    return 'Введите корректную почту или российский номер.';
  }
  if (message.includes('RECOVERY_PHONE_ACCOUNT_NOT_FOUND')) {
    return 'Аккаунт с таким номером не найден.';
  }
  if (message.includes('RECOVERY_PASSWORD_INVALID')) {
    return 'Пароль должен содержать не менее 8 символов.';
  }
  if (message.includes('RECOVERY_CODE_INVALID_OR_EXPIRED')) {
    return 'Код неверный или истёк. Запросите новый код.';
  }
  return 'Восстановление временно недоступно. Попробуйте позже.';
}

function Checkbox({
  checked,
  label,
  onPress,
  testID,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, mode } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  const activation = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    activation.stopAnimation();
    Animated.timing(activation, {
      toValue: checked ? 1 : 0,
      duration: checked ? 220 : 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [activation, checked]);

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      hitSlop={10}
      onPress={onPress}
      style={styles.checkboxHitArea}
    >
      <Animated.View
        style={[
          styles.checkbox,
          {
            backgroundColor: activation.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.surface.raised, colors.brand.primary],
            }),
            borderColor: activation.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.surface.divider, colors.brand.primary],
            }),
            transform: [
              {
                scale: activation.interpolate({
                  inputRange: [0, 0.55, 1],
                  outputRange: [1, 0.92, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.checkboxMark,
            {
              opacity: activation,
              transform: [
                {
                  scale: activation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.55, 1],
                  }),
                },
              ],
            },
          ]}
        >
          ✓
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

function LegalLink({ children, onPress }: { children: string; onPress: () => void }) {
  const { colors, mode } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  return (
    <Text
      accessibilityRole="link"
      onPress={onPress}
      style={styles.legalLink}
    >
      {children}
    </Text>
  );
}

export function AuthScreen({
  embedded = false,
  onAuthenticated,
  onDevLogin,
  onPreviewComplete,
  preview = false,
}: {
  embedded?: boolean;
  onAuthenticated?: () => void;
  onDevLogin?: () => void;
  onPreviewComplete?: () => void;
  preview?: boolean;
}) {
  const { colors, mode } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  const { signIn } = useAuthActions();
  const requestPasswordRecovery = useAction(api.passwordRecovery.request);
  const completePasswordRecovery = useAction(api.passwordRecovery.complete);
  const requestPhoneRegistration = useAction(api.phoneRegistration.request);
  const confirmPhoneRegistration = useAction(api.phoneRegistration.confirm);
  const { isOffline } = useConnectivity();
  const window = useWindowDimensions();
  const [legalDocument, setLegalDocument] = useState<LegalDocumentSelection>(null);
  const [flow, setFlow] = useState<AuthFlow>('signUp');
  const [channel, setChannel] = useState<AuthChannel>('email');
  const [identifier, setIdentifier] = useState(e2eMode ? (e2eEmail ?? '') : '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [personalDataConsent, setPersonalDataConsent] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [emailChallenge, setEmailChallenge] = useState<LoginEmailChallenge>();
  const loginLock = useRef(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'identifier' | 'code'>(
    'identifier',
  );
  const [recoveryChallengeId, setRecoveryChallengeId] =
    useState<Id<'passwordRecoveryChallenges'>>();
  const [recoveryExpiresAt, setRecoveryExpiresAt] = useState<number>();
  const [phoneRetryAt, setPhoneRetryAt] = useState<number>();
  const [clock, setClock] = useState(Date.now());
  const [phoneSignupStep, setPhoneSignupStep] = useState<'identifier' | 'code' | 'password'>('identifier');
  const [phoneSignupId, setPhoneSignupId] = useState<Id<'phoneRegistrationChallenges'>>();
  const phoneSignupToken = useRef('');
  const phoneSignup = flow === 'signUp' && channel === 'phone' && !recoveryMode;
  const phoneSignupCode = phoneSignup && phoneSignupStep === 'code';
  const resetPhoneSignup = () => {
    setPhoneSignupStep('identifier'); setPhoneSignupId(undefined); phoneSignupToken.current = '';
    setRecoveryCode(''); setPassword(''); setPasswordConfirmation(''); setPhoneRetryAt(undefined);
  };
  const phoneCodeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!phoneRetryAt || phoneRetryAt <= Date.now()) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phoneRetryAt]);

  useEffect(() => {
    if ((!phoneSignupCode && (!recoveryMode || recoveryStep !== 'code')) || submitting)
      return undefined;
    const frame = requestAnimationFrame(() =>
      phoneCodeInputRef.current?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [recoveryMode, recoveryStep, submitting, phoneSignupCode]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = listenForSmsOtp((code) => {
      if (recoveryMode && channel === 'phone') setRecoveryCode(code);
      if (phoneSignupCode) setRecoveryCode(code);
    });
    return () => subscription?.remove();
  }, [channel, recoveryMode, phoneSignupCode]);

  const normalizedIdentifier = identifier.trim();
  const validIdentifier =
    channel === 'email'
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)
      : normalizedIdentifier.replace(/\D/g, '').length >= 10;
  const validPassword = password.length >= 8;
  const validRecoveryCode = /^\d{6}$/.test(recoveryCode);
  const legalAccepted =
    flow === 'signIn' || (personalDataConsent && agreementAccepted);
  const canSubmit = phoneSignup
    ? validIdentifier && legalAccepted && (phoneSignupStep === 'identifier' ||
      (phoneSignupStep === 'code' ? validRecoveryCode : validPassword && password === passwordConfirmation))
    : recoveryMode
    ? recoveryStep === 'identifier'
      ? validIdentifier
      : validRecoveryCode &&
        validPassword &&
        password === passwordConfirmation &&
        Boolean(recoveryChallengeId)
    : validIdentifier && validPassword && legalAccepted;
  const submitDisabled = !canSubmit || submitting || (!preview && isOffline);
  const visibleError =
    error ??
    (!preview && isOffline
      ? 'Нет интернета. Подключитесь к сети, чтобы войти или зарегистрироваться.'
      : undefined);
  const canvasScale = embedded
    ? 1
    : Math.min(window.width / designWidth, window.height / designHeight);

  const changeChannel = (nextChannel: AuthChannel) => {
    if (loginLock.current) return;
    resetPhoneSignup();
    setChannel(nextChannel);
    setIdentifier('');
    setError(undefined);
    setRecoveryCode('');
    setRecoveryStep('identifier');
    setRecoveryChallengeId(undefined);
    setPhoneRetryAt(undefined);
  };

  const changeFlow = () => {
    if (loginLock.current) return;
    resetPhoneSignup();
    setFlow((current) => (current === 'signUp' ? 'signIn' : 'signUp'));
    setChannel('email');
    setRecoveryMode(false);
    setError(undefined);
    setRecoveryCode('');
    setRecoveryStep('identifier');
    setRecoveryChallengeId(undefined);
  };

  const beginRecovery = () => {
    setFlow('signIn');
    setRecoveryMode(true);
    setRecoveryStep('identifier');
    setRecoveryChallengeId(undefined);
    setRecoveryCode('');
    setPassword('');
    setPasswordConfirmation('');
    setError(undefined);
  };

  const cancelRecovery = () => {
    setRecoveryMode(false);
    setRecoveryStep('identifier');
    setRecoveryChallengeId(undefined);
    setRecoveryCode('');
    setPassword('');
    setPasswordConfirmation('');
    setError(undefined);
  };

  const requestRecoveryCode = async () => {
    if (loginLock.current) return;
    loginLock.current = true;
    setSubmitting(true);
    setError(undefined);
    setRecoveryCode('');
    try {
      if (channel === 'phone') await startSmsRetriever();
      const result = await requestPasswordRecovery({
        identifier:
          channel === 'phone'
            ? canonicalPhone(normalizedIdentifier)
            : normalizedIdentifier.toLowerCase(),
        ...(Platform.OS === 'ios' || Platform.OS === 'android'
          ? { platform: Platform.OS }
          : {}),
      });
      setRecoveryChallengeId(result.challengeId);
      setRecoveryExpiresAt(result.expiresAt);
      setPhoneRetryAt(result.retryAt);
      setRecoveryStep('code');
    } catch (cause) {
      console.error('Password recovery request failed');
      setError(recoveryError(cause));
    } finally {
      loginLock.current = false;
      setSubmitting(false);
    }
  };

  const finishRecovery = async () => {
    if (!recoveryChallengeId || loginLock.current) return;
    loginLock.current = true;
    setSubmitting(true);
    setError(undefined);
    try {
      await completePasswordRecovery({
        challengeId: recoveryChallengeId,
        code: recoveryCode,
        newPassword: password,
      });
      const data = new FormData();
      if (channel === 'phone') {
        data.append('phone', canonicalPhone(normalizedIdentifier));
      } else {
        data.append('email', normalizedIdentifier.toLowerCase());
        data.append('flow', 'signIn');
      }
      data.append('password', password);
      const emailTicketToken = Array.from(getRandomBytes(32), byte => byte.toString(16).padStart(2, '0')).join('');
      data.append('emailTicketToken', emailTicketToken);
      try {
        await signIn(channel === 'phone' ? 'phone-password' : 'password', data);
        onAuthenticated?.();
      } catch (cause) {
        cancelRecovery();
        const pending = parseLoginEmailChallenge(cause, emailTicketToken);
        if (pending) { setEmailChallenge(pending); setPassword(''); setPasswordConfirmation(''); setFlow('signIn'); return; }
        setError('Пароль изменён. Войдите с новым паролем.');
      }
    } catch (cause) {
      console.error('Password recovery completion failed');
      setError(recoveryError(cause));
    } finally {
      loginLock.current = false;
      setSubmitting(false);
    }
  };

  const sendPhoneSignupCode = async () => {
    if (loginLock.current || isOffline || (phoneRetryAt && phoneRetryAt > Date.now())) return;
    loginLock.current = true; setSubmitting(true); setError(undefined);
    try {
      if (Platform.OS === 'android') await startSmsRetriever().catch(() => undefined);
      if (!phoneSignupToken.current) phoneSignupToken.current = Array.from(getRandomBytes(32), b => b.toString(16).padStart(2, '0')).join('');
      const result = await requestPhoneRegistration({ phone: canonicalPhone(normalizedIdentifier), token: phoneSignupToken.current,
        platform: Platform.OS === 'android' ? 'android' : 'ios', challengeId: phoneSignupId });
      setPhoneSignupId(result.challengeId); setPhoneRetryAt(result.retryAt); setClock(Date.now()); setRecoveryCode(''); setPhoneSignupStep('code');
      if (result.deliveryFailed) setError('Не удалось отправить SMS. Повторите запрос позже.');
    } catch (cause) { setError(phoneSignupError(cause)); }
    finally { loginLock.current = false; setSubmitting(false); }
  };

  const submit = async () => {
    if (!canSubmit || submitting || loginLock.current) {
      return;
    }

    if (isOffline && !preview) {
      setError(
        'Нет интернета. Подключитесь к сети, чтобы войти или зарегистрироваться.',
      );
      return;
    }

    Keyboard.dismiss();
    setError(undefined);

    if (preview) {
      onPreviewComplete?.();
      return;
    }

    if (recoveryMode) {
      if (recoveryStep === 'identifier') await requestRecoveryCode();
      else await finishRecovery();
      return;
    }

    if (phoneSignup) {
      if (phoneSignupStep === 'identifier') { await sendPhoneSignupCode(); return; }
      if (!phoneSignupId) return;
      loginLock.current = true; setSubmitting(true);
      try {
        if (phoneSignupStep === 'code') {
          await confirmPhoneRegistration({ challengeId: phoneSignupId, token: phoneSignupToken.current, code: recoveryCode });
          setPhoneSignupStep('password'); setRecoveryCode('');
        } else {
          await rememberRegistrationConsent(canonicalPhone(normalizedIdentifier), 'phone');
          await signIn('phone-password', { flow: 'signUp', challengeId: phoneSignupId, token: phoneSignupToken.current, password });
          setPassword(''); setPasswordConfirmation(''); phoneSignupToken.current = '';
          onAuthenticated?.();
        }
      } catch (cause) {
        if (phoneSignupStep === 'password') await clearRegistrationConsent();
        setError(phoneSignupError(cause));
      }
      finally { loginLock.current = false; setSubmitting(false); }
      return;
    }

    const data = new FormData();
    if (channel === 'phone') {
      data.append('phone', canonicalPhone(normalizedIdentifier));
    } else {
      data.append('email', normalizedIdentifier.toLowerCase());
      data.append('flow', flow);
    }
    data.append('password', password);
    const emailTicketToken = Array.from(getRandomBytes(32), byte => byte.toString(16).padStart(2, '0')).join('');
    data.append('emailTicketToken', emailTicketToken);
    loginLock.current = true;
    setSubmitting(true);

    try {
      if (flow === 'signUp' && channel === 'email' && personalDataConsent && agreementAccepted) {
        await rememberRegistrationConsent(normalizedIdentifier);
      }
      await signIn(channel === 'phone' ? 'phone-password' : 'password', data);
      onAuthenticated?.();
    } catch (cause) {
      const pending = parseLoginEmailChallenge(cause, emailTicketToken);
      if (pending) {
        setEmailChallenge(pending);
        setPassword('');
        setPasswordConfirmation('');
        setFlow('signIn');
        return;
      }
      if (flow === 'signUp') await clearRegistrationConsent();
      const issue = classifyServiceIssue(cause, isOffline);
      setError(
        issue.kind === 'update-required' ? 'CLIENT_UPDATE_REQUIRED' : issue.retryable
          ? issue.message
          : flow === 'signIn'
            ? 'Не удалось войти. Проверьте данные и пароль.'
            : 'Не удалось создать аккаунт. Возможно, email уже используется.',
      );
    } finally {
      loginLock.current = false;
      setSubmitting(false);
    }
  };

  const enterDevMode = () => {
    Keyboard.dismiss();
    setError(undefined);

    if (onDevLogin) {
      onDevLogin();
      return;
    }

    if (preview) {
      onPreviewComplete?.();
      return;
    }

    onAuthenticated?.();
  };

  return (
    <View style={styles.root}>
      {emailChallenge && <LoginEmailVerification initial={emailChallenge}
        onClose={() => { setEmailChallenge(undefined); setPassword(''); setPasswordConfirmation(''); }}
        onDone={() => { setEmailChallenge(undefined); onAuthenticated?.(); }} />}
      {preview ? null : <StatusBar hidden />}
      <LegalDocumentsModal selection={legalDocument} onClose={() => setLegalDocument(null)} />
      <View
        style={[
          styles.screenViewport,
          {
            width: designWidth * canvasScale,
            height: designHeight * canvasScale,
            borderRadius: Platform.OS === 'android' ? 0 : 40 * canvasScale,
          },
        ]}
      >
        <View
          style={[
            styles.canvas,
            {
              transform: [{ scale: canvasScale }],
              transformOrigin: 'top left',
            },
          ]}
        >
          <View style={styles.canvas}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.canvas}
            >
              {/* Keep keyboard dismissal behind the form so it cannot claim scroll gestures. */}
              <Pressable
                accessible={false}
                onPress={Keyboard.dismiss}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="box-none" style={styles.content}>
                {devLoginEnabled ? (
                  <View style={styles.devLoginSlot}>
                    <Pressable
                      accessibilityLabel="Войти в локальном режиме разработчика"
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={enterDevMode}
                      style={styles.devLoginButton}
                    >
                      <Text style={styles.devLoginLabel}>DEV вход</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.brandBlock}>
                  <BrandLogo width={184} style={{ marginTop: 2 }} />
                  <Text style={styles.brandSubtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {recoveryMode ? 'Восстановление доступа' : 'Сфера женского здоровья'}
                  </Text>
                </View>

                <SegmentedSwitcher
                  accessibilityLabel={
                    recoveryMode ? 'Способ восстановления' : flow === 'signUp' ? 'Способ регистрации' : 'Способ входа'
                  }
                  options={authChannelOptions}
                  value={channel}
                  onChange={changeChannel}
                  style={styles.channelPicker}
                />

                <View style={[styles.fieldGroup, styles.identifierField]}>
                  <Text style={styles.fieldLabel}>
                    {channel === 'email' ? 'Почта' : 'Телефон'}
                  </Text>
                  <TextInput
                    testID="e2e-auth-identifier"
                    editable={!submitting && (!phoneSignup || phoneSignupStep === 'identifier')}
                    autoCapitalize="none"
                    autoComplete={channel === 'email' ? 'email' : 'tel'}
                    autoCorrect={false}
                    keyboardType={
                      channel === 'email' ? 'email-address' : 'phone-pad'
                    }
                    onChangeText={(value) =>
                      setIdentifier(
                        channel === 'phone' ? normalizePhone(value) : value,
                      )
                    }
                    placeholder={
                      channel === 'email' ? 'Email' : '+7 999 000-00-00'
                    }
                    placeholderTextColor={colors.text.secondary}
                    style={styles.input}
                    value={identifier}
                  />
                </View>

                {(phoneSignup ? phoneSignupStep !== 'identifier' : !recoveryMode || recoveryStep === 'code') ? (
                  <View style={[styles.fieldGroup, styles.passwordField]}>
                    <Text style={styles.fieldLabel}>
                      {phoneSignupCode ? 'Код из SMS' : recoveryMode
                        ? channel === 'phone'
                          ? 'Код из SMS'
                          : 'Код из письма'
                        : 'Пароль'}
                    </Text>
                    <TextInput
                      testID="e2e-auth-password"
                      ref={phoneCodeInputRef}
                      autoCapitalize="none"
                      {...(phoneSignupCode ? otpAutofillProps(Platform.OS) : recoveryMode
                        ? channel === 'phone'
                          ? otpAutofillProps(Platform.OS)
                          : {
                              autoComplete: 'one-time-code' as const,
                              textContentType: 'oneTimeCode' as const,
                            }
                        : {
                            autoComplete: e2eMode
                              ? ('off' as const)
                              : flow === 'signIn'
                                ? ('current-password' as const)
                                : ('new-password' as const),
                            textContentType: undefined,
                          })}
                      keyboardType={recoveryMode || phoneSignupCode ? 'number-pad' : 'default'}
                      maxLength={recoveryMode || phoneSignupCode ? 6 : undefined}
                      onChangeText={(value) =>
                        recoveryMode || phoneSignupCode
                          ? setRecoveryCode(
                              value.replace(/\D/g, '').slice(0, 6),
                            )
                          : setPassword(value)
                      }
                      placeholder={recoveryMode || phoneSignupCode ? '000000' : 'Введите пароль'}
                      placeholderTextColor={colors.text.secondary}
                      secureTextEntry={!recoveryMode && !phoneSignupCode && !e2eMode}
                      style={styles.input}
                      value={recoveryMode || phoneSignupCode ? recoveryCode : password}
                    />
                  </View>
                ) : (
                  <Text style={styles.recoveryHint}>
                    {phoneSignup ? 'Подтвердите номер по SMS, затем придумайте пароль. Почта не обязательна.' : 'Мы отправим одноразовый код, если аккаунт существует.'}
                  </Text>
                )}

                {recoveryMode && recoveryStep === 'code' ? (
                  <>
                    <View style={[styles.fieldGroup, styles.newPasswordField]}>
                      <Text style={styles.fieldLabel}>Новый пароль</Text>
                      <TextInput
                        testID="e2e-auth-new-password"
                        autoCapitalize="none"
                        autoComplete="new-password"
                        onChangeText={setPassword}
                        placeholder="Не менее 8 символов"
                        placeholderTextColor={colors.text.secondary}
                        secureTextEntry={!e2eMode}
                        style={styles.input}
                        value={password}
                      />
                    </View>
                    <View
                      style={[styles.fieldGroup, styles.confirmPasswordField]}
                    >
                      <Text style={styles.fieldLabel}>Повторите пароль</Text>
                      <TextInput
                        testID="e2e-auth-confirm-password"
                        autoCapitalize="none"
                        autoComplete="new-password"
                        onChangeText={setPasswordConfirmation}
                        placeholder="Повторите новый пароль"
                        placeholderTextColor={colors.text.secondary}
                        secureTextEntry={!e2eMode}
                        style={styles.input}
                        value={passwordConfirmation}
                      />
                    </View>
                  </>
                ) : null}

                {phoneSignup && phoneSignupStep === 'password' ? (
                  <View style={[styles.fieldGroup, styles.newPasswordField]}>
                    <Text style={styles.fieldLabel}>Повторите пароль</Text>
                    <TextInput testID="e2e-auth-confirm-password" autoCapitalize="none" autoComplete="new-password"
                      secureTextEntry={!e2eMode} value={passwordConfirmation} onChangeText={setPasswordConfirmation}
                      placeholder="Не менее 8 символов" placeholderTextColor={colors.text.secondary} style={styles.input} />
                  </View>
                ) : null}
                {phoneSignup && phoneSignupStep !== 'identifier' ? (
                  <View style={[styles.phoneSignupActions, phoneSignupStep === 'password' && { top: 552 }]}>
                    {phoneSignupCode ? <Pressable accessibilityRole="button" disabled={submitting || Boolean(phoneRetryAt && phoneRetryAt > clock)}
                      onPress={() => void sendPhoneSignupCode()}>
                      <Text style={styles.smsHintText}>{phoneRetryAt && phoneRetryAt > clock ? `Повторно через ${Math.ceil((phoneRetryAt - clock) / 1000)} сек.` : 'Запросить код снова'}</Text>
                    </Pressable> : null}
                    <Pressable accessibilityRole="button" disabled={submitting} onPress={() => { resetPhoneSignup(); setError(undefined); }}>
                      <Text style={styles.smsHintText}>Изменить номер / начать заново</Text>
                    </Pressable>
                  </View>
                ) : null}

                {recoveryMode && recoveryStep === 'code' ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={
                      submitting ||
                      Boolean(phoneRetryAt && phoneRetryAt > clock)
                    }
                    onPress={() => void requestRecoveryCode()}
                    style={styles.recoveryResend}
                  >
                    <Text style={styles.smsHintText}>
                      {phoneRetryAt && phoneRetryAt > clock
                        ? `Повторно через ${Math.ceil((phoneRetryAt - clock) / 1000)} сек.`
                        : recoveryExpiresAt && recoveryExpiresAt <= clock
                          ? 'Код истёк. Запросить новый'
                          : 'Запросить код снова'}
                    </Text>
                  </Pressable>
                ) : null}

                {!recoveryMode && flow === 'signIn' && Platform.OS !== 'web' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={beginRecovery}
                    style={styles.forgotPassword}
                  >
                    <Text style={styles.smsHintText}>Забыли пароль?</Text>
                  </Pressable>
                ) : null}

                {flow === 'signUp' && !recoveryMode && (!phoneSignup || phoneSignupStep === 'identifier') ? (
                  <View style={styles.consents}>
                  <ScrollView
                    style={styles.consentScroll}
                    contentContainerStyle={styles.consentContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    nestedScrollEnabled
                  >
                    <View style={styles.consentRow}>
                      <Checkbox
                        checked={personalDataConsent}
                        label="Согласие на обработку данных, облачную синхронизацию и ИИ Яндекс AI Studio"
                        testID="e2e-auth-consent-personal"
                        onPress={() =>
                          setPersonalDataConsent((current) => !current)
                        }
                      />
                      <Text
                        style={[styles.consentText, styles.personalConsentText]}
                      >
                        Согласен(на) на обработку и облачную синхронизацию
                        данных, их передачу Яндекс AI Studio для ответов
                        и рекомендаций. Подробнее — в{' '}
                        <LegalLink onPress={() => setLegalDocument('privacy')}>
                          Политике конфиденциальности
                        </LegalLink>
                        .
                      </Text>
                    </View>

                    <View style={styles.consentRow}>
                      <Checkbox
                        checked={agreementAccepted}
                        label="Принятие пользовательского соглашения"
                        testID="e2e-auth-consent-agreement"
                        onPress={() =>
                          setAgreementAccepted((current) => !current)
                        }
                      />
                      <Text style={styles.consentText}>
                        Я принимаю условия{' '}
                        <LegalLink onPress={() => setLegalDocument('agreement')}>
                          Пользовательского соглашения
                        </LegalLink>
                        .
                      </Text>
                    </View>
                  </ScrollView>
                  </View>
                ) : null}

                {visibleError === 'CLIENT_UPDATE_REQUIRED' ? <UpdateRequiredNotice /> : visibleError ? (
                  <Text
                    accessibilityRole="alert"
                    style={[
                      styles.errorText,
                      flow === 'signIn' && styles.errorTextSignIn,
                      recoveryMode && styles.errorTextRecovery,
                    ]}
                  >
                    {visibleError}
                  </Text>
                ) : null}

                <View key={`${flow}:${recoveryMode}`} collapsable={false} style={styles.authActions}>
                <Pressable
                  cssInterop={false}
                  testID="e2e-auth-submit"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: submitDisabled }}
                  disabled={submitDisabled}
                  onPress={() => void submit()}
                  style={[
                    styles.primaryButton,
                    submitDisabled && styles.primaryButtonDisabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.primaryButtonLabel,
                        submitDisabled && styles.primaryButtonLabelDisabled,
                      ]}
                    >
                      {phoneSignup ? phoneSignupStep === 'identifier' ? 'Получить код' : phoneSignupStep === 'code' ? 'Подтвердить номер' : 'Создать аккаунт' : recoveryMode
                        ? recoveryStep === 'identifier'
                          ? 'Получить код'
                          : 'Сохранить пароль'
                        : flow === 'signUp'
                          ? 'Далее'
                          : 'Войти'}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  cssInterop={false}
                  testID="e2e-auth-switch-flow"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={recoveryMode ? cancelRecovery : changeFlow}
                  style={styles.flowSwitcher}
                >
                  <Text style={styles.flowSwitcherText}>
                    {recoveryMode
                      ? 'Вернуться ко входу'
                      : flow === 'signUp'
                        ? 'Уже зарегистрированы? '
                        : 'Нет аккаунта? '}
                    {!recoveryMode ? (
                      <Text style={styles.flowSwitcherAction}>
                        {flow === 'signUp' ? 'Войти' : 'Зарегистрироваться'}
                      </Text>
                    ) : null}
                  </Text>
                </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.canvas,
  },
  screenViewport: {
    overflow: 'hidden',
    backgroundColor: colors.surface.raised,
  },
  canvas: {
    width: designWidth,
    height: designHeight,
    backgroundColor: colors.surface.raised,
  },
  content: {
    position: 'relative',
    width: designWidth,
    height: designHeight,
  },
  brandBlock: {
    position: 'absolute',
    left: 79,
    top: 88,
    width: 244,
    height: 72,
    alignItems: 'center',
  },
  devLoginSlot: {
    position: 'absolute',
    zIndex: 2,
    left: 26,
    top: 697,
    width: 349,
    height: 34,
  },
  devLoginButton: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(211, 20, 113, 0.28)',
    borderRadius: 12,
    backgroundColor: 'rgba(211, 20, 113, 0.08)',
  },
  devLoginLabel: {
    color: '#EA4087',
    ...fontStyle('SFProDisplay-Medium'),
    fontSize: 13,
    lineHeight: 16,
  },
  brand: {
    width: 244,
    color: '#EA4087',
    ...fontStyle('Comfortaa-Regular'),
    fontSize: 34,
    lineHeight: 46,
    textAlign: 'center',
  },
  brandSubtitle: {
    position: 'absolute',
    left: -53,
    top: 48,
    width: 350,
    color: '#EA4087',
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 20.7,
    lineHeight: 24,
    textAlign: 'center',
  },
  channelPicker: {
    position: 'absolute',
    left: 26,
    top: 200,
    width: 349,
  },
  fieldGroup: {
    position: 'absolute',
    left: 26,
    width: 349,
    height: 79,
    gap: 7,
  },
  identifierField: {
    top: 266,
  },
  passwordField: {
    top: 360,
  },
  newPasswordField: {
    top: 454,
  },
  confirmPasswordField: {
    top: 548,
  },
  fieldLabel: {
    color: colors.text.primary,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 14,
    lineHeight: 18,
  },
  input: {
    width: 349,
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 15,
    backgroundColor: colors.surface.divider,
    color: colors.text.primary,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 14,
    lineHeight: 18,
  },
  consents: {
    position: 'absolute',
    left: 26,
    top: 463,
    width: 349,
    height: 200,
  },
  consentContent: {
    gap: 18,
    paddingVertical: 4,
  },
  consentScroll: {
    flex: 1,
  },
  consentRow: {
    width: 349,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkboxHitArea: {
    width: 22,
    height: 22,
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.surface.divider,
    borderRadius: 6,
    backgroundColor: colors.surface.raised,
  },
  checkboxMark: {
    color: '#FFFFFF',
    ...fontStyle('SFProDisplay-Semibold'),
    fontSize: 14,
    lineHeight: 16,
  },
  consentText: {
    width: 315,
    color: colors.text.primary,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 13.5,
    lineHeight: 16,
  },
  personalConsentText: {
    fontSize: 12.55,
    letterSpacing: 0.35,
    marginTop: -1,
  },
  legalLink: {
    color: '#EA4087',
    textDecorationLine: 'underline',
  },
  errorText: {
    position: 'absolute',
    left: 26,
    top: 674,
    width: 349,
    color: colors.state.error,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 13,
    lineHeight: 17,
  },
  errorTextSignIn: {
    top: 480,
  },
  errorTextRecovery: {
    top: 665,
  },
  recoveryHint: {
    position: 'absolute',
    left: 26,
    top: 365,
    width: 349,
    color: colors.text.secondary,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 13,
    lineHeight: 18,
  },
  forgotPassword: {
    position: 'absolute',
    right: 27,
    top: 446,
  },
  recoveryResend: {
    position: 'absolute',
    left: 26,
    top: 640,
    width: 349,
  },
  phoneSignupActions: { position: 'absolute', left: 26, top: 454, width: 349, gap: 20 },
  smsHint: {
    position: 'absolute',
    left: 26,
    top: 442,
    width: 349,
  },
  smsHintText: {
    color: colors.text.secondary,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 12,
    lineHeight: 16,
  },
  authActions: {
    position: 'absolute',
    left: 26,
    right: 26,
    bottom: 24,
    gap: 8,
  },
  primaryButton: {
    width: '100%',
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#EA4087',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.surface.divider,
  },
  primaryButtonPressed: {
    opacity: 0.78,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    ...fontStyle('SFProDisplay-Medium'),
    fontSize: 15,
    lineHeight: 18,
  },
  primaryButtonLabelDisabled: {
    color: '#A8A3A8',
  },
  flowSwitcher: {
    width: '100%',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowSwitcherText: {
    color: colors.text.primary,
    ...fontStyle('SFProDisplay-Regular'),
    fontSize: 16,
    lineHeight: 21,
    textAlign: 'center',
    flexShrink: 1,
  },
  flowSwitcherAction: {
    color: '#EA4087',
  },
  controlPressed: {
    opacity: 0.7,
  },
});

const styles = createStyles(defaultThemeColors);
