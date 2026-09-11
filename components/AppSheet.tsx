import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../design-system/components';
import { colors, overlayRadii } from '../design-system/tokens';
import { useProfileReducedMotion } from './ProfileMotion';

export const sheetStyles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface.canvas,
    borderRadius: overlayRadii.sheet,
    overflow: 'hidden',
  },
  header: {
    minHeight: 60,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: { flex: 1, fontSize: 20, lineHeight: 25 },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeDisc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8E5E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 16 },
  popover: {
    borderRadius: overlayRadii.popover,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  disabled: { backgroundColor: '#E8E5E6' },
  group: {
    backgroundColor: colors.surface.raised,
    borderRadius: 18,
    padding: 16,
  },
  primary: {
    minHeight: 50,
    borderRadius: 25,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  secondary: {
    minHeight: 50,
    borderRadius: 25,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8E5E6',
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 12 },
});

export function SheetHeader({
  title,
  onClose,
  disabled = false,
}: {
  title: string;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={sheetStyles.header}>
      <AppText role="heading" weight="semibold" style={sheetStyles.title}>
        {title}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть окно"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onClose}
        style={sheetStyles.close}
      >
        <View style={sheetStyles.closeDisc}>
          <SymbolView
            name="xmark"
            size={13}
            weight="semibold"
            tintColor={colors.text.secondary}
            fallback={<AppText color={colors.text.secondary}>×</AppText>}
          />
        </View>
      </Pressable>
    </View>
  );
}

/** Shared presentation for task sheets. Native pickers stay inside the content. */
export function AppSheet({
  visible = true,
  title,
  onClose,
  dismissDisabled = false,
  children,
  footer,
  scroll = true,
  surface = 'grouped',
  onClosed,
}: {
  visible?: boolean;
  title: string;
  onClose: () => void;
  dismissDisabled?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  surface?: 'grouped' | 'white';
  onClosed?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useProfileReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const latestOnClosed = useRef(onClosed);
  latestOnClosed.current = onClosed;
  // Keep the last form intact while its parent clears selection after closing.
  const lastContent = useRef({ title, children, footer });
  if (visible) lastContent.current = { title, children, footer };
  const content = visible ? { title, children, footer } : lastContent.current;
  useEffect(() => {
    if (visible && !mounted) {
      setMounted(true);
      return;
    }
    // Start only once the native modal is on screen, not during its creation.
    if (!mounted || (visible && !shown)) return;
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? 360 : 280,
      easing: visible
        ? Easing.bezier(0.22, 0.61, 0.36, 1)
        : Easing.bezier(0.4, 0, 0.6, 1),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
        setShown(false);
        latestOnClosed.current?.();
      }
    });
    return () => animation.stop();
  }, [visible, mounted, shown, progress, reducedMotion]);
  const dismiss = () => {
    if (!dismissDisabled) onClose();
  };
  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType="none"
      onShow={() => setShown(true)}
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.root}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть окно"
            disabled={dismissDisabled}
            onPress={dismiss}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          pointerEvents={visible ? 'auto' : 'none'}
          style={[
            sheetStyles.surface,
            surface === 'white' && styles.whiteSurface,
            styles.sheet,
            {
              marginTop: insets.top + 12,
              marginBottom: 12,
              paddingBottom: Math.max(8, insets.bottom - 12),
              opacity: progress,
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [reducedMotion ? 0 : 28, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <SheetHeader
            title={content.title}
            onClose={dismiss}
            disabled={dismissDisabled}
          />
          {scroll ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={sheetStyles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {content.children}
            </ScrollView>
          ) : (
            content.children
          )}
          {content.footer ? (
            <View style={sheetStyles.footer}>{content.footer}</View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  scrim: { backgroundColor: 'rgba(30,22,25,0.24)' },
  whiteSurface: { backgroundColor: '#FFFFFF' },
  sheet: { flexShrink: 1, maxHeight: '92%', paddingBottom: 8 },
  scroll: { flexShrink: 1 },
});
