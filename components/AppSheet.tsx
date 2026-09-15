import { useIOSSwipe } from '../lib/use-ios-swipe';
import {
  useProfileAppearance,
  useProfileStyles,
} from '../lib/profile-appearance';
import type { ThemeColors } from '../lib/theme';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../design-system/components';
import { colors, overlayRadii } from '../design-system/tokens';
import { useProfileReducedMotion } from './ProfileMotion';

const createSheetStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      backgroundColor: colors.surface.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 20,
      gap: 16,
    },
    popover: {
      borderRadius: overlayRadii.popover,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.72)',
    },
    disabled: { backgroundColor: colors.surface.divider },
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
      backgroundColor: colors.surface.divider,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 12,
    },
  });

export const sheetStyles = createSheetStyles(colors);
export const useSheetStyles = () => useProfileStyles(createSheetStyles);

export function SheetHeader({
  title,
  onClose,
  disabled = false,
  testID,
}: {
  title: string;
  onClose: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const sheetStyles = useSheetStyles();
  const { colors } = useProfileAppearance();
  return (
    <View style={sheetStyles.header}>
      <AppText role="heading" weight="semibold" style={sheetStyles.title}>
        {title}
      </AppText>
      <Pressable
        testID={testID}
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
  containsLiquidGlass = false,
  onClosed,
  fullWidth = false,
  closeTestID,
  backdropColor,
}: {
  visible?: boolean;
  title: string;
  onClose: () => void;
  dismissDisabled?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  surface?: 'grouped' | 'white';
  containsLiquidGlass?: boolean;
  onClosed?: () => void;
  fullWidth?: boolean;
  closeTestID?: string;
  backdropColor?: string;
}) {
  const sheetStyles = useSheetStyles();
  const styles = useProfileStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reducedMotion = useProfileReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const resetDrag = () => {
    dragY.stopAnimation();
    if (reducedMotion) dragY.setValue(0);
    else Animated.spring(dragY, {
      toValue: 0, damping: 24, stiffness: 280, mass: 0.8, useNativeDriver: true,
    }).start();
  };
  const swipeHandlers = useIOSSwipe({
    axis: 'vertical', positiveOnly: true,
    enabled: visible && shown && !dismissDisabled,
    onStart: () => dragY.stopAnimation(),
    onDrag: (distance) => dragY.setValue(Math.min(distance, windowHeight)),
    onCancel: resetDrag,
    onSwipe: () => { dismiss(); resetDrag(); },
  });
  useEffect(() => {
    if (!mounted) { dragY.stopAnimation(); dragY.setValue(0); }
  }, [mounted, dragY]);
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
    const animation = Animated.parallel([
      Animated.timing(backdrop, {
        toValue: visible ? 1 : 0,
        duration: reducedMotion ? 0 : visible ? 320 : 260,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: visible ? 1 : 0,
        duration: reducedMotion ? 0 : visible ? 360 : 280,
        easing: visible
          ? Easing.bezier(0.22, 0.61, 0.36, 1)
          : Easing.bezier(0.4, 0, 0.6, 1),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
        setShown(false);
        latestOnClosed.current?.();
      }
    });
    return () => animation.stop();
  }, [visible, mounted, shown, progress, backdrop, reducedMotion]);
  const dismiss = () => {
    if (!dismissDisabled && visible) {
      Keyboard.dismiss();
      onClose();
    }
  };
  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      animationType="none"
      onShow={() => setShown(true)}
      onRequestClose={dismiss}
    >
      <View style={styles.container}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.scrim, { opacity: backdrop }, backdropColor ? { backgroundColor: backdropColor } : undefined]}
        >
          <Pressable
            accessibilityRole="button"
            testID="sheet-backdrop"
            accessibilityLabel="Закрыть окно нажатием на фон"
            disabled={dismissDisabled}
            onPress={dismiss}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.root, fullWidth && { paddingHorizontal: 0 }]}
        >
          <Animated.View
            accessibilityViewIsModal
            pointerEvents={visible ? 'auto' : 'none'}
            style={[
              sheetStyles.surface,
              surface === 'white' && styles.whiteSurface,
              styles.sheet,
              {
                marginTop: insets.top + 12,
                marginBottom: fullWidth ? 0 : 12,
                ...(fullWidth
                  ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
                  : {}),
                paddingBottom: Math.max(8, insets.bottom - 12),
                // Native glass must not inherit animated opacity. Slide its sheet instead.
                opacity: containsLiquidGlass ? 1 : progress,
                transform: [
                  { translateY: dragY },
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        containsLiquidGlass ? windowHeight : reducedMotion ? 0 : 28,
                        0,
                      ],
                    }),
                  },
                ],
              },
            ]}
          >
          <View {...swipeHandlers}>
            <SheetHeader
              testID={closeTestID}
              title={content.title}
              onClose={dismiss}
              disabled={dismissDisabled}
            />
          </View>
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
      </View>
    </Modal>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    root: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
    scrim: { backgroundColor: 'rgba(30,22,25,0.24)' },
    whiteSurface: { backgroundColor: colors.surface.raised },
    sheet: { flexShrink: 1, maxHeight: '92%', paddingBottom: 8 },
    scroll: { flexShrink: 1 },
  });
