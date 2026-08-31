import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useNavigation, useRouter } from 'expo-router';
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
import { buildAgentContextEnvelope } from '../lib/agent-context-builder';
import { assistantQuestionNeedsBodyMetrics } from '../lib/agent-context-policy';
import {
  executeLocalAgentTool,
  type AgentToolCall,
  type AgentToolOutput,
} from '../lib/agent-context';
import {
  buildChatTranscript,
  chatTimestampIsInPeriod,
  type ChatHistoryPeriod,
  findUnansweredUserMessage,
} from '../lib/chat-context';
import {
  chatGenerationErrorText,
  type ChatGenerationState,
  transitionChatGeneration,
} from '../lib/chat-generation-state';
import { useHealthStore } from '../lib/health-store';
import type { AgentSourceRef, ChatMessage } from '../lib/health-types';

const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

type ScreenMessage = {
  id: string;
  text: string;
  assistant: boolean;
  conversationLocalId: string;
  state: 'thinking' | 'complete' | 'error';
  retryUserMessageId?: string;
  sourceRefs?: AgentSourceRef[];
};

type ActiveGeneration = {
  assistantMessageId: string;
  conversationLocalId: string;
  userMessageId: string;
  mode: ChatHeaderMode;
};

type PendingConsentRequest =
  | { kind: 'mode'; mode: 'assistant' }
  | { kind: 'new'; mode: ChatHeaderMode; text: string }
  | { kind: 'retry'; mode: ChatHeaderMode; userMessage: ChatMessage };

const PRIVACY_POLICY_URL = 'https://brainwaves.engineering/docs#document-2';
const AGENT_LOCAL_TOOL_TIMEOUT_MS = 60_000;

async function executeAgentToolWithTimeout(
  healthStore: Parameters<typeof executeLocalAgentTool>[0],
  call: AgentToolCall,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      executeLocalAgentTool(healthStore, call),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('LOCAL_AGENT_TOOL_TIMEOUT')),
          AGENT_LOCAL_TOOL_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

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
  assistant,
  onAccept,
  onCancel,
  visible,
}: {
  accepting: boolean;
  assistant: boolean;
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
            {assistant
              ? 'Данные для режима «Ассистент»'
              : 'Передача текста в Yandex AI Studio'}
          </AppText>
          <AppText style={styles.consentBody}>
            {assistant
              ? 'Для ответа Сферка отправит через наш сервер в Yandex AI Studio видимый текст чата; возраст, цель, параметры тела и данные цикла или беременности; указанные заболевания, лекарства и аллергии; записи дневника не старше 30 дней; подтверждённые результаты анализов и домашние тесты; активный план. По запросу Ассистент сможет искать более старые записи, другие ваши чаты и метаданные документов. Если вы отдельно включите автономные рекомендации, при проверке плана также могут передаваться новые сообщения, написанные вами в режиме «Ассистент», и факт появления нового документа с его категорией и датой. Обычные чаты, ответы ИИ, названия и содержимое файлов при такой проверке не передаются. Содержимое файлов, имя, контакты, пути к файлам, идентификаторы аккаунта и устройства не передаются. Логирование запросов у Yandex отключено.'
              : 'Для ответа Сферка отправит ваше сообщение и до 20 последних сообщений этого чата через наш сервер в Yandex AI Studio. Структурированные данные профиля, анализы и файлы автоматически не передаются — отправляется только видимый текст чата. Логирование запросов у Yandex отключено. История хранится зашифрованно на устройстве и синхронизируется только при включённой облачной синхронизации.'}
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
                {accepting ? 'Сохраняем…' : 'Согласиться'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ChatScreen() {
  const healthStore = useHealthStore();
  const {
    chatConversations,
    chatMessages,
    cloudProfileReady,
    deleteChatConversation,
    journalEntries,
    labResults,
    markReminderRead,
    profile,
    readOnly,
    reminders,
    saveChatMessage,
    saveConversation,
  } = healthStore;
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const aiEligible = Platform.OS !== 'web' && isAuthenticated && !readOnly;
  const chatStatus = useQuery(
    api.chat.status,
    aiEligible && cloudProfileReady ? {} : 'skip',
  );
  const agentStatus = useQuery(
    api.agent.status,
    aiEligible && cloudProfileReady ? {} : 'skip',
  );
  const generateChat = useAction(api.chat.generate);
  const startAgentTurn = useAction(api.chat.startAgentTurn);
  const continueAgentTurn = useAction(api.chat.continueAgentTurn);
  const acceptAiConsent = useMutation(api.chat.acceptConsent);
  const acceptAgentConsent = useMutation(api.chat.acceptAgentConsent);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [composerFocused, setComposerFocused] = useState(false);
  const [headerMode, setHeaderMode] = useState<ChatHeaderMode>('chat');
  const [conversationVisible, setConversationVisible] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRendered, setHistoryRendered] = useState(false);
  const [surfaceResetKey, setSurfaceResetKey] = useState(0);
  const [recentChats, setRecentChats] = useState<ChatHistoryItem[]>([]);
  const [historyPeriod, setHistoryPeriod] = useState<ChatHistoryPeriod>('all');
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [generationState, setGenerationState] =
    useState<ChatGenerationState>('idle');
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAccepting, setConsentAccepting] = useState(false);
  const [copyNoticeVisible, setCopyNoticeVisible] = useState(false);
  const [pendingConsentRequest, setPendingConsentRequest] =
    useState<PendingConsentRequest>();
  const compactHeight = window.height < 760;
  const composerBottom =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, 8) + 60 + 18
      : Math.max(insets.bottom, 12) + (!hasNativeLiquidGlass ? 78 : 64);
  const conversationComposerBottom = Math.max(insets.bottom + 4, 16) - 12;
  const historyPanelWidth = Math.min(window.width * 0.76, 318);
  const headerTop = getHeaderTop(insets.top);
  const suggestionsVisible = !composerFocused;
  const suggestionsProgress = useRef(new Animated.Value(1)).current;
  const emptyStateProgress = useRef(new Animated.Value(1)).current;
  const conversationProgress = useRef(new Animated.Value(0)).current;
  const historyProgress = useRef(new Animated.Value(0)).current;
  const copyNoticeProgress = useRef(new Animated.Value(0)).current;
  const copyNoticeAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const copyNoticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationScrollRef = useRef<ScrollView>(null);
  const generationInFlight = useRef(false);
  const activeGeneration = useRef<ActiveGeneration | undefined>(undefined);
  const knownUserMessages = useRef(new Map<string, ChatMessage>());
  const chatMessagesRef = useRef(chatMessages);
  const aiReady = aiEligible && chatStatus?.enabled === true;
  const agentReady =
    aiEligible &&
    healthStore.ready &&
    Boolean(profile) &&
    agentStatus?.enabled === true;
  const selectedModeReady = headerMode === 'assistant' ? agentReady : aiReady;
  const selectedConsentAccepted =
    headerMode === 'assistant'
      ? agentStatus?.consentAccepted === true
      : chatStatus?.consentAccepted === true;
  const availabilityNotice =
    Platform.OS === 'web'
      ? 'ИИ-чат доступен в приложении для iOS и Android после входа.'
      : authLoading
        ? 'Проверяем доступность ИИ-чата…'
        : !isAuthenticated || readOnly
          ? 'Войдите в аккаунт, чтобы получать ответы Сферки.'
          : !cloudProfileReady
            ? 'ИИ-чат станет доступен после включения облачной синхронизации.'
            : headerMode === 'assistant' && !agentStatus
              ? 'Проверяем доступность Ассистента…'
              : headerMode === 'chat' && !chatStatus
                ? 'Проверяем доступность ИИ-чата…'
                : headerMode === 'assistant' && !agentStatus?.enabled
                  ? 'Ассистент пока выключен администратором.'
                  : headerMode === 'chat' && !chatStatus?.enabled
                    ? 'ИИ-чат пока выключен администратором.'
                    : undefined;
  const persistedRecentChats = useMemo<ChatHistoryItem[]>(
    () =>
      chatConversations
        .filter((conversation) => !conversation.deletedAt)
        .sort((left, right) => right.lastMessageAt - left.lastMessageAt)
        .map((conversation) => ({
          id: conversation.localId,
          lastMessageAt: conversation.lastMessageAt,
          title: conversation.title,
        })),
    [chatConversations],
  );
  const visibleRecentChats = useMemo(
    () =>
      recentChats.filter((chat) =>
        chatTimestampIsInPeriod(chat.lastMessageAt, historyPeriod),
      ),
    [historyPeriod, recentChats],
  );
  const historyPanelTitle =
    historyPeriod === 'today'
      ? 'Сегодня'
      : historyPeriod === '7-days'
        ? 'За 7 дней'
        : 'Недавнее';
  const historyEmptyText =
    historyPeriod === 'all'
      ? 'У вас пока нет чатов'
      : 'За выбранный период чатов нет';

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
    return [
      {
        id: 'reference-clinic',
        title: 'Choose the best clinic in the area',
        icon: 'clinic',
      },
      {
        id: 'reference-nutrition',
        title: 'Create a personalized weekly meal plan',
        icon: 'nutrition',
      },
      {
        id: 'reference-training',
        title: 'How to gain muscle in the shortest time',
        icon: 'analyses',
      },
    ];
  }, []);

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

  useEffect(
    () => () => {
      copyNoticeAnimation.current?.stop();
      if (copyNoticeTimeout.current) clearTimeout(copyNoticeTimeout.current);
    },
    [],
  );

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

  useEffect(() => {
    emptyStateProgress.stopAnimation();

    if (reduceMotion) {
      emptyStateProgress.setValue(composerFocused ? 0 : 1);
      return undefined;
    }

    const animation = Animated.timing(emptyStateProgress, {
      toValue: composerFocused ? 0 : 1,
      duration: composerFocused ? 200 : 240,
      easing: composerFocused
        ? Easing.in(Easing.cubic)
        : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start();
    return () => animation.stop();
  }, [composerFocused, emptyStateProgress, reduceMotion]);

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

  const chooseHistoryPeriod = () => {
    void Haptics.selectionAsync();
    Alert.alert('История чатов', 'За какой период показать разговоры?', [
      {
        text: 'Все чаты',
        onPress: () => {
          setHistoryPeriod('all');
          openHistory();
        },
      },
      {
        text: '7 дней',
        onPress: () => {
          setHistoryPeriod('7-days');
          openHistory();
        },
      },
      {
        text: 'Сегодня',
        onPress: () => {
          setHistoryPeriod('today');
          openHistory();
        },
      },
    ]);
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
        sourceRefs: message.sourceRefs,
      }),
    );
    const conversation = chatConversations.find(
      (candidate) => candidate.localId === item.id,
    );
    setHeaderMode(conversation?.mode ?? 'chat');
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

  const openAssistantSource = (source: AgentSourceRef) => {
    if (source.source === 'chat') {
      const sourceMessage = chatMessagesRef.current.find(
        (message) => !message.deletedAt && message.localId === source.localId,
      );
      const sourceConversation = sourceMessage
        ? recentChats.find(
            (item) => item.id === sourceMessage.conversationLocalId,
          )
        : undefined;
      if (sourceConversation) openRecentChat(sourceConversation);
      return;
    }
    if (source.source === 'document') {
      router.push({
        pathname: '/profile',
        params: { panel: 'documents', sourceId: source.localId },
      });
      return;
    }
    if (source.source === 'journal') {
      router.push({ pathname: '/scan', params: { journalId: source.localId } });
      return;
    }
    router.push({
      pathname: '/analyses',
      params: { sourceId: source.localId },
    });
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
          const deletingLastChat = recentChats.length === 1;
          const finishDeletion = () => {
            setRecentChats((current) =>
              current.filter((chat) => chat.id !== item.id),
            );

            if (deletingLastChat) {
              setSelectedHistoryId('');
              closeHistory(() => {
                if (conversationVisible) closeConversation();
              });
              return;
            }

            if (selectedHistoryId === item.id) {
              const nextChat = recentChats.find((chat) => chat.id !== item.id);
              setSelectedHistoryId(nextChat?.id ?? '');
            }
          };

          if (!conversation) {
            finishDeletion();
            return;
          }

          void deleteChatConversation(conversation)
            .then(finishDeletion)
            .catch((error) => {
              console.error('Deleting chat failed', error);
              Alert.alert(
                'Не удалось удалить чат',
                'Проверьте подключение и попробуйте ещё раз.',
              );
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
      const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const transcript = buildChatTranscript(
        [...chatMessagesRef.current, userMessage],
        currentGeneration.conversationLocalId,
        userMessage,
      );
      const result =
        currentGeneration.mode === 'chat'
          ? await generateChat({ requestId, messages: transcript })
          : await (async () => {
              const contextEnvelope = JSON.stringify(
                buildAgentContextEnvelope(healthStore, Date.now(), {
                  includeBodyMetrics: assistantQuestionNeedsBodyMetrics(
                    userMessage.text,
                  ),
                }),
              );
              let step = await startAgentTurn({
                requestId,
                messages: transcript,
                contextEnvelope,
              });
              const accumulatedProviderItems: Array<{
                type: 'function_call';
                call_id: string;
                name: string;
                arguments: string;
              }> = [];
              const accumulatedToolResults: AgentToolOutput[] = [];
              while (step.ok && step.kind === 'tool_calls') {
                const currentToolResults = await Promise.all(
                  step.calls.map((call) =>
                    executeAgentToolWithTimeout(
                      healthStore,
                      call as AgentToolCall,
                    ),
                  ),
                );
                accumulatedProviderItems.push(...step.providerItems);
                accumulatedToolResults.push(...currentToolResults);
                step = await continueAgentTurn({
                  requestId,
                  continuationId: step.continuationId,
                  step: step.step,
                  messages: transcript,
                  contextEnvelope,
                  providerItems: accumulatedProviderItems,
                  toolResults: accumulatedToolResults,
                });
              }
              return step;
            })();

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
        sourceRefs:
          'sourceRefs' in result
            ? (result.sourceRefs as AgentSourceRef[])
            : undefined,
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
        sourceRefs: assistantMessage.sourceRefs,
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
            ? {
                ...message,
                text: result.reply,
                state: 'complete',
                sourceRefs: assistantMessage.sourceRefs,
              }
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

  const startNewMessage = (text: string, mode = headerMode) => {
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
            mode,
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
          mode,
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

  const startRetry = (userMessage: ChatMessage, mode = headerMode) => {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    setGenerationState((current) => transitionChatGeneration(current, 'start'));
    const currentGeneration: ActiveGeneration = {
      assistantMessageId: `message_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_assistant`,
      conversationLocalId: userMessage.conversationLocalId,
      userMessageId: userMessage.localId,
      mode,
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
    const retryMode =
      chatConversations.find(
        (conversation) =>
          conversation.localId === userMessage.conversationLocalId,
      )?.mode ?? headerMode;
    const retryReady = retryMode === 'assistant' ? agentReady : aiReady;
    const retryConsentAccepted =
      retryMode === 'assistant'
        ? agentStatus?.consentAccepted
        : chatStatus?.consentAccepted;
    if (!retryReady) {
      Alert.alert(
        'ИИ-чат недоступен',
        availabilityNotice ?? 'Попробуйте позже.',
      );
      return;
    }
    if (!retryConsentAccepted) {
      setPendingConsentRequest({
        kind: 'retry',
        mode: retryMode,
        userMessage,
      });
      setConsentVisible(true);
      return;
    }
    startRetry(userMessage, retryMode);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || generationInFlight.current) return;
    if (!selectedModeReady) {
      Alert.alert(
        'ИИ-чат недоступен',
        availabilityNotice ?? 'Попробуйте позже.',
      );
      return;
    }
    if (!selectedConsentAccepted) {
      setPendingConsentRequest({ kind: 'new', mode: headerMode, text });
      setConsentVisible(true);
      return;
    }
    startNewMessage(text);
  };

  const acceptConsentAndContinue = async () => {
    const pending = pendingConsentRequest;
    const policyVersion =
      pending?.mode === 'assistant'
        ? agentStatus?.policyVersion
        : chatStatus?.policyVersion;
    if (!pending || !policyVersion || consentAccepting) return;
    setConsentAccepting(true);
    try {
      if (pending.mode === 'assistant') {
        await acceptAgentConsent({
          policyVersion,
          scopes: [...(agentStatus?.scopes ?? [])],
        });
      } else {
        await acceptAiConsent({ policyVersion });
      }
      setConsentVisible(false);
      setPendingConsentRequest(undefined);
      if (pending.kind === 'new') startNewMessage(pending.text, pending.mode);
      else if (pending.kind === 'retry')
        startRetry(pending.userMessage, pending.mode);
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
      headerMode === 'assistant'
        ? 'Чтение файлов появится позже'
        : 'Файлы доступны через разделы приложения',
      headerMode === 'assistant'
        ? 'Ассистент пока видит только метаданные документов и подтверждённые структурированные результаты. Содержимое файлов не читается и не отправляется.'
        : 'В обычном чате Сферка получает только видимый текст. Документы можно сохранить в «Анализах» или профиле.',
    );
  };

  const showCopyNotice = () => {
    copyNoticeAnimation.current?.stop();
    if (copyNoticeTimeout.current) {
      clearTimeout(copyNoticeTimeout.current);
      copyNoticeTimeout.current = null;
    }

    setCopyNoticeVisible(true);
    AccessibilityInfo.announceForAccessibility('Текст скопирован');

    if (reduceMotion) {
      copyNoticeProgress.setValue(1);
      copyNoticeTimeout.current = setTimeout(() => {
        setCopyNoticeVisible(false);
        copyNoticeProgress.setValue(0);
        copyNoticeTimeout.current = null;
      }, 1600);
      return;
    }

    copyNoticeProgress.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(copyNoticeProgress, {
        toValue: 1,
        duration: 220,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.delay(1400),
      Animated.timing(copyNoticeProgress, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    copyNoticeAnimation.current = animation;
    animation.start(({ finished }) => {
      if (!finished) return;
      setCopyNoticeVisible(false);
      copyNoticeAnimation.current = null;
    });
  };

  const copyMessage = async (text: string) => {
    await Clipboard.setStringAsync(text);
    void Haptics.selectionAsync();
    showCopyNotice();
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

  const changeMode = (nextMode: ChatHeaderMode) => {
    if (nextMode === headerMode || generationInFlight.current) return;
    const activate = () => {
      setHeaderMode(nextMode);
      if (
        nextMode === 'assistant' &&
        agentReady &&
        agentStatus?.consentAccepted === false
      ) {
        setPendingConsentRequest({ kind: 'mode', mode: 'assistant' });
        setConsentVisible(true);
      }
    };
    if (conversationVisible && messages.length) {
      Alert.alert(
        'Начать новый разговор?',
        'Режимы «Чат» и «Ассистент» используют разные разрешения на данные.',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Начать',
            onPress: () => {
              closeConversation();
              activate();
            },
          },
        ],
      );
      return;
    }
    activate();
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
          emptyText={historyEmptyText}
          items={visibleRecentChats}
          onDelete={deleteRecentChat}
          onPin={togglePinnedRecentChat}
          onRename={renameRecentChat}
          onSelect={openRecentChat}
          selectedId={selectedHistoryId}
          title={historyPanelTitle}
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
        <StatusBar hidden={false} style="dark" />

        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(255,255,255,1)',
            'rgba(255,249,252,0.94)',
            'rgba(255,255,255,0)',
          ]}
          locations={[0, 0.58, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.screenTopFade, { height: headerTop + 74 }]}
        />

        <View
          onTouchStart={dismissComposer}
          style={[styles.headerWrap, { top: headerTop - 18 }]}
        >
          <ChatHeader
            activeMode={headerMode}
            onModeChange={changeMode}
            onHistory={openHistory}
            onCalendar={chooseHistoryPeriod}
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
              paddingTop: headerTop + 64,
              paddingBottom: composerBottom + 152,
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.emptyStage,
              {
                opacity: emptyStateProgress,
                paddingTop: 217,
              },
            ]}
          >
            <ChatEmptyState compact={compactHeight} />
          </Animated.View>
        </ScrollView>

        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(255,255,255,0)',
            'rgba(255,250,252,0.84)',
            'rgba(255,255,255,1)',
          ]}
          locations={[0, 0.46, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.screenBottomFade,
            { height: composerBottom + 190 },
          ]}
        />

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
            disabled={!selectedModeReady || generationState === 'thinking'}
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
              emptyText={historyEmptyText}
              items={visibleRecentChats}
              onDelete={deleteRecentChat}
              onPin={togglePinnedRecentChat}
              onRename={renameRecentChat}
              onSelect={openRecentChat}
              selectedId={selectedHistoryId}
              title={historyPanelTitle}
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

            <View style={[styles.headerWrap, { top: headerTop - 18 }]}>
              <ChatHeader
                activeMode={headerMode}
                onModeChange={changeMode}
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
                      allowExternalLinks={headerMode === 'chat'}
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
                          ? () => void copyMessage(message.text)
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
                      onSourcePress={openAssistantSource}
                      reduceMotion={reduceMotion}
                      sources={message.sourceRefs}
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
              {copyNoticeVisible ? (
                <Animated.View
                  accessibilityRole="alert"
                  pointerEvents="none"
                  style={[
                    styles.copyNotice,
                    {
                      opacity: copyNoticeProgress,
                      transform: [
                        {
                          translateY: copyNoticeProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [8, 0],
                          }),
                        },
                        {
                          scale: copyNoticeProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.98, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <AppText
                    role="label"
                    weight="semibold"
                    color={colors.text.inverse}
                  >
                    Текст скопирован
                  </AppText>
                </Animated.View>
              ) : null}
              <ChatComposer
                disabled={!selectedModeReady || generationState === 'thinking'}
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
              <AppText
                numberOfLines={2}
                role="caption"
                style={styles.aiDisclaimer}
              >
                {
                  'ИИ может ошибаться. Ответы не являются\nмедицинской рекомендацией.'
                }
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
        assistant={pendingConsentRequest?.mode === 'assistant'}
        visible={consentVisible}
        onAccept={() => void acceptConsentAndContinue()}
        onCancel={() => {
          if (consentAccepting) return;
          if (pendingConsentRequest?.kind === 'mode') setHeaderMode('chat');
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
    left: 0,
    right: 0,
    zIndex: 30,
    alignItems: 'center',
    paddingTop: 18,
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: 24,
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    backgroundColor: '#FFFFFF',
  },
  screenTopFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 20,
  },
  screenBottomFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
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
    left: 16,
    right: 16,
    zIndex: 30,
    alignItems: 'center',
    gap: 16,
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
  copyNotice: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.text.primary,
    shadowColor: '#2F151B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
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
    borderRadius: 40,
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
    flexDirection: 'row',
    gap: 10,
  },
  consentCancelButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#F0EEF0',
  },
  consentAcceptButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 25,
    backgroundColor: colors.brand.primary,
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
