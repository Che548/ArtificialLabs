import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnalysisAttentionHero,
  AnalysisDeadlineSummary,
  AnalysisReferenceHeader,
  AnalysisReferencePlanCard,
  AnalysisTabs,
  AppText,
  colors,
  type AnalysisPlanCardProps,
  type AnalysisTabKey,
  fonts,
  radii,
  shadows,
  sizes,
  spacing,
} from '../design-system';
import { useHealthStore } from '../lib/health-store';
import { persistLabDocument } from '../lib/local-files';

const bloodTubesImage = require('../assets/analyses/blood-tubes.png');
const ultrasoundImage = require('../assets/analyses/ultrasound.png');
const hysteroscopeImage = require('../assets/analyses/hysteroscope.png');
const mascotHandsImage = require('../assets/analyses/mascot-hands-reference.png');

type PlannedAnalysis = Omit<AnalysisPlanCardProps, 'onView'> & {
  id: string;
  tab: Exclude<AnalysisTabKey, 'completed'>;
};

const plannedAnalyses: PlannedAnalysis[] = [
  {
    id: 'blood-count',
    tab: 'current',
    title: 'Исследования крови',
    description: 'Общий анализ крови, гематокрит, гемоглобин, тромбоциты',
    category: 'Лаборатория',
    dueLabel: 'Сдать до',
    dueValue: '14 августа',
    validityLabel: 'Актуален',
    validityValue: '30 дней',
    status: 'Осталось 6 Дней',
    image: bloodTubesImage,
    imagePosition: 'center',
    tone: 'rose',
  },
  {
    id: 'pelvic-ultrasound',
    tab: 'current',
    title: 'УЗИ малого таза',
    description: 'Ультразвуковое исследование органов малого таза',
    category: 'Диагностика',
    dueLabel: 'Пройти до',
    dueValue: '26 августа',
    validityLabel: 'Актуально',
    validityValue: '3 месяца',
    status: 'Запланировать визит',
    image: ultrasoundImage,
    imagePosition: 'center',
    tone: 'lilac',
  },
  {
    id: 'hysteroscopy',
    tab: 'upcoming',
    title: 'Гистероскопия',
    description: 'Исследование полости матки и эндометрия',
    category: 'Процедура',
    dueLabel: 'Рекомендуемая дата',
    dueValue: '5 сентября',
    validityLabel: 'Актуально',
    validityValue: '6 месяцев',
    status: 'В следующем месяце',
    image: hysteroscopeImage,
    imagePosition: 'top',
    tone: 'pearl',
  },
];

export default function AnalysesScreen() {
  const insets = useSafeAreaInsets();
  const headerTop = Platform.OS === 'web' ? 16 : Math.max(16, insets.top + 8);
  const { labResults, addLabResult, readOnly } = useHealthStore();
  const [activeTab, setActiveTab] = useState<AnalysisTabKey>('current');
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [analyte, setAnalyte] = useState('');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [documentUri, setDocumentUri] = useState<string>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const savedResults = useMemo(
    () => labResults.filter((item) => !item.deletedAt),
    [labResults],
  );

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
      setActiveTab('completed');
    } catch (cause) {
      console.error('Saving lab result failed', cause);
      setError('Не удалось сохранить результат.');
    } finally {
      setSaving(false);
    }
  };

  const visiblePlans =
    activeTab === 'upcoming'
      ? plannedAnalyses
      : plannedAnalyses.filter((item) => item.tab === 'current');

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: headerTop + 48,
            paddingBottom: Math.max(insets.bottom + 118, 132),
          },
        ]}
      >
        <View style={styles.heroWrap}>
          <AnalysisAttentionHero
            mascot={mascotHandsImage}
            score={72}
            onPress={() => setActiveTab('current')}
          />
        </View>

        <AnalysisDeadlineSummary
          currentCount={
            plannedAnalyses.filter((item) => item.tab === 'current').length
          }
          upcomingCount={plannedAnalyses.length}
          onCurrent={() => setActiveTab('current')}
          onUpcoming={() => setActiveTab('upcoming')}
          style={styles.summaryWrap}
        />

        <View style={styles.tabsWrap}>
          <AnalysisTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            variant={2}
          />
        </View>

        {activeTab !== 'completed' ? (
          <View style={styles.cardsList}>
            {visiblePlans.map((item) => (
              <AnalysisReferencePlanCard
                key={item.id}
                title={item.title}
                description={item.description}
                dueLabel={item.dueLabel}
                dueValue={item.dueValue}
                validityLabel={item.validityLabel}
                validityValue={item.validityValue}
                image={item.image}
                onView={() => undefined}
              />
            ))}
          </View>
        ) : savedResults.length ? (
          <View style={styles.cardsList}>
            {savedResults.map((result, index) => {
              const firstAnalyte = result.analytes[0];
              const resultImages = [
                bloodTubesImage,
                ultrasoundImage,
                hysteroscopeImage,
              ];
              return (
                <AnalysisReferencePlanCard
                  key={result.localId}
                  title={result.title}
                  dueLabel="Дата сдачи"
                  dueValue={new Date(result.collectedAt).toLocaleDateString(
                    'ru-RU',
                  )}
                  validityLabel={firstAnalyte?.name ?? 'Результат'}
                  validityValue={
                    firstAnalyte
                      ? `${firstAnalyte.value}${firstAnalyte.unit ? ` ${firstAnalyte.unit}` : ''}`
                      : 'Сохранён'
                  }
                  image={resultImages[index % resultImages.length]}
                  onView={() => undefined}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <AppText role="heading" weight="semibold">
              Здесь появятся результаты
            </AppText>
            <AppText
              role="label"
              color={colors.text.secondary}
              style={styles.emptyCopy}
            >
              Добавьте анализ вручную или прикрепите фотографию документа —
              данные сохранятся на устройстве.
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить первый результат"
              disabled={readOnly}
              onPress={() => setFormOpen(true)}
              style={({ pressed }) => [
                styles.emptyButton,
                readOnly && styles.addButtonDisabled,
                pressed && !readOnly && styles.pressed,
              ]}
            >
              <AppText
                role="label"
                weight="medium"
                color={colors.brand.primary}
              >
                Добавить результат
              </AppText>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={[colors.surface.canvas, colors.surface.canvas, 'rgba(245,243,243,0)']}
        locations={[0, 0.72, 1]}
        style={[styles.headerFade, { height: headerTop + 48 }]}
      />

      <View style={[styles.fixedHeader, { top: headerTop }]}>
        <AnalysisReferenceHeader
          dateLabel="21 июля"
          onChart={() => setActiveTab('completed')}
          onDate={() => undefined}
          onCalendar={() => setActiveTab('upcoming')}
        />
      </View>

      {formOpen ? (
        <View style={styles.modalBackdrop}>
          <View style={styles.formSheet}>
            <View style={styles.formHeader}>
              <AppText role="heading" weight="semibold">
                Новый результат
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                onPress={() => setFormOpen(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
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
                placeholderTextColor="rgba(115,110,108,0.72)"
                style={styles.input}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить фото результата"
              onPress={() => void pickDocument()}
              style={styles.photoButton}
            >
              <AppText
                role="label"
                weight="medium"
                color={colors.brand.primary}
              >
                {documentUri
                  ? 'Фото сохранено на устройстве'
                  : 'Добавить фото результата'}
              </AppText>
            </Pressable>
            {error ? (
              <AppText
                role="caption"
                color={colors.state.error}
                style={styles.error}
              >
                {error}
              </AppText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сохранить результат"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={() => void save()}
              style={styles.saveButton}
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <AppText
                  role="label"
                  weight="medium"
                  color={colors.text.inverse}
                >
                  Сохранить
                </AppText>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  headerFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 8,
  },
  fixedHeader: {
    position: 'absolute',
    right: sizes.screenGutter,
    left: sizes.screenGutter,
    zIndex: 10,
  },
  addButtonDisabled: {
    backgroundColor: colors.state.disabled,
  },
  heroWrap: {
    marginTop: spacing.md,
    zIndex: 2,
  },
  summaryWrap: {
    alignSelf: 'stretch',
    marginTop: 16,
  },
  tabsWrap: {
    marginTop: 16,
  },
  cardsList: {
    marginTop: 20,
    gap: spacing.md,
  },
  emptyState: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    padding: spacing.lg,
    ...shadows.card,
  },
  emptyCopy: {
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  emptyButton: {
    minHeight: 44,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(211,20,113,0.36)',
    backgroundColor: colors.surface.raised,
    paddingHorizontal: spacing.md,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.30)',
    paddingHorizontal: sizes.screenGutter,
    paddingBottom: 92,
  },
  formSheet: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    padding: 20,
    ...shadows.floating,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: '#F2F2F7',
  },
  closeButtonText: {
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 22,
    lineHeight: 24,
  },
  input: {
    height: 44,
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    paddingHorizontal: 16,
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 15,
  },
  photoButton: {
    height: 44,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brand.primary,
  },
  error: {
    marginTop: 12,
  },
  saveButton: {
    height: 48,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
});
