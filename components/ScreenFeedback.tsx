import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../design-system/components';
import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';

type Action = {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void | Promise<void>;
};
type Notice = {
  id: number;
  title: string;
  message?: string;
  actions: Action[];
  edit?: {
    initialValue: string;
    onSave: (value: string) => void | Promise<void>;
  };
  error?: string;
};

export function useScreenFeedback() {
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const show = useCallback(
    (
      title: string,
      message?: string,
      actions: Action[] = [{ text: 'Понятно' }],
    ) => {
      setNotice({ id: ++sequence.current, title, message, actions });
    },
    [],
  );
  const edit = useCallback(
    (
      title: string,
      initialValue: string,
      onSave: (value: string) => void | Promise<void>,
    ) => {
      setNotice({
        id: ++sequence.current,
        title,
        actions: [],
        edit: { initialValue, onSave },
      });
    },
    [],
  );
  const dismiss = useCallback(() => {
    if (!inFlight.current) setNotice(undefined);
  }, []);
  const run = async (action: () => void | Promise<void>) => {
    if (!notice || inFlight.current) return;
    const id = notice.id;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
      setNotice((current) => (current?.id === id ? undefined : current));
    } catch {
      setNotice((current) =>
        current?.id === id
          ? {
              ...current,
              error: 'Не удалось выполнить действие. Попробуйте ещё раз.',
            }
          : current,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { notice, busy, show, edit, dismiss, run };
}

export function ScreenFeedback({
  feedback,
}: {
  feedback: ReturnType<typeof useScreenFeedback>;
}) {
  return feedback.notice ? (
    <FeedbackCard
      key={feedback.notice.id}
      feedback={feedback}
      notice={feedback.notice}
    />
  ) : null;
}

function FeedbackCard({
  feedback,
  notice,
}: {
  feedback: ReturnType<typeof useScreenFeedback>;
  notice: Notice;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const [value, setValue] = useState(notice.edit?.initialValue ?? '');
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <View
      style={[styles.card, { top: insets.top + 12, maxHeight: height * 0.45 }]}
      testID="screen-feedback"
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <View accessibilityRole="header">
          <AppText weight="semibold" style={styles.title}>{notice.title}</AppText>
        </View>
        {!!notice.message && (
          <AppText style={styles.message}>{notice.message}</AppText>
        )}
        {!!notice.edit && (
          <TextInput
            testID="screen-feedback-input"
            accessibilityLabel={notice.title}
            value={value}
            onChangeText={setValue}
            selectTextOnFocus
            maxLength={120}
            editable={!feedback.busy}
            placeholderTextColor={colors.text.secondary}
            selectionColor={colors.brand.primary}
            style={styles.input}
          />
        )}
        {!!notice.error && (
          <View accessibilityRole="alert">
            <AppText style={[styles.message, styles.error]}>{notice.error}</AppText>
          </View>
        )}
        <View style={styles.actions}>
          {notice.edit ? (
            <Pressable
              accessibilityRole="button"
              disabled={feedback.busy || !value.trim()}
              onPress={() =>
                void feedback.run(() => notice.edit!.onSave(value.trim()))
              }
              cssInterop={false}
              style={({ pressed }) => [styles.button, (feedback.busy || !value.trim()) && styles.disabled, pressed && styles.pressed]}
            >
              <AppText weight="semibold" style={styles.buttonLabel}>Сохранить</AppText>
            </Pressable>
          ) : (
            notice.actions.map((action, index) => (
              <Pressable
                key={index}
                accessibilityRole="button"
                disabled={feedback.busy}
                onPress={() =>
                  action.style === 'cancel'
                    ? feedback.dismiss()
                    : void feedback.run(() => action.onPress?.())
                }
                cssInterop={false}
                style={({ pressed }) => [styles.button, action.style === 'cancel' && styles.secondaryButton, feedback.busy && styles.disabled, pressed && styles.pressed]}
              >
                <AppText
                  weight="semibold"
                  style={styles.buttonLabel}
                  color={
                    action.style === 'destructive'
                      ? colors.state.error
                      : colors.text.primary
                  }
                >
                  {action.text}
                </AppText>
              </Pressable>
            ))
          )}
          {!notice.actions.some((action) => action.style === 'cancel') &&
            (notice.edit ||
              notice.actions.some((action) => action.onPress)) && (
              <Pressable
                accessibilityRole="button"
                disabled={feedback.busy}
                onPress={feedback.dismiss}
                cssInterop={false}
                style={({ pressed }) => [styles.button, styles.secondaryButton, feedback.busy && styles.disabled, pressed && styles.pressed]}
              >
                <AppText weight="semibold" style={styles.buttonLabel}>Отмена</AppText>
              </Pressable>
            )}
        </View>
        {feedback.busy && (
          <View accessibilityLiveRegion="polite">
            <AppText>Сохранение…</AppText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 30,
    padding: 20,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
    backgroundColor: colors.surface.raised,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { fontSize: 20, lineHeight: 25, color: colors.text.primary },
  message: { marginTop: 8, fontSize: 16, lineHeight: 23, color: colors.text.secondary },
  error: { color: colors.state.error },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.surface.divider,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.surface.canvas,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  button: {
    minHeight: 48,
    minWidth: 120,
    flexGrow: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface.rose,
    borderRadius: 24,
  },
  buttonLabel: { fontSize: 16, lineHeight: 21, textAlign: 'center' },
  secondaryButton: { backgroundColor: colors.surface.divider },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
});
