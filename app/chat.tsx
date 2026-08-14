import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChatAttachmentMenu,
  ChatComposer,
  ChatEmptyState,
  ChatHeader,
  type ChatHeaderMode,
  ChatHistoryPanel,
  type ChatHistoryItem,
  ChatMessageBubble,
  ChatSuggestionList,
  colors,
  type ChatSuggestion,
  sizes,
  spacing,
} from '../design-system';
import { useHealthStore } from '../lib/health-store';
import { persistChatAttachment } from '../lib/local-files';
import type { ChatAttachment } from '../lib/health-types';

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

type DemoMessage = {
  id: string;
  text: string;
  assistant: boolean;
  thinking?: boolean;
};

export default function ChatScreen() {
  const {
    chatConversations,
    chatMessages,
    readOnly,
    saveChatMessage,
    saveConversation,
  } = useHealthStore();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>(
    [],
  );
  const [composerFocused, setComposerFocused] = useState(false);
  const [headerMode, setHeaderMode] = useState<ChatHeaderMode>('chat');
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [conversationVisible, setConversationVisible] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRendered, setHistoryRendered] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const compactHeight = window.height < 760;
  const composerBottom = Math.max(insets.bottom, 12) + 67;
  const conversationComposerBottom = Math.max(insets.bottom + 4, 16);
  const historyPanelWidth = Math.min(window.width * 0.76, 318);
  const suggestionsVisible = !composerFocused;
  const suggestionsProgress = useRef(new Animated.Value(1)).current;
  const conversationProgress = useRef(new Animated.Value(0)).current;
  const historyProgress = useRef(new Animated.Value(0)).current;
  const conversationScrollRef = useRef<ScrollView>(null);
  const responseTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const recentChats = useMemo<ChatHistoryItem[]>(
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
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(
    () => () => {
      responseTimers.current.forEach(clearTimeout);
      responseTimers.current = [];
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
    setAttachmentMenuVisible(false);
    if (!composerFocused) return;

    Keyboard.dismiss();
    setComposerFocused(false);
  };

  const openHistory = () => {
    Keyboard.dismiss();
    setComposerFocused(false);
    setAttachmentMenuVisible(false);
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

  const closeHistory = () => {
    setHistoryOpen(false);
    historyProgress.stopAnimation();

    if (reduceMotion) {
      historyProgress.setValue(0);
      setHistoryRendered(false);
      return;
    }

    Animated.timing(historyProgress, {
      toValue: 0,
      duration: 300,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setHistoryRendered(false);
    });
  };

  const openRecentChat = (item: ChatHistoryItem) => {
    setSelectedHistoryId(item.id);
    setConversationId(item.id);
    setMessages(
      chatMessages
        .filter(
          (message) =>
            !message.deletedAt && message.conversationLocalId === item.id,
        )
        .sort((left, right) => left.sentAt - right.sentAt)
        .map((message) => ({
          id: message.localId,
          text: message.text,
          assistant: message.role === 'assistant',
        })),
    );
    setConversationVisible(true);
    closeHistory();
  };

  const rememberAttachment = async (input: {
    uri: string;
    kind: ChatAttachment['kind'];
    name?: string | null;
    mimeType?: string | null;
    size?: number;
  }) => {
    if (readOnly) return;
    const localUri = await persistChatAttachment(input.uri);
    setPendingAttachments((current) => [
      ...current,
      {
        localId: `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: input.kind,
        name: input.name || (input.kind === 'image' ? 'Изображение' : 'Документ'),
        mimeType: input.mimeType ?? undefined,
        size: input.size,
        localUri,
        availableLocally: true,
      },
    ]);
  };

  const openCamera = async () => {
    setAttachmentMenuVisible(false);
    void Haptics.selectionAsync();

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Нужен доступ к камере',
          'Разрешите Private использовать камеру, чтобы сделать фотографию.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset)
        await rememberAttachment({
          uri: asset.uri,
          kind: 'image',
          name: asset.fileName,
          mimeType: asset.mimeType,
          size: asset.fileSize,
        });
    } catch (error) {
      console.error('Opening chat camera failed', error);
      Alert.alert(
        'Не удалось открыть камеру',
        'Попробуйте ещё раз или выберите изображение из галереи.',
      );
    }
  };

  const openImageLibrary = async () => {
    setAttachmentMenuVisible(false);
    void Haptics.selectionAsync();

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Нужен доступ к Фото',
          'Разрешите Private выбирать изображения из медиатеки.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset)
        await rememberAttachment({
          uri: asset.uri,
          kind: 'image',
          name: asset.fileName,
          mimeType: asset.mimeType,
          size: asset.fileSize,
        });
    } catch (error) {
      console.error('Opening chat image library failed', error);
      Alert.alert(
        'Не удалось открыть Фото',
        'Попробуйте выбрать изображение ещё раз.',
      );
    }
  };

  const openFilePicker = async () => {
    setAttachmentMenuVisible(false);
    void Haptics.selectionAsync();

    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });
      const asset = result.canceled ? undefined : result.assets[0];
      if (asset)
        await rememberAttachment({
          uri: asset.uri,
          kind: 'document',
          name: asset.name,
          mimeType: asset.mimeType,
          size: asset.size,
        });
    } catch (error) {
      console.error('Opening chat document picker failed', error);
      Alert.alert(
        'Не удалось открыть Файлы',
        'Попробуйте выбрать файл ещё раз.',
      );
    }
  };

  const send = async () => {
    const text = draft.trim();
    if ((!text && !pendingAttachments.length) || readOnly) return;

    const messageTimestamp = Date.now();
    const assistantMessageId = `${messageTimestamp}-assistant`;
    const userMessageId = `${messageTimestamp}-user`;
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      activeConversationId = await saveConversation({
        title: text || pendingAttachments[0]?.name || 'Новый чат',
        createdAt: messageTimestamp,
        lastMessageAt: messageTimestamp,
      });
      setConversationId(activeConversationId);
      setSelectedHistoryId(activeConversationId);
    } else {
      const existing = chatConversations.find(
        (conversation) => conversation.localId === activeConversationId,
      );
      if (existing)
        await saveConversation({
          ...existing,
          lastMessageAt: messageTimestamp,
        });
    }

    await saveChatMessage({
      localId: userMessageId,
      conversationLocalId: activeConversationId,
      role: 'user',
      source: 'user',
      text: text || 'Вложение',
      sentAt: messageTimestamp,
      attachments: pendingAttachments,
    });

    setMessages((current) => [
      ...current,
      { id: userMessageId, text: text || 'Вложение', assistant: false },
      {
        id: assistantMessageId,
        text: '',
        assistant: true,
        thinking: true,
      },
    ]);

    const responseTimer = setTimeout(() => {
      const demoText =
        'Я получила ваш вопрос. Сейчас это демонстрация интерфейса: медицинский AI и обработка персональных данных пока не подключены.';
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: demoText,
                thinking: false,
              }
            : message,
        ),
      );
      responseTimers.current = responseTimers.current.filter(
        (timer) => timer !== responseTimer,
      );
      void saveChatMessage({
        localId: assistantMessageId,
        conversationLocalId: activeConversationId,
        role: 'assistant',
        source: 'demo',
        text: demoText,
        sentAt: Date.now(),
        attachments: [],
      });
    }, 2000);
    responseTimers.current.push(responseTimer);
    Keyboard.dismiss();
    setComposerFocused(false);
    setAttachmentMenuVisible(false);
    setConversationVisible(true);
    setDraft('');
    setPendingAttachments([]);
  };

  const closeConversation = () => {
    Keyboard.dismiss();
    setComposerFocused(false);
    setAttachmentMenuVisible(false);
    conversationProgress.stopAnimation();
    responseTimers.current.forEach(clearTimeout);
    responseTimers.current = [];

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

  return (
    <KeyboardAvoidingView
      style={styles.drawerRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
    >
      {historyRendered ? (
        <ChatHistoryPanel
          items={recentChats}
          onSelect={openRecentChat}
          selectedId={selectedHistoryId}
          topInset={insets.top}
          width={historyPanelWidth}
        />
      ) : null}

      <Animated.View
        style={[
          styles.chatSurface,
          historyRendered && styles.chatSurfaceRaised,
          {
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
          },
        ]}
      >
        <StatusBar style="dark" />

        <View
          onTouchStart={dismissComposer}
          style={[styles.headerWrap, { top: Math.max(16, insets.top + 8) }]}
        >
          <ChatHeader
            activeMode={headerMode}
            onModeChange={setHeaderMode}
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
        <View pointerEvents="box-none" style={styles.attachmentMenuAnchor}>
          <ChatAttachmentMenu
            visible={attachmentMenuVisible}
            onCamera={openCamera}
            onImage={openImageLibrary}
            onFile={openFilePicker}
          />
        </View>

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
            onSelect={(suggestion) => setDraft(suggestion.title)}
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
        <ChatComposer
          value={draft}
          onChangeText={setDraft}
          onSubmit={send}
          onFocus={() => {
            setAttachmentMenuVisible(false);
            setComposerFocused(true);
          }}
          onBlur={() => setComposerFocused(false)}
          onAdd={() => {
            Keyboard.dismiss();
            setComposerFocused(false);
            void Haptics.selectionAsync();
            setAttachmentMenuVisible((current) => !current);
          }}
          onVoice={() =>
            Alert.alert('Голосовой ввод', 'Голосовой режим пока не подключён.')
          }
        />
        </View>

        {historyRendered ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть историю чатов"
            onPress={closeHistory}
            pointerEvents={historyOpen ? 'auto' : 'none'}
            style={styles.historyDismissLayer}
          />
        ) : null}
      </Animated.View>

      <Modal
        animationType="none"
        transparent
        visible={conversationVisible}
        presentationStyle="overFullScreen"
        statusBarTranslucent
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
              onSelect={openRecentChat}
              selectedId={selectedHistoryId}
              topInset={insets.top}
              width={historyPanelWidth}
            />
          ) : null}

          <Animated.View
            style={[
              styles.conversationSurface,
              historyRendered && styles.chatSurfaceRaised,
              {
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
              },
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

          <View
            style={[styles.headerWrap, { top: Math.max(16, insets.top + 8) }]}
          >
            <ChatHeader
              activeMode={headerMode}
              conversation
              conversationIconProgress={conversationProgress}
              onModeChange={setHeaderMode}
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
                    isThinking={message.thinking}
                    reduceMotion={reduceMotion}
                    variant={17}
                  >
                    {message.text}
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
            style={[
              styles.conversationTopFade,
              { height: insets.top + 150 },
            ]}
          />

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
            <View pointerEvents="box-none" style={styles.attachmentMenuAnchor}>
              <ChatAttachmentMenu
                visible={attachmentMenuVisible}
                onCamera={openCamera}
                onImage={openImageLibrary}
                onFile={openFilePicker}
              />
            </View>

            <ChatComposer
              value={draft}
              onChangeText={setDraft}
              onSubmit={send}
              onFocus={() => {
                setAttachmentMenuVisible(false);
                setComposerFocused(true);
              }}
              onBlur={() => setComposerFocused(false)}
              onAdd={() => {
                Keyboard.dismiss();
                setComposerFocused(false);
                void Haptics.selectionAsync();
                setAttachmentMenuVisible((current) => !current);
              }}
              onVoice={() =>
                Alert.alert(
                  'Голосовой ввод',
                  'Голосовой режим пока не подключён.',
                )
              }
            />
          </Animated.View>
          {historyRendered ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть историю чатов"
              onPress={closeHistory}
              pointerEvents={historyOpen ? 'auto' : 'none'}
              style={styles.historyDismissLayer}
            />
          ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
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
    gap: 20,
  },
  suggestionsMotion: {
    width: '100%',
    overflow: 'hidden',
  },
  attachmentMenuAnchor: {
    position: 'absolute',
    left: 0,
    bottom: 58,
    zIndex: 20,
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
