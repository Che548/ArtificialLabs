import { useEffect, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { emailChangeApi, emailChangeMessage, type EmailChangeChallenge } from '../lib/email-change';
import { AppText } from '../design-system/components';
import { colors, fonts } from '../design-system/tokens';
import { ProfileCollapse } from './ProfileMotion';
import { otpAutofillProps } from '../lib/otp-autofill';

export function ProfileEmailEditor({ currentEmail, disabled, onDone }: {
  currentEmail?: string;
  disabled: boolean;
  onDone: (email: string) => void;
}) {
  const request = useAction(emailChangeApi.request);
  const confirm = useAction(emailChangeApi.confirm);
  const resend = useAction(emailChangeApi.resend);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<EmailChangeChallenge>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [now, setNow] = useState(Date.now());
  const mounted = useRef(true);
  const running = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const normalized = email.trim().toLowerCase();
  const validEmail = normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized !== currentEmail?.toLowerCase();
  const expired = Boolean(challenge && now >= challenge.expiresAt);
  const submit = async () => {
    if (running.current || disabled || (!challenge && (!validEmail || !password)) || (challenge && (!/^\d{6}$/.test(code) || expired))) return;
    running.current = true;
    setBusy(true);
    setMessage(undefined);
    Keyboard.dismiss();
    try {
      if (!challenge) {
        const result = await request({ newEmail: normalized, currentPassword: password });
        if (mounted.current) { setChallenge(result); setPassword(''); setNow(Date.now()); }
      } else {
        const result = await confirm({ challengeId: challenge.challengeId, code });
        if (!result.changed) throw new Error('EMAIL_CHANGE_UNAVAILABLE');
        if (mounted.current) onDone(normalized);
      }
    } catch (error) {
      if (mounted.current) setMessage(emailChangeMessage(error));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const resendCode = async () => {
    if (!challenge || running.current || disabled || now < challenge.retryAt) return;
    running.current = true;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await resend({ challengeId: challenge.challengeId });
      if (mounted.current) { setChallenge(result); setCode(''); setNow(Date.now()); }
    } catch (error) {
      if (mounted.current) setMessage(emailChangeMessage(error));
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const blocked = busy || disabled || (challenge ? code.length !== 6 || expired : !validEmail || !password);
  return (
    <View style={styles.form}>
      <ProfileCollapse open={!challenge}>
        <View style={styles.fields}>
          <TextInput accessibilityLabel="Новая электронная почта" placeholder="Новая почта" value={email} onChangeText={setEmail}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" maxLength={254}
            editable={!busy && !disabled} style={styles.input} placeholderTextColor={colors.text.secondary} />
          <TextInput accessibilityLabel="Текущий пароль" placeholder="Текущий пароль" value={password} onChangeText={setPassword}
            secureTextEntry textContentType="password" autoCapitalize="none" autoCorrect={false} maxLength={1024}
            editable={!busy && !disabled} style={styles.input} placeholderTextColor={colors.text.secondary} />
          <AppText style={styles.caption} color={colors.text.secondary}>Пришлём код на новый адрес. До подтверждения почта не изменится.</AppText>
        </View>
      </ProfileCollapse>
      <ProfileCollapse open={Boolean(challenge)}>
        <View style={styles.fields}>
          <AppText style={styles.caption} color={colors.text.secondary}>{`Код отправлен на ${normalized}`}</AppText>
          <TextInput accessibilityLabel="Код из письма" placeholder="Код из письма" value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))} {...otpAutofillProps(Platform.OS)}
            keyboardType="number-pad" maxLength={6} editable={!busy && !disabled && !expired}
            style={styles.input} placeholderTextColor={colors.text.secondary} onSubmitEditing={() => void submit()} />
          {expired ? <AppText style={styles.caption} color={colors.text.secondary}>Срок действия кода истёк.</AppText> : null}
        </View>
      </ProfileCollapse>
      {message ? <AppText style={styles.caption} color={colors.text.secondary}>{message}</AppText> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked}
        onPress={() => void submit()} style={[styles.button, blocked && styles.disabled]}>
        <AppText weight="medium" color={colors.text.inverse}>{busy ? 'Подождите…' : challenge ? 'Подтвердить новую почту' : 'Получить код'}</AppText>
      </Pressable>
      {challenge ? (
        <View style={styles.fields}>
          <Pressable accessibilityRole="button" disabled={busy || disabled || now < challenge.retryAt || expired}
            onPress={() => void resendCode()}>
            <AppText style={styles.caption} color={colors.text.secondary}>
              {now < challenge.retryAt ? `Повторно через ${Math.ceil((challenge.retryAt - now) / 1000)} сек.` : 'Отправить код ещё раз'}
            </AppText>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy || disabled}
            onPress={() => { setChallenge(undefined); setCode(''); setMessage(undefined); }}>
            <AppText style={styles.caption} color={colors.text.secondary}>{expired ? 'Запросить новый код' : 'Изменить адрес'}</AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  form: { paddingLeft: 14, paddingRight: 18, paddingBottom: 16, gap: 12 },
  fields: { gap: 12 },
  input: { height: 48, paddingHorizontal: 16, paddingVertical: 0, paddingBottom: Platform.OS === 'ios' ? 6 : 0,
    textAlignVertical: 'center', includeFontPadding: false, fontFamily: fonts.sfRegular, fontSize: 16,
    borderRadius: 16, backgroundColor: '#F0EEF0', color: colors.text.primary },
  caption: { fontSize: 14, lineHeight: 20 },
  button: { minHeight: 48, borderRadius: 16, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  disabled: { opacity: 0.5 },
});
