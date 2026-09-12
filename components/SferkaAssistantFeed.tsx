import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  markAssistantWelcomeRead,
  useAssistantUnread,
  useAssistantWelcomeCreatedAt,
} from '../lib/assistant-inbox';
import { Image, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, colors } from '../design-system';

const mascot = require('../assets/figma/chat/mascot.png');

// Local welcome content: opening the feed does not send data to the assistant.
export function SferkaAssistantFeed({
  topInset,
  bottomInset,
}: {
  topInset: number;
  bottomInset: number;
}) {
  const focused = useIsFocused();
  const unread = useAssistantUnread();
  const createdAt = useAssistantWelcomeCreatedAt();
  const dateLabel = createdAt == null ? null : new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(createdAt));
  useEffect(() => {
    if (!focused || !unread) return;
    const timer = setTimeout(markAssistantWelcomeRead, 1000);
    return () => clearTimeout(timer);
  }, [focused, unread]);
  return (
    <ScrollView
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

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, flexGrow: 1 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FCE4EE',
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
    backgroundColor: '#FFF1F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationImage: { width: '125%', height: '100%' },
});
