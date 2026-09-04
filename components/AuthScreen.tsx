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
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';

import { SegmentedSwitcher } from '../design-system/components';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { useConnectivity } from '../lib/connectivity';
import { otpAutofillProps } from '../lib/otp-autofill';
import { classifyServiceIssue } from '../lib/service-errors';
import { listenForSmsOtp, startSmsRetriever } from '../lib/sms-otp-retriever';

type AuthChannel = 'email' | 'phone';
type AuthFlow = 'signIn' | 'signUp';

const authChannelOptions: Array<{ value: AuthChannel; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Телефон' },
];

const privacyPolicyUrl = 'https://brainwaves.engineering/docs#document-2';
const userAgreementUrl = 'https://brainwaves.engineering/docs#document-3';
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
              outputRange: ['#FFFFFF', '#EA4087'],
            }),
            borderColor: activation.interpolate({
              inputRange: [0, 1],
              outputRange: ['#D8D4D8', '#EA4087'],
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

function LegalLink({ children, url }: { children: string; url: string }) {
  return (
    <Text
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
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
  const { signIn } = useAuthActions();
  const requestPasswordRecovery = useAction(api.passwordRecovery.request);
  const completePasswordRecovery = useAction(api.passwordRecovery.complete);
  const { isOffline } = useConnectivity();
  const window = useWindowDimensions();
  const [flow, setFlow] = useState<AuthFlow>('signUp');
  const [channel, setChannel] = useState<AuthChannel>('email');
  const [identifier, setIdentifier] = useState(e2eMode ? (e2eEmail ?? '') : '');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [personalDataConsent, setPersonalDataConsent] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
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
  const phoneCodeInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!phoneRetryAt || phoneRetryAt <= Date.now()) return undefined;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phoneRetryAt]);

  useEffect(() => {
    if (!recoveryMode || recoveryStep !== 'code' || submitting)
      return undefined;
    const frame = requestAnimationFrame(() =>
      phoneCodeInputRef.current?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [recoveryMode, recoveryStep, submitting]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = listenForSmsOtp((code) => {
      if (recoveryMode && channel === 'phone') setRecoveryCode(code);
    });
    return () => subscription?.remove();
  }, [channel, recoveryMode]);

  const normalizedIdentifier = identifier.trim();
  const validIdentifier =
    channel === 'email'
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)
      : normalizedIdentifier.replace(/\D/g, '').length >= 10;
  const validPassword = password.length >= 8;
  const validRecoveryCode = /^\d{6}$/.test(recoveryCode);
  const legalAccepted =
    flow === 'signIn' || (personalDataConsent && agreementAccepted);
  const canSubmit = recoveryMode
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
    setChannel(nextChannel);
    setIdentifier('');
    setError(undefined);
    setRecoveryCode('');
    setRecoveryStep('identifier');
    setRecoveryChallengeId(undefined);
    setPhoneRetryAt(undefined);
  };

  const changeFlow = () => {
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
      setSubmitting(false);
    }
  };

  const finishRecovery = async () => {
    if (!recoveryChallengeId) return;
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
      try {
        await signIn(channel === 'phone' ? 'phone-password' : 'password', data);
        onAuthenticated?.();
      } catch {
        cancelRecovery();
        setError('Пароль изменён. Войдите с новым паролем.');
      }
    } catch (cause) {
      console.error('Password recovery completion failed');
      setError(recoveryError(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (!canSubmit || submitting) {
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

    const data = new FormData();
    if (channel === 'phone') {
      data.append('phone', canonicalPhone(normalizedIdentifier));
    } else {
      data.append('email', normalizedIdentifier.toLowerCase());
      data.append('flow', flow);
    }
    data.append('password', password);
    setSubmitting(true);

    try {
      await signIn(channel === 'phone' ? 'phone-password' : 'password', data);
      onAuthenticated?.();
    } catch (cause) {
      console.error('Authentication failed', cause);
      const issue = classifyServiceIssue(cause, isOffline);
      setError(
        issue.retryable
          ? issue.message
          : flow === 'signIn'
            ? 'Не удалось войти. Проверьте данные и пароль.'
            : 'Не удалось создать аккаунт. Возможно, email уже используется.',
      );
    } finally {
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
      {preview ? null : <StatusBar hidden />}
      <View
        style={[
          styles.screenViewport,
          {
            width: designWidth * canvasScale,
            height: designHeight * canvasScale,
            borderRadius: 40 * canvasScale,
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
          <TouchableWithoutFeedback
            accessible={false}
            onPress={Keyboard.dismiss}
            touchSoundDisabled
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.canvas}
            >
              <View style={styles.content}>
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
                  <Text style={styles.brand}>сфера.</Text>
                  <Text style={styles.brandSubtitle}>
                    Сфера женского здоровья
                  </Text>
                </View>

                {flow === 'signIn' || recoveryMode ? (
                  <SegmentedSwitcher
                    accessibilityLabel={
                      recoveryMode ? 'Способ восстановления' : 'Способ входа'
                    }
                    options={authChannelOptions}
                    value={channel}
                    onChange={changeChannel}
                    style={styles.channelPicker}
                    labelStyle={styles.channelLabel}
                  />
                ) : (
                  <Text style={styles.registrationHint}>
                    Регистрация по электронной почте
                  </Text>
                )}

                <View style={[styles.fieldGroup, styles.identifierField]}>
                  <Text style={styles.fieldLabel}>
                    {channel === 'email' ? 'Почта' : 'Телефон'}
                  </Text>
                  <TextInput
                    testID="e2e-auth-identifier"
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
                    placeholderTextColor="#8F8A90"
                    style={styles.input}
                    value={identifier}
                  />
                </View>

                {!recoveryMode || recoveryStep === 'code' ? (
                  <View style={[styles.fieldGroup, styles.passwordField]}>
                    <Text style={styles.fieldLabel}>
                      {recoveryMode
                        ? channel === 'phone'
                          ? 'Код из SMS'
                          : 'Код из письма'
                        : 'Пароль'}
                    </Text>
                    <TextInput
                      testID="e2e-auth-password"
                      ref={phoneCodeInputRef}
                      autoCapitalize="none"
                      {...(recoveryMode
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
                      keyboardType={recoveryMode ? 'number-pad' : 'default'}
                      maxLength={recoveryMode ? 6 : undefined}
                      onChangeText={(value) =>
                        recoveryMode
                          ? setRecoveryCode(
                              value.replace(/\D/g, '').slice(0, 6),
                            )
                          : setPassword(value)
                      }
                      placeholder={recoveryMode ? '000000' : 'Введите пароль'}
                      placeholderTextColor="#8F8A90"
                      secureTextEntry={!recoveryMode && !e2eMode}
                      style={styles.input}
                      value={recoveryMode ? recoveryCode : password}
                    />
                  </View>
                ) : (
                  <Text style={styles.recoveryHint}>
                    Мы отправим одноразовый код, если аккаунт существует.
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
                        placeholderTextColor="#8F8A90"
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
                        placeholderTextColor="#8F8A90"
                        secureTextEntry={!e2eMode}
                        style={styles.input}
                        value={passwordConfirmation}
                      />
                    </View>
                  </>
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

                {flow === 'signUp' && !recoveryMode ? (
                  <ScrollView
                    style={styles.consents}
                    contentContainerStyle={styles.consentContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.consentRow}>
                      <Checkbox
                        checked={personalDataConsent}
                        label="Согласие на обработку персональных данных"
                        testID="e2e-auth-consent-personal"
                        onPress={() =>
                          setPersonalDataConsent((current) => !current)
                        }
                      />
                      <Text
                        style={[styles.consentText, styles.personalConsentText]}
                      >
                        Я даю согласие ООО «БРЭЙНВЕЙВС ИНЖИНИРИНГ» на обработку моих
                        персональных данных в целях обработки обращения, связи
                        со мной и подготовки ответа. Я ознакомлен(а) с{' '}
                        <LegalLink url={privacyPolicyUrl}>
                          Политикой обработки персональных данных
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
                        <LegalLink url={userAgreementUrl}>
                          Пользовательского соглашения
                        </LegalLink>
                        .
                      </Text>
                    </View>
                  </ScrollView>
                ) : null}

                {visibleError ? (
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

                <Pressable
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
                      {recoveryMode
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
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3F3',
  },
  screenViewport: {
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  canvas: {
    width: designWidth,
    height: designHeight,
    backgroundColor: '#FFFFFF',
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
    fontFamily: 'SFProDisplay-Medium',
    fontSize: 13,
    lineHeight: 16,
  },
  brand: {
    width: 244,
    color: '#EA4087',
    fontFamily: 'YaroRg',
    fontSize: 34,
    lineHeight: 46,
    textAlign: 'center',
  },
  brandSubtitle: {
    position: 'absolute',
    left: 0,
    top: 48,
    width: 244,
    color: '#EA4087',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 20.7,
    lineHeight: 24,
    textAlign: 'center',
  },
  channelPicker: {
    position: 'absolute',
    left: 26,
    top: 200,
    width: 349,
    flexDirection: 'row',
    height: 46,
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#F0EEF0',
  },
  registrationHint: {
    position: 'absolute',
    left: 26,
    top: 214,
    width: 349,
    color: '#6F6A70',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  channelOption: {
    zIndex: 1,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  channelSlider: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 170.5,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  channelLabel: {
    color: '#8F8A90',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 14,
    lineHeight: 18,
  },
  channelLabelSelected: {
    color: '#242124',
    fontFamily: 'SFProDisplay-Medium',
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
    color: '#242124',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 14,
    lineHeight: 18,
  },
  input: {
    width: 349,
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 15,
    backgroundColor: '#F0EEF0',
    color: '#242124',
    fontFamily: 'SFProDisplay-Regular',
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
    borderColor: '#D8D4D8',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontFamily: 'SFProDisplay-Semibold',
    fontSize: 14,
    lineHeight: 16,
  },
  consentText: {
    width: 315,
    color: '#242124',
    fontFamily: 'SFProDisplay-Regular',
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
    color: '#D93838',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 13,
    lineHeight: 17,
  },
  errorTextSignIn: {
    top: 446,
  },
  errorTextRecovery: {
    top: 665,
  },
  recoveryHint: {
    position: 'absolute',
    left: 26,
    top: 365,
    width: 349,
    color: '#6F6A70',
    fontFamily: 'SFProDisplay-Regular',
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
  smsHint: {
    position: 'absolute',
    left: 26,
    top: 442,
    width: 349,
  },
  smsHintText: {
    color: '#6F6A70',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  primaryButton: {
    position: 'absolute',
    left: 26,
    top: 740,
    width: 349,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#EA4087',
  },
  primaryButtonDisabled: {
    backgroundColor: '#DEDADD',
  },
  primaryButtonPressed: {
    opacity: 0.78,
  },
  primaryButtonLabel: {
    color: '#FFFFFF',
    fontFamily: 'SFProDisplay-Medium',
    fontSize: 15,
    lineHeight: 18,
  },
  primaryButtonLabelDisabled: {
    color: '#A8A3A8',
  },
  flowSwitcher: {
    position: 'absolute',
    left: 26,
    top: 800,
    width: 349,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowSwitcherText: {
    color: '#242124',
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 18,
    lineHeight: 22,
  },
  flowSwitcherAction: {
    color: '#EA4087',
  },
  controlPressed: {
    opacity: 0.7,
  },
});
