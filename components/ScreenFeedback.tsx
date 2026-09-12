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
import { AppText, colors } from '../design-system';

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
          <AppText weight="semibold">{notice.title}</AppText>
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
            style={styles.input}
          />
        )}
        {!!notice.error && (
          <View accessibilityRole="alert">
            <AppText style={styles.message}>{notice.error}</AppText>
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
              style={styles.button}
            >
              <AppText>Сохранить</AppText>
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
                style={styles.button}
              >
                <AppText
                  color={
                    action.style === 'destructive'
                      ? '#A51D39'
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
                style={styles.button}
              >
                <AppText>Отмена</AppText>
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

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 30,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D9BBC7',
    backgroundColor: '#FFF8FA',
    shadowColor: '#351D28',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  message: { marginTop: 10 },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#AB8798',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#2B2025',
    backgroundColor: '#FFFFFF',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#F4DDE7',
    borderRadius: 12,
  },
});
