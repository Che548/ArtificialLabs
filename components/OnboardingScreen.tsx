import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

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
  const [goal, setGoal] = useState<HealthGoal>('planning');
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
    if (goal === 'planning' && (!Number.isInteger(length) || length < 20 || length > 45)) {
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
        lastPeriodStartAt: goal === 'planning' ? parsedDate : undefined,
        cycleLengthDays: goal === 'planning' ? length : undefined,
      });
    } catch (cause) {
      console.error('Onboarding failed', cause);
      setError('Не удалось сохранить профиль. Проверьте соединение и повторите.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 justify-center bg-surface-rose px-5">
      <View className="rounded-[30px] bg-white p-6 shadow-card">
        <Text className="font-sf-semibold text-[27px] leading-8 text-ink">Настроим мониторинг</Text>
        <Text className="mt-2 font-sf text-[15px] leading-5 text-text-secondary">
          Минимальные данные сохраняются в зашифрованной базе на устройстве и синхронизируются только после вашего согласия.
        </Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Как к вам обращаться"
          className="mt-5 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[16px] text-ink"
        />
        <View className="mt-3 flex-row gap-2">
          {(['planning', 'pregnancy'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setGoal(value)}
              className={`h-12 flex-1 items-center justify-center rounded-full ${goal === value ? 'bg-brand-primary' : 'bg-[#f2f2f7]'}`}
            >
              <Text className={`font-sf-medium text-[14px] ${goal === value ? 'text-white' : 'text-ink'}`}>
                {value === 'planning' ? 'Планирование' : 'Беременность'}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={date}
          onChangeText={setDate}
          keyboardType="numbers-and-punctuation"
          placeholder={goal === 'planning' ? 'Первый день последних месячных: ГГГГ-ММ-ДД' : 'Начало беременности: ГГГГ-ММ-ДД'}
          className="mt-3 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[15px] text-ink"
        />
        {goal === 'planning' ? (
          <TextInput
            value={cycleLength}
            onChangeText={setCycleLength}
            keyboardType="number-pad"
            placeholder="Средняя длина цикла"
            className="mt-3 h-12 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[15px] text-ink"
          />
        ) : null}
        {error ? <Text className="mt-3 font-sf text-[14px] text-state-error">{error}</Text> : null}
        <Pressable
          disabled={submitting}
          onPress={() => void submit()}
          className="mt-5 h-12 items-center justify-center rounded-full bg-brand-primary active:opacity-70"
        >
          {submitting ? <ActivityIndicator color="white" /> : <Text className="font-sf-medium text-[16px] text-white">Продолжить</Text>}
        </Pressable>
      </View>
    </View>
  );
}
