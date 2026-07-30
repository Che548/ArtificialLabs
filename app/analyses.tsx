import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useHealthStore } from '../lib/health-store';
import { persistLabDocument } from '../lib/local-files';

const recommendations = {
  planning: [
    ['progesterone', 'Прогестерон', 'По фазе цикла'],
    ['thyroid', 'ТТГ', 'В течение месяца'],
  ],
  pregnancy: [
    ['blood-count', 'Общий анализ крови', 'В течение месяца'],
    ['urine', 'Общий анализ мочи', 'В течение 2 недель'],
  ],
} as const;

export default function AnalysesScreen() {
  const insets = useSafeAreaInsets();
  const { profile, labResults, addLabResult, readOnly } = useHealthStore();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [analyte, setAnalyte] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [documentUri, setDocumentUri] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const pickDocument = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (!result.canceled)
      setDocumentUri(await persistLabDocument(result.assets[0].uri));
  };

  const save = async () => {
    if (!title.trim() || !analyte.trim() || !value.trim()) {
      setError('Заполните название анализа, показатель и значение.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await addLabResult({
        catalogKey: title.trim().toLowerCase().replace(/\s+/g, '-'),
        title: title.trim(),
        collectedAt: Date.now(),
        status: 'unreviewed',
        analytes: [
          {
            name: analyte.trim(),
            value: value.trim(),
            unit: unit.trim() || undefined,
          },
        ],
        hasLocalSourceDocument: Boolean(documentUri),
        localDocumentUri: documentUri,
      });
      setTitle('');
      setAnalyte('');
      setValue('');
      setUnit('');
      setDocumentUri(undefined);
      setFormOpen(false);
    } catch (cause) {
      console.error('Saving lab result failed', cause);
      setError('Не удалось сохранить результат.');
    } finally {
      setSaving(false);
    }
  };

  const items = recommendations[profile?.goal ?? 'planning'];
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
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="font-sf-semibold text-[30px] leading-9 text-ink">
              Анализы
            </Text>
            <Text className="text-text-secondary mt-1 font-sf text-[15px]">
              План и подтверждённые результаты
            </Text>
          </View>
          <Pressable
            disabled={readOnly}
            onPress={() => setFormOpen(true)}
            className={`h-11 items-center justify-center rounded-full px-5 ${readOnly ? 'bg-state-disabled' : 'bg-brand-primary'}`}
          >
            <Text className="font-sf-medium text-[14px] text-white">
              Добавить
            </Text>
          </Pressable>
        </View>

        <View className="mt-5 flex-row gap-3">
          <View className="shadow-card flex-1 rounded-card-lg bg-white p-4">
            <Text className="font-yaro text-[32px] text-brand-primary">
              {labResults.length}
            </Text>
            <Text className="text-text-secondary font-sf text-[13px]">
              результатов сохранено
            </Text>
          </View>
          <View className="shadow-card flex-1 rounded-card-lg bg-white p-4">
            <Text className="font-yaro text-[32px] text-brand-primary">
              {items.length}
            </Text>
            <Text className="text-text-secondary font-sf text-[13px]">
              рекомендовано сейчас
            </Text>
          </View>
        </View>

        <Text className="mt-6 font-sf-semibold text-[20px] text-ink">
          Ближайшие проверки
        </Text>
        {items.map(([key, name, due]) => (
          <View
            key={key}
            className="shadow-card mt-3 rounded-card-lg bg-white p-4"
          >
            <Text className="font-sf-semibold text-[17px] text-ink">
              {name}
            </Text>
            <Text className="text-text-secondary mt-1 font-sf text-[14px]">
              {due}
            </Text>
          </View>
        ))}

        <Text className="mt-6 font-sf-semibold text-[20px] text-ink">
          История
        </Text>
        {labResults.filter((item) => !item.deletedAt).length ? (
          labResults
            .filter((item) => !item.deletedAt)
            .map((result) => (
              <View
                key={result.localId}
                className="shadow-card mt-3 rounded-card-lg bg-white p-4"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="font-sf-semibold text-[17px] text-ink">
                      {result.title}
                    </Text>
                    <Text className="text-text-secondary mt-1 font-sf text-[13px]">
                      {new Date(result.collectedAt).toLocaleDateString('ru-RU')}
                      {result.hasLocalSourceDocument
                        ? ' · исходник на устройстве'
                        : ''}
                    </Text>
                  </View>
                  <View className="rounded-full bg-surface-warm px-3 py-1.5">
                    <Text className="font-sf-medium text-[12px] text-ink">
                      Нужна проверка
                    </Text>
                  </View>
                </View>
                {result.analytes.map((item) => (
                  <View
                    key={`${result.localId}-${item.name}`}
                    className="mt-3 flex-row justify-between border-t border-surface-divider pt-3"
                  >
                    <Text className="text-text-secondary font-sf text-[14px]">
                      {item.name}
                    </Text>
                    <Text className="font-sf-semibold text-[14px] text-ink">
                      {item.value}
                      {item.unit ? ` ${item.unit}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ))
        ) : (
          <View className="mt-3 rounded-card-lg bg-white p-5">
            <Text className="text-text-secondary font-sf text-[14px] leading-5">
              Пока нет результатов. Добавьте значение вручную; OCR появится
              отдельным этапом.
            </Text>
          </View>
        )}
      </ScrollView>

      {formOpen ? (
        <View className="absolute inset-0 z-50 justify-end bg-black/30 px-4 pb-[92px]">
          <View className="rounded-[30px] bg-white p-5">
            <View className="flex-row items-center justify-between">
              <Text className="font-sf-semibold text-[22px] text-ink">
                Новый результат
              </Text>
              <Pressable
                onPress={() => setFormOpen(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-[#f2f2f7]"
              >
                <Text className="text-[22px]">×</Text>
              </Pressable>
            </View>
            {[
              ['Название анализа', title, setTitle],
              ['Показатель', analyte, setAnalyte],
              ['Значение', value, setValue],
              ['Единица', unit, setUnit],
            ].map(([placeholder, field, setter]) => (
              <TextInput
                key={placeholder as string}
                value={field as string}
                onChangeText={setter as (text: string) => void}
                placeholder={placeholder as string}
                className="mt-3 h-11 rounded-2xl bg-[#f2f2f7] px-4 font-sf text-[15px] text-ink"
              />
            ))}
            <Pressable
              onPress={() => void pickDocument()}
              className="mt-3 h-11 items-center justify-center rounded-full border border-brand-primary"
            >
              <Text className="font-sf-medium text-[14px] text-brand-primary">
                {documentUri
                  ? 'Фото сохранено на устройстве'
                  : 'Добавить фото результата'}
              </Text>
            </Pressable>
            {error ? (
              <Text className="mt-3 font-sf text-[13px] text-state-error">
                {error}
              </Text>
            ) : null}
            <Pressable
              disabled={saving}
              onPress={() => void save()}
              className="mt-4 h-12 items-center justify-center rounded-full bg-brand-primary"
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-sf-medium text-[15px] text-white">
                  Сохранить
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
