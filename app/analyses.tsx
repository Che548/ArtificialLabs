import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
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
  getHeaderTop,
  HealthInsightsPage,
  shadows,
  sizes,
  spacing,
} from '../design-system';
import { useHealthStore } from '../lib/health-store';
import { persistLabDocument } from '../lib/local-files';
import { calculateCompletionScore } from '../lib/product-insights';

const bloodTubesImage = require('../assets/analyses/blood-tubes.png');
const ultrasoundImage = require('../assets/analyses/ultrasound.png');
const hysteroscopeImage = require('../assets/analyses/hysteroscope.png');
const mascotHandsImage = require('../assets/analyses/mascot-hands-reference.png');

type PlannedAnalysis = Omit<AnalysisPlanCardProps, 'onView'> & {
  clinic: string;
  id: string;
  purpose: string;
  requirements: string[];
  tab: Exclude<AnalysisTabKey, 'completed'>;
};

type PendingAnalysisAttachment = {
  kind: 'file' | 'photo';
  name: string;
  uri: string;
};

const plannedAnalyses: PlannedAnalysis[] = [
  {
    id: 'blood-count',
    tab: 'current',
    title: 'Исследования крови',
    description: 'Общий анализ крови, гематокрит, гемоглобин, тромбоциты',
    category: 'Лаборатория',
    dueLabel: 'Сдать до',
    dueValue: '22 августа',
    validityLabel: 'Актуален',
    validityValue: '30 дней',
    status: 'Осталось 6 Дней',
    image: bloodTubesImage,
    imagePosition: 'center',
    tone: 'rose',
    requirements: [
      'Общий анализ крови с лейкоцитарной формулой',
      'Гематокрит и гемоглобин',
      'Количество тромбоцитов',
    ],
    purpose:
      'Чтобы оценить уровень гемоглобина, исключить анемию и заметить признаки воспаления до следующего этапа наблюдения.',
    clinic: 'Клиника-партнёр рядом с вами',
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
    requirements: [
      'УЗИ матки и эндометрия',
      'Оценка яичников и фолликулярного аппарата',
      'Заключение врача ультразвуковой диагностики',
    ],
    purpose:
      'Чтобы оценить состояние органов малого таза и уточнить факторы, которые могут влиять на цикл и планирование беременности.',
    clinic: 'Центр женского здоровья рядом с вами',
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
    requirements: [
      'Гистероскопия по направлению врача',
      'Заключение о состоянии полости матки',
      'Результаты биопсии, если она проводилась',
    ],
    purpose:
      'Чтобы детально оценить полость матки и эндометрий, когда данных УЗИ недостаточно для принятия решения.',
    clinic: 'Профильная гинекологическая клиника',
  },
];

export default function AnalysesScreen() {
  const insets = useSafeAreaInsets();
  const headerTop = getHeaderTop(insets.top);
  const {
    journalEntries,
    labResults,
    profile,
    scanResults,
    addLabResult,
    readOnly,
  } = useHealthStore();
  const [activeTab, setActiveTab] = useState<AnalysisTabKey>('current');
  const [selectedAnalysis, setSelectedAnalysis] = useState<PlannedAnalysis>();
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAnalysisAttachment>();
  const [attachmentError, setAttachmentError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [attachmentPicking, setAttachmentPicking] = useState(false);
  const [modalViewportHeight, setModalViewportHeight] = useState(0);
  const [modalContentHeight, setModalContentHeight] = useState(0);
  const [chartsVisible, setChartsVisible] = useState(false);

  const savedResults = useMemo(
    () => labResults.filter((item) => !item.deletedAt),
    [labResults],
  );

  const attachedResultsByPlan = useMemo(() => {
    const result = new Map<string, (typeof savedResults)[number]>();
    for (const item of savedResults) {
      if (item.hasLocalSourceDocument && item.localDocumentUri) {
        result.set(item.catalogKey, item);
      }
    }
    return result;
  }, [savedResults]);

  const closeAnalysis = () => {
    if (saving || attachmentPicking) return;
    setSelectedAnalysis(undefined);
    setPendingAttachment(undefined);
    setAttachmentError(undefined);
  };

  const openAnalysis = (analysis: PlannedAnalysis) => {
    setSelectedAnalysis(analysis);
    setPendingAttachment(undefined);
    setAttachmentError(undefined);
  };

  const pickAnalysisAttachment = async (kind: 'file' | 'photo') => {
    setAttachmentPicking(true);
    setAttachmentError(undefined);

    try {
      if (kind === 'photo') {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setAttachmentError(
            'Разрешите доступ к фото, чтобы выбрать результат.',
          );
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.9,
        });
        if (result.canceled) return;

        const asset = result.assets[0];
        setPendingAttachment({
          kind,
          name: asset.fileName || 'Фото результата',
          uri: asset.uri,
        });
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/pdf', 'image/*'],
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      setPendingAttachment({
        kind,
        name: asset.name || 'Файл результата',
        uri: asset.uri,
      });
    } catch (cause) {
      console.error('Picking analysis attachment failed', cause);
      setAttachmentError(
        'Не удалось прикрепить результат. Попробуйте ещё раз.',
      );
    } finally {
      setAttachmentPicking(false);
    }
  };

  const saveAnalysisAttachment = async () => {
    if (!selectedAnalysis || !pendingAttachment || readOnly) return;

    setSaving(true);
    setAttachmentError(undefined);
    try {
      const persistedDocumentUri = await persistLabDocument(
        pendingAttachment.uri,
      );
      await addLabResult({
        catalogKey: selectedAnalysis.id,
        title: selectedAnalysis.title,
        collectedAt: Date.now(),
        status: 'unreviewed',
        analytes: [
          {
            name: 'Результат',
            value: 'Прикреплён',
          },
        ],
        hasLocalSourceDocument: true,
        localDocumentUri: persistedDocumentUri,
      });
      setSelectedAnalysis(undefined);
      setPendingAttachment(undefined);
    } catch (cause) {
      console.error('Saving planned analysis result failed', cause);
      setAttachmentError('Не удалось сохранить результат.');
    } finally {
      setSaving(false);
    }
  };

  const modalScrollEnabled =
    modalViewportHeight > 0 && modalContentHeight > modalViewportHeight + 1;

  const visiblePlans =
    activeTab === 'upcoming'
      ? plannedAnalyses.filter((item) => item.tab === 'upcoming')
      : plannedAnalyses.filter((item) => item.tab === 'current');
  const currentPlans = plannedAnalyses.filter((item) => item.tab === 'current');
  const attentionScore = calculateCompletionScore(
    currentPlans.map((item) => item.id),
    new Set(attachedResultsByPlan.keys()),
  );
  const selectedSavedResult = selectedAnalysis
    ? attachedResultsByPlan.get(selectedAnalysis.id)
    : undefined;
  const hasSelectedResult = Boolean(
    pendingAttachment || selectedSavedResult?.localDocumentUri,
  );

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
            score={attentionScore}
            onPress={() => setActiveTab('current')}
          />
        </View>

        <AnalysisDeadlineSummary
          currentCount={currentPlans.length}
          upcomingCount={
            plannedAnalyses.filter((item) => item.tab === 'upcoming').length
          }
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
                hasAttachedResult={attachedResultsByPlan.has(item.id)}
                image={item.image}
                onView={() => openAnalysis(item)}
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
            <AppText role="body" weight="regular" style={styles.emptyTitle}>
              Здесь появятся результаты
            </AppText>
          </View>
        )}
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={[
          colors.surface.canvas,
          colors.surface.canvas,
          'rgba(245,243,243,0)',
        ]}
        locations={[0, 0.72, 1]}
        style={[styles.headerFade, { height: headerTop + 48 }]}
      />

      <View style={[styles.fixedHeader, { top: headerTop }]}>
        <AnalysisReferenceHeader
          dateLabel="21 июля"
          onChart={() => setChartsVisible(true)}
          onDate={() => undefined}
          onCalendar={() => setActiveTab('upcoming')}
        />
      </View>

      <Modal
        animationType="slide"
        onRequestClose={closeAnalysis}
        presentationStyle="overFullScreen"
        statusBarTranslucent
        transparent
        visible={Boolean(selectedAnalysis)}
      >
        <View style={styles.analysisModalRoot}>
          <Pressable
            accessibilityLabel="Закрыть карточку анализа"
            disabled={saving || attachmentPicking}
            onPress={closeAnalysis}
            style={styles.analysisModalScrim}
          />

          <ScrollView
            alwaysBounceVertical={false}
            bounces={modalScrollEnabled}
            contentContainerStyle={styles.analysisModalPageContent}
            onContentSizeChange={(_width, height) =>
              setModalContentHeight(height)
            }
            onLayout={({ nativeEvent }) =>
              setModalViewportHeight(nativeEvent.layout.height)
            }
            scrollEnabled={modalScrollEnabled}
            showsVerticalScrollIndicator={false}
            style={styles.analysisModalPageScroll}
          >
            <Pressable
              accessibilityLabel="Закрыть карточку анализа"
              disabled={saving || attachmentPicking}
              onPress={closeAnalysis}
              style={styles.analysisModalDismissArea}
            />

            {selectedAnalysis ? (
              <View
                style={[
                  styles.analysisModalSheet,
                  { paddingBottom: Math.max(insets.bottom + 102, 118) },
                ]}
              >
                <View style={styles.analysisModalHandle} />

                <View style={styles.analysisModalHero}>
                  <View style={styles.analysisModalImageWrap}>
                    <Image
                      accessible
                      accessibilityLabel={`Изображение: ${selectedAnalysis.title}`}
                      resizeMode="contain"
                      source={selectedAnalysis.image as ImageSourcePropType}
                      style={styles.analysisModalImage}
                    />
                    <LinearGradient
                      pointerEvents="none"
                      colors={['rgba(255,255,255,0)', '#FFFFFF']}
                      locations={[0.42, 1]}
                      style={styles.analysisModalImageFade}
                    />
                  </View>

                  <View style={styles.analysisModalHeroCopy}>
                    <AppText
                      role="caption"
                      weight="semibold"
                      color={colors.brand.primary}
                      style={styles.analysisModalCategory}
                    >
                      {selectedAnalysis.category}
                    </AppText>
                    <AppText
                      role="title"
                      weight="semibold"
                      style={styles.analysisModalTitle}
                    >
                      {selectedAnalysis.title}
                    </AppText>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                      style={styles.analysisModalDescription}
                    >
                      {selectedAnalysis.description}
                    </AppText>
                  </View>
                </View>

                <View style={styles.analysisModalDates}>
                  <View style={styles.analysisModalDateCell}>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                      style={styles.analysisModalMetaLabel}
                    >
                      {selectedAnalysis.dueLabel}
                    </AppText>
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalMetaValue}
                    >
                      {selectedAnalysis.dueValue}
                    </AppText>
                  </View>
                  <View style={styles.analysisModalDateDivider} />
                  <View style={styles.analysisModalDateCell}>
                    <AppText
                      role="caption"
                      color={colors.text.secondary}
                      style={styles.analysisModalMetaLabel}
                    >
                      {selectedAnalysis.validityLabel}
                    </AppText>
                    <AppText
                      role="label"
                      weight="semibold"
                      style={styles.analysisModalMetaValue}
                    >
                      {selectedAnalysis.validityValue}
                    </AppText>
                  </View>
                </View>

                <View style={styles.analysisModalSections}>
                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Что именно нужно сдать
                    </AppText>
                    <View style={styles.analysisModalInfoCard}>
                      {selectedAnalysis.requirements.map((requirement) => (
                        <View
                          key={requirement}
                          style={styles.analysisModalRequirement}
                        >
                          <View style={styles.analysisModalBullet} />
                          <AppText
                            role="label"
                            style={styles.analysisModalRequirementText}
                          >
                            {requirement}
                          </AppText>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Зачем это нужно?
                    </AppText>
                    <View style={styles.analysisModalInfoCard}>
                      <AppText
                        role="label"
                        color={colors.text.secondary}
                        style={styles.analysisModalBodyText}
                      >
                        {selectedAnalysis.purpose}
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <AppText role="label" weight="semibold">
                      Рекомендованная клиника
                    </AppText>
                    <View style={styles.analysisModalClinicCard}>
                      <View style={styles.analysisModalClinicIcon}>
                        <AppText
                          role="label"
                          weight="semibold"
                          color={colors.brand.primary}
                        >
                          +
                        </AppText>
                      </View>
                      <View style={styles.analysisModalClinicCopy}>
                        <AppText role="label" weight="semibold">
                          {selectedAnalysis.clinic}
                        </AppText>
                        <AppText role="caption" color={colors.text.secondary}>
                          Подберём адрес и доступное время записи
                        </AppText>
                      </View>
                      <AppText
                        role="label"
                        weight="semibold"
                        color={colors.brand.primary}
                      >
                        ↗
                      </AppText>
                    </View>
                  </View>

                  <View style={styles.analysisModalSection}>
                    <View style={styles.analysisModalAttachmentHeading}>
                      <AppText role="label" weight="semibold">
                        Прикрепить результат
                      </AppText>
                      {hasSelectedResult ? (
                        <View style={styles.analysisModalReadyPill}>
                          <View style={styles.analysisModalReadyDot} />
                          <AppText
                            role="caption"
                            weight="semibold"
                            color={colors.brand.primary}
                          >
                            Прикреплён
                          </AppText>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.analysisModalAttachmentCard}>
                      {pendingAttachment || selectedSavedResult ? (
                        <View style={styles.analysisModalAttachmentStatus}>
                          <View style={styles.analysisModalFileIcon}>
                            <AppText
                              role="label"
                              weight="semibold"
                              color={colors.brand.primary}
                            >
                              ✓
                            </AppText>
                          </View>
                          <View style={styles.analysisModalAttachmentCopy}>
                            <AppText
                              role="label"
                              weight="semibold"
                              numberOfLines={1}
                            >
                              {pendingAttachment?.name ||
                                'Результат обследования'}
                            </AppText>
                            <AppText
                              role="caption"
                              color={colors.text.secondary}
                            >
                              {pendingAttachment
                                ? 'Будет сохранён после подтверждения'
                                : 'Сохранён на устройстве'}
                            </AppText>
                          </View>
                        </View>
                      ) : (
                        <AppText
                          role="caption"
                          color={colors.text.secondary}
                          style={styles.analysisModalAttachmentHint}
                        >
                          Добавьте заключение или результаты лаборатории
                        </AppText>
                      )}

                      <View style={styles.analysisModalAttachmentActions}>
                        {(['file', 'photo'] as const).map((kind) => (
                          <Pressable
                            key={kind}
                            accessibilityRole="button"
                            accessibilityLabel={
                              kind === 'file'
                                ? 'Прикрепить файл результата'
                                : 'Прикрепить фото результата'
                            }
                            disabled={attachmentPicking || saving}
                            onPress={() => void pickAnalysisAttachment(kind)}
                            style={({ pressed }) => [
                              styles.analysisModalAttachmentButton,
                              pressed && styles.pressed,
                            ]}
                          >
                            {attachmentPicking ? (
                              <ActivityIndicator
                                color={colors.brand.primary}
                                size="small"
                              />
                            ) : (
                              <>
                                <AppText
                                  role="label"
                                  weight="semibold"
                                  color={colors.brand.primary}
                                >
                                  {kind === 'file' ? 'Файл' : 'Фото'}
                                </AppText>
                                <AppText
                                  role="caption"
                                  color={colors.text.secondary}
                                >
                                  {kind === 'file'
                                    ? 'PDF или изображение'
                                    : 'Из галереи'}
                                </AppText>
                              </>
                            )}
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {attachmentError ? (
                      <AppText
                        role="caption"
                        color={colors.state.error}
                        style={styles.analysisModalError}
                      >
                        {attachmentError}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View
            style={[
              styles.analysisModalActionsFixed,
              { paddingBottom: Math.max(insets.bottom + 18, 34) },
            ]}
          >
            <View style={styles.analysisModalActions}>
              <View style={styles.analysisModalActionSlot}>
                <View style={styles.analysisModalCancel}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Закрыть"
                    disabled={saving || attachmentPicking}
                    onPress={closeAnalysis}
                    style={StyleSheet.absoluteFillObject}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.analysisModalActionContent,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText role="label" weight="medium">
                          Закрыть
                        </AppText>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>

              <View style={styles.analysisModalActionSlot}>
                <View
                  style={[
                    styles.analysisModalSave,
                    !hasSelectedResult && styles.analysisModalSaveDisabled,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      pendingAttachment ? 'Сохранить результат' : 'Готово'
                    }
                    accessibilityState={{
                      disabled:
                        saving ||
                        attachmentPicking ||
                        readOnly ||
                        !hasSelectedResult,
                    }}
                    disabled={
                      saving ||
                      attachmentPicking ||
                      readOnly ||
                      !hasSelectedResult
                    }
                    onPress={() =>
                      pendingAttachment
                        ? void saveAnalysisAttachment()
                        : closeAnalysis()
                    }
                    style={StyleSheet.absoluteFillObject}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.analysisModalActionContent,
                          pressed && styles.pressed,
                        ]}
                      >
                        {saving ? (
                          <ActivityIndicator color={colors.text.inverse} />
                        ) : (
                          <AppText
                            role="label"
                            weight="medium"
                            color={colors.text.inverse}
                          >
                            {pendingAttachment ? 'Сохранить' : 'Готово'}
                          </AppText>
                        )}
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <HealthInsightsPage
        visible={chartsVisible}
        initialPeriod="90"
        onClose={() => setChartsVisible(false)}
        profile={profile}
        journalEntries={journalEntries}
        labResults={labResults}
        scanResults={scanResults}
      />
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
    marginTop: 32,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { textAlign: 'center', fontSize: 17, lineHeight: 22 },
  analysisModalRoot: {
    flex: 1,
  },
  analysisModalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(43,31,36,0.24)',
  },
  analysisModalPageScroll: {
    flex: 1,
  },
  analysisModalPageContent: {
    flexGrow: 1,
  },
  analysisModalDismissArea: {
    flex: 1,
    minHeight: 88,
  },
  analysisModalSheet: {
    width: '100%',
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.surface.raised,
    ...shadows.floating,
  },
  analysisModalHandle: {
    width: 38,
    height: 5,
    marginBottom: 16,
    borderRadius: 3,
    backgroundColor: '#DED9DB',
    alignSelf: 'center',
  },
  analysisModalHero: {
    minHeight: 126,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(33,31,32,0.10)',
    paddingBottom: 14,
  },
  analysisModalImageWrap: {
    width: 104,
    height: 116,
    overflow: 'hidden',
    flexShrink: 0,
  },
  analysisModalImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.12 }],
  },
  analysisModalImageFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 38,
  },
  analysisModalHeroCopy: {
    minWidth: 0,
    flex: 1,
  },
  analysisModalCategory: {
    marginBottom: 5,
    fontSize: 12,
    lineHeight: 15,
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  analysisModalTitle: {
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: -0.55,
  },
  analysisModalDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 18,
  },
  analysisModalDates: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(33,31,32,0.10)',
  },
  analysisModalDateCell: {
    minWidth: 0,
    flex: 1,
    gap: 2,
    paddingHorizontal: 8,
  },
  analysisModalDateDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: 'rgba(33,31,32,0.12)',
  },
  analysisModalMetaLabel: {
    fontSize: 13.5,
    lineHeight: 16,
  },
  analysisModalMetaValue: {
    fontSize: 17,
    lineHeight: 20,
  },
  analysisModalSections: {
    paddingTop: 20,
    gap: 20,
  },
  analysisModalSection: {
    gap: 9,
  },
  analysisModalInfoCard: {
    gap: 9,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.08)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalRequirement: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  analysisModalBullet: {
    width: 7,
    height: 7,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  analysisModalRequirementText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 19,
  },
  analysisModalBodyText: {
    fontSize: 15,
    lineHeight: 20,
  },
  analysisModalClinicCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.18)',
    backgroundColor: '#FFF7FA',
  },
  analysisModalClinicIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F5E8ED',
  },
  analysisModalClinicCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  analysisModalAttachmentHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  analysisModalReadyPill: {
    height: 25,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 13,
    backgroundColor: '#FFF0F6',
  },
  analysisModalReadyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  analysisModalAttachmentCard: {
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.09)',
    backgroundColor: '#F7F3F4',
  },
  analysisModalAttachmentStatus: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  analysisModalFileIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#FFF0F6',
  },
  analysisModalAttachmentCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  analysisModalAttachmentHint: {
    paddingHorizontal: 2,
    fontSize: 14,
    lineHeight: 18,
  },
  analysisModalAttachmentActions: {
    flexDirection: 'row',
    gap: 10,
  },
  analysisModalAttachmentButton: {
    minWidth: 0,
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.20)',
    backgroundColor: colors.surface.raised,
  },
  analysisModalError: {
    marginTop: -2,
    paddingHorizontal: 2,
  },
  analysisModalActionsFixed: {
    position: 'absolute',
    zIndex: 6,
    right: 0,
    bottom: 0,
    left: 0,
    paddingTop: 14,
    paddingHorizontal: 20,
    backgroundColor: colors.surface.raised,
    shadowColor: '#2B131B',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 12,
  },
  analysisModalActions: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    gap: 12,
  },
  analysisModalActionSlot: {
    flex: 1,
    height: 48,
  },
  analysisModalActionContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisModalCancel: {
    position: 'relative',
    height: 48,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#F5F1F2',
  },
  analysisModalSave: {
    position: 'relative',
    height: 48,
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: colors.brand.primary,
  },
  analysisModalSaveDisabled: {
    opacity: 0.38,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
});
