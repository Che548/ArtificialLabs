import { LegalDocumentsButton } from '../components/LegalDocumentsModal';
import { ThemeStatusBar, useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { colors as defaultThemeColors } from '../design-system/tokens';
import { AppSheet, sheetStyles } from '../components/AppSheet';
import { TopChromeBackdrop } from '../components/TopChromeBackdrop';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useAction,
  useConvexAuth,
  useMutation,
  useQuery,
  useQueries,
} from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  type KeyboardEvent,
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
  androidTabBarContentHeight,
  colors,
  getHeaderTop,
  type ChatSuggestion,
  sizes,
} from '../design-system';
import { SferkaAssistantFeed } from '../components/SferkaAssistantFeed';
import { api } from '../convex/_generated/api';
import {
  ScreenFeedback,
  useScreenFeedback,
} from '../components/ScreenFeedback';
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
import { useUpdateChatDraft } from '../lib/use-update-chat-draft';
import { useConnectivity } from '../lib/connectivity';
import { chatComposerInset, chatEmptyHeroFits } from '../lib/chat-layout';
import { resolveChatAvailability } from '../lib/chat-availability';
import { submitConsentOnce } from '../lib/chat-consent';
import type { AgentSourceRef, ChatMessage } from '../lib/health-types';

const composerGutter = 20;

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
};

type PendingConsentRequest =
  | { kind: 'consent' }
  | { kind: 'new'; text: string }
  | { kind: 'retry'; userMessage: ChatMessage };

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
  const styles = useThemeStyles(createStyles);
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
  error,
}: {
  accepting: boolean;
  onAccept: () => void;
  onCancel: () => void;
  visible: boolean;
  error?: string;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <AppSheet
      visible={visible}
      title="Согласие для чата"
      onClose={onCancel}
      dismissDisabled={accepting}
      footer={
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
      }
    >
      <AppText style={styles.consentIntro}>Ответы с помощью Yandex AI Studio</AppText>
      <AppText style={styles.consentBody}>
        Для ответа Сферка отправит через наш сервер в Yandex AI Studio видимый
        текст чата; возраст, цель, параметры тела и данные цикла или
        беременности; указанные заболевания, лекарства и аллергии; записи
        дневника не старше 30 дней; подтверждённые результаты анализов и
        домашние тесты; активный план. По запросу в чате Сферка сможет искать
        более старые записи, другие ваши чаты и метаданные документов. Если вы
        отдельно включите проверки плана, при проверке также могут передаваться
        новые сообщения, написанные вами в чатах с доступом к данным здоровья, и
        факт появления нового документа с его категорией и датой. Старые
        текстовые чаты без такого доступа, ответы ИИ, названия и содержимое
        файлов при такой проверке не передаются. Содержимое файлов, имя,
        контакты, пути к файлам, идентификаторы аккаунта и устройства не
        передаются. Логирование запросов у Yandex отключено. История хранится
        зашифрованно на устройстве и синхронизируется только при включённой
        облачной синхронизации.
      </AppText>
      <View style={styles.consentDocuments}>
        <LegalDocumentsButton variant="row" documentId="privacy" label="Политика конфиденциальности" />
        <LegalDocumentsButton variant="row" documentId="ai" label="Правила работы ИИ" />
        <LegalDocumentsButton variant="row" documentId="health" label="Согласие на данные о здоровье" />
      </View>
      {error ? (
        <View accessibilityRole="alert">
          <AppText style={styles.availabilityNotice}>{error}</AppText>
        </View>
      ) : null}
    </AppSheet>
  );
}

export default function ChatScreen() {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const feedback = useScreenFeedback();
  const healthStore = useHealthStore();
  const {
    chatConversations,
    chatMessages,
    cloudProfileReady,
    cloudSyncEnabled,
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
  const connectivity = useConnectivity();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const aiEligible = Platform.OS !== 'web' && isAuthenticated && !readOnly;
  const qaViewer = useQuery(
    api.profile.viewer,
    __DEV__ && process.env.EXPO_PUBLIC_E2E_MODE === '1' && aiEligible
      ? {}
      : 'skip',
  );
  const [statusAttempt, setStatusAttempt] = useState(0);
  const statusQueries = useMemo(
    () =>
      aiEligible
        ? {
            [`chat-${statusAttempt}`]: { query: api.chat.status, args: {} },
            ...(cloudProfileReady
              ? {
                  [`agent-${statusAttempt}`]: {
                    query: api.agent.status,
                    args: {},
                  },
                }
              : {}),
          }
        : {},
    [aiEligible, cloudProfileReady, statusAttempt],
  );
  const statuses = useQueries(statusQueries);
  const chatResult = statuses[`chat-${statusAttempt}`] as
    FunctionReturnType<typeof api.chat.status> | Error | undefined;
  const agentResult = statuses[`agent-${statusAttempt}`] as
    FunctionReturnType<typeof api.agent.status> | Error | undefined;
  const chatStatus = chatResult instanceof Error ? undefined : chatResult;
  const agentStatus = agentResult instanceof Error ? undefined : agentResult;
  const startAgentTurn = useAction(api.chat.startAgentTurn);
  const continueAgentTurn = useAction(api.chat.continueAgentTurn);
  const acceptAgentConsent = useMutation(api.chat.acceptAgentConsent);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [composerFocused, setComposerFocused] = useState(false);
  const [keyboardShown, setKeyboardShown] = useState(() =>
    Keyboard.isVisible(),
  );
  const [headerMode, setHeaderMode] = useState<ChatHeaderMode>('chat');
  const [displayedMode, setDisplayedMode] = useState<ChatHeaderMode>('chat');
  const modeContentOpacity = useRef(new Animated.Value(1)).current;
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
  const [reviewedConsentModes, setReviewedConsentModes] = useState<string[]>([]);
  const [consentAccepting, setConsentAccepting] = useState(false);
  const consentInFlight = useRef(false);
  const [consentError, setConsentError] = useState<string>();
  const [chatNotice, setChatNotice] = useState<string>();
  const [mainDockHeight, setMainDockHeight] = useState(152);
  const qaFixtureInFlight = useRef(false);
  const qaClient =
    __DEV__ &&
    process.env.EXPO_PUBLIC_E2E_MODE === '1' &&
    Platform.OS !== 'web' &&
    isAuthenticated &&
    !cloudSyncEnabled &&
    /^artificiallabs-e2e\+[a-f0-9]{12}-native@example\.test$/.test(
      process.env.EXPO_PUBLIC_E2E_EMAIL ?? '',
    ) &&
    qaViewer?.email === process.env.EXPO_PUBLIC_E2E_EMAIL;
  const qaFixtureAllowed = qaClient && chatConversations.length === 0;
  const createQaConversation = async () => {
    if (!qaFixtureAllowed || qaFixtureInFlight.current) return;
    qaFixtureInFlight.current = true;
    try {
      const now = Date.now();
      const localId = await saveConversation({
        title: 'Synthetic QA conversation',
        createdAt: now,
        lastMessageAt: now + 1,
        mode: 'chat',
      });
      await saveChatMessage({
        conversationLocalId: localId,
        role: 'user',
        source: 'user',
        text: 'Synthetic QA question, no health data.',
        sentAt: now,
        attachments: [],
      });
      await saveChatMessage({
        conversationLocalId: localId,
        role: 'assistant',
        source: 'demo',
        text: 'Synthetic QA response, not generated by AI.',
        sentAt: now + 1,
        attachments: [],
      });
    } catch {
      feedback.show(
        'QA-диалог не сохранён',
        'Проверка остановлена. Синтетические данные остаются только в тестовом контейнере.',
      );
    } finally {
      qaFixtureInFlight.current = false;
    }
  };
  const [conversationDockHeight, setConversationDockHeight] = useState(152);
  const [copyNoticeVisible, setCopyNoticeVisible] = useState(false);
  const [pendingConsentRequest, setPendingConsentRequest] =
    useState<PendingConsentRequest>();
  const compactHeight = window.height < 760;
  const composerBottom = chatComposerInset(
    Platform.OS,
    insets.bottom,
    keyboardShown,
  );
  const conversationComposerBottom = keyboardShown
    ? 8
    : Math.max(insets.bottom + 4, 16) - 12;
  const keyboardActive = composerFocused || keyboardShown;
  // Keep the greeting's measured layout while the keyboard animates. Removing
  // it on keyboardWillShow used to cut off its opacity transition.
  const heroLayout = useRef({ visible: false, compact: compactHeight });
  if (!keyboardActive && !draft.trim()) {
    heroLayout.current = {
      visible: chatEmptyHeroFits(
        window.height, insets.top, composerBottom, mainDockHeight, false,
      ),
      compact: compactHeight ||
        window.height - composerBottom - mainDockHeight - insets.top - 80 < 340,
    };
  }
  const emptyHeroVisible = heroLayout.current.visible;
  const compactHero = heroLayout.current.compact;
  const historyPanelWidth = Math.min(window.width * 0.76, 318);
  const headerTop = getHeaderTop(insets.top);
  // Start together with the native keyboard, rather than on the earlier focus.
  const suggestionsVisible = !keyboardShown && !draft.trim();
  const keyboardAnimationDuration = useRef(300);
  const suggestionsProgress = useRef(new Animated.Value(1)).current;
  const emptyStateProgress = useRef(
    new Animated.Value(keyboardShown ? 0 : 1),
  ).current;
  const conversationProgress = useRef(new Animated.Value(0)).current;
  const historyProgress = useRef(new Animated.Value(0)).current;
  const copyNoticeProgress = useRef(new Animated.Value(0)).current;
  const copyNoticeAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const copyNoticeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationScrollRef = useRef<ScrollView>(null);
  const generationInFlight = useRef(false);
  useUpdateChatDraft(draft, conversationId, (text, id) => {
    setDraft(text);
    if (id && chatConversations.some(item => item.localId === id && !item.deletedAt)) openRecentChat({ id });
  }, () => generationInFlight.current, healthStore.ready);
  const activeGeneration = useRef<ActiveGeneration | undefined>(undefined);
  const knownUserMessages = useRef(new Map<string, ChatMessage>());
  const chatMessagesRef = useRef(chatMessages);
  const availability = resolveChatAvailability({
    web: Platform.OS === 'web',
    authLoading,
    authenticated: isAuthenticated,
    readOnly,
    cloudSyncEnabled,
    cloudProfileReady,
    requiresCloudSync: true,
    localReady: healthStore.ready && Boolean(profile),
    offline: connectivity.isOffline,
    backendUnavailable: connectivity.backendStatus === 'unavailable',
    statusError:
      chatResult instanceof Error ||
      agentResult instanceof Error ||
      (!cloudProfileReady && healthStore.syncStatus === 'error'),
    status:
      agentStatus && chatStatus
        ? { ...agentStatus, userEnabled: chatStatus.userEnabled }
        : undefined,
  });
  const selectedModeReady = availability.canSend;
  const selectedConsentAccepted = agentStatus?.consentAccepted === true;
  const availabilityNotice = availability.message;
  useEffect(() => {
    if (availability.reason === 'ready') setChatNotice(undefined);
  }, [availability.reason]);
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
      {id:'prepare-labs', title:'Как подготовиться к анализам?', icon:'analyses' as const},
      {id:'daily-care', title:'Как поддерживать хорошее самочувствие?', icon:'clinic' as const},
      {id:'journal-insights', title:'Как замечать изменения в дневнике?', icon:'nutrition' as const},
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

  useEffect(
    () => () => {
      copyNoticeAnimation.current?.stop();
      if (copyNoticeTimeout.current) clearTimeout(copyNoticeTimeout.current);
    },
    [],
  );

  useEffect(() => {
    const updateKeyboard = (shown: boolean) => (event: KeyboardEvent) => {
      keyboardAnimationDuration.current = event.duration > 0 ? event.duration : 300;
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation(event);
      setKeyboardShown(shown);
      if (!shown) setComposerFocused(false);
    };
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      updateKeyboard(true),
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      updateKeyboard(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const animation = Animated.timing(emptyStateProgress, {
      toValue: suggestionsVisible ? 1 : 0,
      duration: reduceMotion ? 0 : keyboardAnimationDuration.current,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [emptyStateProgress, suggestionsVisible, reduceMotion]);

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
        height: androidTabBarContentHeight + bottomInset,
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
      duration: reduceMotion ? 0 : keyboardAnimationDuration.current,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    });

    animation.start();
    return () => animation.stop();
  }, [reduceMotion, suggestionsProgress, suggestionsVisible]);

  const dismissComposer = () => {
    // Native focus/keyboard events can arrive in a different order during a
    // Fold resize. An explicit outside tap must not depend on cached focus.
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
    feedback.show('История чатов', 'За какой период показать разговоры?', [
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

  useEffect(() => {
    if (Platform.OS !== 'android' || !historyOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused()) return false;
      closeHistory();
      return true;
    });
    return () => subscription.remove();
  }, [historyOpen, navigation, closeHistory]);

  const openRecentChat = (item: Pick<ChatHistoryItem, 'id'>) => {
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
    // Persisted modes describe data access, never the notification tab.
    setHeaderMode('chat');
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
    closeConversation();
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
    const applyRename = async (nextTitle?: string) => {
      const title = nextTitle?.trim();
      if (!title || title === item.title) return;
      const conversation = chatConversations.find(
        (candidate) => candidate.localId === item.id,
      );
      if (conversation) {
        await saveConversation({ ...conversation, title });
      }
      setRecentChats((current) =>
        current.map((chat) =>
          chat.id === item.id ? { ...chat, title } : chat,
        ),
      );
    };

    feedback.edit('Переименовать чат', item.title, applyRename);
  };

  const deleteRecentChat = (item: ChatHistoryItem) => {
    if (
      activeGeneration.current?.conversationLocalId === item.id ||
      (generationInFlight.current && conversationId === item.id)
    ) {
      feedback.show(
        'Сферка ещё отвечает',
        'Дождитесь ответа, прежде чем удалять этот чат.',
      );
      return;
    }
    feedback.show('Удалить чат?', `«${item.title}» будет удалён из истории.`, [
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

          return deleteChatConversation(conversation).then(finishDeletion);
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
      const result = await (async () => {
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
              executeAgentToolWithTimeout(healthStore, call as AgentToolCall),
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
    } catch {
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
            // Keep the legacy storage discriminator for plan-review eligibility.
            mode: 'assistant',
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
      } catch {
        setGenerationState((current) =>
          transitionChatGeneration(current, 'fail'),
        );
        if (currentGeneration) markGenerationError(currentGeneration);
        else {
          feedback.show(
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
    const retryReady = availability.canSend;
    const retryConsentAccepted = selectedConsentAccepted;
    if (!retryReady) {
      setChatNotice(
        availabilityNotice ?? 'Не удалось связаться с ИИ. Повторите позже.',
      );
      return;
    }
    if (!retryConsentAccepted) {
      Keyboard.dismiss();
      setConsentError(undefined);
      setPendingConsentRequest({
        kind: 'retry',
        userMessage,
      });
      setConsentVisible(true);
      return;
    }
    startRetry(userMessage);
  };

  const send = () => {
    const text = draft.trim();
    if (
      headerMode !== 'chat' ||
      !text ||
      generationInFlight.current ||
      consentInFlight.current ||
      consentVisible
    )
      return;
    if (!selectedModeReady) {
      setChatNotice(availabilityNotice ?? 'Попробуйте позже.');
      return;
    }
    if (!selectedConsentAccepted) {
      Keyboard.dismiss();
      setConsentError(undefined);
      setPendingConsentRequest({ kind: 'new', text });
      setConsentVisible(true);
      return;
    }
    startNewMessage(text);
  };

  const acceptConsentAndContinue = async () => {
    const pending = pendingConsentRequest;
    const policyVersion = agentStatus?.policyVersion;
    if (!pending || !policyVersion || consentInFlight.current) return;
    setConsentError(undefined);
    setConsentAccepting(true);
    try {
      await submitConsentOnce(
        consentInFlight,
        async () => {
          await acceptAgentConsent({
            policyVersion,
            scopes: [...(agentStatus?.scopes ?? [])],
          });
        },
        () => {
          setConsentVisible(false);
          setPendingConsentRequest(undefined);
          if (pending.kind === 'new') startNewMessage(pending.text);
          else if (pending.kind === 'retry') startRetry(pending.userMessage);
        },
      );
    } catch {
      setConsentError(
        'Не удалось сохранить согласие. Проверьте подключение и попробуйте ещё раз. Черновик не удалён.',
      );
    } finally {
      setConsentAccepting(false);
    }
  };

  const composerVisible = availability.action !== 'consent' || reviewedConsentModes.includes(headerMode);

  const availabilityPanel = (
    <View accessibilityLiveRegion="polite" style={styles.availabilityPanel}>
      {availability.action ? (
        <Pressable
          accessibilityRole="button"
          style={styles.availabilityAction}
          onPress={() => {
            Keyboard.dismiss();
            if (availability.action === 'profile') {
              closeConversation();
              router.push(
                availability.reason === 'sync'
                  ? '/profile?panel=permissions'
                  : '/profile',
              );
            } else if (availability.action === 'retry') {
              setChatNotice(undefined);
              setStatusAttempt((attempt) => attempt + 1);
            } else {
              setConsentError(undefined);
              setReviewedConsentModes((modes) => modes.includes(headerMode) ? modes : [...modes, headerMode]);
              setPendingConsentRequest({ kind: 'consent' });
              setConsentVisible(true);
            }
          }}
        >
          <AppText weight="medium" color="#FFFFFF" style={{ textAlign: 'center' }}>
            {availability.action === 'profile'
              ? 'Открыть настройки профиля'
              : availability.action === 'retry'
                ? 'Повторить проверку'
                : 'Ознакомиться с условиями'}
          </AppText>
        </Pressable>
      ) : null}
      {availabilityNotice || chatNotice ? (
        <AppText role="caption" style={styles.availabilityNotice}>
          {availabilityNotice ?? chatNotice}
        </AppText>
      ) : null}
    </View>
  );

  const explainAttachments = () => {
    void Haptics.selectionAsync();
    feedback.show(
      'Документы в профиле',
      'Добавьте PDF или фото в «Документы» профиля. После отдельного согласия изображения страниц распознаются через Yandex; исходник остаётся на устройстве. Для интерпретации отдельно проверьте и выберите текст, затем подтвердите его отправку. Файлы и изображения в чат не отправляются.',
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

  // Keep the outgoing view mounted until it is invisible. Stopping the
  // previous animation makes rapid reversals continue from the current opacity.
  useEffect(() => {
    if (reduceMotion) {
      modeContentOpacity.stopAnimation();
      setDisplayedMode(headerMode);
      modeContentOpacity.setValue(1);
      return;
    }
    const changing = displayedMode !== headerMode;
    const animation = Animated.timing(modeContentOpacity, {
      toValue: changing ? 0 : 1,
      duration: changing ? 130 : 220,
      easing: changing ? Easing.inOut(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && changing) setDisplayedMode(headerMode);
    });
    return () => animation.stop();
  }, [displayedMode, headerMode, modeContentOpacity, reduceMotion]);

  const changeMode = (nextMode: ChatHeaderMode) => {
    if (nextMode === headerMode || generationInFlight.current) return;
    Keyboard.dismiss();
    setComposerFocused(false);
    if (conversationVisible) closeConversation();
    setHeaderMode(nextMode);
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

  const consentSheet = (
    <AiChatConsentSheet
      error={consentError}
      accepting={consentAccepting}
      visible={consentVisible}
      onAccept={() => void acceptConsentAndContinue()}
      onCancel={() => {
        if (consentInFlight.current) return;
        setConsentError(undefined);
        setConsentVisible(false);
        setPendingConsentRequest(undefined);
      }}
    />
  );

  return (
    <KeyboardAvoidingView
      style={styles.drawerRoot}
      enabled={!conversationVisible}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
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
        pointerEvents={conversationVisible ? 'none' : 'auto'}
        accessibilityElementsHidden={conversationVisible}
        importantForAccessibility={
          conversationVisible ? 'no-hide-descendants' : 'auto'
        }
        style={[
          styles.chatSurface,
          displayedMode === 'assistant' && {
            backgroundColor: colors.surface.canvas,
          },
          historyRendered && styles.chatSurfaceRaised,
          historySurfaceMotionStyle,
        ]}
      >
        <ThemeStatusBar />
        <TopChromeBackdrop headerTop={headerTop} style={{ height: headerTop + 180 }} />

        <View
          onTouchStart={dismissComposer}
          style={[styles.headerWrap, { top: headerTop }]}
        >
          <ChatHeader
            activeMode={headerMode}
            hideHistory={headerMode === 'assistant'}
            onModeChange={changeMode}
            onHistory={openHistory}
            onCalendar={chooseHistoryPeriod}
          />
        </View>

        <Animated.View
          style={{ flex: 1, opacity: modeContentOpacity }}
          pointerEvents={displayedMode === headerMode ? 'auto' : 'none'}
          accessibilityElementsHidden={displayedMode !== headerMode}
          importantForAccessibility={
            displayedMode === headerMode ? 'auto' : 'no-hide-descendants'
          }
        >
          {displayedMode === 'assistant' ? (
            <SferkaAssistantFeed
              active={headerMode === 'assistant' && !conversationVisible && !historyRendered}
              topInset={headerTop + 72}
              bottomInset={composerBottom + 16}
            />
          ) : (
            <>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onTouchStart={dismissComposer}
                contentContainerStyle={[
                  styles.scrollContent,
                  {
                    paddingTop: insets.top + 80,
                    paddingBottom: composerBottom + mainDockHeight + 16,
                  },
                ]}
              >
                <Animated.View
                  pointerEvents={keyboardActive ? 'none' : 'auto'}
                  accessibilityElementsHidden={keyboardActive}
                  importantForAccessibility={
                    keyboardActive ? 'no-hide-descendants' : 'auto'
                  }
                  style={[
                    styles.emptyStage,
                    {
                      opacity: emptyStateProgress,
                      paddingTop: emptyHeroVisible
                        ? compactHero ? 8 : Math.max(135 - insets.top, 32)
                        : 0,
                      minHeight: emptyHeroVisible ? (compactHero ? 228 : 390) : 0,
                    },
                  ]}
                >
                  {emptyHeroVisible ? (
                    <ChatEmptyState compact={compactHero} />
                  ) : null}
                </Animated.View>
              </ScrollView>
            </>
          )}
          <LinearGradient
            pointerEvents="none"
            colors={[
              `${displayedMode === 'assistant' ? colors.surface.canvas : colors.surface.raised}00`,
              `${displayedMode === 'assistant' ? colors.surface.canvas : colors.surface.raised}60`,
              `${displayedMode === 'assistant' ? colors.surface.canvas : colors.surface.raised}ff`,
            ]}
            locations={[0, 0.65, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[
              styles.conversationBottomFade,
              { height: composerBottom + (displayedMode === 'chat' ? mainDockHeight + 40 : 56) },
            ]}
          />
          {displayedMode === 'chat' ? (
          <View
            pointerEvents="box-none"
            onLayout={(event) =>
              setMainDockHeight(event.nativeEvent.layout.height)
            }
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
                  colors={[`${colors.surface.raised}00`, `${colors.surface.raised}ff`]}
                  locations={[0, 1]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </Animated.View>
            </Animated.View>
            {availabilityPanel}
            {composerVisible ? <ChatComposer
              inputTestID="chat-main-input"
              editable={
                !readOnly && !consentAccepting && generationState !== 'thinking'
              }
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
                feedback.show(
                  'Голосовой ввод',
                  'Голосовой режим пока не подключён.',
                )
              }
            /> : null}
            {composerVisible && !keyboardShown ? (
              <AppText
                numberOfLines={2}
                role="caption"
                style={styles.aiDisclaimer}
              >
                {
                  'ИИ может ошибаться. Ответы не являются\nмедицинской рекомендацией.'
                }
              </AppText>
            ) : null}
          </View>
          ) : null}
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

      <ConversationOverlay
        visible={conversationVisible}
        onRequestClose={closeConversation}
      >
        <KeyboardAvoidingView
          style={[styles.conversationModal, styles.drawerRoot]}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
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

            <TopChromeBackdrop headerTop={headerTop} style={{ height: headerTop + 180 }} />
            <View style={[styles.headerWrap, { top: headerTop }]}>
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
                  paddingBottom:
                    conversationComposerBottom + conversationDockHeight,
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
                    paddingBottom: 16,
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
                `${colors.surface.raised}ff`,
                `${colors.surface.raised}b8`,
                `${colors.surface.raised}00`,
              ]}
              locations={[0, 0.3, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[styles.conversationTopFade, { height: insets.top + 105 }]}
            />

            <LinearGradient
              pointerEvents="none"
              colors={[
                `${colors.surface.raised}00`,
                `${colors.surface.raised}60`,
                `${colors.surface.raised}ff`,
              ]}
              locations={[0, 0.65, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={[
                styles.conversationBottomFade,
                { height: conversationComposerBottom + conversationDockHeight + 56 },
              ]}
            />

            <Animated.View
              pointerEvents="box-none"
              onLayout={(event) =>
                setConversationDockHeight(event.nativeEvent.layout.height)
              }
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
              {availabilityPanel}
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
              {composerVisible ? <ChatComposer
                inputTestID="chat-conversation-input"
                editable={
                  !readOnly &&
                  !consentAccepting &&
                  generationState !== 'thinking'
                }
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
                  feedback.show(
                    'Голосовой ввод',
                    'Голосовой режим пока не подключён.',
                  )
                }
              /> : null}
              {composerVisible && !keyboardShown ? (
                <AppText
                  numberOfLines={2}
                  role="caption"
                  style={styles.aiDisclaimer}
                >
                  {
                    'ИИ может ошибаться. Ответы не являются\nмедицинской рекомендацией.'
                  }
                </AppText>
              ) : null}
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
        {conversationVisible ? consentSheet : null}
        {conversationVisible ? <ScreenFeedback feedback={feedback} /> : null}
      </ConversationOverlay>
      {!conversationVisible ? consentSheet : null}
      {!conversationVisible ? <ScreenFeedback feedback={feedback} /> : null}
      {qaClient && !conversationVisible && !historyOpen ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: insets.top + 65,
            alignSelf: 'center',
            zIndex: 60,
          }}
        >
          <AppText role="caption">{`QA backend ${connectivity.backendStatus}`}</AppText>
        </View>
      ) : null}
      {qaFixtureAllowed && historyOpen && !conversationVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Создать синтетический QA-диалог"
          onPress={() => void createQaConversation()}
          style={{
            position: 'absolute',
            left: 20,
            bottom: 120,
            zIndex: 200,
            padding: 16,
            backgroundColor: '#F4DDE7',
            borderRadius: 12,
          }}
        >
          <AppText>Создать синтетический QA-диалог</AppText>
        </Pressable>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  drawerRoot: {
    flex: 1,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#F3F0F1',
  },
  root: {
    flex: 1,
    backgroundColor: colors.surface.raised,
  },
  chatSurface: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface.raised,
  },
  conversationSurface: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surface.raised,
  },
  chatSurfaceRaised: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(130,53,55,0.12)',
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
    left: composerGutter,
    right: composerGutter,
    zIndex: 30,
    alignItems: 'center',
    gap: 10,
  },
  suggestionsMotion: {
    width: '100%',
    overflow: 'hidden',
  },
  availabilityPanel: { width: '100%', gap: 10 },
  availabilityNotice: {
    width: '100%',
    paddingHorizontal: 10,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  availabilityAction: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
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
  consentIntro: { fontSize: 15, lineHeight: 21, color: colors.brand.primary },
  consentDocuments: { gap: 8 },
  consentBody: {
    color: colors.text.secondary,
    fontSize: 16,
    lineHeight: 23,
  },
  consentLink: {
    color: colors.brand.primary,
    textDecorationLine: 'underline',
  },
  consentActions: {
    flexDirection: 'row',
    gap: 10,
  },
  consentCancelButton: { ...sheetStyles.secondary, backgroundColor: colors.surface.divider, flex: 1 },
  consentAcceptButton: { ...sheetStyles.primary, flex: 1 },
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
    backgroundColor: colors.surface.raised,
  },
  conversationBackground: {
    backgroundColor: colors.surface.raised,
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

const styles = createStyles(defaultThemeColors);
