import { useAuthActions } from '@convex-dev/auth/react';
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
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from 'react-native';

import { SegmentedSwitcher } from '../design-system/components';

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

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, '').slice(0, 16);
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
  const window = useWindowDimensions();
  const [flow, setFlow] = useState<AuthFlow>('signUp');
  const [channel, setChannel] = useState<AuthChannel>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [personalDataConsent, setPersonalDataConsent] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const normalizedIdentifier = identifier.trim();
  const validIdentifier =
    channel === 'email'
      ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedIdentifier)
      : normalizedIdentifier.replace(/\D/g, '').length >= 10;
  const validPassword = password.length >= 8;
  const canSubmit =
    validIdentifier &&
    validPassword &&
    (flow === 'signIn' || (personalDataConsent && agreementAccepted));
  const canvasScale = embedded
    ? 1
    : Math.min(window.width / designWidth, window.height / designHeight);

  const changeChannel = (nextChannel: AuthChannel) => {
    setChannel(nextChannel);
    setIdentifier('');
    setError(undefined);
  };

  const changeFlow = () => {
    setFlow((current) => (current === 'signUp' ? 'signIn' : 'signUp'));
    setError(undefined);
  };

  const submit = async () => {
    if (!canSubmit || submitting) {
      return;
    }

    Keyboard.dismiss();
    setError(undefined);

    if (preview) {
      onPreviewComplete?.();
      return;
    }

    if (channel === 'phone') {
      setError(
        'Вход и регистрация по телефону появятся после подключения SMS-подтверждения.',
      );
      return;
    }

    const data = new FormData();
    data.append('email', normalizedIdentifier.toLowerCase());
    data.append('password', password);
    data.append('flow', flow);
    setSubmitting(true);

    try {
      await signIn('password', data);
      onAuthenticated?.();
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

                <SegmentedSwitcher
                  accessibilityLabel="Способ входа"
                  options={authChannelOptions}
                  value={channel}
                  onChange={changeChannel}
                  style={styles.channelPicker}
                  labelStyle={styles.channelLabel}
                />

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

                <View style={[styles.fieldGroup, styles.passwordField]}>
                  <Text style={styles.fieldLabel}>Пароль</Text>
                  <TextInput
                    testID="e2e-auth-password"
                    autoCapitalize="none"
                    autoComplete={
                      e2eMode
                        ? 'off'
                        : flow === 'signIn'
                          ? 'current-password'
                          : 'new-password'
                    }
                    textContentType={e2eMode ? 'oneTimeCode' : undefined}
                    onChangeText={setPassword}
                    placeholder="Введите пароль"
                    placeholderTextColor="#8F8A90"
                    secureTextEntry={!e2eMode}
                    style={styles.input}
                    value={password}
                  />
                </View>

                {flow === 'signUp' ? (
                  <View style={styles.consents}>
                    <View style={[styles.consentRow, styles.personalConsent]}>
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
                        Я даю согласие ООО «Имя компании» на обработку моих
                        персональных данных в целях обработки обращения, связи
                        со мной и подготовки ответа. Я ознакомлен(а) с{' '}
                        <LegalLink url={privacyPolicyUrl}>
                          Политикой обработки персональных данных
                        </LegalLink>
                        .
                      </Text>
                    </View>

                    <View style={[styles.consentRow, styles.agreementConsent]}>
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
                  </View>
                ) : null}

                {error ? (
                  <Text
                    accessibilityRole="alert"
                    style={[
                      styles.errorText,
                      flow === 'signIn' && styles.errorTextSignIn,
                    ]}
                  >
                    {error}
                  </Text>
                ) : null}

                <Pressable
                  testID="e2e-auth-submit"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit || submitting }}
                  disabled={!canSubmit || submitting}
                  onPress={() => void submit()}
                  style={[
                    styles.primaryButton,
                    !canSubmit && styles.primaryButtonDisabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text
                      style={[
                        styles.primaryButtonLabel,
                        !canSubmit && styles.primaryButtonLabelDisabled,
                      ]}
                    >
                      {flow === 'signUp' ? 'Далее' : 'Войти'}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  testID="e2e-auth-switch-flow"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={changeFlow}
                  style={styles.flowSwitcher}
                >
                  <Text style={styles.flowSwitcherText}>
                    {flow === 'signUp'
                      ? 'Уже зарегистрированы? '
                      : 'Нет аккаунта? '}
                    <Text style={styles.flowSwitcherAction}>
                      {flow === 'signUp' ? 'Войти' : 'Зарегистрироваться'}
                    </Text>
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
    height: 226,
  },
  consentRow: {
    position: 'absolute',
    left: 0,
    width: 349,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  personalConsent: {
    top: 0,
    height: 154,
  },
  agreementConsent: {
    top: 95,
    height: 52,
    alignItems: 'center',
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
