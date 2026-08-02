import { useAuthActions } from '@convex-dev/auth/react';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHealthStore } from '../lib/health-store';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuthActions();
  const {
    profile,
    programs,
    reminders,
    syncStatus,
    readOnly,
    setProgramStatus,
    markReminderRead,
    syncNow,
  } = useHealthStore();
  const [message, setMessage] = useState<string>();
  const activeProgram = programs.find((program) => !program.deletedAt);

  const synchronize = async () => {
    setMessage(undefined);
    await syncNow();
    setMessage('Локальные изменения отправлены в Convex.');
  };

  return (
    <View className="flex-1 bg-surface-canvas">
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: 120,
        }}
        className="px-4"
      >
        <Text className="font-sf-semibold text-[30px] text-ink">Профиль</Text>
        <View className="shadow-card mt-5 items-center rounded-card-lg bg-white p-5">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-ink">
            <Text className="font-yaro text-[28px] text-white">
              {(profile?.displayName ?? 'Д').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text className="mt-3 font-sf-semibold text-[20px] text-ink">
            {profile?.displayName ?? 'Демо-профиль'}
          </Text>
          <Text className="text-text-secondary mt-1 font-sf text-[14px]">
            {profile?.goal === 'pregnancy'
              ? 'Сопровождение беременности'
              : 'Планирование беременности'}
          </Text>
        </View>

        <Text className="mt-6 font-sf-semibold text-[20px] text-ink">
          Программа
        </Text>
        <View className="shadow-card mt-3 rounded-card-lg bg-white p-4">
          <Text className="font-sf-semibold text-[17px] text-ink">
            {activeProgram?.title ?? 'Программа создаётся'}
          </Text>
          <Text className="text-text-secondary mt-1 font-sf text-[14px]">
            {activeProgram?.status === 'paused'
              ? 'Приостановлена · история сохранена'
              : 'Активна'}
          </Text>
          {activeProgram ? (
            <Pressable
              disabled={readOnly}
              onPress={() =>
                void setProgramStatus(
                  activeProgram,
                  activeProgram.status === 'paused' ? 'active' : 'paused',
                )
              }
              className="mt-4 h-10 items-center justify-center rounded-full border border-brand-primary"
            >
              <Text className="font-sf-medium text-[14px] text-brand-primary">
                {activeProgram.status === 'paused'
                  ? 'Возобновить'
                  : 'Приостановить'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Text className="mt-6 font-sf-semibold text-[20px] text-ink">
          Уведомления
        </Text>
        {reminders
          .filter((item) => !item.deletedAt)
          .map((reminder) => (
            <Pressable
              key={reminder.localId}
              disabled={readOnly}
              onPress={() => void markReminderRead(reminder)}
              className={`mt-3 rounded-card-lg p-4 ${reminder.readAt ? 'bg-white/60' : 'bg-white'} shadow-card`}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="font-sf-semibold text-[16px] text-ink">
                    {reminder.title}
                  </Text>
                  <Text className="text-text-secondary mt-1 font-sf text-[14px] leading-5">
                    {reminder.body}
                  </Text>
                </View>
                {!reminder.readAt ? (
                  <View className="mt-1 h-2.5 w-2.5 rounded-full bg-brand-primary" />
                ) : null}
              </View>
            </Pressable>
          ))}

        <Text className="mt-6 font-sf-semibold text-[20px] text-ink">
          Данные и синхронизация
        </Text>
        <View className="shadow-card mt-3 rounded-card-lg bg-white p-4">
          <Text className="text-text-secondary font-sf text-[14px] leading-5">
            Записи хранятся в SQLCipher на устройстве. В Convex передаются
            только структурированные значения; фотографии и документы не
            загружаются.
          </Text>
          <Pressable
            disabled={readOnly || syncStatus === 'syncing'}
            onPress={() => void synchronize()}
            className="mt-4 h-11 items-center justify-center rounded-full bg-brand-primary"
          >
            <Text className="font-sf-medium text-[14px] text-white">
              {syncStatus === 'syncing'
                ? 'Синхронизация…'
                : 'Синхронизировать сейчас'}
            </Text>
          </Pressable>
          {message ? (
            <Text className="mt-3 font-sf text-[13px] text-brand-success">
              {message}
            </Text>
          ) : null}
          {syncStatus === 'error' ? (
            <Text className="mt-3 font-sf text-[13px] text-state-error">
              Нет связи с сервером. Изменения остались в outbox.
            </Text>
          ) : null}
        </View>

        {!readOnly ? (
          <Pressable
            onPress={() => void signOut()}
            className="mt-6 h-12 items-center justify-center rounded-full border border-state-error"
          >
            <Text className="font-sf-medium text-[15px] text-state-error">
              Выйти
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
