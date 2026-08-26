import type { BlurTint } from 'expo-blur';
import { useFonts } from 'expo-font';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import BuyIcon from '../assets/figma/scan-screen/buy.svg';
import HistoryIcon from '../assets/figma/scan-screen/history.svg';
import InfoIcon from '../assets/figma/scan-screen/info.svg';
import ScanIcon from '../assets/figma/scan-screen/scan.svg';
import {
  CalendarPageModal,
  AppHeader,
  androidMaterials,
  androidShadows,
  colors,
  EdgeFadeGradient,
  getHeaderTop,
  JournalFlowModal,
  type JournalFlowEntry,
  ScanCorrectionScreen,
  ScanFlowOverlay,
  ScanHistoryPreview,
  ScanResultScreen,
  shadows,
  type ScanHistoryRecord,
} from '../design-system';
import { FallbackGlassBackdrop } from '../design-system/glass-fallback';
import { useHealthStore } from '../lib/health-store';
import { enqueueTelemetryEvent } from '../lib/local-database';
import { loadScanHistory, saveScanToHistory } from '../services/scanning';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const FONT_SF_REGULAR = 'SFProDisplay-Regular';
const FONT_YARO_RG = 'YaroRg';
const IOS_PAGE_DURATION = 280;
const IOS_PAGE_EXIT_DURATION = 220;
const IOS_PAGE_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
const RAPIDBIO_INFO_URL = 'https://rapidbio.ru/';
const RAPIDBIO_STORE_URL = 'https://rapidbio-tests.ru/';
const e2eScanFixtureUri =
  __DEV__ && process.env.EXPO_PUBLIC_E2E_MODE === '1'
    ? Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_E2E_SCAN_FIXTURE_IOS_URI
      : Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_E2E_SCAN_FIXTURE_ANDROID_URI
        : undefined
    : undefined;

type GlassControlProps = {
  accessibilityLabel: string;
  children: React.ReactNode;
  onPress?: () => void;
  style: StyleProp<ViewStyle>;
};

type LiquidGlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: GlassStyle;
  tintColor?: string;
  colorScheme?: GlassColorScheme;
  fallbackTint?: BlurTint;
  intensity?: number;
  washColor?: string;
  highlight?: 'light' | 'dark';
  radius?: number;
}>;

function LiquidGlassSurface({
  children,
  style,
  variant = 'regular',
  tintColor,
  colorScheme = 'auto',
  fallbackTint = 'systemUltraThinMaterial',
  intensity = 62,
  washColor = 'rgba(255,255,255,0.08)',
  highlight = 'light',
  radius = 999,
}: LiquidGlassSurfaceProps) {
  return (
    <View
      pointerEvents={hasNativeLiquidGlass ? 'box-none' : 'none'}
      style={[
        styles.glassSurface,
        !hasNativeLiquidGlass && styles.glassSurfaceClipped,
        { borderRadius: radius },
        style,
      ]}
    >
      {hasNativeLiquidGlass ? (
        <GlassView
          glassEffectStyle={variant}
          tintColor={tintColor}
          colorScheme={colorScheme}
          style={[
            StyleSheet.absoluteFill,
            styles.nativeGlassView,
            { borderRadius: radius },
          ]}
        >
          <View pointerEvents="none" style={styles.nativeGlassContent}>
            {children}
          </View>
        </GlassView>
      ) : (
        <>
          {Platform.OS === 'android' ? (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                highlight === 'dark'
                  ? androidMaterials.dark
                  : androidMaterials.light,
                { borderRadius: radius },
              ]}
            />
          ) : Platform.OS === 'web' ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor:
                    highlight === 'dark'
                      ? 'rgba(49,5,12,0.34)'
                      : 'rgba(255,255,255,0.58)',
                },
              ]}
            />
          ) : (
            <FallbackGlassBackdrop
              intensity={intensity}
              radius={radius}
              tint={fallbackTint}
              tone={highlight}
              washColor={washColor}
            />
          )}
          {Platform.OS === 'web' ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: washColor }]}
            />
          ) : null}
          <View pointerEvents="none" style={styles.nativeGlassContent}>
            {children}
          </View>
        </>
      )}
    </View>
  );
}

function GlassControl({
  accessibilityLabel,
  children,
  onPress,
  style,
}: GlassControlProps) {
  if (hasNativeLiquidGlass) {
    return (
      <GlassView
        glassEffectStyle="clear"
        tintColor={colors.surface.headerGlassWash}
        colorScheme="light"
        isInteractive
        style={[style, styles.glassShadow]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={styles.nativeGlassPressTarget}
        >
          {children}
        </Pressable>
      </GlassView>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <View style={[style, androidMaterials.light]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => [
            styles.androidGlassPressTarget,
            pressed && styles.fallbackPressed,
          ]}
        >
          {children}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[style, styles.fallbackGlassHost, styles.glassShadow]}>
      <FallbackGlassBackdrop
        intensity={58}
        radius={999}
        tint="systemUltraThinMaterialLight"
        tone="light"
        washColor={colors.surface.headerGlassWash}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          StyleSheet.absoluteFillObject,
          pressed && styles.fallbackPressed,
        ]}
      >
        <View pointerEvents="none" style={styles.androidGlassControlContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
}

type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

function ActionButton({ icon, label, onPress }: ActionButtonProps) {
  const width = label === 'Инфо' ? 109 : label === 'Купить' ? 114 : 128;

  return (
    <View style={[styles.actionButton, { width }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
      >
        {({ pressed }) => (
          <View style={[styles.actionButtonContent, pressed && styles.pressed]}>
            <View style={styles.actionIconCircle}>{icon}</View>
            <Text style={styles.actionLabel}>{label}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

function ScannerCorners() {
  return (
    <Svg
      pointerEvents="none"
      width={338}
      height={344}
      viewBox="0 0 338 344"
      style={styles.scannerCorners}
    >
      <Path
        d="M79 6H43C22.6 6 6 22.6 6 43v36"
        fill="none"
        stroke="#F2A8CB"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Path
        d="M259 6h36c20.4 0 37 16.6 37 37v36"
        fill="none"
        stroke="#F2A8CB"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Path
        d="M79 338H43c-20.4 0-37-16.6-37-37v-36"
        fill="none"
        stroke="#F2A8CB"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <Path
        d="M259 338h36c20.4 0 37-16.6 37-37v-36"
        fill="none"
        stroke="#F2A8CB"
        strokeWidth={6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function HistoryBackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Path
        d="M13.5 5.5 8 11l5.5 5.5"
        fill="none"
        stroke="#EA4087"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ScanScreen() {
  const { journalId } = useLocalSearchParams<{ journalId?: string }>();
  const {
    addJournalEntry,
    addScanResult,
    journalEntries,
    preferences,
    profile,
    scanResults,
  } = useHealthStore();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [scanFlowVisible, setScanFlowVisible] = useState(false);
  const [selectedScanImageUri, setSelectedScanImageUri] = useState<
    string | null
  >(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const linkedJournalEntry = journalEntries.find(
    (entry) => !entry.deletedAt && entry.localId === journalId,
  );
  const [journalFlowDate, setJournalFlowDate] = useState<Date | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanHistoryRecord[]>([]);
  const [selectedHistoryResult, setSelectedHistoryResult] =
    useState<ScanHistoryRecord | null>(null);
  const [historyCorrectionVisible, setHistoryCorrectionVisible] =
    useState(false);
  const [openScanAfterHistoryDismiss, setOpenScanAfterHistoryDismiss] =
    useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [hasSeenScanBriefing, setHasSeenScanBriefing] = useState(false);
  const historyResultProgress = useRef(new Animated.Value(0)).current;
  const historyCorrectionProgress = useRef(new Animated.Value(0)).current;
  const photoPickerBusy = useRef(false);
  const [fontsLoaded] = useFonts(
    Platform.OS === 'web'
      ? {
          [FONT_SF_REGULAR]: require('../assets/fonts/SF-Pro-Display-Regular.otf'),
          [FONT_YARO_RG]: require('../assets/fonts/Yaro-Rg-Regular.otf'),
        }
      : {},
  );
  const symptomDateKeys = useMemo(
    () =>
      new Set(
        journalEntries
          .filter(
            (entry) =>
              !entry.deletedAt &&
              ['symptom', 'mood', 'energy', 'nutrition', 'activity'].includes(
                entry.kind,
              ),
          )
          .map((entry) => {
            const date = new Date(entry.occurredAt);
            return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          }),
      ),
    [journalEntries],
  );

  const saveJournalFlow = async (entries: JournalFlowEntry[]) => {
    if (!journalFlowDate) return;
    const occurredAt = new Date(
      journalFlowDate.getFullYear(),
      journalFlowDate.getMonth(),
      journalFlowDate.getDate(),
      12,
    ).getTime();

    for (const entry of entries) {
      await addJournalEntry({ occurredAt, ...entry });
    }
  };

  useEffect(() => {
    if (linkedJournalEntry) setCalendarVisible(true);
  }, [linkedJournalEntry]);

  useEffect(() => {
    let active = true;

    void loadScanHistory().then((records) => {
      if (!active) {
        return;
      }
      setScanHistory(records);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!scanResults.length) {
      return;
    }

    setScanHistory((current) => {
      const knownImages = new Set(current.map((record) => record.imageUri));
      const imported = scanResults
        .filter(
          (result) =>
            !result.deletedAt &&
            Boolean(result.localImageUri) &&
            !knownImages.has(result.localImageUri ?? ''),
        )
        .map<ScanHistoryRecord>((result) => {
          const capturedDate = new Date(result.capturedAt);

          return {
            id: result.localId,
            capturedAt: result.capturedAt,
            imageUri: result.localImageUri ?? '',
            batch: 'Сохранено в профиле',
            confidence: 0,
            date: new Intl.DateTimeFormat('ru-RU', {
              day: 'numeric',
              month: 'long',
            }).format(capturedDate),
            day: new Intl.DateTimeFormat('ru-RU', { day: 'numeric' }).format(
              capturedDate,
            ),
            result:
              result.confirmedValue === 'positive'
                ? 'Положительный'
                : 'Отрицательный',
            time: new Intl.DateTimeFormat('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            }).format(capturedDate),
            type:
              result.testSystemKey === 'ovulation-strip'
                ? 'Ovulation LH'
                : 'Pregnancy hCG',
          };
        });

      return imported.length
        ? [...current, ...imported].sort(
            (left, right) => right.capturedAt - left.capturedAt,
          )
        : current;
    });
  }, [scanResults]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => subscription.remove();
  }, []);

  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const headerTop = getHeaderTop(insets.top, scale);
  const scannerTop = Math.max(108, headerTop + 70);
  const sfRegular = fontsLoaded
    ? FONT_SF_REGULAR
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';
  const yaro = fontsLoaded
    ? FONT_YARO_RG
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';

  const pickScanPhoto = async () => {
    if (photoPickerBusy.current) {
      return;
    }

    photoPickerBusy.current = true;
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Нужен доступ к Фото',
          'Разрешите Private выбирать фотографии тестов из медиатеки.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 1,
      });
      const imageUri = result.canceled ? null : result.assets[0]?.uri;
      if (!imageUri) {
        return;
      }

      setHasSeenScanBriefing(true);
      setSelectedScanImageUri(imageUri);
      setScanFlowVisible(true);
    } catch (error) {
      console.error('Selecting scan photo failed', error);
      Alert.alert(
        'Не удалось открыть Фото',
        'Выберите изображение ещё раз и попробуйте снова.',
      );
    } finally {
      photoPickerBusy.current = false;
    }
  };

  const openExternalUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (cause) {
      console.error('Opening Rapid Bio link failed', cause);
    }
  };

  const animatePage = (
    progress: Animated.Value,
    toValue: 0 | 1,
    onComplete?: () => void,
  ) => {
    progress.stopAnimation();

    if (reduceMotion) {
      progress.setValue(toValue);
      onComplete?.();
      return;
    }

    Animated.timing(progress, {
      toValue,
      duration: toValue === 1 ? IOS_PAGE_DURATION : IOS_PAGE_EXIT_DURATION,
      easing: IOS_PAGE_EASING,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onComplete?.();
      }
    });
  };

  const openHistoryResult = (record: ScanHistoryRecord) => {
    historyCorrectionProgress.setValue(0);
    setHistoryCorrectionVisible(false);
    historyResultProgress.setValue(0);
    setSelectedHistoryResult(record);
    requestAnimationFrame(() => animatePage(historyResultProgress, 1));
  };

  const closeHistoryResult = () => {
    animatePage(historyResultProgress, 0, () => {
      setHistoryCorrectionVisible(false);
      setSelectedHistoryResult(null);
    });
  };

  const openHistoryCorrection = () => {
    historyCorrectionProgress.setValue(0);
    setHistoryCorrectionVisible(true);
    requestAnimationFrame(() => animatePage(historyCorrectionProgress, 1));
  };

  const closeHistoryCorrection = () => {
    animatePage(historyCorrectionProgress, 0, () => {
      setHistoryCorrectionVisible(false);
    });
  };

  return (
    <View
      style={[styles.root, Platform.OS === 'android' && styles.androidRoot]}
    >
      <StatusBar style="dark" hidden={false} />
      <View
        style={{
          width: DESIGN_WIDTH * scale,
          height: DESIGN_HEIGHT * scale,
        }}
      >
        <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
          <View style={styles.canvas}>
            <Image
              accessibilityIgnoresInvertColors
              source={require('../assets/figma/scan-screen/background.png')}
              resizeMode="cover"
              style={styles.scanPageBackground}
            />

            <AppHeader
              style={[styles.header, { top: headerTop }]}
              onHistory={() => setHistoryVisible(true)}
              onDate={() => setCalendarVisible(true)}
              onCalendar={() => setCalendarVisible(true)}
            />

            <View style={[styles.scannerStage, { top: scannerTop }]}>
              <ScannerCorners />

              <Image
                accessibilityIgnoresInvertColors
                source={require('../assets/scan/mascot-test.png')}
                resizeMode="contain"
                style={styles.scanMascot}
              />

              <View style={styles.scanButton}>
                <Pressable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Начать сканирование"
                  onPress={() => setScanFlowVisible(true)}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.scanButtonContent,
                        pressed && styles.pressed,
                      ]}
                    >
                      <ScanIcon width={20} height={20} />
                      <Text
                        accessible={false}
                        importantForAccessibility="no"
                        style={[
                          styles.scanButtonLabel,
                          { fontFamily: sfRegular },
                        ]}
                      >
                        Начать сканирование
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Выбрать тест из галереи"
                onPress={() => {
                  void pickScanPhoto();
                }}
                style={styles.galleryButton}
              >
                {({ pressed }) => (
                  <Text
                    style={[
                      styles.galleryButtonLabel,
                      { fontFamily: sfRegular },
                      pressed && styles.galleryButtonLabelPressed,
                    ]}
                  >
                    Выбрать из галереи
                  </Text>
                )}
              </Pressable>

              {e2eScanFixtureUri ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Запустить тестовый снимок"
                  onPress={() => {
                    setHasSeenScanBriefing(true);
                    setSelectedScanImageUri(e2eScanFixtureUri);
                    setScanFlowVisible(true);
                  }}
                  style={styles.e2eFixtureButton}
                  testID="e2e-scan-fixture"
                >
                  <Text
                    style={[
                      styles.galleryButtonLabel,
                      { fontFamily: sfRegular },
                    ]}
                  >
                    Тестовый снимок
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.scanContentPanel}>
              <View style={styles.scanBrandCopy}>
                <Text
                  style={[
                    styles.sphere,
                    { fontFamily: yaro },
                    Platform.OS === 'android' && styles.sphereAndroid,
                  ]}
                >
                  сфера.
                </Text>
                <Text
                  style={[styles.scannerDescription, { fontFamily: sfRegular }]}
                >
                  Мгновенный анализ тестов на{'\n'}
                  овуляцию или беременность
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.actions,
                Platform.OS === 'android' && styles.actionsAndroid,
              ]}
            >
              <ActionButton
                label="Инфо"
                onPress={() => void openExternalUrl(RAPIDBIO_INFO_URL)}
                icon={<InfoIcon width={19} height={19} />}
              />
              <ActionButton
                label="Купить"
                onPress={() => void openExternalUrl(RAPIDBIO_STORE_URL)}
                icon={<BuyIcon width={19} height={19} />}
              />
              <ActionButton
                label="История"
                onPress={() => setHistoryVisible(true)}
                icon={<HistoryIcon width={19} height={19} />}
              />
            </View>

            <EdgeFadeGradient
              edge="bottom"
              height={108}
              style={styles.navbarFadeGradient}
            />
          </View>
        </View>
      </View>

      <Modal
        animationType={reduceMotion ? 'none' : 'slide'}
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        visible={scanFlowVisible}
        onRequestClose={() => setScanFlowVisible(false)}
      >
        <View style={styles.flowModalRoot}>
          <StatusBar style="dark" hidden={false} />
          <View
            style={{
              width: DESIGN_WIDTH * scale,
              height: DESIGN_HEIGHT * scale,
            }}
          >
            <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
              <View style={styles.flowModalCanvas}>
                <ScanFlowOverlay
                  headerTop={headerTop}
                  initialImageUri={selectedScanImageUri}
                  visible={scanFlowVisible}
                  showBriefing={!hasSeenScanBriefing}
                  onBriefingSeen={() => setHasSeenScanBriefing(true)}
                  onClose={() => {
                    setSelectedScanImageUri(null);
                    setScanFlowVisible(false);
                  }}
                  onComplete={async (pendingRecord) => {
                    try {
                      const record = await saveScanToHistory(pendingRecord);
                      await addScanResult({
                        testSystemKey:
                          record.type === 'Ovulation LH'
                            ? 'ovulation-strip'
                            : 'pregnancy-strip',
                        capturedAt: record.capturedAt,
                        confirmedValue:
                          record.result === 'Положительный' ||
                          record.result === 'Пик ЛГ'
                            ? 'positive'
                            : 'negative',
                        resultSource: record.resultSource ?? 'manual',
                        confidence: Math.max(
                          0,
                          Math.min(1, record.confidence / 100),
                        ),
                        qualityFlags: record.qualityFlags ?? [],
                        calibrationVersion: record.calibrationVersion,
                        algorithmVersion:
                          record.algorithmVersion ?? 'manual-v1',
                        analysisStatus: record.analysisStatus,
                        signalRatio: record.signalRatio,
                        confirmedByUser: true,
                        hasLocalImage: true,
                        localImageUri: record.imageUri,
                      });
                      const analyticsEnabled = preferences.some(
                        (item) => !item.deletedAt && item.anonymousAnalytics,
                      );
                      if (analyticsEnabled && Platform.OS !== 'web') {
                        const normalizedLot = record.batch
                          .trim()
                          .replace(/[^A-Za-z0-9._:+-]/g, '-')
                          .slice(0, 64);
                        await enqueueTelemetryEvent({
                          eventId: `scan-${record.id}`,
                          kind: 'cv_processed',
                          occurredAt: record.capturedAt,
                          platform: Platform.OS as 'ios' | 'android',
                          osMajor: String(Platform.Version).split('.')[0],
                          appVersion: Constants.expoConfig?.version ?? '1.0.0',
                          algorithmVersion: record.algorithmVersion,
                          calibrationVersion: record.calibrationVersion,
                          testSystemKey:
                            record.type === 'Ovulation LH'
                              ? 'ovulation-strip'
                              : 'pregnancy-strip',
                          lotNumber: normalizedLot || undefined,
                          durationMs: record.processingDurationMs,
                          outcome:
                            record.analysisStatus === 'invalid'
                              ? 'invalid'
                              : record.analysisStatus === 'review'
                                ? 'review'
                                : 'success',
                          qualityFlags: record.qualityFlags?.slice(0, 12) ?? [],
                        });
                      }
                      setScanHistory((current) =>
                        [record, ...current].sort(
                          (left, right) => right.capturedAt - left.capturedAt,
                        ),
                      );
                      setScanFlowVisible(false);
                    } catch (error) {
                      Alert.alert(
                        'Не удалось сохранить снимок',
                        'Попробуйте подтвердить результат ещё раз.',
                      );
                      throw error;
                    }
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <CalendarPageModal
        visible={calendarVisible}
        pregnancyMode={profile?.goal === 'pregnancy'}
        initialDate={
          linkedJournalEntry
            ? new Date(linkedJournalEntry.occurredAt)
            : undefined
        }
        onClose={() => setCalendarVisible(false)}
        onAddSymptoms={(date) => setJournalFlowDate(new Date(date))}
        symptomDateKeys={symptomDateKeys}
      />

      <JournalFlowModal
        visible={journalFlowDate !== null}
        targetDate={journalFlowDate ?? new Date()}
        initialCategory="cycle"
        onClose={() => setJournalFlowDate(null)}
        onComplete={saveJournalFlow}
      />

      <Modal
        animationType={reduceMotion ? 'none' : 'slide'}
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        visible={historyVisible}
        onDismiss={() => {
          if (!openScanAfterHistoryDismiss) {
            return;
          }

          setOpenScanAfterHistoryDismiss(false);
          setScanFlowVisible(true);
        }}
        onRequestClose={() => {
          if (historyCorrectionVisible) {
            closeHistoryCorrection();
            return;
          }

          if (selectedHistoryResult) {
            closeHistoryResult();
            return;
          }

          setHistoryVisible(false);
        }}
      >
        <View style={styles.historyModalRoot}>
          <StatusBar style="dark" hidden={false} />
          <View
            style={{
              width: DESIGN_WIDTH * scale,
              height: DESIGN_HEIGHT * scale,
            }}
          >
            <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
              <View style={styles.historyModalCanvas}>
                <Animated.View
                  pointerEvents={selectedHistoryResult ? 'none' : 'auto'}
                  style={[
                    styles.historyBasePage,
                    {
                      opacity: historyResultProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 0.96],
                      }),
                      transform: [
                        {
                          translateX: historyResultProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, -34],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <GlassControl
                    accessibilityLabel="Вернуться к сканированию"
                    onPress={() => setHistoryVisible(false)}
                    style={[styles.historyBackButton, { top: headerTop }]}
                  >
                    <HistoryBackIcon />
                  </GlassControl>

                  <ScrollView
                    contentInsetAdjustmentBehavior="never"
                    showsVerticalScrollIndicator={false}
                    style={styles.historyModalScroll}
                    contentContainerStyle={[
                      styles.historyModalScrollContent,
                      { paddingTop: headerTop + 66 },
                    ]}
                  >
                    <ScanHistoryPreview
                      hideFilter
                      records={scanHistory}
                      variant="gallery"
                      standalone
                      onResultPress={openHistoryResult}
                    />
                  </ScrollView>
                </Animated.View>

                {selectedHistoryResult ? (
                  <Animated.View
                    style={[
                      styles.historyResultOverlay,
                      {
                        opacity: historyResultProgress,
                        transform: [
                          {
                            translateX: historyResultProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [DESIGN_WIDTH, 0],
                            }),
                          },
                          {
                            translateX: historyCorrectionProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, -34],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <ScanResultScreen
                      fromHistory
                      headerTop={headerTop}
                      hideReadyHeading
                      resultData={selectedHistoryResult}
                      onClose={closeHistoryResult}
                      onConfirm={closeHistoryResult}
                      onCorrection={openHistoryCorrection}
                      onHelp={() => undefined}
                    />
                  </Animated.View>
                ) : null}

                {selectedHistoryResult && historyCorrectionVisible ? (
                  <Animated.View
                    style={[
                      styles.historyCorrectionOverlay,
                      {
                        opacity: historyCorrectionProgress,
                        transform: [
                          {
                            translateX: historyCorrectionProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [DESIGN_WIDTH, 0],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <ScanCorrectionScreen
                      fromHistory
                      headerTop={headerTop}
                      resultData={selectedHistoryResult}
                      onClose={closeHistoryCorrection}
                      onSubmit={closeHistoryCorrection}
                      onRetake={() => {
                        setHistoryCorrectionVisible(false);
                        setSelectedHistoryResult(null);
                        setOpenScanAfterHistoryDismiss(true);
                        setHistoryVisible(false);
                      }}
                      onHelp={() => undefined}
                    />
                  </Animated.View>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee8e3',
  },
  flowModalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#170C11',
  },
  flowModalCanvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
    borderRadius: 40,
    backgroundColor: '#170C11',
  },
  historyModalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF8F8',
  },
  historyModalCanvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
    borderRadius: 40,
    backgroundColor: '#FAF8F8',
  },
  historyBasePage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FAF8F8',
  },
  historyResultOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: '#FFF8F5',
  },
  historyCorrectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: '#FFF8F5',
  },
  historyBackButton: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyModalScroll: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  historyModalScrollContent: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  scaledCanvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    transformOrigin: 'top left',
  },
  canvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
    borderRadius: 40,
    backgroundColor: '#FDE9E3',
  },
  scanPageBackground: {
    ...StyleSheet.absoluteFillObject,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
  },
  androidRoot: {
    justifyContent: 'flex-start',
  },
  header: {
    position: 'absolute',
    zIndex: 5,
    left: 16,
  },
  navbarFadeGradient: {
    bottom: 0,
    zIndex: 4,
  },
  nativeGlassView: {
    overflow: 'visible',
  },
  nativeGlassContent: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeGlassPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidGlassControlContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidGlassPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidGlassMaterialFill: {
    flex: 1,
    alignSelf: 'stretch',
  },
  glassShadow: {
    ...shadows.control,
  },
  glassSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  glassSurfaceClipped: {
    overflow: 'hidden',
  },
  glassInnerStroke: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  fallbackPressed: {
    opacity: Platform.OS === 'android' ? 0.94 : 1,
    transform: [{ scale: Platform.OS === 'android' ? 0.98 : 1.035 }],
  },
  fallbackGlassHost: {
    position: 'relative',
  },
  scannerStage: {
    position: 'absolute',
    left: 32,
    width: 338,
    height: 344,
  },
  scannerCorners: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  scanMascot: {
    position: 'absolute',
    zIndex: 3,
    left: 75,
    top: 82,
    width: 216,
    height: 138,
  },
  sphere: {
    color: '#EA4087',
    fontSize: 34.125,
    lineHeight: 37.5,
    letterSpacing: -0.68,
  },
  sphereAndroid: {
    width: 320,
    textAlign: 'center',
  },
  scannerDescription: {
    width: 320,
    color: '#EA4087',
    textAlign: 'center',
    fontSize: 21.5,
    lineHeight: 24,
    letterSpacing: -0.43,
  },
  scanButton: {
    position: 'absolute',
    zIndex: 2,
    left: 59,
    top: 205,
    width: 220,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: '#EA4087',
  },
  scanButtonContent: {
    width: 220,
    height: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanButtonLabel: {
    color: '#ffffff',
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.34,
  },
  galleryButton: {
    position: 'absolute',
    zIndex: 4,
    left: 89,
    top: 258,
    width: 160,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryButtonLabel: {
    color: '#EA4087',
    fontSize: 16,
    lineHeight: 19,
    letterSpacing: -0.32,
  },
  galleryButtonLabelPressed: {
    opacity: 0.55,
  },
  e2eFixtureButton: {
    position: 'absolute',
    top: 286,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scanContentPanel: {
    position: 'absolute',
    left: 0,
    top: 520,
    width: DESIGN_WIDTH,
    height: 354,
    borderTopLeftRadius: 46,
    borderTopRightRadius: 46,
    backgroundColor: '#FFFFFF',
  },
  scanBrandCopy: {
    position: 'absolute',
    left: 41,
    top: 62,
    width: 320,
    alignItems: 'center',
    gap: 7,
  },
  actions: {
    position: 'absolute',
    left: 16,
    top: 732,
    width: 370,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionsAndroid: {
    top: 760,
  },
  actionButton: {
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#EA4087',
  },
  actionButtonContent: {
    width: '100%',
    height: 48,
    paddingLeft: 5,
    paddingRight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#ffffff',
    fontFamily: FONT_SF_REGULAR,
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: -0.3,
  },
  pressed: {
    opacity: 0.72,
  },
});
