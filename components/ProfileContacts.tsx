import { useAction } from 'convex/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { ProfileSettingsGroup } from '../design-system/profile';
import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { contactMessage } from './LoginEmailVerification';
import { otpAutofillProps } from '../lib/otp-autofill';
import { listenForSmsOtp, startSmsRetriever } from '../lib/sms-otp-retriever';

export function emailChangeError(error: unknown) {
  const message = String(error);
  if (message.includes('INVALID_PASSWORD')) return 'Неверный текущий пароль.';
  if (message.includes('INVALID_EMAIL'))
    return 'Проверьте адрес электронной почты.';
  if (message.includes('SAME_EMAIL'))
    return 'Введите новый адрес электронной почты.';
  if (message.includes('EMAIL_UNAVAILABLE'))
    return 'Этот адрес недоступен. Укажите другой.';
  if (message.includes('RATE_LIMITED'))
    return 'Повторная отправка пока недоступна. Попробуйте позже.';
  if (message.includes('INVALID_CODE'))
    return 'Код неверный или истёк. Запросите новый код.';
  if (message.includes('REAUTHENTICATE'))
    return 'Начните смену почты заново и подтвердите пароль.';
  return 'Не удалось выполнить запрос. Проверьте подключение и попробуйте позже.';
}

function EmailChangeForm({
  email,
  onDone,
}: {
  email?: string;
  onDone: () => void;
}) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useAppTheme();
  const request = useAction(api.emailChange.request);
  const resend = useAction(api.emailChange.resend);
  const confirm = useAction(api.emailChange.confirm);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{
    challengeId: Id<'emailChangeChallenges'>;
    expiresAt: number;
    retryAt: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const codeInput = useRef<TextInput>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (challenge) codeInput.current?.focus();
  }, [challenge]);
  const run = async (operation: 'request' | 'resend' | 'confirm') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (operation === 'request') {
        const result = await request({
          newEmail: newEmail.trim().toLowerCase(),
          currentPassword: password,
        });
        setPassword('');
        setCode('');
        setChallenge(result);
        setNow(Date.now());
      } else if (operation === 'resend' && challenge) {
        setCode('');
        setChallenge(await resend({ challengeId: challenge.challengeId }));
        setNow(Date.now());
      } else if (challenge) {
        await confirm({ challengeId: challenge.challengeId, code });
        setCode('');
        onDone();
      }
    } catch (cause) {
      setError(emailChangeError(cause));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  const expired = challenge && now >= challenge.expiresAt;
  return (
    <View style={styles.form}>
      <Text style={styles.help}>
        {challenge
          ? `Код отправлен на ${newEmail.trim().toLowerCase()}`
          : `Текущая почта: ${email ?? '—'}. Подтвердите смену паролем и кодом на новый адрес.`}
      </Text>
      {!challenge ? (
        <>
          <TextInput
            placeholderTextColor={colors.text.secondary}
            selectionColor={colors.brand.primary}
            testID="email-change-address"
            accessibilityLabel="Новая электронная почта"
            placeholder="Новая электронная почта"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={newEmail}
            onChangeText={setNewEmail}
            editable={!busy}
            style={styles.input}
          />
          <TextInput
            placeholderTextColor={colors.text.secondary}
            selectionColor={colors.brand.primary}
            testID="email-change-password"
            accessibilityLabel="Текущий пароль"
            placeholder="Текущий пароль"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            style={styles.input}
            onSubmitEditing={() => void run('request')}
          />
        </>
      ) : (
        <TextInput
          placeholderTextColor={colors.text.secondary}
          selectionColor={colors.brand.primary}
          ref={codeInput}
          testID="email-change-code"
          accessibilityLabel="Код из письма"
          placeholder="000000"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'off'}
          maxLength={6}
          value={code}
          onChangeText={(value) =>
            setCode(value.replace(/\D/g, '').slice(0, 6))
          }
          editable={!busy && !expired}
          style={styles.input}
          onSubmitEditing={() => void run('confirm')}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!!expired && (
        <Text style={styles.error}>
          Срок кода истёк. Начните смену почты заново.
        </Text>
      )}
      <Pressable
        testID="email-change-submit"
        accessibilityRole="button"
        disabled={
          busy ||
          !!expired ||
          (challenge ? code.length !== 6 : !newEmail.trim() || !password)
        }
        onPress={() => void run(challenge ? 'confirm' : 'request')}
        style={({ pressed }) => [
          styles.primary,
          (busy || !!expired || pressed) && { opacity: 0.5 },
        ]}
      >
        <Text style={styles.primaryText}>
          {busy ? 'Подождите…' : challenge ? 'Подтвердить' : 'Получить код'}
        </Text>
      </Pressable>
      {challenge && (
        <>
          <Pressable
            testID="email-change-resend"
            accessibilityRole="button"
            disabled={busy || !!expired || now < challenge.retryAt}
            onPress={() => void run('resend')}
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
            disabled={busy}
            onPress={() => {
              setChallenge(undefined);
              setCode('');
              setError('');
            }}
            style={styles.action}
          >
            <Text style={styles.link}>Начать заново</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function PhoneChangeForm({
  onDone,
}: {
  onDone: (phone: string) => Promise<void>;
}) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useAppTheme();
  const request = useAction(api.phoneChange.request),
    resend = useAction(api.phoneChange.resend),
    confirm = useAction(api.phoneChange.confirm);
  const [phone, setPhone] = useState('+7'),
    [password, setPassword] = useState(''),
    [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<{
    challengeId: Id<'contactVerificationChallenges'>;
    expiresAt: number;
    retryAt: number;
    deliveryFailed?: boolean;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  const lock = useRef(false),
    input = useRef<TextInput>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (challenge && !busy) input.current?.focus();
  }, [challenge, busy]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = listenForSmsOtp(setCode);
    return () => subscription?.remove();
  }, []);
  const run = async (operation: 'request' | 'resend' | 'confirm') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android')
        throw new Error('NATIVE_REQUIRED');
      if (operation === 'confirm' && challenge) {
        const result = await confirm({
          challengeId: challenge.challengeId,
          code,
        });
        setCode('');
        await onDone(result.phone);
      } else {
        await startSmsRetriever();
        const result =
          operation === 'resend' && challenge
            ? await resend({
                challengeId: challenge.challengeId,
                platform: Platform.OS,
              })
            : await request({
                newPhone: phone,
                currentPassword: password,
                platform: Platform.OS,
              });
        setChallenge(result);
        setPassword('');
        setCode('');
        setNow(Date.now());
        if (result.deliveryFailed)
          setError('SMS пока не отправлено. Повторите после таймера.');
      }
    } catch (cause) {
      setError(contactMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const expired = challenge && now >= challenge.expiresAt;
  return (
    <View style={styles.form}>
      <Text style={styles.help}>
        {challenge
          ? 'Введите SMS-код на новый номер. Старый номер пока не изменён.'
          : 'Подтвердите смену текущим паролем и SMS на новый номер.'}
      </Text>
      {!challenge ? (
        <>
          <TextInput
            placeholderTextColor={colors.text.secondary}
            selectionColor={colors.brand.primary}
            testID="phone-change-number"
            accessibilityLabel="Новый номер телефона"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!busy}
            style={styles.input}
          />
          <TextInput
            placeholderTextColor={colors.text.secondary}
            selectionColor={colors.brand.primary}
            testID="phone-change-password"
            accessibilityLabel="Текущий пароль"
            placeholder="Текущий пароль"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
          />
        </>
      ) : (
        <TextInput
          placeholderTextColor={colors.text.secondary}
          selectionColor={colors.brand.primary}
          ref={input}
          testID="phone-change-code"
          accessibilityLabel="Код из SMS"
          value={code}
          onChangeText={(value) =>
            setCode(value.replace(/\D/g, '').slice(0, 6))
          }
          maxLength={6}
          keyboardType="number-pad"
          {...otpAutofillProps(Platform.OS)}
          editable={!busy}
          style={styles.input}
        />
      )}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {expired && (
        <Text style={styles.error}>Срок кода истёк. Запросите новый код.</Text>
      )}
      <Pressable
        testID="phone-change-submit"
        accessibilityRole="button"
        disabled={
          busy ||
          (challenge ? !!expired || code.length !== 6 : !phone || !password)
        }
        onPress={() => void run(challenge ? 'confirm' : 'request')}
        style={styles.primary}
      >
        <Text style={styles.primaryText}>
          {busy ? 'Подождите…' : challenge ? 'Подтвердить' : 'Получить SMS'}
        </Text>
      </Pressable>
      {challenge && (
        <>
          <Pressable
            testID="phone-change-resend"
            accessibilityRole="button"
            disabled={busy || now < challenge.retryAt}
            onPress={() => void run('resend')}
            style={styles.action}
          >
            <Text style={styles.link}>
              {now < challenge.retryAt
                ? `Повторно через ${Math.ceil((challenge.retryAt - now) / 1000)} сек.`
                : 'Отправить SMS повторно'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setChallenge(undefined);
              setCode('');
              setPassword('');
              setError('');
            }}
            style={styles.action}
          >
            <Text style={styles.link}>Начать заново</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function ProfileContacts({
  email,
  phone,
  disabled,
  renderPhone,
  onPhoneChanged,
}: {
  email?: string;
  phone?: string;
  disabled: boolean;
  renderPhone: (onDone: () => void) => ReactNode;
  onPhoneChanged?: (phone: string) => Promise<void>;
}) {
  const styles = useThemeStyles(createStyles);
  const [modal, setModal] = useState<'phone' | 'email' | null>(null);
  const [notice, setNotice] = useState('');
  const insets = useSafeAreaInsets();
  const close = () => setModal(null);
  return (
    <>
      <ProfileSettingsGroup
        title="Контакты"
        footer="Электронная почта используется для входа в аккаунт."
      >
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.contactCopy}>
              <Text style={styles.value}>Электронная почта</Text>
              <Text selectable style={styles.contactDetail}>
                {email ?? 'Не добавлена'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Изменить электронную почту"
              testID="profile-change-email"
              disabled={disabled}
              onPress={() => {
                setNotice('');
                setModal('email');
              }}
              style={[styles.contactAction, disabled && styles.disabled]}
            >
              <Text style={styles.link}>Изменить</Text>
            </Pressable>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.contactCopy}>
              <Text style={styles.value}>Телефон</Text>
              <Text selectable style={styles.contactDetail}>
                {phone ?? 'Не добавлен'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                phone ? 'Изменить телефон' : 'Добавить телефон'
              }
              testID={phone ? 'profile-change-phone' : 'profile-add-phone'}
              disabled={disabled}
              onPress={() => {
                setNotice('');
                setModal('phone');
              }}
              style={[styles.contactAction, disabled && styles.disabled]}
            >
              <Text style={styles.link}>{phone ? 'Изменить' : 'Добавить'}</Text>
            </Pressable>
          </View>
        </View>
      </ProfileSettingsGroup>
      {!!notice && (
        <Text accessibilityLiveRegion="polite" style={styles.help}>
          {notice}
        </Text>
      )}
      {modal && (
        <Modal transparent visible animationType="slide" onRequestClose={close}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.overlay}
          >
            <View
              style={[
                styles.sheet,
                {
                  paddingBottom: Math.max(insets.bottom, 20),
                  marginTop: insets.top + 12,
                },
              ]}
              accessibilityViewIsModal
            >
              <View style={styles.row}>
                <Text accessibilityRole="header" style={styles.title}>
                  {modal === 'phone'
                    ? phone
                      ? 'Изменить телефон'
                      : 'Добавить телефон'
                    : 'Изменить почту'}
                </Text>
                <Pressable
                  testID="contact-modal-close"
                  accessibilityRole="button"
                  onPress={close}
                  style={styles.action}
                >
                  <Text style={styles.link}>Закрыть</Text>
                </Pressable>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                {modal === 'phone' ? (
                  phone ? (
                    <PhoneChangeForm
                      onDone={async (newPhone) => {
                        await onPhoneChanged?.(newPhone);
                        close();
                        setNotice('Телефон изменён.');
                      }}
                    />
                  ) : (
                    renderPhone(() => {
                      close();
                      setNotice('Телефон подтверждён.');
                    })
                  )
                ) : (
                  <EmailChangeForm
                    email={email}
                    onDone={() => {
                      close();
                      setNotice('Электронная почта изменена.');
                    }}
                  />
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { paddingHorizontal: 14 },
    contactCopy: { flex: 1, minWidth: 0, gap: 4, paddingVertical: 16 },
    contactDetail: {
      color: colors.text.secondary,
      fontSize: 14,
      lineHeight: 20,
    },
    contactAction: {
      minHeight: 44,
      minWidth: 82,
      flexShrink: 0,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.45 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    value: {
      flexShrink: 1,
      color: colors.text.primary,
      fontSize: 17,
      lineHeight: 22,
    },
    help: {
      color: colors.text.secondary,
      fontSize: 14,
      lineHeight: 21,
      marginVertical: 8,
    },
    action: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
    link: { color: colors.brand.primary, fontSize: 16 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.surface.divider,
    },
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: '#00000055',
    },
    sheet: {
      backgroundColor: colors.surface.canvas,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 20,
      width: '100%',
      maxWidth: 560,
      maxHeight: '95%',
    },
    title: {
      flex: 1,
      fontSize: 22,
      fontWeight: '600',
      color: colors.text.primary,
    },
    form: { gap: 12 },
    input: {
      backgroundColor: colors.surface.raised,
      borderRadius: 16,
      padding: 16,
      fontSize: 17,
      color: colors.text.primary,
      minHeight: 52,
    },
    primary: {
      backgroundColor: colors.brand.primary,
      borderRadius: 20,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: 'white', fontSize: 17, fontWeight: '600' },
    error: { color: colors.state.error, fontSize: 14, lineHeight: 20 },
  });
