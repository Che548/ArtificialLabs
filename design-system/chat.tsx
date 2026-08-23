import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import Markdown, {
  MarkdownIt,
  type MarkdownStyles,
  type RenderFunction,
  type RenderRules,
} from 'react-native-markdown-renderer';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import PlusIcon from '../assets/figma/chat/plus.svg';
import ChatExitArrowIcon from '../assets/figma/calendar-page/back.svg';
import MessageBrainIcon from '../assets/figma/chat/message-brain.svg';
import MessageCopyIcon from '../assets/figma/chat/message-copy.svg';
import MessageEditIcon from '../assets/figma/chat/message-edit.svg';
import MessageExportIcon from '../assets/figma/chat/message-export.svg';
import MessageReportIcon from '../assets/figma/chat/message-report.svg';
import SuggestionAnalysesIcon from '../assets/figma/chat/suggestion-analyses.svg';
import SuggestionClinicIcon from '../assets/figma/chat/suggestion-clinic.svg';
import SuggestionNutritionIcon from '../assets/figma/chat/suggestion-nutrition.svg';
import VoiceIcon from '../assets/figma/chat/voice.svg';
import { AppHeader } from './app-header';
import { AppText, SegmentedSwitcher } from './components';
import { isAllowedChatMarkdownLink } from '../lib/safe-markdown';
import { FallbackGlassBackdrop } from './glass-fallback';
import {
  androidMaterials,
  androidShadows,
  colors,
  fonts,
  motion,
  radii,
  shadows,
  spacing,
} from './tokens';

const mascotImage = require('../assets/figma/chat/mascot.png');
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
const safeMarkdown = MarkdownIt({
  typographer: true,
  html: false,
  linkify: false,
});
const renderSafeMarkdownLink: RenderFunction = (
  node,
  children,
  _parents,
  markdownStyles,
  ...args
) => {
  if (!isAllowedChatMarkdownLink(node.attributes.href)) {
    return <Text key={node.key}>{children}</Text>;
  }
  const onLinkPress = args[0] as ((url: string) => boolean | void) | undefined;
  return (
    <Text
      key={node.key}
      style={markdownStyles.link as never}
      onPress={() => onLinkPress?.(node.attributes.href)}
    >
      {children}
    </Text>
  );
};
const safeMarkdownRules: RenderRules = {
  image: () => null,
  html_block: () => null,
  html_inline: () => null,
  link: renderSafeMarkdownLink,
  blocklink: renderSafeMarkdownLink,
};

export type ChatSuggestion = {
  id: string;
  title: string;
  icon: 'nutrition' | 'clinic' | 'analyses';
};

const suggestionIcons = {
  nutrition: SuggestionNutritionIcon,
  clinic: SuggestionClinicIcon,
  analyses: SuggestionAnalysesIcon,
} as const;

function ChatComposerGlass({
  children,
  forceFallback = false,
  radius = 999,
  style,
  tintColor = 'rgba(255,255,255,0.20)',
}: PropsWithChildren<{
  forceFallback?: boolean;
  radius?: number;
  style: StyleProp<ViewStyle>;
  tintColor?: string;
}>) {
  if (hasNativeLiquidGlass && !forceFallback) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tintColor}
        colorScheme="light"
        isInteractive
        style={style}
      >
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          style,
          styles.composerGlassFallback,
          styles.composerGlassAndroid,
        ]}
      >
        <BlurView
          tint="light"
          intensity={38}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.90)', 'rgba(255,244,249,0.62)']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View pointerEvents="none" style={styles.composerGlassAndroidWash} />
        {children}
      </View>
    );
  }

  return (
    <View style={[style, styles.composerGlassFallback]}>
      <FallbackGlassBackdrop
        radius={radius}
        intensity={58}
        tint="systemUltraThinMaterialLight"
        washColor={tintColor}
      />
      {children}
    </View>
  );
}

export type ChatHeaderMode = 'chat' | 'assistant';

const chatHeaderModes: Array<{
  value: ChatHeaderMode;
  label: string;
  badge?: string;
  disabled?: boolean;
}> = [
  { value: 'chat', label: 'Чат' },
  { value: 'assistant', label: 'Ассистент' },
];

export function ChatModeSwitcher({
  value,
  onChange,
}: {
  value: ChatHeaderMode;
  onChange?: (value: ChatHeaderMode) => void;
}) {
  return (
    <SegmentedSwitcher
      accessibilityLabel="Режим чата"
      options={chatHeaderModes}
      value={value}
      onChange={(nextValue) => onChange?.(nextValue)}
    />
  );
}

export function ChatHeader({
  activeMode = 'chat',
  conversation = false,
  conversationIconProgress,
  onModeChange,
  onExitConversation,
  onHistory,
  onCalendar,
}: {
  activeMode?: ChatHeaderMode;
  conversation?: boolean;
  conversationIconProgress?: Animated.Value;
  onModeChange?: (value: ChatHeaderMode) => void;
  onExitConversation?: () => void;
  onHistory?: () => void;
  onCalendar?: () => void;
}) {
  return (
    <AppHeader
      centerContent={
        <ChatModeSwitcher value={activeMode} onChange={onModeChange} />
      }
      centerStyle={styles.chatModeHeaderSlot}
      hideRightControl={!conversation}
      historyAccessibilityLabel="История чатов"
      onHistory={onHistory}
      onCalendar={onCalendar}
      onRightAction={onExitConversation}
      rightAccessibilityLabel={
        conversation ? 'Вернуться к началу чата' : undefined
      }
      rightContent={
        conversation ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.conversationExitIcon,
              conversationIconProgress
                ? {
                    opacity: conversationIconProgress.interpolate({
                      inputRange: [0, 0.3, 1],
                      outputRange: [0, 0, 1],
                    }),
                    transform: [
                      {
                        scale: conversationIconProgress.interpolate({
                          inputRange: [0, 0.3, 1],
                          outputRange: [0.72, 0.72, 1],
                        }),
                      },
                    ],
                  }
                : undefined,
            ]}
          >
            <ChatExitArrowIcon width={22} height={22} />
          </Animated.View>
        ) : undefined
      }
    />
  );
}

export type ChatHistoryItem = {
  id: string;
  lastMessageAt: number;
  title: string;
  pinned?: boolean;
};

type ChatPopupMenuAction = {
  id: string;
  label: string;
  symbol: SFSymbol;
  destructive?: boolean;
  onPress?: () => void;
};

function ChatTrashIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M4.5 6.5h15M9 6.5V4.75c0-.69.56-1.25 1.25-1.25h3.5c.69 0 1.25.56 1.25 1.25V6.5m-7.75 0 .8 12.25c.05.98.87 1.75 1.85 1.75h4.2c.98 0 1.8-.77 1.85-1.75l.8-12.25M10 10v6.5M14 10v6.5"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChatPopupMenu({
  visible,
  actions,
  origin = 'bottomLeft',
  shadowless = false,
  style,
}: {
  visible: boolean;
  actions: ChatPopupMenuAction[];
  origin?: 'bottomLeft' | 'topRight';
  shadowless?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const menuProgress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [menuRendered, setMenuRendered] = useState(visible);
  const menuContentHeight = actions.length * 66;
  const menuHeight = menuContentHeight + 24;

  useEffect(() => {
    if (visible) {
      setMenuRendered(true);
      menuProgress.setValue(0);
    } else if (!menuRendered) {
      return undefined;
    }

    const animation = visible
      ? Animated.spring(menuProgress, {
          toValue: 1,
          damping: 24,
          stiffness: 360,
          mass: 0.52,
          overshootClamping: false,
          restDisplacementThreshold: 0.001,
          restSpeedThreshold: 0.001,
          useNativeDriver: true,
        })
      : Animated.timing(menuProgress, {
          toValue: 0,
          duration: 125,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        });

    animation.start(({ finished }) => {
      if (finished && !visible) setMenuRendered(false);
    });
    return () => animation.stop();
  }, [menuProgress, menuRendered, visible]);

  if (!menuRendered) return null;

  const opensFromTopRight = origin === 'topRight';

  return (
    <Animated.View
      accessibilityViewIsModal={visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.attachmentMenuWrap,
        shadowless && styles.popupMenuShadowless,
        style,
        {
          transformOrigin: opensFromTopRight ? '100% 0%' : undefined,
          transform: [
            {
              translateX: menuProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [opensFromTopRight ? -34 : -20, 0],
              }),
            },
            {
              translateY: menuProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [opensFromTopRight ? -26 : 20, 0],
              }),
            },
            {
              scale: menuProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0.84, 1],
              }),
            },
          ],
        },
      ]}
    >
      <ChatComposerGlass
        forceFallback={shadowless}
        radius={40}
        tintColor="rgba(255,255,255,0.42)"
        style={[
          styles.attachmentMenuGlass,
          { height: menuHeight },
          shadowless && styles.popupMenuShadowless,
        ]}
      >
        <View />
      </ChatComposerGlass>

      <View
        style={[styles.attachmentMenuContent, { height: menuContentHeight }]}
      >
        {actions.map((action) => (
          <View key={action.id} style={styles.attachmentMenuRowSlot}>
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel={action.label}
              focusable
              importantForAccessibility="yes"
              testID={`chat-popup-${action.id}`}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.attachmentMenuItem,
                pressed && styles.attachmentMenuItemPressed,
              ]}
            >
              <View style={styles.attachmentMenuIcon}>
                {action.symbol === 'trash' ? (
                  <ChatTrashIcon
                    color={
                      action.destructive
                        ? colors.state.error
                        : colors.text.primary
                    }
                  />
                ) : (
                  <SymbolView
                    name={action.symbol}
                    size={20}
                    tintColor={
                      action.destructive
                        ? colors.state.error
                        : colors.text.primary
                    }
                    weight="medium"
                    fallback={
                      <Text style={styles.attachmentFallbackIcon}>●</Text>
                    }
                  />
                )}
              </View>
              <Text
                accessible={false}
                importantForAccessibility="no"
                style={[
                  styles.attachmentMenuLabel,
                  action.destructive && styles.popupMenuLabelDestructive,
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

export function ChatDeleteActionPreview({ onPress }: { onPress?: () => void }) {
  return (
    <ChatPopupMenu
      actions={[
        {
          id: 'delete-preview',
          label: 'Удалить',
          symbol: 'trash',
          destructive: true,
          onPress,
        },
      ]}
      visible
      shadowless
    />
  );
}

function ChatHistoryActionMenu({
  visible,
  pinned,
  onRename,
  onDelete,
  onPin,
}: {
  visible: boolean;
  pinned?: boolean;
  onRename?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
}) {
  const actions: ChatPopupMenuAction[] = [
    {
      id: 'rename',
      label: 'Переименовать',
      symbol: 'pencil',
      onPress: onRename,
    },
    {
      id: 'pin',
      label: pinned ? 'Открепить' : 'Закрепить',
      symbol: pinned ? 'pin.slash' : 'pin',
      onPress: onPin,
    },
    {
      id: 'delete',
      label: 'Удалить',
      symbol: 'trash',
      destructive: true,
      onPress: onDelete,
    },
  ];

  return (
    <ChatPopupMenu
      actions={actions}
      origin="topRight"
      shadowless
      style={styles.historyActionMenuWrap}
      visible={visible}
    />
  );
}

export function ChatHistoryPanel({
  emptyText = 'У вас пока нет чатов',
  items,
  onSelect,
  onRename,
  onDelete,
  onPin,
  selectedId,
  title = 'Недавнее',
  topInset = 0,
  width,
}: {
  emptyText?: string;
  items: ChatHistoryItem[];
  onSelect?: (item: ChatHistoryItem) => void;
  onRename?: (item: ChatHistoryItem) => void;
  onDelete?: (item: ChatHistoryItem) => void;
  onPin?: (item: ChatHistoryItem) => void;
  selectedId?: string;
  title?: string;
  topInset?: number;
  width: number;
}) {
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const selectionPosition = useRef(
    new Animated.Value(Math.max(0, selectedIndex)),
  ).current;
  const selectionOpacity = useRef(
    new Animated.Value(selectedIndex >= 0 ? 1 : 0),
  ).current;
  const displayedSelectionIndex = useRef(selectedIndex);
  const selectionTransitionVersion = useRef(0);
  const [reduceSelectionMotion, setReduceSelectionMotion] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceSelectionMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceSelectionMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const transitionVersion = selectionTransitionVersion.current + 1;
    selectionTransitionVersion.current = transitionVersion;
    selectionOpacity.stopAnimation();

    if (selectedIndex < 0) {
      displayedSelectionIndex.current = -1;
      selectionPosition.setValue(0);
      selectionOpacity.setValue(0);
      return undefined;
    }

    if (reduceSelectionMotion) {
      displayedSelectionIndex.current = selectedIndex;
      selectionPosition.setValue(selectedIndex);
      selectionOpacity.setValue(1);
      return undefined;
    }

    if (displayedSelectionIndex.current === selectedIndex) {
      selectionOpacity.setValue(1);
      return undefined;
    }

    const fadeOut = Animated.timing(selectionOpacity, {
      toValue: 0,
      duration: 120,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });

    fadeOut.start(({ finished }) => {
      if (
        !finished ||
        selectionTransitionVersion.current !== transitionVersion
      ) {
        return;
      }

      displayedSelectionIndex.current = selectedIndex;
      selectionPosition.setValue(selectedIndex);
      selectionOpacity.setValue(0);

      Animated.timing(selectionOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      fadeOut.stop();
      selectionOpacity.stopAnimation();
    };
  }, [
    reduceSelectionMotion,
    selectedIndex,
    selectionOpacity,
    selectionPosition,
  ]);

  return (
    <View
      accessibilityLabel="Недавние чаты"
      style={[styles.historyPanel, { width, paddingTop: topInset + 32 }]}
    >
      <Text
        style={[
          styles.historyBrand,
          Platform.OS === 'android' && styles.historyBrandAndroid,
        ]}
      >
        сфера.
      </Text>

      <AppText weight="semibold" style={styles.historyTitle}>
        {title}
      </AppText>

      {items.length === 0 ? (
        <View style={styles.historyEmptyState}>
          <AppText
            color={colors.text.secondary}
            role="body"
            style={styles.historyEmptyText}
          >
            {emptyText}
          </AppText>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={[styles.historyScroll, { width: Math.max(width - 40, 0) }]}
          contentContainerStyle={styles.historyList}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.historySelectionIndicator,
              {
                opacity: selectionOpacity,
                width: Math.max(width - 52, 0),
                transform: [
                  {
                    translateY: Animated.multiply(selectionPosition, 48),
                  },
                ],
              },
            ]}
          />
          {items.map((item, index) => {
            const selected = item.id === selectedId;
            const menuVisible = item.id === actionMenuId;
            return (
              <View
                key={item.id}
                style={[
                  styles.historyItem,
                  selected && styles.historyItemSelected,
                  menuVisible && styles.historyItemMenuOpen,
                  {
                    width: Math.max(width - 52, 0),
                    marginBottom: index === items.length - 1 ? 0 : 4,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Открыть чат: ${item.title}`}
                  accessibilityState={{ selected }}
                  onPress={() => onSelect?.(item)}
                  style={[
                    styles.historyItemPressable,
                    selected && styles.historyItemPressableSelected,
                  ]}
                >
                  <AppText
                    numberOfLines={1}
                    role="body"
                    color={colors.text.primary}
                    weight="regular"
                    style={styles.historyItemText}
                  >
                    {item.title}
                  </AppText>
                </Pressable>
                {selected ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Действия с чатом: ${item.title}`}
                    accessibilityState={{ expanded: menuVisible }}
                    hitSlop={6}
                    onPress={() => {
                      setActionMenuId((current) =>
                        current === item.id ? null : item.id,
                      );
                    }}
                    style={({ pressed }) => [
                      styles.historyMoreButton,
                      pressed && styles.historyMoreButtonPressed,
                    ]}
                  >
                    <SymbolView
                      name="ellipsis"
                      size={19}
                      tintColor={colors.text.primary}
                      weight="semibold"
                      fallback={
                        <Text style={styles.historyMoreFallback}>•••</Text>
                      }
                    />
                  </Pressable>
                ) : null}

                <ChatHistoryActionMenu
                  visible={menuVisible}
                  pinned={item.pinned}
                  onRename={() => {
                    setActionMenuId(null);
                    onRename?.(item);
                  }}
                  onDelete={() => {
                    setActionMenuId(null);
                    onDelete?.(item);
                  }}
                  onPin={() => {
                    setActionMenuId(null);
                    onPin?.(item);
                  }}
                />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function ChatGlassAddButton({ onPress }: { onPress?: () => void }) {
  return (
    <ChatComposerGlass style={styles.addButton}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить вложение"
        onPress={onPress}
        style={styles.composerPressTarget}
      >
        <PlusIcon width={20} height={20} />
      </Pressable>
    </ChatComposerGlass>
  );
}

export function ChatEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.emptyState, compact && styles.emptyStateCompact]}>
      <Image
        accessibilityLabel="Сферка — защитница женского здоровья"
        source={mascotImage}
        resizeMode="contain"
        style={[styles.mascot, compact && styles.mascotCompact]}
      />
      <View style={styles.brand}>
        <Text
          style={[
            styles.brandTitle,
            Platform.OS === 'android' && styles.brandTitleAndroid,
          ]}
        >
          сферка.
        </Text>
        <AppText
          role="heading"
          color={colors.brand.primarySoft}
          style={styles.brandTagline}
        >
          Защитница женского здоровья
        </AppText>
      </View>
    </View>
  );
}

export function ChatSuggestionList({
  suggestions,
  onSelect,
}: {
  suggestions: ChatSuggestion[];
  onSelect?: (suggestion: ChatSuggestion) => void;
}) {
  return (
    <View style={styles.suggestions}>
      {suggestions.map((suggestion) => {
        const Icon = suggestionIcons[suggestion.icon];
        return (
          <Pressable
            key={suggestion.id}
            accessibilityRole="button"
            accessibilityLabel={suggestion.title}
            onPress={() => onSelect?.(suggestion)}
            style={styles.suggestion}
          >
            <View style={styles.suggestionIconSlot}>
              <Icon width={24} height={24} />
            </View>
            <AppText
              numberOfLines={1}
              role="caption"
              color="#5C5C5C"
              style={styles.suggestionText}
            >
              {suggestion.title}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChatAttachmentMenu({
  visible,
  onCamera,
  onImage,
  onFile,
}: {
  visible: boolean;
  onCamera?: () => void;
  onImage?: () => void;
  onFile?: () => void;
}) {
  const actions: ChatPopupMenuAction[] = [
    { id: 'camera', label: 'Камера', symbol: 'camera.fill', onPress: onCamera },
    { id: 'image', label: 'Фото', symbol: 'photo', onPress: onImage },
    { id: 'file', label: 'Файлы', symbol: 'paperclip', onPress: onFile },
  ];

  return <ChatPopupMenu actions={actions} visible={visible} />;
}

export type ChatSendButtonVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const chatSendButtonVariants: Array<{
  variant: ChatSendButtonVariant;
  label: string;
}> = [
  { variant: 1, label: 'Бордовая' },
  { variant: 2, label: 'Розовая' },
  { variant: 3, label: 'Графитовая' },
  { variant: 4, label: 'Мягкая' },
  { variant: 5, label: 'Контурная' },
  { variant: 6, label: 'Liquid Glass' },
  { variant: 7, label: 'Градиентная' },
  { variant: 8, label: 'Приподнятая' },
  { variant: 9, label: 'Позитивная' },
  { variant: 10, label: 'Акцентное кольцо' },
];

function ChatSendArrow({ color }: { color: string }) {
  return (
    <SymbolView
      name="arrow.up"
      size={18}
      tintColor={color}
      weight="semibold"
      fallback={<Text style={[styles.sendFallback, { color }]}>↑</Text>}
    />
  );
}

export function ChatSendButtonPreview({
  variant,
  onPress,
}: {
  variant: ChatSendButtonVariant;
  onPress?: () => void;
}) {
  if (variant === 6) {
    return (
      <ChatComposerGlass
        tintColor="rgba(255,255,255,0.34)"
        style={[styles.sendVariantButton, styles.sendVariantGlass]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отправить сообщение"
          onPress={onPress}
          style={({ pressed }) => [
            styles.sendVariantPressTarget,
            pressed && styles.sendVariantPressed,
          ]}
        >
          <ChatSendArrow color={colors.brand.primary} />
        </Pressable>
      </ChatComposerGlass>
    );
  }

  const foreground =
    variant === 4 || variant === 5 || variant === 8 || variant === 10
      ? colors.brand.burgundy
      : colors.text.inverse;
  const visualStyle =
    variant === 1
      ? styles.sendVariant1
      : variant === 2
        ? styles.sendVariant2
        : variant === 3
          ? styles.sendVariant3
          : variant === 4
            ? styles.sendVariant4
            : variant === 5
              ? styles.sendVariant5
              : variant === 7
                ? styles.sendVariant7
                : variant === 8
                  ? styles.sendVariant8
                  : variant === 9
                    ? styles.sendVariant9
                    : styles.sendVariant10;

  return (
    <View style={[styles.sendVariantButton, visualStyle]}>
      {variant === 7 ? (
        <LinearGradient
          colors={[colors.brand.primarySoft, colors.brand.burgundy]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sendVariantGradient}
        />
      ) : null}
      {variant === 10 ? <View style={styles.sendVariantInnerRing} /> : null}
      <ChatSendArrow color={foreground} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Отправить сообщение"
        onPress={onPress}
        style={({ pressed }) => [
          styles.sendVariantPressTarget,
          pressed && styles.sendVariantPressedOverlay,
        ]}
      />
    </View>
  );
}

export function ChatSendButtonVariantsCatalog() {
  return (
    <View style={styles.sendVariantsGrid}>
      {chatSendButtonVariants.map((item) => (
        <View key={item.variant} style={styles.sendVariantCard}>
          <View style={styles.sendVariantStage}>
            <ChatSendButtonPreview variant={item.variant} />
          </View>
          <AppText role="caption" weight="medium">
            {String(item.variant).padStart(2, '0')} / {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function ChatComposer({
  value,
  disabled = false,
  onChangeText,
  onSubmit,
  onAdd,
  onVoice,
  onFocus,
  onBlur,
}: {
  value: string;
  disabled?: boolean;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  onAdd?: () => void;
  onVoice?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const [canSubmit, setCanSubmit] = useState(
    () => !disabled && value.trim().length > 0,
  );
  const actionProgress = useRef(new Animated.Value(canSubmit ? 1 : 0)).current;

  useEffect(() => {
    setCanSubmit(!disabled && value.trim().length > 0);
  }, [disabled, value]);

  useEffect(() => {
    const animation = Animated.timing(actionProgress, {
      toValue: canSubmit ? 1 : 0,
      duration: 220,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });

    animation.start();
    return () => animation.stop();
  }, [actionProgress, canSubmit]);

  return (
    <View style={styles.composerRow}>
      <ChatGlassAddButton onPress={onAdd} />

      <ChatComposerGlass radius={23} style={styles.composer}>
        <TextInput
          accessibilityLabel="Сообщение для Сферки"
          accessibilityState={{ disabled }}
          value={value}
          editable={!disabled}
          onChangeText={(nextValue) => {
            setCanSubmit(!disabled && nextValue.trim().length > 0);
            onChangeText(nextValue);
          }}
          placeholder="Спросить Сферку"
          placeholderTextColor="#5C5C5C"
          multiline
          maxLength={1200}
          returnKeyType="send"
          blurOnSubmit={false}
          onFocus={onFocus}
          onBlur={onBlur}
          onSubmitEditing={() => {
            if (canSubmit) onSubmit?.();
          }}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            canSubmit ? 'Отправить сообщение' : 'Голосовой ввод'
          }
          onPress={canSubmit ? onSubmit : onVoice}
          disabled={disabled}
          style={[
            styles.actionButton,
            disabled && styles.composerActionDisabled,
          ]}
        >
          <ChatComposerGlass
            tintColor="rgba(255,255,255,0.34)"
            style={styles.sendButtonGlass}
          >
            <View />
          </ChatComposerGlass>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.sendButtonBackground,
              {
                opacity: actionProgress,
              },
            ]}
          />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.actionIcon,
              {
                opacity: actionProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
                transform: [
                  {
                    scale: actionProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 0.84],
                    }),
                  },
                ],
              },
            ]}
          >
            <VoiceIcon
              color={colors.brand.primary}
              width={17.4}
              height={17.4}
            />
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.actionIcon,
              {
                opacity: actionProgress,
                transform: [
                  {
                    translateY: actionProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [4, 0],
                    }),
                  },
                  {
                    scale: actionProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.78, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <SymbolView
              name="arrow.up"
              size={18}
              tintColor={colors.text.inverse}
              weight="semibold"
              fallback={
                <Text
                  style={[styles.sendFallback, { color: colors.text.inverse }]}
                >
                  ↑
                </Text>
              }
            />
          </Animated.View>
        </Pressable>
      </ChatComposerGlass>
    </View>
  );
}

export function ChatMessageBubble({
  allowExternalLinks = true,
  children,
  assistant = false,
  errorText,
  isThinking = false,
  markdown = false,
  onCopy,
  onRetry,
  onShare,
  onSourcePress,
  reduceMotion = false,
  sources = [],
  variant = 1,
}: {
  allowExternalLinks?: boolean;
  children: ReactNode;
  assistant?: boolean;
  errorText?: string;
  isThinking?: boolean;
  markdown?: boolean;
  onCopy?: () => void;
  onRetry?: () => void;
  onShare?: () => void;
  onSourcePress?: (source: {
    source: 'journal' | 'test' | 'document' | 'chat' | 'care-plan';
    localId: string;
    label: string;
  }) => void;
  reduceMotion?: boolean;
  sources?: Array<{
    source: 'journal' | 'test' | 'document' | 'chat' | 'care-plan';
    localId: string;
    label: string;
    occurredAt?: number;
    stale?: boolean;
    unverified?: boolean;
  }>;
  variant?: ChatMessageVariant;
}) {
  const config = chatMessageVariantConfigs[variant];
  const responseProgress = useRef(
    new Animated.Value(isThinking ? 0 : 1),
  ).current;
  const actions = [
    onCopy
      ? {
          label: assistant ? 'Копировать ответ' : 'Копировать сообщение',
          symbol: assistant
            ? config.assistantActions[0]
            : config.userActions[0],
          customIcon: config.customIcons ? ('copy' as const) : undefined,
          onPress: onCopy,
        }
      : undefined,
    assistant && onShare
      ? {
          label: 'Поделиться ответом',
          symbol: config.assistantActions[1],
          customIcon: config.customIcons ? ('export' as const) : undefined,
          onPress: onShare,
        }
      : undefined,
  ].filter((action) => action !== undefined);
  const markdownStyles: Partial<MarkdownStyles> = {
    body: {
      color: colors.text.primary,
      fontFamily: fonts.sfRegular,
      fontSize: config.messageFontSize,
      lineHeight: config.messageLineHeight,
      letterSpacing: config.messageLetterSpacing,
    },
    text: {
      color: colors.text.primary,
      fontFamily: fonts.sfRegular,
      fontSize: config.messageFontSize,
      lineHeight: config.messageLineHeight,
      letterSpacing: config.messageLetterSpacing,
    },
    paragraph: { marginTop: 0, marginBottom: 10 },
    heading1: {
      fontFamily: fonts.sfSemibold,
      fontSize: config.messageFontSize + 6,
      lineHeight: config.messageLineHeight + 7,
      marginTop: 10,
      marginBottom: 8,
    },
    heading2: {
      fontFamily: fonts.sfSemibold,
      fontSize: config.messageFontSize + 4,
      lineHeight: config.messageLineHeight + 5,
      marginTop: 8,
      marginBottom: 7,
    },
    heading3: {
      fontFamily: fonts.sfSemibold,
      fontSize: config.messageFontSize + 2,
      lineHeight: config.messageLineHeight + 3,
      marginTop: 7,
      marginBottom: 6,
    },
    strong: { fontFamily: fonts.sfSemibold },
    em: { fontStyle: 'italic' },
    link: { color: colors.brand.primary, textDecorationLine: 'underline' },
    blockquote: {
      borderLeftColor: colors.brand.primarySoft,
      borderLeftWidth: 3,
      paddingLeft: 12,
      marginVertical: 8,
    },
    codeInline: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      backgroundColor: '#F3F0F1',
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    codeBlock: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: Math.max(13, config.messageFontSize - 2),
      lineHeight: config.messageLineHeight,
      backgroundColor: '#F3F0F1',
      borderRadius: 10,
      padding: 12,
    },
    fence: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: Math.max(13, config.messageFontSize - 2),
      lineHeight: config.messageLineHeight,
      backgroundColor: '#F3F0F1',
      borderRadius: 10,
      padding: 12,
    },
    list: { marginVertical: 6 },
    listItem: { marginVertical: 2 },
  };

  useEffect(() => {
    if (isThinking) {
      responseProgress.setValue(0);
      return undefined;
    }

    if (reduceMotion) {
      responseProgress.setValue(1);
      return undefined;
    }

    const animation = Animated.timing(responseProgress, {
      toValue: 1,
      duration: 380,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [isThinking, reduceMotion, responseProgress]);

  if (assistant && isThinking) {
    return (
      <View style={[styles.assistantMessage, { gap: config.assistantGap }]}>
        <ChatThinkingIndicator
          customIcon={config.customIcons}
          iconSize={config.thinkingIconSize}
          reduceMotion={reduceMotion}
          textFontSize={config.thinkingFontSize}
          textLineHeight={config.thinkingLineHeight}
          textWeight={config.thinkingWeight}
          thinkingGap={config.thinkingGap}
          thinkingSymbol={config.thinkingSymbol}
        />
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        assistant ? styles.assistantMessage : styles.userMessage,
        assistant
          ? { gap: config.assistantGap }
          : { gap: config.userGap, maxWidth: config.userMaxWidth },
        assistant
          ? {
              opacity: responseProgress,
              transform: [
                {
                  translateY: responseProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            }
          : undefined,
      ]}
    >
      {assistant ? (
        <View style={[styles.thinkingRow, { gap: config.thinkingGap }]}>
          {config.customIcons ? (
            <CustomMessageIcon kind="brain" size={config.thinkingIconSize} />
          ) : (
            <SymbolView
              name={config.thinkingSymbol}
              size={config.thinkingIconSize}
              tintColor={colors.text.primary}
              weight="medium"
              fallback={<Text style={styles.messageFallbackIcon}>✣</Text>}
            />
          )}
          <AppText
            weight={config.thinkingWeight}
            style={[
              styles.thinkingText,
              {
                fontSize: config.thinkingFontSize,
                lineHeight: config.thinkingLineHeight,
              },
            ]}
          >
            Ответ Сферки
          </AppText>
        </View>
      ) : null}

      <View
        style={
          assistant
            ? undefined
            : [
                styles.userBubble,
                {
                  paddingHorizontal: config.bubblePaddingHorizontal,
                  paddingVertical: config.bubblePaddingVertical,
                  borderRadius: config.bubbleRadius,
                },
              ]
        }
      >
        {errorText ? (
          <View style={styles.messageErrorBox}>
            <AppText style={styles.messageErrorText}>{errorText}</AppText>
            {onRetry ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Повторить отправку"
                onPress={onRetry}
                style={styles.messageRetryButton}
              >
                <AppText weight="semibold" style={styles.messageRetryText}>
                  Повторить
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : markdown && typeof children === 'string' ? (
          <Markdown
            allowedImageHandlers={[]}
            defaultImageHandler={null}
            markdownit={safeMarkdown}
            rules={
              allowExternalLinks
                ? safeMarkdownRules
                : {
                    ...safeMarkdownRules,
                    link: (_node, children) => <Text>{children}</Text>,
                    blocklink: (_node, children) => <Text>{children}</Text>,
                  }
            }
            style={markdownStyles}
            onLinkPress={(url) => {
              if (allowExternalLinks && isAllowedChatMarkdownLink(url))
                void Linking.openURL(url);
              return false;
            }}
          >
            {children}
          </Markdown>
        ) : (
          <AppText
            style={[
              styles.messageText,
              {
                fontSize: config.messageFontSize,
                lineHeight: config.messageLineHeight,
                letterSpacing: config.messageLetterSpacing,
              },
            ]}
          >
            {children}
          </AppText>
        )}
      </View>

      {assistant && !errorText && sources.length ? (
        <View style={styles.messageSources}>
          {sources.slice(0, 6).map((source) => (
            <Pressable
              key={`${source.localId}:${source.label}`}
              accessibilityRole={onSourcePress ? 'button' : undefined}
              accessibilityLabel={`Открыть источник: ${source.label}`}
              disabled={!onSourcePress}
              onPress={() => onSourcePress?.(source)}
              style={styles.messageSourceChip}
            >
              <AppText
                role="caption"
                numberOfLines={1}
                style={styles.messageSourceText}
              >
                {source.unverified ? 'Не проверено · ' : ''}
                {source.stale ? 'Старая запись · ' : ''}
                {source.label}
                {source.occurredAt
                  ? ` · ${new Date(source.occurredAt).toLocaleDateString(
                      'ru-RU',
                      {
                        day: 'numeric',
                        month: 'short',
                      },
                    )}`
                  : ''}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {actions.length > 0 && !errorText ? (
        <View
          style={[
            assistant ? styles.assistantActions : styles.userActions,
            {
              gap: assistant ? config.assistantActionGap : config.userActionGap,
            },
          ]}
        >
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={styles.messageAction}
            >
              {action.customIcon ? (
                <CustomMessageIcon
                  kind={action.customIcon}
                  size={config.actionIconSize}
                />
              ) : (
                <SymbolView
                  name={action.symbol}
                  size={config.actionIconSize}
                  tintColor={colors.text.primary}
                  weight="regular"
                  fallback={<Text style={styles.messageFallbackIcon}>□</Text>}
                />
              )}
            </Pressable>
          ))}
        </View>
      ) : null}
    </Animated.View>
  );
}

function ChatThinkingIndicator({
  customIcon,
  iconSize,
  reduceMotion,
  textFontSize,
  textLineHeight,
  textWeight,
  thinkingGap,
  thinkingSymbol,
}: {
  customIcon?: boolean;
  iconSize: number;
  reduceMotion: boolean;
  textFontSize: number;
  textLineHeight: number;
  textWeight: 'regular' | 'medium' | 'semibold';
  thinkingGap: number;
  thinkingSymbol: SFSymbol;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion]);

  const dotOpacities = [0, 1, 2].map((index) =>
    progress.interpolate({
      inputRange: [0, 0.16 + index * 0.18, 0.34 + index * 0.18, 1],
      outputRange: [0.24, 0.24, 1, 0.24],
    }),
  );

  return (
    <View style={[styles.thinkingRow, { gap: thinkingGap }]}>
      <Animated.View
        style={
          reduceMotion
            ? undefined
            : {
                opacity: progress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.58, 1, 0.58],
                }),
                transform: [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.92, 1.06, 0.92],
                    }),
                  },
                ],
              }
        }
      >
        {customIcon ? (
          <CustomMessageIcon kind="brain" size={iconSize} />
        ) : (
          <SymbolView
            name={thinkingSymbol}
            size={iconSize}
            tintColor={colors.text.primary}
            weight="medium"
            fallback={<Text style={styles.messageFallbackIcon}>✣</Text>}
          />
        )}
      </Animated.View>

      <View style={styles.thinkingPendingCopy}>
        <AppText
          weight={textWeight}
          style={[
            styles.thinkingText,
            { fontSize: textFontSize, lineHeight: textLineHeight },
          ]}
        >
          Сферка думает
        </AppText>
        <View style={styles.thinkingDots}>
          {dotOpacities.map((opacity, index) => (
            <Animated.View
              key={index}
              style={[styles.thinkingDot, { opacity }]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

type CustomMessageIconKind = 'brain' | 'copy' | 'edit' | 'export' | 'report';

const customMessageIcons = {
  brain: MessageBrainIcon,
  copy: MessageCopyIcon,
  edit: MessageEditIcon,
  export: MessageExportIcon,
  report: MessageReportIcon,
} as const;

function CustomMessageIcon({
  kind,
  size,
}: {
  kind: CustomMessageIconKind;
  size: number;
}) {
  const Icon = customMessageIcons[kind];
  return <Icon width={size} height={size} />;
}

export type ChatMessageVariant =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;

type ChatMessageVariantConfig = {
  label: string;
  customIcons?: boolean;
  thinkingSymbol: SFSymbol;
  userActions: readonly [SFSymbol, SFSymbol];
  assistantActions: readonly [SFSymbol, SFSymbol, SFSymbol];
  messageFontSize: number;
  messageLineHeight: number;
  messageLetterSpacing: number;
  thinkingFontSize: number;
  thinkingLineHeight: number;
  thinkingWeight: 'regular' | 'medium' | 'semibold';
  thinkingIconSize: number;
  actionIconSize: number;
  bubblePaddingHorizontal: number;
  bubblePaddingVertical: number;
  bubbleRadius: number;
  userGap: number;
  assistantGap: number;
  thinkingGap: number;
  userActionGap: number;
  assistantActionGap: number;
  userMaxWidth: `${number}%`;
};

const chatMessageVariantConfigs: Record<
  ChatMessageVariant,
  ChatMessageVariantConfig
> = {
  1: {
    label: 'Референс',
    thinkingSymbol: 'brain.head.profile',
    userActions: ['doc.on.doc', 'square.and.pencil'],
    assistantActions: ['doc.on.doc', 'square.and.arrow.up', 'flag'],
    messageFontSize: 17,
    messageLineHeight: 22,
    messageLetterSpacing: -0.34,
    thinkingFontSize: 15,
    thinkingLineHeight: 18,
    thinkingWeight: 'medium',
    thinkingIconSize: 19,
    actionIconSize: 21,
    bubblePaddingHorizontal: 18,
    bubblePaddingVertical: 13,
    bubbleRadius: 24,
    userGap: 8,
    assistantGap: 14,
    thinkingGap: 6,
    userActionGap: 14,
    assistantActionGap: 16,
    userMaxWidth: '82%',
  },
  2: {
    label: 'Компактная',
    thinkingSymbol: 'brain',
    userActions: ['square.on.square', 'pencil'],
    assistantActions: ['square.on.square', 'paperplane', 'flag'],
    messageFontSize: 15,
    messageLineHeight: 19,
    messageLetterSpacing: -0.2,
    thinkingFontSize: 13.5,
    thinkingLineHeight: 16,
    thinkingWeight: 'medium',
    thinkingIconSize: 17,
    actionIconSize: 18,
    bubblePaddingHorizontal: 14,
    bubblePaddingVertical: 10,
    bubbleRadius: 20,
    userGap: 5,
    assistantGap: 10,
    thinkingGap: 5,
    userActionGap: 8,
    assistantActionGap: 10,
    userMaxWidth: '76%',
  },
  3: {
    label: 'Крупная editorial',
    thinkingSymbol: 'lightbulb',
    userActions: ['doc.on.clipboard', 'pencil.line'],
    assistantActions: ['doc.on.clipboard', 'square.and.arrow.up', 'flag.fill'],
    messageFontSize: 18,
    messageLineHeight: 24,
    messageLetterSpacing: -0.4,
    thinkingFontSize: 16,
    thinkingLineHeight: 20,
    thinkingWeight: 'semibold',
    thinkingIconSize: 21,
    actionIconSize: 22,
    bubblePaddingHorizontal: 21,
    bubblePaddingVertical: 15,
    bubbleRadius: 27,
    userGap: 10,
    assistantGap: 18,
    thinkingGap: 8,
    userActionGap: 18,
    assistantActionGap: 20,
    userMaxWidth: '88%',
  },
  4: {
    label: 'Плотная системная',
    thinkingSymbol: 'waveform.path.ecg',
    userActions: [
      'rectangle.portrait.on.rectangle.portrait',
      'square.and.pencil',
    ],
    assistantActions: [
      'rectangle.portrait.on.rectangle.portrait',
      'arrowshape.turn.up.right',
      'exclamationmark.bubble',
    ],
    messageFontSize: 16,
    messageLineHeight: 20,
    messageLetterSpacing: -0.25,
    thinkingFontSize: 14,
    thinkingLineHeight: 17,
    thinkingWeight: 'medium',
    thinkingIconSize: 18,
    actionIconSize: 19,
    bubblePaddingHorizontal: 16,
    bubblePaddingVertical: 11,
    bubbleRadius: 18,
    userGap: 4,
    assistantGap: 9,
    thinkingGap: 5,
    userActionGap: 6,
    assistantActionGap: 8,
    userMaxWidth: '80%',
  },
  5: {
    label: 'Воздушная',
    thinkingSymbol: 'sparkles',
    userActions: ['doc.on.doc', 'pencil'],
    assistantActions: ['doc.on.doc', 'paperplane', 'ellipsis.circle'],
    messageFontSize: 17,
    messageLineHeight: 23,
    messageLetterSpacing: -0.3,
    thinkingFontSize: 15,
    thinkingLineHeight: 19,
    thinkingWeight: 'regular',
    thinkingIconSize: 20,
    actionIconSize: 20,
    bubblePaddingHorizontal: 20,
    bubblePaddingVertical: 14,
    bubbleRadius: 26,
    userGap: 13,
    assistantGap: 22,
    thinkingGap: 9,
    userActionGap: 22,
    assistantActionGap: 24,
    userMaxWidth: '84%',
  },
  6: {
    label: 'Микроиконки',
    thinkingSymbol: 'circle.dotted',
    userActions: ['square.on.square', 'pencil.line'],
    assistantActions: ['square.on.square', 'link', 'flag'],
    messageFontSize: 18,
    messageLineHeight: 23,
    messageLetterSpacing: -0.36,
    thinkingFontSize: 14,
    thinkingLineHeight: 17,
    thinkingWeight: 'medium',
    thinkingIconSize: 16,
    actionIconSize: 16,
    bubblePaddingHorizontal: 18,
    bubblePaddingVertical: 12,
    bubbleRadius: 23,
    userGap: 7,
    assistantGap: 13,
    thinkingGap: 5,
    userActionGap: 12,
    assistantActionGap: 14,
    userMaxWidth: '86%',
  },
  7: {
    label: 'Акцент на размышлении',
    thinkingSymbol: 'brain.head.profile',
    userActions: ['doc.on.clipboard', 'square.and.pencil'],
    assistantActions: [
      'doc.on.clipboard',
      'square.and.arrow.up',
      'hand.thumbsdown',
    ],
    messageFontSize: 16.5,
    messageLineHeight: 22,
    messageLetterSpacing: -0.28,
    thinkingFontSize: 17,
    thinkingLineHeight: 21,
    thinkingWeight: 'semibold',
    thinkingIconSize: 22,
    actionIconSize: 20,
    bubblePaddingHorizontal: 17,
    bubblePaddingVertical: 12,
    bubbleRadius: 22,
    userGap: 8,
    assistantGap: 15,
    thinkingGap: 8,
    userActionGap: 13,
    assistantActionGap: 15,
    userMaxWidth: '80%',
  },
  8: {
    label: 'Мягкая pill',
    thinkingSymbol: 'lightbulb',
    userActions: ['rectangle.portrait.on.rectangle.portrait', 'pencil'],
    assistantActions: [
      'rectangle.portrait.on.rectangle.portrait',
      'paperplane',
      'flag',
    ],
    messageFontSize: 17,
    messageLineHeight: 22,
    messageLetterSpacing: -0.32,
    thinkingFontSize: 15,
    thinkingLineHeight: 18,
    thinkingWeight: 'medium',
    thinkingIconSize: 19,
    actionIconSize: 21,
    bubblePaddingHorizontal: 23,
    bubblePaddingVertical: 15,
    bubbleRadius: 31,
    userGap: 9,
    assistantGap: 16,
    thinkingGap: 7,
    userActionGap: 16,
    assistantActionGap: 18,
    userMaxWidth: '85%',
  },
  9: {
    label: 'Сообщение прежде действий',
    thinkingSymbol: 'waveform.path.ecg',
    userActions: ['doc.on.doc', 'pencil.line'],
    assistantActions: ['doc.on.doc', 'link', 'exclamationmark.bubble'],
    messageFontSize: 17.5,
    messageLineHeight: 23,
    messageLetterSpacing: -0.34,
    thinkingFontSize: 14.5,
    thinkingLineHeight: 18,
    thinkingWeight: 'medium',
    thinkingIconSize: 18,
    actionIconSize: 19,
    bubblePaddingHorizontal: 18,
    bubblePaddingVertical: 13,
    bubbleRadius: 24,
    userGap: 3,
    assistantGap: 11,
    thinkingGap: 6,
    userActionGap: 10,
    assistantActionGap: 12,
    userMaxWidth: '83%',
  },
  10: {
    label: 'Крупная доступная',
    thinkingSymbol: 'sparkles',
    userActions: ['square.on.square', 'square.and.pencil'],
    assistantActions: ['square.on.square', 'square.and.arrow.up', 'flag.fill'],
    messageFontSize: 19,
    messageLineHeight: 25,
    messageLetterSpacing: -0.42,
    thinkingFontSize: 16,
    thinkingLineHeight: 20,
    thinkingWeight: 'semibold',
    thinkingIconSize: 22,
    actionIconSize: 23,
    bubblePaddingHorizontal: 21,
    bubblePaddingVertical: 15,
    bubbleRadius: 28,
    userGap: 11,
    assistantGap: 19,
    thinkingGap: 8,
    userActionGap: 18,
    assistantActionGap: 21,
    userMaxWidth: '90%',
  },
  11: {
    label: 'Ультракомпактная',
    customIcons: true,
    thinkingSymbol: 'brain',
    userActions: ['doc.on.doc', 'pencil'],
    assistantActions: ['doc.on.doc', 'paperplane', 'flag'],
    messageFontSize: 14,
    messageLineHeight: 18,
    messageLetterSpacing: -0.16,
    thinkingFontSize: 12.5,
    thinkingLineHeight: 15,
    thinkingWeight: 'medium',
    thinkingIconSize: 16,
    actionIconSize: 17,
    bubblePaddingHorizontal: 12,
    bubblePaddingVertical: 9,
    bubbleRadius: 18,
    userGap: 4,
    assistantGap: 8,
    thinkingGap: 4,
    userActionGap: 5,
    assistantActionGap: 7,
    userMaxWidth: '72%',
  },
  12: {
    label: 'Крупная bubble',
    customIcons: true,
    thinkingSymbol: 'sparkles',
    userActions: ['square.on.square', 'square.and.pencil'],
    assistantActions: ['square.on.square', 'square.and.arrow.up', 'flag.fill'],
    messageFontSize: 20,
    messageLineHeight: 26,
    messageLetterSpacing: -0.46,
    thinkingFontSize: 17,
    thinkingLineHeight: 21,
    thinkingWeight: 'semibold',
    thinkingIconSize: 22,
    actionIconSize: 22,
    bubblePaddingHorizontal: 24,
    bubblePaddingVertical: 16,
    bubbleRadius: 30,
    userGap: 12,
    assistantGap: 20,
    thinkingGap: 9,
    userActionGap: 20,
    assistantActionGap: 22,
    userMaxWidth: '92%',
  },
  13: {
    label: 'Узкая колонка',
    customIcons: true,
    thinkingSymbol: 'lightbulb',
    userActions: ['doc.on.clipboard', 'pencil.line'],
    assistantActions: ['doc.on.clipboard', 'link', 'ellipsis.circle'],
    messageFontSize: 16.5,
    messageLineHeight: 22,
    messageLetterSpacing: -0.28,
    thinkingFontSize: 14.5,
    thinkingLineHeight: 18,
    thinkingWeight: 'medium',
    thinkingIconSize: 18,
    actionIconSize: 19,
    bubblePaddingHorizontal: 17,
    bubblePaddingVertical: 12,
    bubbleRadius: 23,
    userGap: 7,
    assistantGap: 14,
    thinkingGap: 6,
    userActionGap: 11,
    assistantActionGap: 13,
    userMaxWidth: '68%',
  },
  14: {
    label: 'Акцентные действия',
    customIcons: true,
    thinkingSymbol: 'brain.head.profile',
    userActions: ['square.on.square', 'square.and.pencil'],
    assistantActions: [
      'square.on.square',
      'square.and.arrow.up',
      'hand.thumbsdown',
    ],
    messageFontSize: 17,
    messageLineHeight: 22,
    messageLetterSpacing: -0.32,
    thinkingFontSize: 14,
    thinkingLineHeight: 17,
    thinkingWeight: 'regular',
    thinkingIconSize: 18,
    actionIconSize: 24,
    bubblePaddingHorizontal: 18,
    bubblePaddingVertical: 13,
    bubbleRadius: 24,
    userGap: 6,
    assistantGap: 12,
    thinkingGap: 6,
    userActionGap: 4,
    assistantActionGap: 5,
    userMaxWidth: '82%',
  },
  15: {
    label: 'Тихое размышление',
    customIcons: true,
    thinkingSymbol: 'circle.dotted',
    userActions: ['doc.on.doc', 'pencil'],
    assistantActions: ['doc.on.doc', 'paperplane', 'flag'],
    messageFontSize: 18,
    messageLineHeight: 24,
    messageLetterSpacing: -0.38,
    thinkingFontSize: 12,
    thinkingLineHeight: 15,
    thinkingWeight: 'regular',
    thinkingIconSize: 15,
    actionIconSize: 20,
    bubblePaddingHorizontal: 19,
    bubblePaddingVertical: 13,
    bubbleRadius: 25,
    userGap: 8,
    assistantGap: 13,
    thinkingGap: 4,
    userActionGap: 13,
    assistantActionGap: 15,
    userMaxWidth: '86%',
  },
  16: {
    label: 'Крупные иконки',
    customIcons: true,
    thinkingSymbol: 'waveform.path.ecg',
    userActions: ['doc.on.clipboard', 'square.and.pencil'],
    assistantActions: ['doc.on.clipboard', 'square.and.arrow.up', 'flag.fill'],
    messageFontSize: 16,
    messageLineHeight: 21,
    messageLetterSpacing: -0.24,
    thinkingFontSize: 15,
    thinkingLineHeight: 19,
    thinkingWeight: 'medium',
    thinkingIconSize: 24,
    actionIconSize: 25,
    bubblePaddingHorizontal: 17,
    bubblePaddingVertical: 12,
    bubbleRadius: 22,
    userGap: 10,
    assistantGap: 17,
    thinkingGap: 8,
    userActionGap: 17,
    assistantActionGap: 19,
    userMaxWidth: '79%',
  },
  17: {
    label: 'Плотное чтение',
    customIcons: true,
    thinkingSymbol: 'brain',
    userActions: ['rectangle.portrait.on.rectangle.portrait', 'pencil.line'],
    assistantActions: [
      'rectangle.portrait.on.rectangle.portrait',
      'link',
      'exclamationmark.bubble',
    ],
    messageFontSize: 15.5,
    messageLineHeight: 21,
    messageLetterSpacing: -0.22,
    thinkingFontSize: 15,
    thinkingLineHeight: 18,
    thinkingWeight: 'semibold',
    thinkingIconSize: 19,
    actionIconSize: 18,
    bubblePaddingHorizontal: 15,
    bubblePaddingVertical: 10,
    bubbleRadius: 16,
    userGap: 5,
    assistantGap: 9,
    thinkingGap: 5,
    userActionGap: 7,
    assistantActionGap: 9,
    userMaxWidth: '78%',
  },
  18: {
    label: 'Расширенный ритм',
    customIcons: true,
    thinkingSymbol: 'sparkles',
    userActions: ['square.on.square', 'pencil'],
    assistantActions: ['square.on.square', 'paperplane', 'ellipsis.circle'],
    messageFontSize: 17,
    messageLineHeight: 23,
    messageLetterSpacing: -0.3,
    thinkingFontSize: 15,
    thinkingLineHeight: 19,
    thinkingWeight: 'medium',
    thinkingIconSize: 20,
    actionIconSize: 20,
    bubblePaddingHorizontal: 20,
    bubblePaddingVertical: 14,
    bubbleRadius: 27,
    userGap: 16,
    assistantGap: 26,
    thinkingGap: 10,
    userActionGap: 26,
    assistantActionGap: 28,
    userMaxWidth: '84%',
  },
  19: {
    label: 'Контраст масштаба',
    customIcons: true,
    thinkingSymbol: 'lightbulb',
    userActions: ['doc.on.doc', 'square.and.pencil'],
    assistantActions: ['doc.on.doc', 'square.and.arrow.up', 'flag'],
    messageFontSize: 18.5,
    messageLineHeight: 24,
    messageLetterSpacing: -0.4,
    thinkingFontSize: 13,
    thinkingLineHeight: 16,
    thinkingWeight: 'medium',
    thinkingIconSize: 17,
    actionIconSize: 19,
    bubblePaddingHorizontal: 19,
    bubblePaddingVertical: 14,
    bubbleRadius: 26,
    userGap: 7,
    assistantGap: 12,
    thinkingGap: 5,
    userActionGap: 12,
    assistantActionGap: 14,
    userMaxWidth: '88%',
  },
  20: {
    label: 'Максимальная читаемость',
    customIcons: true,
    thinkingSymbol: 'brain.head.profile',
    userActions: ['square.on.square', 'square.and.pencil'],
    assistantActions: ['square.on.square', 'square.and.arrow.up', 'flag.fill'],
    messageFontSize: 21,
    messageLineHeight: 28,
    messageLetterSpacing: -0.48,
    thinkingFontSize: 18,
    thinkingLineHeight: 22,
    thinkingWeight: 'semibold',
    thinkingIconSize: 24,
    actionIconSize: 24,
    bubblePaddingHorizontal: 25,
    bubblePaddingVertical: 17,
    bubbleRadius: 32,
    userGap: 13,
    assistantGap: 22,
    thinkingGap: 10,
    userActionGap: 21,
    assistantActionGap: 24,
    userMaxWidth: '94%',
  },
};

const chatMessageVariants: ChatMessageVariant[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];

export function ChatMessageVariantsCatalog() {
  return (
    <View style={styles.messageVariantsList}>
      {chatMessageVariants.map((variant) => {
        const config = chatMessageVariantConfigs[variant];
        return (
          <View key={variant} style={styles.messageVariantItem}>
            <View style={styles.messageVariantHeading}>
              <AppText role="caption" weight="semibold">
                ВАРИАНТ {String(variant).padStart(2, '0')}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {config.label}
              </AppText>
            </View>
            <View style={styles.messageVariantStage}>
              <ChatMessageBubble variant={variant}>
                Какие анализы нужно сдать?
              </ChatMessageBubble>
              <ChatMessageBubble assistant variant={variant}>
                Я получила ваш вопрос. Сейчас это демонстрация интерфейса:
                медицинский AI и обработка персональных данных пока не
                подключены.
              </ChatMessageBubble>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function ChatKitPreview() {
  const [value, setValue] = useState('');
  const [headerMode, setHeaderMode] = useState<ChatHeaderMode>('chat');
  const suggestions: ChatSuggestion[] = [
    {
      id: 'nutrition',
      title: 'Риски в рационе питания на 4 неделе беременности',
      icon: 'nutrition',
    },
    {
      id: 'clinic',
      title: 'Как выбрать клинику для обследований во время беременности',
      icon: 'clinic',
    },
    {
      id: 'analyses',
      title:
        'Какие анализы обязательно следует сдавать при подготовке к беременности',
      icon: 'analyses',
    },
  ];

  return (
    <View style={styles.preview}>
      <ChatHeader activeMode={headerMode} onModeChange={setHeaderMode} />
      <ChatEmptyState compact />
      <ChatSuggestionList
        suggestions={suggestions}
        onSelect={(suggestion) => setValue(suggestion.title)}
      />
      <ChatComposer
        value={value}
        onChangeText={setValue}
        onSubmit={() => setValue('')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    width: 370,
    alignItems: 'center',
  },
  chatModeHeaderSlot: {
    width: 184,
  },
  conversationExitIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateCompact: {
    transform: [{ scale: 0.84 }],
  },
  mascot: {
    width: 282,
    height: 188,
  },
  mascotCompact: {
    marginBottom: -8,
  },
  brand: {
    width: 288,
    marginTop: -29,
    alignItems: 'center',
    gap: 4,
  },
  brandTitle: {
    color: colors.brand.primarySoft,
    fontFamily: fonts.yaroRegular,
    fontSize: 34.125,
    lineHeight: 37.5,
    letterSpacing: -0.68,
    textAlign: 'center',
  },
  brandTitleAndroid: {
    width: 288,
  },
  brandTagline: {
    width: 288,
    fontSize: 21.5,
    lineHeight: 24,
    letterSpacing: -0.43,
    textAlign: 'center',
  },
  suggestions: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 8,
  },
  suggestion: {
    width: '100%',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestionIconSlot: {
    width: 46,
    height: 28,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionPressed: {
    opacity: motion.pressedOpacity,
    transform: [{ translateX: 2 }],
  },
  suggestionText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 19.2,
    letterSpacing: -0.32,
  },
  attachmentMenuWrap: {
    width: 252,
  },
  attachmentMenuGlass: {
    width: 252,
    height: 222,
    borderRadius: 40,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,198,204,0.52)',
  },
  attachmentMenuContent: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 228,
    height: 198,
    overflow: 'hidden',
    borderRadius: 28,
  },
  attachmentMenuRowSlot: {
    width: 228,
    height: 66,
  },
  attachmentMenuItem: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
  },
  attachmentMenuItemPressed: {
    backgroundColor: 'rgba(33,33,35,0.06)',
  },
  attachmentMenuIcon: {
    position: 'absolute',
    left: 8,
    top: 11,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245,243,243,0.78)',
  },
  attachmentMenuLabel: {
    position: 'absolute',
    left: 68,
    top: 22,
    width: 150,
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 18,
    lineHeight: 21.6,
    letterSpacing: -0.36,
  },
  attachmentFallbackIcon: {
    color: colors.text.primary,
    fontFamily: fonts.sfSemibold,
    fontSize: 17,
    lineHeight: 19,
  },
  composerRow: {
    width: '100%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'android'
      ? androidShadows.control
      : {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 4,
          elevation: 2,
        }),
  },
  composer: {
    flex: 1,
    minHeight: 46,
    maxHeight: 108,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 5.5,
    borderRadius: 23,
    ...(Platform.OS === 'android'
      ? androidShadows.control
      : {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.18,
          shadowRadius: 4,
          elevation: 2,
        }),
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  composerGlassFallback: {
    overflow: 'visible',
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  composerGlassAndroid: {
    ...androidMaterials.light,
    overflow: 'hidden',
  },
  composerGlassAndroidWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
  },
  composerGlassWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  composerPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 35,
    maxHeight: 94,
    paddingHorizontal: 0,
    paddingVertical: Platform.OS === 'ios' ? 7.9 : 0,
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 16,
    lineHeight: 19.2,
    letterSpacing: -0.32,
    textAlign: 'left',
    textAlignVertical: 'center',
  },
  actionButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonBackground: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17.5,
    backgroundColor: colors.brand.primary,
  },
  sendButtonGlass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17.5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.84)',
  },
  actionIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlPressed: {
    opacity: 0.76,
    transform: [{ scale: Platform.OS === 'ios' ? 0.94 : 0.97 }],
  },
  sendFallback: {
    color: colors.text.inverse,
    fontFamily: fonts.sfSemibold,
    fontSize: 17,
    lineHeight: 19,
  },
  sendVariantsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  sendVariantCard: {
    width: '48%',
    gap: 8,
  },
  sendVariantStage: {
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,33,35,0.08)',
  },
  sendVariantButton: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendVariantGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17.5,
  },
  sendVariantPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendVariantPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  sendVariantPressedOverlay: {
    borderRadius: 17.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sendVariant1: {
    backgroundColor: colors.brand.burgundy,
  },
  sendVariant2: {
    backgroundColor: colors.brand.primary,
  },
  sendVariant3: {
    backgroundColor: colors.text.primary,
  },
  sendVariant4: {
    backgroundColor: colors.surface.rose,
  },
  sendVariant5: {
    backgroundColor: colors.surface.raised,
    borderWidth: 1.5,
    borderColor: colors.brand.burgundy,
  },
  sendVariantGlass: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.84)',
  },
  sendVariant7: {
    backgroundColor: colors.brand.primary,
  },
  sendVariant8: {
    backgroundColor: colors.surface.raised,
    shadowColor: colors.brand.burgundy,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 3,
  },
  sendVariant9: {
    backgroundColor: colors.brand.success,
  },
  sendVariant10: {
    backgroundColor: colors.surface.warm,
    borderWidth: 1,
    borderColor: 'rgba(130,53,55,0.34)',
  },
  sendVariantInnerRing: {
    position: 'absolute',
    width: 27,
    height: 27,
    borderRadius: 13.5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.34)',
  },
  userMessage: {
    maxWidth: '82%',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    gap: 8,
  },
  userBubble: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: '#E9E9EA',
  },
  assistantMessage: {
    width: '100%',
    alignSelf: 'flex-start',
    gap: 14,
  },
  messageSources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  messageSourceChip: {
    maxWidth: '100%',
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.15)',
    backgroundColor: '#FFF5F8',
  },
  messageSourceText: {
    maxWidth: 260,
    color: colors.brand.burgundy,
    fontSize: 11.5,
    lineHeight: 14,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  thinkingText: {
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: -0.25,
  },
  messageText: {
    color: colors.text.primary,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.34,
  },
  messageErrorBox: {
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFF2F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.24)',
  },
  messageErrorText: {
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 20,
  },
  messageRetryButton: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: colors.surface.raised,
  },
  messageRetryText: {
    color: colors.brand.burgundy,
    fontSize: 14,
    lineHeight: 17,
  },
  userActions: {
    paddingRight: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  assistantActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  messageAction: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerActionDisabled: {
    opacity: 0.46,
  },
  messageFallbackIcon: {
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 19,
    lineHeight: 22,
  },
  historyPanel: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 32,
    paddingBottom: 32,
    backgroundColor: '#F3F0F1',
  },
  historyBrand: {
    color: colors.brand.primarySoft,
    fontFamily: fonts.yaroRegular,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  historyBrandAndroid: {
    width: 180,
  },
  historyTitle: {
    marginTop: 42,
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.28,
  },
  historyEmptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 96,
  },
  historyEmptyText: {
    fontSize: 15.5,
    lineHeight: 20,
    letterSpacing: -0.22,
    textAlign: 'center',
  },
  historyScroll: {
    marginLeft: -12,
  },
  historyList: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 18,
    paddingBottom: 36,
  },
  historySelectionIndicator: {
    position: 'absolute',
    left: 0,
    top: 18,
    height: 44,
    borderRadius: 18,
    backgroundColor: 'rgba(35,30,32,0.06)',
  },
  historyItem: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: 18,
    overflow: 'visible',
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyItemMenuOpen: {
    zIndex: 20,
  },
  historyItemSelected: {
    paddingRight: 16,
  },
  historyItemPressable: {
    flex: 1,
    height: 44,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  historyItemPressableSelected: {
    paddingRight: 0,
  },
  historyItemText: {
    fontSize: 15.5,
    lineHeight: 20,
    letterSpacing: -0.22,
  },
  historyMoreButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMoreButtonPressed: {
    backgroundColor: 'rgba(33,33,35,0.07)',
  },
  historyMoreFallback: {
    color: colors.text.primary,
    fontFamily: fonts.sfSemibold,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: 1.2,
  },
  historyActionMenuWrap: {
    position: 'absolute',
    right: 0,
    top: 48,
    zIndex: 30,
  },
  popupMenuShadowless: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  popupMenuLabelDestructive: {
    color: colors.state.error,
  },
  thinkingPendingCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  thinkingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingTop: 2,
  },
  thinkingDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.text.primary,
  },
  messageVariantsList: {
    width: '100%',
    gap: 30,
  },
  messageVariantItem: {
    width: '100%',
    gap: 12,
  },
  messageVariantHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  messageVariantStage: {
    width: '100%',
    paddingVertical: 18,
    gap: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
  },
  preview: {
    width: 370,
    minHeight: 720,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
  },
});
