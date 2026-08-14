import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { ProfileVerticalChoiceControl } from '../design-system';
import { useHealthStore } from '../lib/health-store';
import type { HealthGoal } from '../lib/health-types';

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const timestamp = new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function OnboardingScreen() {
  const { completeOnboarding } = useHealthStore();
  const [displayName, setDisplayName] = useState('');
  const [goal, setGoal] = useState<HealthGoal>('cycle');
  const [date, setDate] = useState('');
  const [cycleLength, setCycleLength] = useState('28');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const parsedDate = parseDate(date);
    if (!displayName.trim() || !parsedDate) {
      setError('Укажите имя и дату в формате ГГГГ-ММ-ДД.');
      return;
    }
    const length = Number(cycleLength);
    if (
      goal !== 'pregnancy' &&
      (!Number.isInteger(length) || length < 20 || length > 45)
    ) {
      setError('Длина цикла должна быть от 20 до 45 дней.');
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      await completeOnboarding({
        displayName: displayName.trim(),
        goal,
        pregnancyStartAt: goal === 'pregnancy' ? parsedDate : undefined,
        lastPeriodStartAt: goal !== 'pregnancy' ? parsedDate : undefined,
        cycleLengthDays: goal !== 'pregnancy' ? length : undefined,
      });
    } catch (cause) {
      console.error('Onboarding failed', cause);
      setError(
        'Не удалось сохранить профиль. Проверьте соединение и повторите.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TouchableWithoutFeedback
      accessible={false}
      onPress={Keyboard.dismiss}
      touchSoundDisabled
    >
      <View className="flex-1 justify-center bg-surface-rose px-5">
        <View className="rounded-[30px] bg-white p-6 shadow-card">
          <Text className="font-sf-semibold text-[27px] leading-8 text-ink">
            Настроим мониторинг
          </Text>
          <Text className="mt-2 font-sf text-[15px] leading-5 text-text-secondary">
            Минимальные данные сохраняются в зашифрованной базе на устройстве и
            синхронизируются только после вашего согласия.
          </Text>
          <TextInput
            testID="e2e-onboarding-name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Как к вам обращаться"
            className="mt-5 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[16px] text-ink"
          />
          <View className="mt-3">
            <ProfileVerticalChoiceControl
              accessibilityLabel="Цель использования"
              defaultValue="cycle"
              value={goal}
              options={[
                { value: 'cycle', label: 'Отслеживание цикла' },
                { value: 'planning', label: 'Планирование' },
                { value: 'pregnancy', label: 'Беременность' },
              ]}
              onChange={setGoal}
            />
          </View>
          <TextInput
            testID="e2e-onboarding-date"
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
            placeholder={
              goal !== 'pregnancy'
                ? 'Первый день последних месячных: ГГГГ-ММ-ДД'
                : 'Начало беременности: ГГГГ-ММ-ДД'
            }
            className="mt-3 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[15px] text-ink"
          />
          {goal !== 'pregnancy' ? (
            <TextInput
              testID="e2e-onboarding-cycle-length"
              value={cycleLength}
              onChangeText={setCycleLength}
              keyboardType="number-pad"
              placeholder="Средняя длина цикла"
              className="mt-3 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[15px] text-ink"
            />
          ) : null}
          {error ? (
            <Text className="mt-3 font-sf text-[14px] text-state-error">
              {error}
            </Text>
          ) : null}
          <Pressable
            testID="e2e-onboarding-submit"
            disabled={submitting}
            onPress={() => void submit()}
            className="mt-5 h-12 items-center justify-center rounded-full bg-brand-primary active:opacity-70"
          >
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="font-sf-medium text-[16px] text-white">
                Продолжить
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}
