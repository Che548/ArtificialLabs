import { useAssistantFeedPosition } from '../lib/use-assistant-feed-position';
import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { useIsFocused } from '@react-navigation/native';
import {
  markAssistantWelcomeRead,
  useAssistantWelcomeCreatedAt,
} from '../lib/assistant-inbox';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, colors } from '../design-system';

const mascot = require('../assets/figma/chat/mascot.png');

// Local welcome content: opening the feed does not send data to the assistant.
export function SferkaAssistantFeed({
  topInset,
  bottomInset,
  active = true,
}: {
  topInset: number;
  bottomInset: number;
  active?: boolean;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const focused = useIsFocused();
  const createdAt = useAssistantWelcomeCreatedAt();
  const dateLabel = createdAt == null ? null : new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(createdAt));
  const feed = useAssistantFeedPosition({
    active: active && focused,
    ready: createdAt !== null,
    readOnly: true,
    reminders: [],
    contentKey: String(createdAt),
    markReminderRead: async () => {},
    markWelcomeRead: markAssistantWelcomeRead,
  });
  return (
    <ScrollView
      ref={feed.scrollRef}
      testID="assistant-message-feed"
      style={{ flex: 1, opacity: feed.positioned ? 1 : 0 }}
      onLayout={feed.onLayout}
      onContentSizeChange={feed.onContentSizeChange}
      onScroll={feed.onScroll}
      onScrollBeginDrag={feed.onScrollBeginDrag}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topInset, paddingBottom: bottomInset },
      ]}
    >
      <View style={styles.messageRow}>
        <View style={styles.avatar} accessible={false}>
          <Image
            source={mascot}
            style={styles.avatarImage}
            resizeMode="contain"
          />
        </View>
        <View style={styles.messageBody}>
          <View style={styles.bubble}>
            <AppText style={styles.copy}>Привет! Я Сферка</AppText>
            <AppText style={styles.copy}>
              Здесь будут мои сообщения для тебя: напоминания и подсказки,
              которые помогут заботиться о себе.
            </AppText>
            <AppText style={styles.copy}>
              А если захочешь что-то спросить — я рядом во вкладке «Чат».
            </AppText>
            <View style={styles.illustration}>
              <Image
                source={mascot}
                accessibilityLabel="Улыбающаяся розовая Сферка"
                resizeMode="contain"
                style={styles.illustrationImage}
              />
            </View>
            {dateLabel ? (
              <AppText style={styles.messageDate}>
                {dateLabel}
              </AppText>
            ) : null}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { paddingHorizontal: 20, flexGrow: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.rose : '#FCE4EE',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 64, height: 44 },
  messageBody: { flex: 1, minWidth: 0 },
  bubble: {
    backgroundColor: colors.surface.raised,
    borderRadius: 24,
    borderTopLeftRadius: 6,
    padding: 16,
    gap: 12,
  },
  copy: { fontSize: 17, lineHeight: 23 },
  messageDate: { fontSize: 12, lineHeight: 16, color: colors.text.secondary, textAlign: 'right' },
  illustration: {
    aspectRatio: 1.35,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.rose : '#FFF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationImage: { width: '125%', height: '100%' },
});
