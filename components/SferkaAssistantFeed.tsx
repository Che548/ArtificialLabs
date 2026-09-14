import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  markAssistantWelcomeRead,
  useAssistantUnread,
  useAssistantReminders,
  useAssistantWelcomeCreatedAt,
} from '../lib/assistant-inbox';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, colors } from '../design-system';

import { useRouter } from 'expo-router';
import { useHealthStore } from '../lib/health-store';
import { assistantReminderRoute } from '../lib/assistant-notifications';

const mascot = require('../assets/figma/chat/mascot.png');

// Local welcome content: opening the feed does not send data to the assistant.
export function SferkaAssistantFeed({
  topInset,
  bottomInset,
}: {
  topInset: number;
  bottomInset: number;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const focused = useIsFocused();
  const router = useRouter();
  const { markReminderRead, readOnly } = useHealthStore();
  const reminders = useAssistantReminders();
  const unread = useAssistantUnread();
  const createdAt = useAssistantWelcomeCreatedAt();
  const dateLabel =
    createdAt == null
      ? null
      : new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
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
              <AppText style={styles.messageDate}>{dateLabel}</AppText>
            ) : null}
          </View>
        </View>
      </View>
      {reminders.map((reminder) => (
        <View key={reminder.localId} style={styles.messageRow}>
          <View style={styles.avatar} accessible={false}>
            <Image
              source={mascot}
              style={styles.avatarImage}
              resizeMode="contain"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${reminder.readAt ? '' : 'Новое уведомление. '}${reminder.title}`}
            style={styles.messageBody}
            onPress={() => {
              if (!readOnly && !reminder.readAt)
                void markReminderRead(reminder).catch(() => undefined);
              router.push(assistantReminderRoute(reminder));
            }}
          >
            <View style={styles.bubble}>
              <AppText style={styles.copy} weight="semibold">
                {reminder.title}
              </AppText>
              <AppText style={styles.copy}>{reminder.body}</AppText>
              <AppText style={styles.messageDate}>
                {new Intl.DateTimeFormat('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(reminder.dueAt))}
              </AppText>
            </View>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { paddingHorizontal: 20, flexGrow: 1, gap: 16 },
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
  messageDate: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
    textAlign: 'right',
  },
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
