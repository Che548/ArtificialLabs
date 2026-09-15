import { AndroidMaterialBackdrop } from '../design-system/android-material';
import { ThemeStatusBar, useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { colors as defaultThemeColors } from '../design-system/tokens';
import { BrandLogo } from '../components/BrandLogo';
import { TopChromeBackdrop } from '../components/TopChromeBackdrop';
import { bundledFonts } from '../lib/bundled-fonts';
import { fontStyle } from '../lib/font-style';
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

import ScanIcon from '../assets/figma/scan-screen/scan.svg';
import {
  CalendarPageModal,
  AppHeader,
  androidTabBarContentHeight,
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
import { enqueueTelemetryEvent, loadLocalSetting } from '../lib/local-database';
import { loadScanHistory, saveScanToHistory } from '../services/scanning';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const FONT_SF_REGULAR = 'SFProDisplay-Regular';
const IOS_PAGE_DURATION = 280;
const IOS_PAGE_EXIT_DURATION = 220;
const IOS_PAGE_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
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
  const styles = useThemeStyles(createStyles);
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
            <AndroidMaterialBackdrop radius={radius} tone={highlight} washColor={washColor} />
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
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  if (hasNativeLiquidGlass) {
    return (
      <GlassView
        glassEffectStyle="clear"
        tintColor={colors.surface.headerGlassWash}
        colorScheme={colors.surface.canvas === "#161417" ? "dark" : "light"}
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
      <View style={style}>
        <AndroidMaterialBackdrop washColor={colors.surface.headerGlassWash} />
        <Pressable
          cssInterop={false}
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
        cssInterop={false}
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

function ScannerCorners() {
  const styles = useThemeStyles(createStyles);
  return (
    <Svg
      pointerEvents="none"
      width={338}
      height={344}
      viewBox="0 0 338 344"
      style={styles.scannerCorners}
    >
      <Path
        d="M79 38H43C22.6 38 6 54.6 6 75v36"
        fill="none"
        stroke="#EA4087"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Path
        d="M259 38h36c20.4 0 37 16.6 37 37v36"
        fill="none"
        stroke="#EA4087"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Path
        d="M79 306H43c-20.4 0-37-16.6-37-37v-36"
        fill="none"
        stroke="#EA4087"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <Path
        d="M259 306h36c20.4 0 37-16.6 37-37v-36"
        fill="none"
        stroke="#EA4087"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const TEST_SHOP_URL = 'https://en.rapidbio.ru/';

function confirmTestShopNavigation() {
  Alert.alert(
    'Купить тесты',
    'Вы перейдёте на сайт Rapid Bio (en.rapidbio.ru) в браузере, чтобы купить тесты.',
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Перейти на сайт',
        onPress: () => {
          void Linking.openURL(TEST_SHOP_URL).catch(() => {
            Alert.alert('Не удалось открыть сайт', 'Попробуйте ещё раз позже.');
          });
        },
      },
    ],
  );
}

function TestShopIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 3h2l2.4 12.1a2 2 0 0 0 2 1.6H18a2 2 0 0 0 2-1.6L21.5 7H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        stroke="#EA4087"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
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
  const { mode } = useAppTheme();
  const styles = useThemeStyles(createStyles);
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
  const openScanFlow = async () => {
    const skip = await loadLocalSetting<boolean>('scan.skip-briefing.v1').catch(
      () => false,
    );
    setHasSeenScanBriefing(skip === true);
    setScanFlowVisible(true);
  };
  const historyResultProgress = useRef(new Animated.Value(0)).current;
  const historyCorrectionProgress = useRef(new Animated.Value(0)).current;
  const photoPickerBusy = useRef(false);
  const [fontsLoaded] = useFonts(Platform.OS === 'web' ? bundledFonts : {});
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
  const scannerTop = Math.max(132, headerTop + 84);
  const contentPanelTop = scannerTop + 482 + (e2eScanFixtureUri ? 44 : 0);
  const navbarClearance =
    (Math.max(insets.bottom, 8) + (Platform.OS === 'android' ? androidTabBarContentHeight : 64)) / scale;
  const sfRegular = fontsLoaded
    ? FONT_SF_REGULAR
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
      void openScanFlow();
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
      <ThemeStatusBar hidden={false} />

      <View
        style={{
          width: DESIGN_WIDTH * scale,
          height: DESIGN_HEIGHT * scale,
        }}
      >
        <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
          <View style={styles.canvas}>
            <TopChromeBackdrop headerTop={headerTop} style={{ zIndex: 4 }} />
            <AppHeader
              elevatedControls
              style={[styles.header, { top: headerTop }]}
              onHistory={() => setHistoryVisible(true)}
              onDate={() => setCalendarVisible(true)}
              rightContent={<TestShopIcon />}
              rightAccessibilityLabel="Купить тесты"
              onRightAction={confirmTestShopNavigation}
            />

            <View style={[styles.scannerStage, { top: scannerTop }]}>
              <ScannerCorners />

              <View style={styles.scanIntro}>
                <BrandLogo width={160} style={{ marginTop: 3 }} />
                <Text style={[styles.scanDescription, fontStyle(sfRegular)]}>
                  Мгновенная интерпретация{'\n'}экспресс-тестов
                </Text>
              </View>

              <View style={styles.scanButton}>
                <Pressable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Начать сканирование"
                  onPress={() => void openScanFlow()}
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
                          { ...fontStyle(sfRegular) },
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
                      { ...fontStyle(sfRegular) },
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
                    void openScanFlow();
                  }}
                  style={styles.e2eFixtureButton}
                  testID="e2e-scan-fixture"
                >
                  <Text
                    style={[
                      styles.galleryButtonLabel,
                      { ...fontStyle(sfRegular) },
                    ]}
                  >
                    Тестовый снимок
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {mode !== 'dark' ? <View
              style={[
                styles.scanContentPanel,
                { top: contentPanelTop, bottom: navbarClearance },
              ]}
            >
              <Image
                accessibilityIgnoresInvertColors
                accessible={false}
                source={require('../assets/scan/test-strips.png')}
                resizeMode="contain"
                style={styles.testStrips}
              />
            </View> : null}

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
        highlightFertility={profile?.goal === 'planning'}
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
          void openScanFlow();
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
          <ThemeStatusBar hidden={false} />
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
                  <TopChromeBackdrop
                    headerTop={headerTop}
                    style={{ zIndex: 1 }}
                  />
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.raised,
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
    borderRadius: Platform.OS === 'android' ? 0 : 40,
    backgroundColor: '#170C11',
  },
  historyModalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#FAF8F8',
  },
  historyModalCanvas: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
    borderRadius: Platform.OS === 'android' ? 0 : 40,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#FAF8F8',
  },
  historyBasePage: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#FAF8F8',
  },
  historyResultOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#FFF8F5',
  },
  historyCorrectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#FFF8F5',
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
    borderRadius: Platform.OS === 'android' ? 0 : 40,
    backgroundColor: colors.surface.raised,
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
    borderColor: colors.surface.canvas === '#161417' ? colors.surface.divider : 'rgba(255,255,255,0.52)',
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
  scanIntro: {
    position: 'absolute',
    top: 124,
    left: 0,
    width: 338,
    alignItems: 'center',
    gap: 10,
  },
  scanDescription: {
    color: '#EA4087',
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  scanButton: {
    position: 'absolute',
    zIndex: 2,
    left: -16,
    top: 340,
    width: 370,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: '#EA4087',
  },
  scanButtonContent: {
    width: 370,
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
    top: 394,
    width: 160,
    height: 44,
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
    top: 470,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scanContentPanel: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: DESIGN_WIDTH,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
    backgroundColor: colors.surface.raised,
  },
  testStrips: {
    width: DESIGN_WIDTH,
    height: DESIGN_WIDTH * 410 / 2010,
  },
  pressed: {
    opacity: 0.72,
  },
});

const styles = createStyles(defaultThemeColors);
