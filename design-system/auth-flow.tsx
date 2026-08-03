import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, GlassControl, LiquidGlassSurface } from "./components";
import {
  colors,
  fonts,
  motion,
  radii,
  shadows,
  sizes,
  spacing,
} from "./tokens";

type AuthChannel = "email" | "phone";
type AuthFlowStep =
  | "login"
  | "recovery"
  | "emailSent"
  | "verifyCode"
  | "newPassword"
  | "complete";

type AuthFlowModalProps = {
  visible: boolean;
  onClose: () => void;
};

const stepMeta: Record<
  AuthFlowStep,
  { current: number; eyebrow: string; title: string; description: string }
> = {
  login: {
    current: 1,
    eyebrow: "ЗАЩИЩЁННЫЙ ВХОД",
    title: "Войдите в приложение",
    description:
      "Используйте телефон или e-mail, указанный при регистрации.",
  },
  recovery: {
    current: 2,
    eyebrow: "ВОССТАНОВЛЕНИЕ",
    title: "Куда отправить доступ?",
    description:
      "Мы отправим код по SMS или защищённую ссылку на e-mail.",
  },
  emailSent: {
    current: 3,
    eyebrow: "ПРОВЕРЬТЕ ПОЧТУ",
    title: "Ссылка отправлена",
    description:
      "Откройте письмо на этом устройстве. Ссылка вернёт вас в приложение.",
  },
  verifyCode: {
    current: 3,
    eyebrow: "ПОДТВЕРЖДЕНИЕ",
    title: "Введите код из SMS",
    description: "Код отправлен на указанный номер и действует 10 минут.",
  },
  newPassword: {
    current: 4,
    eyebrow: "НОВЫЙ ПАРОЛЬ",
    title: "Защитите аккаунт",
    description: "Используйте не менее 8 символов и не повторяйте старый пароль.",
  },
  complete: {
    current: 5,
    eyebrow: "ГОТОВО",
    title: "Доступ восстановлен",
    description: "Новый пароль установлен. Можно вернуться в приложение.",
  },
};

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").slice(0, 16);
}

function AuthChannelPicker({
  channel,
  onChange,
}: {
  channel: AuthChannel;
  onChange: (channel: AuthChannel) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.channelPicker}>
      {(["phone", "email"] as const).map((item) => {
        const active = channel === item;
        return (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item)}
            style={({ pressed }) => [
              styles.channelOption,
              active && styles.channelOptionActive,
              pressed && styles.channelOptionPressed,
            ]}
          >
            <AppText
              role="label"
              weight="medium"
              color={active ? colors.text.primary : colors.text.secondary}
            >
              {item === "phone" ? "Телефон" : "E-mail"}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function AuthField({
  autoComplete,
  keyboardType,
  label,
  maxLength,
  numeric = false,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value,
}: {
  autoComplete?: "email" | "new-password" | "one-time-code" | "password" | "tel";
  keyboardType?: "default" | "email-address" | "number-pad" | "phone-pad";
  label: string;
  maxLength?: number;
  numeric?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <AppText role="caption" weight="medium" color={colors.text.secondary}>
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        keyboardType={keyboardType}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor="rgba(115,110,108,0.62)"
        secureTextEntry={secureTextEntry}
        selectionColor={colors.brand.primary}
        style={[styles.field, numeric && styles.numericField]}
      />
    </View>
  );
}

function ConsentControl({
  checked,
  onPress,
}: {
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel="Согласие на обработку персональных данных и принятие политики конфиденциальности"
      onPress={onPress}
      style={({ pressed }) => [
        styles.consent,
        pressed && styles.consentPressed,
      ]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? (
          <AppText
            role="caption"
            weight="semibold"
            color={colors.text.inverse}
            style={styles.checkboxMark}
          >
            ✓
          </AppText>
        ) : null}
      </View>
      <AppText role="caption" color={colors.text.secondary} style={styles.consentText}>
        Я даю согласие на обработку персональных данных и принимаю политику
        конфиденциальности.
      </AppText>
    </Pressable>
  );
}

function AuthPrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.primaryButtonPressed,
      ]}
    >
      <AppText role="body" weight="medium" color={colors.text.inverse}>
        {label}
      </AppText>
      <View style={styles.primaryButtonArrow}>
        <AppText role="heading" color={colors.brand.primary} style={styles.arrowGlyph}>
          →
        </AppText>
      </View>
    </Pressable>
  );
}

function CompletionMark() {
  return (
    <View style={styles.completionMarkOuter}>
      <LinearGradient
        colors={["#55D99A", colors.brand.success]}
        style={styles.completionMark}
      >
        <AppText
          role="display"
          weight="semibold"
          color={colors.text.inverse}
          style={styles.completionCheck}
        >
          ✓
        </AppText>
      </LinearGradient>
    </View>
  );
}

export function AuthFlowModal({ visible, onClose }: AuthFlowModalProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<AuthFlowStep>("login");
  const [channel, setChannel] = useState<AuthChannel>("phone");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string>();
  const transition = useRef(new Animated.Value(1)).current;
  const meta = stepMeta[step];

  useEffect(() => {
    if (visible) {
      setStep("login");
      setChannel("phone");
      setIdentifier("");
      setPassword("");
      setConsent(false);
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setError(undefined);
      transition.setValue(1);
    }
  }, [transition, visible]);

  const moveTo = (nextStep: AuthFlowStep) => {
    Keyboard.dismiss();
    setError(undefined);
    Animated.timing(transition, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      transition.setValue(0);
      Animated.spring(transition, {
        toValue: 1,
        damping: 19,
        stiffness: 220,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    });
  };

  const changeChannel = (nextChannel: AuthChannel) => {
    setChannel(nextChannel);
    setIdentifier("");
    setError(undefined);
  };

  const validateIdentifier = () => {
    const valid =
      channel === "email"
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())
        : identifier.replace(/\D/g, "").length >= 10;

    if (!valid) {
      setError(
        channel === "email"
          ? "Введите корректный e-mail."
          : "Введите номер телефона полностью.",
      );
    }
    return valid;
  };

  const submitLogin = () => {
    if (!validateIdentifier()) return;
    if (password.length < 8) {
      setError("Пароль должен содержать не менее 8 символов.");
      return;
    }
    if (!consent) {
      setError("Подтвердите согласие и принятие политики конфиденциальности.");
      return;
    }
    moveTo("complete");
  };

  const submitRecovery = () => {
    if (!validateIdentifier()) return;
    moveTo(channel === "phone" ? "verifyCode" : "emailSent");
  };

  const submitCode = () => {
    if (code.replace(/\D/g, "").length !== 6) {
      setError("Введите шестизначный код из SMS.");
      return;
    }
    moveTo("newPassword");
  };

  const submitNewPassword = () => {
    if (newPassword.length < 8) {
      setError("Новый пароль должен содержать не менее 8 символов.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }
    moveTo("complete");
  };

  const goBack = () => {
    if (step === "login") {
      onClose();
      return;
    }
    if (step === "newPassword") {
      moveTo(channel === "phone" ? "verifyCode" : "emailSent");
      return;
    }
    if (step === "complete") {
      moveTo("login");
      return;
    }
    moveTo(step === "recovery" ? "login" : "recovery");
  };

  const cardTranslateX = transition.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar style="dark" hidden={false} />
      <TouchableWithoutFeedback
        accessible={false}
        onPress={Keyboard.dismiss}
        touchSoundDisabled
      >
        <View style={styles.root}>
          <LinearGradient
            colors={["#FFF9F7", "#FCE9E4", "#F7F3F2"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.backgroundOrbLarge} />
          <View style={styles.backgroundOrbSmall} />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardAvoider}
          >
            <View
              style={[
                styles.header,
                { paddingTop: Math.max(insets.top, 14) + 8 },
              ]}
            >
              <GlassControl
                accessibilityLabel={step === "login" ? "Закрыть" : "Назад"}
                onPress={goBack}
                style={styles.headerButton}
              >
                <AppText role="heading" style={styles.headerGlyph}>
                  {step === "login" ? "×" : "‹"}
                </AppText>
              </GlassControl>

              <LiquidGlassSurface style={styles.progressPill} radius={24}>
                <View style={styles.progressContent}>
                  <AppText numeric role="label" weight="medium">
                    {meta.current} из 5
                  </AppText>
                </View>
              </LiquidGlassSurface>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentInsetAdjustmentBehavior="never"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, 16) + 24 },
              ]}
            >
              <View style={styles.brandBlock}>
                <AppText numeric role="display" color={colors.brand.primary} style={styles.brand}>
                  сфера.
                </AppText>
                <AppText
                  role="caption"
                  weight="semibold"
                  color={colors.brand.primary}
                  style={styles.eyebrow}
                >
                  {meta.eyebrow}
                </AppText>
                <AppText role="display" weight="semibold" style={styles.title}>
                  {meta.title}
                </AppText>
                <AppText role="body" color={colors.text.secondary} style={styles.description}>
                  {meta.description}
                </AppText>
              </View>

              <Animated.View
                style={[
                  styles.formCard,
                  { opacity: transition, transform: [{ translateX: cardTranslateX }] },
                ]}
              >
                {step === "login" ? (
                  <>
                    <AuthChannelPicker channel={channel} onChange={changeChannel} />
                    <AuthField
                      label={channel === "phone" ? "Номер телефона" : "E-mail"}
                      value={identifier}
                      onChangeText={(value) =>
                        setIdentifier(channel === "phone" ? normalizePhone(value) : value)
                      }
                      placeholder={channel === "phone" ? "+7 999 000-00-00" : "name@example.com"}
                      keyboardType={channel === "phone" ? "phone-pad" : "email-address"}
                      autoComplete={channel === "phone" ? "tel" : "email"}
                      numeric={channel === "phone"}
                    />
                    <AuthField
                      label="Пароль"
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Введите пароль"
                      secureTextEntry
                      autoComplete="password"
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => moveTo("recovery")}
                      style={({ pressed }) => [
                        styles.forgotButton,
                        pressed && styles.textButtonPressed,
                      ]}
                    >
                      <AppText role="label" weight="medium" color={colors.brand.primary}>
                        Забыли пароль?
                      </AppText>
                    </Pressable>
                    <ConsentControl checked={consent} onPress={() => setConsent((value) => !value)} />
                    {error ? (
                      <AppText role="caption" color={colors.state.error} style={styles.error}>
                        {error}
                      </AppText>
                    ) : null}
                    <AuthPrimaryButton label="Войти" onPress={submitLogin} />
                  </>
                ) : null}

                {step === "recovery" ? (
                  <>
                    <AuthChannelPicker channel={channel} onChange={changeChannel} />
                    <AuthField
                      label={channel === "phone" ? "Номер телефона" : "E-mail"}
                      value={identifier}
                      onChangeText={(value) =>
                        setIdentifier(channel === "phone" ? normalizePhone(value) : value)
                      }
                      placeholder={channel === "phone" ? "+7 999 000-00-00" : "name@example.com"}
                      keyboardType={channel === "phone" ? "phone-pad" : "email-address"}
                      autoComplete={channel === "phone" ? "tel" : "email"}
                      numeric={channel === "phone"}
                    />
                    <View style={styles.deliveryNote}>
                      <View style={styles.deliveryIcon}>
                        <AppText role="body" color={colors.brand.primary}>
                          {channel === "phone" ? "#" : "↗"}
                        </AppText>
                      </View>
                      <AppText role="caption" color={colors.text.secondary} style={styles.deliveryText}>
                        {channel === "phone"
                          ? "По SMS придёт одноразовый шестизначный код."
                          : "На почту придёт защищённая ссылка для смены пароля."}
                      </AppText>
                    </View>
                    {error ? (
                      <AppText role="caption" color={colors.state.error} style={styles.error}>
                        {error}
                      </AppText>
                    ) : null}
                    <AuthPrimaryButton
                      label={channel === "phone" ? "Получить код" : "Отправить ссылку"}
                      onPress={submitRecovery}
                    />
                  </>
                ) : null}

                {step === "emailSent" ? (
                  <>
                    <View style={styles.deliveryHero}>
                      <View style={styles.mailIllustration}>
                        <View style={styles.mailFlap} />
                        <AppText role="title" color={colors.brand.primary}>
                          ↗
                        </AppText>
                      </View>
                      <AppText role="body" weight="medium" style={styles.deliveryDestination}>
                        {identifier || "name@example.com"}
                      </AppText>
                      <AppText role="caption" color={colors.text.secondary} style={styles.deliveryCenteredText}>
                        Для UI kit переход по ссылке имитируется этой кнопкой.
                      </AppText>
                    </View>
                    <AuthPrimaryButton label="Открыть ссылку" onPress={() => moveTo("newPassword")} />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => moveTo("recovery")}
                      style={({ pressed }) => [styles.secondaryTextButton, pressed && styles.textButtonPressed]}
                    >
                      <AppText role="label" weight="medium" color={colors.brand.primary}>
                        Отправить повторно
                      </AppText>
                    </Pressable>
                  </>
                ) : null}

                {step === "verifyCode" ? (
                  <>
                    <AuthField
                      label="Код подтверждения"
                      value={code}
                      onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
                      placeholder="000000"
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={6}
                      numeric
                    />
                    <AppText numeric role="caption" color={colors.text.secondary} style={styles.codeHint}>
                      {identifier || "+7 999 000-00-00"} · повторить через 00:42
                    </AppText>
                    {error ? (
                      <AppText role="caption" color={colors.state.error} style={styles.error}>
                        {error}
                      </AppText>
                    ) : null}
                    <AuthPrimaryButton label="Подтвердить код" onPress={submitCode} />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setCode("")}
                      style={({ pressed }) => [styles.secondaryTextButton, pressed && styles.textButtonPressed]}
                    >
                      <AppText role="label" weight="medium" color={colors.brand.primary}>
                        Отправить код повторно
                      </AppText>
                    </Pressable>
                  </>
                ) : null}

                {step === "newPassword" ? (
                  <>
                    <AuthField
                      label="Новый пароль"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Не менее 8 символов"
                      secureTextEntry
                      autoComplete="new-password"
                    />
                    <AuthField
                      label="Повторите пароль"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Введите пароль ещё раз"
                      secureTextEntry
                      autoComplete="new-password"
                    />
                    <View style={styles.passwordRules}>
                      <View style={[styles.ruleDot, newPassword.length >= 8 && styles.ruleDotComplete]} />
                      <AppText role="caption" color={colors.text.secondary}>
                        Минимум 8 символов
                      </AppText>
                    </View>
                    {error ? (
                      <AppText role="caption" color={colors.state.error} style={styles.error}>
                        {error}
                      </AppText>
                    ) : null}
                    <AuthPrimaryButton label="Установить пароль" onPress={submitNewPassword} />
                  </>
                ) : null}

                {step === "complete" ? (
                  <>
                    <CompletionMark />
                    <View style={styles.completeCopy}>
                      <AppText role="heading" weight="semibold" style={styles.completeTitle}>
                        Всё получилось
                      </AppText>
                      <AppText role="body" color={colors.text.secondary} style={styles.deliveryCenteredText}>
                        Сессия восстановлена, защищённые данные снова доступны.
                      </AppText>
                    </View>
                    <AuthPrimaryButton label="Вернуться в приложение" onPress={onClose} />
                  </>
                ) : null}
              </Animated.View>

              <AppText role="caption" color="rgba(115,110,108,0.62)" style={styles.prototypeNote}>
                UI kit prototype · отправка SMS и e-mail не выполняется
              </AppText>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
    overflow: "hidden",
  },
  keyboardAvoider: {
    flex: 1,
  },
  backgroundOrbLarge: {
    position: "absolute",
    top: -120,
    right: -130,
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(211,20,113,0.08)",
  },
  backgroundOrbSmall: {
    position: "absolute",
    bottom: 70,
    left: -90,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: "rgba(31,187,116,0.07)",
  },
  header: {
    zIndex: 4,
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
  },
  headerGlyph: {
    marginTop: Platform.OS === "ios" ? -3 : 0,
    fontSize: 34,
    lineHeight: 38,
    textAlign: "center",
  },
  progressPill: {
    width: 96,
    height: 48,
    borderRadius: 24,
  },
  progressContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: sizes.screenGutter,
    paddingTop: spacing.lg,
    justifyContent: "center",
  },
  brandBlock: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  brand: {
    fontSize: 29,
    lineHeight: 32,
    marginBottom: spacing.xl,
  },
  eyebrow: {
    letterSpacing: 1.25,
    marginBottom: spacing.xs,
  },
  title: {
    maxWidth: 350,
    fontSize: 34,
    lineHeight: 37,
    letterSpacing: -0.78,
  },
  description: {
    maxWidth: 350,
    marginTop: spacing.sm,
  },
  formCard: {
    width: "100%",
    maxWidth: 430,
    minHeight: 280,
    alignSelf: "center",
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(33,33,35,0.06)",
    backgroundColor: "rgba(255,255,255,0.92)",
    gap: spacing.md,
    ...shadows.card,
  },
  channelPicker: {
    height: 46,
    padding: 3,
    borderRadius: 23,
    backgroundColor: "#F0EEEE",
    flexDirection: "row",
  },
  channelOption: {
    flex: 1,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  channelOptionActive: {
    backgroundColor: colors.surface.raised,
    shadowColor: "#2A1116",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  channelOptionPressed: {
    transform: [{ scale: 1.02 }],
  },
  fieldGroup: {
    gap: 7,
  },
  field: {
    height: 54,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(33,33,35,0.08)",
    backgroundColor: "#F5F3F3",
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 17,
  },
  numericField: {
    fontFamily: fonts.yaroRegular,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  forgotButton: {
    alignSelf: "flex-end",
    paddingVertical: 2,
  },
  textButtonPressed: {
    opacity: motion.pressedOpacity,
  },
  consent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  consentPressed: {
    opacity: 0.72,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(115,110,108,0.48)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.raised,
  },
  checkboxChecked: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  checkboxMark: {
    marginTop: -1,
    fontSize: 13,
    lineHeight: 15,
  },
  consentText: {
    flex: 1,
    lineHeight: 17,
  },
  primaryButton: {
    height: 54,
    marginTop: 2,
    paddingLeft: 21,
    paddingRight: 6,
    borderRadius: 27,
    backgroundColor: colors.brand.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  primaryButtonPressed: {
    transform: [{ scale: motion.pressedScale }],
  },
  primaryButtonArrow: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowGlyph: {
    marginTop: -2,
  },
  error: {
    marginTop: -4,
  },
  deliveryNote: {
    minHeight: 68,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface.rose,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  deliveryIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryText: {
    flex: 1,
  },
  deliveryHero: {
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
  },
  mailIllustration: {
    width: 96,
    height: 76,
    marginBottom: spacing.sm,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(211,20,113,0.20)",
    backgroundColor: colors.surface.rose,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  mailFlap: {
    position: "absolute",
    top: -25,
    width: 70,
    height: 70,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(211,20,113,0.16)",
    transform: [{ rotate: "45deg" }],
  },
  deliveryDestination: {
    textAlign: "center",
  },
  deliveryCenteredText: {
    maxWidth: 290,
    textAlign: "center",
  },
  secondaryTextButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  codeHint: {
    textAlign: "center",
  },
  passwordRules: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  ruleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.state.disabled,
  },
  ruleDotComplete: {
    backgroundColor: colors.brand.success,
  },
  completionMarkOuter: {
    width: 112,
    height: 112,
    marginTop: spacing.xs,
    alignSelf: "center",
    borderRadius: 56,
    padding: 8,
    backgroundColor: "rgba(31,187,116,0.10)",
  },
  completionMark: {
    flex: 1,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  completionCheck: {
    marginTop: -3,
  },
  completeCopy: {
    alignItems: "center",
    gap: spacing.xs,
  },
  completeTitle: {
    textAlign: "center",
  },
  prototypeNote: {
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
