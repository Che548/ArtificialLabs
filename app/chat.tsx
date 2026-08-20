import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useNavigation } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  ChatComposer,
  ChatEmptyState,
  ChatHeader,
  type ChatHeaderMode,
  ChatHistoryPanel,
  type ChatHistoryItem,
  ChatMessageBubble,
  ChatSuggestionList,
  androidTabBarBaseStyle,
  colors,
  getHeaderTop,
  type ChatSuggestion,
  sizes,
} from '../design-system';
import { api } from '../convex/_generated/api';
import {
  buildChatTranscript,
  findUnansweredUserMessage,
} from '../lib/chat-context';
import {
  chatGenerationErrorText,
  type ChatGenerationState,
  transitionChatGeneration,
} from '../lib/chat-generation-state';
import { useHealthStore } from '../lib/health-store';
import type { ChatMessage } from '../lib/health-types';

const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

type ScreenMessage = {
  id: string;
  text: string;
  assistant: boolean;
  conversationLocalId: string;
  state: 'thinking' | 'complete' | 'error';
  retryUserMessageId?: string;
};

type ActiveGeneration = {
  assistantMessageId: string;
  conversationLocalId: string;
  userMessageId: string;
};

type PendingConsentRequest =
  { kind: 'new'; text: string } | { kind: 'retry'; userMessage: ChatMessage };

const PRIVACY_POLICY_URL = 'https://brainwaves.engineering/docs#document-2';

function ConversationOverlay({
  children,
  onRequestClose,
  visible,
}: {
  children: ReactNode;
  onRequestClose: () => void;
  visible: boolean;
}) {
  if (Platform.OS === 'android') {
    if (!visible) return null;

    return <View style={styles.androidConversationOverlay}>{children}</View>;
  }

  return (
    <Modal
      animationType="none"
      transparent
      visible={visible}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      {children}
    </Modal>
  );
}

function AiChatConsentSheet({
  accepting,
  onAccept,
  onCancel,
  visible,
}: {
  accepting: boolean;
  onAccept: () => void;
  onCancel: () => void;
  visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.consentBackdrop}>
        <View accessibilityViewIsModal style={styles.consentSheet}>
          <AppText role="heading" weight="semibold" style={styles.consentTitle}>
            Передача текста в Yandex AI Studio
          </AppText>
          <AppText style={styles.consentBody}>
            Для ответа Сферка отправит ваше сообщение и до 20 последних
            сообщений этого чата через наш сервер в Yandex AI Studio.
            Структурированные данные профиля, анализы и файлы автоматически не
            передаются — отправляется только видимый текст чата. Логирование
            запросов у Yandex отключено. История хранится зашифрованно на
            устройстве и синхронизируется только при включённой облачной
            синхронизации.
          </AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Открыть политику конфиденциальности"
            onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
          >
            <AppText weight="medium" style={styles.consentLink}>
              Политика конфиденциальности
            </AppText>
          </Pressable>
          <View style={styles.consentActions}>
            <Pressable
              accessibilityRole="button"
              disabled={accepting}
              onPress={onCancel}
              style={styles.consentCancelButton}
            >
              <AppText weight="medium">Отмена</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: accepting }}
              disabled={accepting}
              onPress={onAccept}
              style={[
                styles.consentAcceptButton,
                accepting && styles.consentButtonDisabled,
              ]}
            >
              <AppText weight="semibold" color={colors.text.inverse}>
                {accepting ? 'Сохраняем…' : 'Согласиться и отправить'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ChatScreen() {
  const {
    chatConversations,
    chatMessages,
    deleteChatConversation,
    journalEntries,
    labResults,
    markReminderRead,
    profile,
    readOnly,
    reminders,
    saveChatMessage,
    saveConversation,
  } = useHealthStore();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const aiEligible = Platform.OS !== 'web' && isAuthenticated && !readOnly;
  const chatStatus = useQuery(api.chat.status, aiEligible ? {} : 'skip');
  const generateChat = useAction(api.chat.generate);
  const acceptAiConsent = useMutation(api.chat.acceptConsent);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [composerFocused, setComposerFocused] = useState(false);
  const headerMode: ChatHeaderMode = 'chat';
  const [conversationVisible, setConversationVisible] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRendered, setHistoryRendered] = useState(false);
  const [surfaceResetKey, setSurfaceResetKey] = useState(0);
  const [recentChats, setRecentChats] = useState<ChatHistoryItem[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [generationState, setGenerationState] =
    useState<ChatGenerationState>('idle');
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAccepting, setConsentAccepting] = useState(false);
  const [pendingConsentRequest, setPendingConsentRequest] =
    useState<PendingConsentRequest>();
  const compactHeight = window.height < 760;
  const composerBottom =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, 8) + 60 + 12
      : Math.max(insets.bottom, 12) + (!hasNativeLiquidGlass ? 72 : 58);
  const conversationComposerBottom = Math.max(insets.bottom + 4, 16);
  const historyPanelWidth = Math.min(window.width * 0.76, 318);
  const headerTop = getHeaderTop(insets.top);
  const suggestionsVisible = !composerFocused;
  const suggestionsProgress = useRef(new Animated.Value(1)).current;
  const conversationProgress = useRef(new Animated.Value(0)).current;
  const historyProgress = useRef(new Animated.Value(0)).current;
  const conversationScrollRef = useRef<ScrollView>(null);
  const generationInFlight = useRef(false);
  const activeGeneration = useRef<ActiveGeneration | undefined>(undefined);
  const knownUserMessages = useRef(new Map<string, ChatMessage>());
  const chatMessagesRef = useRef(chatMessages);
  const aiReady = aiEligible && chatStatus?.enabled === true;
  const availabilityNotice =
    Platform.OS === 'web'
      ? 'ИИ-чат доступен в приложении для iOS и Android после входа.'
      : authLoading
        ? 'Проверяем доступность ИИ-чата…'
        : !isAuthenticated || readOnly
          ? 'Войдите в аккаунт, чтобы получать ответы Сферки.'
          : !chatStatus
            ? 'Проверяем доступность ИИ-чата…'
            : !chatStatus.enabled
              ? 'ИИ-чат пока выключен администратором.'
              : undefined;
  const persistedRecentChats = useMemo<ChatHistoryItem[]>(
    () =>
      chatConversations
        .filter((conversation) => !conversation.deletedAt)
        .sort((left, right) => right.lastMessageAt - left.lastMessageAt)
        .map((conversation) => ({
          id: conversation.localId,
          title: conversation.title,
        })),
    [chatConversations],
  );

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);
  const activeReminders = useMemo(
    () =>
      reminders
        .filter((reminder) => !reminder.deletedAt && !reminder.readAt)
        .sort((left, right) => left.dueAt - right.dueAt)
        .slice(0, 2),
    [reminders],
  );
  const suggestions = useMemo<ChatSuggestion[]>(() => {
    const today = new Date();
    const hasTodayJournal = journalEntries.some((entry) => {
      if (entry.deletedAt) return false;
      const date = new Date(entry.occurredAt);
      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    });
    const contextual: ChatSuggestion[] = [];

    if (!hasTodayJournal) {
      contextual.push({
        id: 'journal-today',
        title: 'Что важно отметить в дневнике сегодня?',
        icon: 'nutrition',
      });
    }
    if (labResults.filter((item) => !item.deletedAt).length === 0) {
      contextual.push({
        id: 'analyses-context',
        title:
          profile?.goal === 'pregnancy'
            ? 'Какие анализы важны на моём сроке беременности?'
            : 'Какие анализы важны при подготовке к беременности?',
        icon: 'analyses',
      });
    }
    contextual.push({
      id: 'goal-context',
      title:
        profile?.goal === 'pregnancy'
          ? 'Как подготовиться к следующему визиту к врачу?'
          : profile?.goal === 'cycle'
            ? 'Какие изменения цикла стоит обсудить с врачом?'
            : 'Как определить фертильное окно точнее?',
      icon: 'clinic',
    });

    return [
      ...activeReminders.map((reminder) => ({
        id: `reminder:${reminder.localId}`,
        title: `${reminder.title}: ${reminder.body}`,
        icon:
          reminder.type === 'checkup'
            ? ('analyses' as const)
            : ('clinic' as const),
      })),
      ...contextual,
    ].slice(0, 3);
  }, [activeReminders, journalEntries, labResults, profile?.goal]);

  useEffect(() => {
    setRecentChats((current) =>
      persistedRecentChats.map((chat) => ({
        ...chat,
        pinned: current.find((item) => item.id === chat.id)?.pinned,
      })),
    );
  }, [persistedRecentChats]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!conversationVisible) return undefined;

    conversationProgress.stopAnimation();
    conversationProgress.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return undefined;

    const animation = Animated.timing(conversationProgress, {
      toValue: 1,
      duration: 420,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [conversationProgress, conversationVisible, reduceMotion]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const bottomInset = Math.max(insets.bottom, 8);
    const visibleTabBarStyle = [
      androidTabBarBaseStyle,
      {
        height: 60 + bottomInset,
        paddingBottom: bottomInset,
      },
    ];

    navigation.setOptions({
      tabBarStyle: conversationVisible
        ? [visibleTabBarStyle, { display: 'none' }]
        : visibleTabBarStyle,
    });

    return () => {
      navigation.setOptions({ tabBarStyle: visibleTabBarStyle });
    };
  }, [conversationVisible, insets.bottom, navigation]);

  useEffect(() => {
    if (!conversationVisible || messages.length === 0) return undefined;

    const frame = requestAnimationFrame(() => {
      conversationScrollRef.current?.scrollToEnd({
        animated: !reduceMotion,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [conversationVisible, messages, reduceMotion]);

  useEffect(() => {
    const animation = Animated.timing(suggestionsProgress, {
      toValue: suggestionsVisible ? 1 : 0,
      duration: suggestionsVisible ? 320 : 220,
      easing: suggestionsVisible
        ? Easing.out(Easing.cubic)
        : Easing.inOut(Easing.quad),
      useNativeDriver: false,
    });

    animation.start();
    return () => animation.stop();
  }, [suggestionsProgress, suggestionsVisible]);

  const dismissComposer = () => {
    if (!composerFocused) return;

    Keyboard.dismiss();
    setComposerFocused(false);
  };

  const openHistory = () => {
    Keyboard.dismiss();
    setComposerFocused(false);
    setHistoryRendered(true);
    setHistoryOpen(true);
    historyProgress.stopAnimation();

    if (reduceMotion) {
      historyProgress.setValue(1);
      return;
    }

    Animated.timing(historyProgress, {
      toValue: 1,
      duration: 420,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: false,
    }).start();
  };

  const closeHistory = (onClosed?: () => void) => {
    setHistoryOpen(false);
    historyProgress.stopAnimation();

    const finishClosing = () => {
      historyProgress.setValue(0);
      setHistoryRendered(false);
      if (Platform.OS === 'android') {
        setSurfaceResetKey((current) => current + 1);
      }
      if (onClosed) {
        requestAnimationFrame(() => requestAnimationFrame(onClosed));
      }
    };

    if (reduceMotion) {
      finishClosing();
      return;
    }

    Animated.timing(historyProgress, {
      toValue: 0,
      duration: 300,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) finishClosing();
    });
  };

  const openRecentChat = (item: ChatHistoryItem) => {
    const persistedMessages = chatMessagesRef.current
      .filter(
        (message) =>
          !message.deletedAt && message.conversationLocalId === item.id,
      )
      .sort((left, right) => left.sentAt - right.sentAt);
    const restoredMessages: ScreenMessage[] = persistedMessages.map(
      (message) => ({
        id: message.localId,
        text: message.text,
        assistant: message.role === 'assistant',
        conversationLocalId: item.id,
        state: 'complete',
      }),
    );
    const running = activeGeneration.current;
    if (
      running?.conversationLocalId === item.id &&
      !restoredMessages.some(
        (message) => message.id === running.assistantMessageId,
      )
    ) {
      restoredMessages.push({
        id: running.assistantMessageId,
        text: '',
        assistant: true,
        conversationLocalId: item.id,
        state: 'thinking',
        retryUserMessageId: running.userMessageId,
      });
    } else {
      const unanswered = findUnansweredUserMessage(persistedMessages, item.id);
      if (unanswered) {
        knownUserMessages.current.set(unanswered.localId, unanswered);
        restoredMessages.push({
          id: `retry_${unanswered.localId}`,
          text: chatGenerationErrorText(),
          assistant: true,
          conversationLocalId: item.id,
          state: 'error',
          retryUserMessageId: unanswered.localId,
        });
      }
    }

    setSelectedHistoryId(item.id);
    setConversationId(item.id);
    setMessages(restoredMessages);
    setConversationVisible(true);
    closeHistory();
  };

  const renameRecentChat = (item: ChatHistoryItem) => {
    const applyRename = (nextTitle?: string) => {
      const title = nextTitle?.trim();
      if (!title || title === item.title) return;
      const conversation = chatConversations.find(
        (candidate) => candidate.localId === item.id,
      );
      if (conversation) {
        void saveConversation({ ...conversation, title }).catch((error) => {
          console.error('Renaming chat failed', error);
          Alert.alert(
            'Не удалось переименовать чат',
            'Проверьте подключение и попробуйте ещё раз.',
          );
        });
      }
      setRecentChats((current) =>
        current.map((chat) =>
          chat.id === item.id ? { ...chat, title } : chat,
        ),
      );
    };

    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Переименовать чат',
        undefined,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Сохранить', onPress: applyRename },
        ],
        'plain-text',
        item.title,
      );
      return;
    }

    Alert.alert(
      'Переименовать чат',
      'Редактирование названия доступно в iOS-версии.',
    );
  };

  const deleteRecentChat = (item: ChatHistoryItem) => {
    if (
      activeGeneration.current?.conversationLocalId === item.id ||
      (generationInFlight.current && conversationId === item.id)
    ) {
      Alert.alert(
        'Сферка ещё отвечает',
        'Дождитесь ответа, прежде чем удалять этот чат.',
      );
      return;
    }
    Alert.alert('Удалить чат?', `«${item.title}» будет удалён из истории.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          const conversation = chatConversations.find(
            (candidate) => candidate.localId === item.id,
          );
          if (conversation) {
            void deleteChatConversation(conversation).catch((error) => {
              console.error('Deleting chat failed', error);
              Alert.alert(
                'Не удалось удалить чат',
                'Проверьте подключение и попробуйте ещё раз.',
              );
            });
          }
          setRecentChats((current) => {
            const nextChats = current.filter((chat) => chat.id !== item.id);
            if (selectedHistoryId === item.id) {
              setSelectedHistoryId(nextChats[0]?.id ?? '');
            }
            return nextChats;
          });
        },
      },
    ]);
  };

  const togglePinnedRecentChat = (item: ChatHistoryItem) => {
    void Haptics.selectionAsync();
    setRecentChats((current) => {
      const updated = current.map((chat) =>
        chat.id === item.id ? { ...chat, pinned: !chat.pinned } : chat,
      );
      return [
        ...updated.filter((chat) => chat.pinned),
        ...updated.filter((chat) => !chat.pinned),
      ];
    });
  };

  const markGenerationError = (
    currentGeneration: ActiveGeneration,
    code?: string,
    retryAfterMs?: number,
  ) => {
    setGenerationState((current) => transitionChatGeneration(current, 'fail'));
    setMessages((current) =>
      current.map((message) =>
        message.id === currentGeneration.assistantMessageId
          ? {
              ...message,
              text: chatGenerationErrorText(code, retryAfterMs),
              state: 'error',
              retryUserMessageId: currentGeneration.userMessageId,
            }
          : message,
      ),
    );
  };

  const requestAssistant = async (
    userMessage: ChatMessage,
    currentGeneration: ActiveGeneration,
  ) => {
    try {
      const result = await generateChat({
        requestId: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        messages: buildChatTranscript(
          [...chatMessagesRef.current, userMessage],
          currentGeneration.conversationLocalId,
          userMessage,
        ),
      });

      if (!result.ok) {
        markGenerationError(
          currentGeneration,
          result.code,
          'retryAfterMs' in result ? result.retryAfterMs : undefined,
        );
        return;
      }

      const sentAt = Date.now();
      const assistantMessage: ChatMessage = {
        localId: currentGeneration.assistantMessageId,
        conversationLocalId: currentGeneration.conversationLocalId,
        role: 'assistant',
        source: 'model',
        text: result.reply,
        sentAt,
        attachments: [],
        generation: {
          provider: result.provider,
          model: result.model,
          responseId: result.responseId,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          durationMs: result.durationMs,
          truncated: result.truncated,
        },
        updatedAt: sentAt,
      };
      await saveChatMessage({
        localId: assistantMessage.localId,
        conversationLocalId: assistantMessage.conversationLocalId,
        role: assistantMessage.role,
        source: assistantMessage.source,
        text: assistantMessage.text,
        sentAt: assistantMessage.sentAt,
        attachments: assistantMessage.attachments,
        generation: assistantMessage.generation,
      });
      chatMessagesRef.current = [
        ...chatMessagesRef.current.filter(
          (message) => message.localId !== assistantMessage.localId,
        ),
        assistantMessage,
      ];
      setMessages((current) =>
        current.map((message) =>
          message.id === currentGeneration.assistantMessageId
            ? { ...message, text: result.reply, state: 'complete' }
            : message,
        ),
      );
      setGenerationState((current) =>
        transitionChatGeneration(current, 'succeed'),
      );
    } catch (error) {
      console.error('AI chat generation failed', error);
      markGenerationError(currentGeneration);
    }
  };

  const startNewMessage = (text: string) => {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setGenerationState((current) => transitionChatGeneration(current, 'start'));

    void (async () => {
      let currentGeneration: ActiveGeneration | undefined;
      try {
        const messageTimestamp = Date.now();
        const nonce = Math.random().toString(36).slice(2, 9);
        const userMessageId = `message_${messageTimestamp}_${nonce}_user`;
        const assistantMessageId = `message_${messageTimestamp}_${nonce}_assistant`;
        let activeConversationId = conversationId;
        if (!activeConversationId) {
          activeConversationId = await saveConversation({
            title: text.slice(0, 80),
            createdAt: messageTimestamp,
            lastMessageAt: messageTimestamp,
          });
          setConversationId(activeConversationId);
          setSelectedHistoryId(activeConversationId);
        } else {
          const existing = chatConversations.find(
            (conversation) => conversation.localId === activeConversationId,
          );
          if (existing) {
            await saveConversation({
              ...existing,
              lastMessageAt: messageTimestamp,
            });
          }
        }

        const userMessage: ChatMessage = {
          localId: userMessageId,
          conversationLocalId: activeConversationId,
          role: 'user',
          source: 'user',
          text,
          sentAt: messageTimestamp,
          attachments: [],
          updatedAt: messageTimestamp,
        };
        await saveChatMessage({
          localId: userMessage.localId,
          conversationLocalId: userMessage.conversationLocalId,
          role: userMessage.role,
          source: userMessage.source,
          text: userMessage.text,
          sentAt: userMessage.sentAt,
          attachments: [],
        });
        chatMessagesRef.current = [
          ...chatMessagesRef.current.filter(
            (message) => message.localId !== userMessage.localId,
          ),
          userMessage,
        ];
        knownUserMessages.current.set(userMessage.localId, userMessage);
        currentGeneration = {
          assistantMessageId,
          conversationLocalId: activeConversationId,
          userMessageId,
        };
        activeGeneration.current = currentGeneration;
        setMessages((current) => [
          ...current,
          {
            id: userMessageId,
            text,
            assistant: false,
            conversationLocalId: activeConversationId,
            state: 'complete',
          },
          {
            id: assistantMessageId,
            text: '',
            assistant: true,
            conversationLocalId: activeConversationId,
            state: 'thinking',
            retryUserMessageId: userMessageId,
          },
        ]);
        Keyboard.dismiss();
        setComposerFocused(false);
        setConversationVisible(true);
        setDraft('');
        await requestAssistant(userMessage, currentGeneration);
      } catch (error) {
        console.error('Saving chat message failed', error);
        setGenerationState((current) =>
          transitionChatGeneration(current, 'fail'),
        );
        if (currentGeneration) markGenerationError(currentGeneration);
        else {
          Alert.alert(
            'Не удалось сохранить сообщение',
            'Освободите место на устройстве и попробуйте ещё раз.',
          );
        }
      } finally {
        generationInFlight.current = false;
        activeGeneration.current = undefined;
      }
    })();
  };

  const startRetry = (userMessage: ChatMessage) => {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setGenerationState((current) => transitionChatGeneration(current, 'start'));
    const currentGeneration: ActiveGeneration = {
      assistantMessageId: `message_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_assistant`,
      conversationLocalId: userMessage.conversationLocalId,
      userMessageId: userMessage.localId,
    };
    activeGeneration.current = currentGeneration;
    setMessages((current) => [
      ...current.filter(
        (message) => message.retryUserMessageId !== userMessage.localId,
      ),
      {
        id: currentGeneration.assistantMessageId,
        text: '',
        assistant: true,
        conversationLocalId: userMessage.conversationLocalId,
        state: 'thinking',
        retryUserMessageId: userMessage.localId,
      },
    ]);

    void requestAssistant(userMessage, currentGeneration).finally(() => {
      generationInFlight.current = false;
      activeGeneration.current = undefined;
    });
  };

  const retryMessage = (userMessageId: string) => {
    const userMessage =
      knownUserMessages.current.get(userMessageId) ??
      chatMessagesRef.current.find(
        (message) =>
          !message.deletedAt &&
          message.localId === userMessageId &&
          message.role === 'user',
      );
    if (!userMessage || generationInFlight.current) return;
    knownUserMessages.current.set(userMessage.localId, userMessage);
    if (!aiReady) {
      Alert.alert(
        'ИИ-чат недоступен',
        availabilityNotice ?? 'Попробуйте позже.',
      );
      return;
    }
    if (!chatStatus?.consentAccepted) {
      setPendingConsentRequest({ kind: 'retry', userMessage });
      setConsentVisible(true);
      return;
    }
    startRetry(userMessage);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || generationInFlight.current) return;
    if (!aiReady) {
      Alert.alert(
        'ИИ-чат недоступен',
        availabilityNotice ?? 'Попробуйте позже.',
      );
      return;
    }
    if (!chatStatus?.consentAccepted) {
      setPendingConsentRequest({ kind: 'new', text });
      setConsentVisible(true);
      return;
    }
    startNewMessage(text);
  };

  const acceptConsentAndContinue = async () => {
    const pending = pendingConsentRequest;
    if (!pending || !chatStatus?.policyVersion || consentAccepting) return;
    setConsentAccepting(true);
    try {
      await acceptAiConsent({ policyVersion: chatStatus.policyVersion });
      setConsentVisible(false);
      setPendingConsentRequest(undefined);
      if (pending.kind === 'new') startNewMessage(pending.text);
      else startRetry(pending.userMessage);
    } catch (error) {
      console.error('Accepting AI chat consent failed', error);
      Alert.alert(
        'Не удалось сохранить согласие',
        'Проверьте подключение и попробуйте ещё раз.',
      );
    } finally {
      setConsentAccepting(false);
    }
  };

  const explainAttachments = () => {
    void Haptics.selectionAsync();
    Alert.alert(
      'Файлы появятся в режиме «Ассистент»',
      'Сейчас Сферка получает только видимый текст чата. Фото, документы, их названия и содержимое не отправляются.',
    );
  };

  const closeConversation = () => {
    Keyboard.dismiss();
    setComposerFocused(false);
    conversationProgress.stopAnimation();

    if (reduceMotion) {
      conversationProgress.setValue(0);
      setConversationVisible(false);
      setMessages([]);
      setConversationId(undefined);
      return;
    }

    Animated.timing(conversationProgress, {
      toValue: 0,
      duration: 340,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setConversationVisible(false);
      setMessages([]);
      setConversationId(undefined);
    });
  };

  const historySurfaceMotionStyle =
    Platform.OS !== 'android' || historyRendered
      ? {
          borderRadius: historyProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 56],
          }),
          transform: [
            {
              translateX: historyProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, historyPanelWidth],
              }),
            },
            {
              scale: historyProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.97],
              }),
            },
          ],
        }
      : undefined;

  return (
    <KeyboardAvoidingView
      style={styles.drawerRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      {historyRendered ? (
        <ChatHistoryPanel
          items={recentChats}
          onDelete={deleteRecentChat}
          onPin={togglePinnedRecentChat}
          onRename={renameRecentChat}
          onSelect={openRecentChat}
          selectedId={selectedHistoryId}
          topInset={insets.top}
          width={historyPanelWidth}
        />
      ) : null}

      <Animated.View
        key={`chat-surface-${surfaceResetKey}`}
        style={[
          styles.chatSurface,
          historyRendered && styles.chatSurfaceRaised,
          historySurfaceMotionStyle,
        ]}
      >
        <StatusBar style="dark" />

        <View
          onTouchStart={dismissComposer}
          style={[styles.headerWrap, { top: headerTop }]}
        >
          <ChatHeader
            activeMode={headerMode}
            onHistory={openHistory}
            onCalendar={() =>
              Alert.alert(
                'Календарь',
                'Выбор даты для истории чата будет добавлен отдельным этапом.',
              )
            }
          />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onTouchStart={dismissComposer}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 80,
              paddingBottom: composerBottom + 152,
            },
          ]}
        >
          <View
            style={[
              styles.emptyStage,
              {
                paddingTop: Math.max(135 - insets.top, 32),
              },
            ]}
          >
            <ChatEmptyState compact={compactHeight} />
          </View>
        </ScrollView>

        <View
          pointerEvents="box-none"
          style={[
            styles.bottomDock,
            {
              bottom: composerBottom,
            },
          ]}
        >
          <Animated.View
            pointerEvents={suggestionsVisible ? 'auto' : 'none'}
            style={[
              styles.suggestionsMotion,
              {
                height: suggestionsProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 100],
                }),
                opacity: suggestionsProgress.interpolate({
                  inputRange: [0, 0.28, 1],
                  outputRange: [0, 0, 1],
                }),
              },
            ]}
          >
            <ChatSuggestionList
              suggestions={suggestions}
              onSelect={(suggestion) => {
                const reminder = activeReminders.find(
                  (item) => suggestion.id === `reminder:${item.localId}`,
                );
                if (reminder) void markReminderRead(reminder);
                setDraft(suggestion.title);
              }}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.suggestionsGradientMask,
                {
                  opacity: suggestionsProgress.interpolate({
                    inputRange: [0, 0.16, 0.78, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,1)']}
                locations={[0, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
            </Animated.View>
          </Animated.View>
          {availabilityNotice ? (
            <AppText role="caption" style={styles.availabilityNotice}>
              {availabilityNotice}
            </AppText>
          ) : null}
          <ChatComposer
            disabled={!aiReady || generationState === 'thinking'}
            value={draft}
            onChangeText={setDraft}
            onSubmit={send}
            onFocus={() => {
              setComposerFocused(true);
            }}
            onBlur={() => setComposerFocused(false)}
            onAdd={explainAttachments}
            onVoice={() =>
              Alert.alert(
                'Голосовой ввод',
                'Голосовой режим пока не подключён.',
              )
            }
          />
          <AppText role="caption" style={styles.aiDisclaimer}>
            ИИ может ошибаться. Важные решения проверяйте у специалиста.
          </AppText>
        </View>

        {historyRendered ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть историю чатов"
            onPress={() => closeHistory()}
            pointerEvents={historyOpen ? 'auto' : 'none'}
            style={styles.historyDismissLayer}
          />
        ) : null}
      </Animated.View>

      <ConversationOverlay
        visible={conversationVisible}
        onRequestClose={closeConversation}
      >
        <KeyboardAvoidingView
          style={[styles.conversationModal, styles.drawerRoot]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        >
          {historyRendered ? (
            <ChatHistoryPanel
              items={recentChats}
              onDelete={deleteRecentChat}
              onPin={togglePinnedRecentChat}
              onRename={renameRecentChat}
              onSelect={openRecentChat}
              selectedId={selectedHistoryId}
              topInset={insets.top}
              width={historyPanelWidth}
            />
          ) : null}

          <Animated.View
            key={`conversation-surface-${surfaceResetKey}`}
            style={[
              styles.conversationSurface,
              historyRendered && styles.chatSurfaceRaised,
              historySurfaceMotionStyle,
            ]}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFillObject,
                styles.conversationBackground,
                { opacity: conversationProgress },
              ]}
            />

            <View style={[styles.headerWrap, { top: headerTop }]}>
              <ChatHeader
                activeMode={headerMode}
                conversation
                conversationIconProgress={conversationProgress}
                onExitConversation={closeConversation}
                onHistory={openHistory}
              />
            </View>

            <Animated.View
              style={[
                styles.conversationContentMotion,
                {
                  opacity: conversationProgress.interpolate({
                    inputRange: [0, 0.28, 1],
                    outputRange: [0, 0, 1],
                  }),
                  transform: [
                    {
                      translateX: conversationProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-12, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <ScrollView
                ref={conversationScrollRef}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onTouchStart={dismissComposer}
                contentContainerStyle={[
                  styles.conversationScrollContent,
                  {
                    paddingTop: insets.top + 102,
                    paddingBottom: conversationComposerBottom + 92,
                  },
                ]}
              >
                <View style={styles.messages}>
                  {messages.map((message) => (
                    <ChatMessageBubble
                      key={message.id}
                      assistant={message.assistant}
                      errorText={
                        message.state === 'error' ? message.text : undefined
                      }
                      isThinking={message.state === 'thinking'}
                      markdown={
                        message.assistant && message.state === 'complete'
                      }
                      onCopy={
                        message.state === 'complete'
                          ? () => void Clipboard.setStringAsync(message.text)
                          : undefined
                      }
                      onRetry={
                        message.state === 'error' && message.retryUserMessageId
                          ? () => retryMessage(message.retryUserMessageId!)
                          : undefined
                      }
                      onShare={
                        message.assistant && message.state === 'complete'
                          ? () => void Share.share({ message: message.text })
                          : undefined
                      }
                      reduceMotion={reduceMotion}
                      variant={17}
                    >
                      {message.state === 'error' ? '' : message.text}
                    </ChatMessageBubble>
                  ))}
                </View>
              </ScrollView>
            </Animated.View>

            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(255,255,255,1)',
                'rgba(255,255,255,0.96)',
                'rgba(255,255,255,0)',
              ]}
              locations={[0, 0.56, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[styles.conversationTopFade, { height: insets.top + 150 }]}
            />

            {Platform.OS !== 'android' ? (
              <LinearGradient
                pointerEvents="none"
                colors={[
                  'rgba(255,255,255,0)',
                  'rgba(255,255,255,0.72)',
                  'rgba(255,255,255,1)',
                ]}
                locations={[0, 0.5, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={[
                  styles.conversationBottomFade,
                  { height: conversationComposerBottom + 120 },
                ]}
              />
            ) : null}

            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.bottomDock,
                {
                  bottom: conversationComposerBottom,
                  transform: [
                    {
                      translateY: conversationProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-67, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {availabilityNotice ? (
                <AppText role="caption" style={styles.availabilityNotice}>
                  {availabilityNotice}
                </AppText>
              ) : null}
              <ChatComposer
                disabled={!aiReady || generationState === 'thinking'}
                value={draft}
                onChangeText={setDraft}
                onSubmit={send}
                onFocus={() => {
                  setComposerFocused(true);
                }}
                onBlur={() => setComposerFocused(false)}
                onAdd={explainAttachments}
                onVoice={() =>
                  Alert.alert(
                    'Голосовой ввод',
                    'Голосовой режим пока не подключён.',
                  )
                }
              />
              <AppText role="caption" style={styles.aiDisclaimer}>
                ИИ может ошибаться. Важные решения проверяйте у специалиста.
              </AppText>
            </Animated.View>
            {historyRendered ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть историю чатов"
                onPress={() => closeHistory()}
                pointerEvents={historyOpen ? 'auto' : 'none'}
                style={styles.historyDismissLayer}
              />
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </ConversationOverlay>
      <AiChatConsentSheet
        accepting={consentAccepting}
        visible={consentVisible}
        onAccept={() => void acceptConsentAndContinue()}
        onCancel={() => {
          if (consentAccepting) return;
          setConsentVisible(false);
          setPendingConsentRequest(undefined);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  drawerRoot: {
    flex: 1,
    backgroundColor: '#F3F0F1',
  },
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  chatSurface: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  conversationSurface: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  chatSurfaceRaised: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.12)',
    shadowColor: '#2F151B',
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 18,
  },
  historyDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 90,
  },
  headerWrap: {
    position: 'absolute',
    left: sizes.screenGutter,
    right: sizes.screenGutter,
    zIndex: 30,
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: sizes.screenGutter,
  },
  emptyStage: {
    flex: 1,
    minHeight: 390,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  messages: {
    gap: 32,
  },
  bottomDock: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 30,
    alignItems: 'center',
    gap: 10,
  },
  suggestionsMotion: {
    width: '100%',
    overflow: 'hidden',
  },
  availabilityNotice: {
    width: '100%',
    paddingHorizontal: 10,
    color: colors.brand.burgundy,
    textAlign: 'center',
  },
  aiDisclaimer: {
    width: '100%',
    paddingHorizontal: 10,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  consentBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
    backgroundColor: 'rgba(33,33,35,0.38)',
  },
  consentSheet: {
    gap: 18,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    borderRadius: 28,
    backgroundColor: colors.surface.raised,
  },
  consentTitle: {
    fontSize: 22,
    lineHeight: 27,
  },
  consentBody: {
    color: colors.text.secondary,
    fontSize: 16,
    lineHeight: 22,
  },
  consentLink: {
    color: colors.brand.primary,
    textDecorationLine: 'underline',
  },
  consentActions: {
    gap: 10,
  },
  consentCancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#F0EEF0',
  },
  consentAcceptButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 25,
    backgroundColor: colors.brand.burgundy,
  },
  consentButtonDisabled: {
    opacity: 0.52,
  },
  suggestionsGradientMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 42,
    zIndex: 2,
  },
  conversationModal: {
    flex: 1,
  },
  androidConversationOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    backgroundColor: '#FFFFFF',
  },
  conversationBackground: {
    backgroundColor: '#FFFFFF',
  },
  conversationContentMotion: {
    flex: 1,
    zIndex: 1,
  },
  conversationScrollContent: {
    flexGrow: 1,
    paddingHorizontal: sizes.screenGutter,
  },
  conversationTopFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 20,
  },
  conversationBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
});
