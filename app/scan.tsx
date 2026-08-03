import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type {
  ColorValue,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView as ScrollViewType,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import ContentShape from '../assets/figma/content-shape.svg';
import CalendarIcon from '../assets/figma/calendar-icon.svg';
import BuyIcon from '../assets/figma/scan-screen/buy.svg';
import HeaderHistoryIcon from '../assets/figma/scan-screen/header-history.svg';
import HistoryIcon from '../assets/figma/scan-screen/history.svg';
import InfoIcon from '../assets/figma/scan-screen/info.svg';
import ScanIcon from '../assets/figma/scan-screen/scan.svg';
import ScannerFrame from '../assets/figma/scan-screen/circle.svg';
import {
  CalendarPageModal,
  colors,
  EdgeFadeGradient,
  HeaderDateLabel,
  InstructionCard,
  InstructionIntroCard,
  InstructionNavigation,
  ScanBackgroundMotion,
  ScanCorrectionScreen,
  ScanFlowOverlay,
  ScanHistoryPreview,
  ScanResultScreen,
  type ScanHistoryRecord,
} from '../design-system';
import { useHealthStore } from '../lib/health-store';
import { loadScanHistory, saveScanToHistory } from '../services/scanning';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const FONT_SF_REGULAR = 'SFProDisplay-Regular';
const FONT_YARO_RG = 'YaroRg';
const INSTRUCTION_CARD_WIDTH = 360;
const INSTRUCTION_CARD_HEIGHT = 130;
const INSTRUCTION_GAP = 10;
const INSTRUCTION_SNAP = INSTRUCTION_CARD_WIDTH + INSTRUCTION_GAP;
const IOS_PAGE_DURATION = 280;
const IOS_PAGE_EXIT_DURATION = 220;
const IOS_PAGE_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

const instructions = [
  {
    body: 'Соберите мочу в чистую сухую емкость.',
  },
  {
    body: 'Вскройте фольгированную упаковку и достаньте тест-полоску.',
  },
  {
    body: 'Опустите тест-полоску в мочу до отметки ”MAX” на 3–5 секунд.',
  },
  {
    body: 'Достаньте тест-полоску и положите её на ровную сухую поверхность.',
  },
  {
    body: 'Спустя 3-7 минут отсканируйте результат в приложении.',
  },
];

const instructionIllustrations = [
  require('../assets/instructions/step-1-cup.png'),
  require('../assets/instructions/step-2-package.png'),
  require('../assets/instructions/step-3-dip-test.png'),
  require('../assets/instructions/step-4-test-strip.png'),
  require('../assets/instructions/step-5-results.png'),
];
const INSTRUCTION_SLIDE_COUNT = instructions.length + 1;

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
  const highlightColors: readonly [ColorValue, ColorValue, ColorValue] =
    highlight === 'light'
      ? [
          'rgba(255,255,255,0.52)',
          'rgba(255,255,255,0.10)',
          'rgba(255,255,255,0.18)',
        ]
      : [
          'rgba(255,255,255,0.26)',
          'rgba(255,255,255,0.03)',
          'rgba(255,255,255,0.10)',
        ];

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
          {Platform.OS === 'web' ? (
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
            <BlurView
              tint={fallbackTint}
              intensity={intensity}
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: washColor }]}
          />
          <LinearGradient
            colors={highlightColors}
            locations={[0, 0.42, 1]}
            start={{ x: 0.04, y: 0 }}
            end={{ x: 0.96, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.glassInnerStroke, { borderRadius: radius }]} />
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
        style={style}
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        styles.glassShadow,
        pressed && styles.fallbackPressed,
      ]}
    >
      <LiquidGlassSurface
        variant="clear"
        tintColor={colors.surface.headerGlassWash}
        colorScheme="light"
        fallbackTint="systemUltraThinMaterialLight"
        intensity={58}
        washColor={colors.surface.headerGlassWash}
        highlight="light"
      >
        {children}
      </LiquidGlassSurface>
    </Pressable>
  );
}

function LiquidGlassGroup({
  children,
  spacing,
  style,
}: PropsWithChildren<{
  spacing: number;
  style: StyleProp<ViewStyle>;
}>) {
  return hasNativeLiquidGlass ? (
    <GlassContainer spacing={spacing} style={style}>
      {children}
    </GlassContainer>
  ) : (
    <View style={style}>{children}</View>
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

function HistoryBackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22">
      <Path
        d="M13.5 5.5 8 11l5.5 5.5"
        fill="none"
        stroke="#D31471"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ScanScreen() {
  const { addScanResult, scanResults } = useHealthStore();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const instructionRef = useRef<ScrollViewType>(null);
  const [activeInstruction, setActiveInstruction] = useState(0);
  const [scanFlowVisible, setScanFlowVisible] = useState(false);
  const [selectedScanImageUri, setSelectedScanImageUri] = useState<
    string | null
  >(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
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
  const [hasSavedScan, setHasSavedScan] = useState(false);
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

  useEffect(() => {
    let active = true;

    void loadScanHistory().then((records) => {
      if (!active) {
        return;
      }
      setScanHistory(records);
      setHasSavedScan(records.length > 0);
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
    setHasSavedScan(true);
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
  const headerTop = Math.max(16, insets.top / scale + 8);
  const scannerTop = Math.max(123, headerTop + 79);
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

  const scrollToInstruction = (index: number) => {
    const nextIndex = Math.max(0, Math.min(INSTRUCTION_SLIDE_COUNT - 1, index));
    setActiveInstruction(nextIndex);
    instructionRef.current?.scrollTo({
      x: nextIndex * INSTRUCTION_SNAP,
      animated: true,
    });
  };

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

  const handleInstructionScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const index = Math.round(
      event.nativeEvent.contentOffset.x / INSTRUCTION_SNAP,
    );
    setActiveInstruction(
      Math.max(0, Math.min(INSTRUCTION_SLIDE_COUNT - 1, index)),
    );
  };

  const showPlaceholder = (title: string) => {
    Alert.alert(title, 'Раздел будет подключён к соответствующему сценарию.');
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
    <View style={styles.root}>
      <StatusBar style={scanFlowVisible ? 'light' : 'dark'} hidden={false} />
      <View
        style={{
          width: DESIGN_WIDTH * scale,
          height: DESIGN_HEIGHT * scale,
        }}
      >
        <View style={[styles.scaledCanvas, { transform: [{ scale }] }]}>
          <View style={styles.canvas}>
            <View style={styles.background}>
              <ScanBackgroundMotion
                source={require('../assets/figma/scan-screen/background.png')}
                variant="drift"
                width={DESIGN_WIDTH}
                height={869}
                flipY
              />
            </View>

            <LiquidGlassGroup
              spacing={12}
              style={[styles.header, { top: headerTop }]}
            >
              <GlassControl
                accessibilityLabel="Открыть историю"
                onPress={() => setHistoryVisible(true)}
                style={styles.headerCircle}
              >
                <HeaderHistoryIcon width={22} height={22} color="#D31471" />
              </GlassControl>

              <GlassControl
                accessibilityLabel="Выбрать дату"
                onPress={() => showPlaceholder('Выбор даты')}
                style={styles.datePill}
              >
                <HeaderDateLabel />
              </GlassControl>

              <GlassControl
                accessibilityLabel="Открыть календарь"
                onPress={() => setCalendarVisible(true)}
                style={styles.headerCircle}
              >
                <View style={styles.headerIconOrientation}>
                  <CalendarIcon width={22} height={22} color="#D31471" />
                </View>
              </GlassControl>
            </LiquidGlassGroup>

            <View style={[styles.scannerCard, { top: scannerTop }]}>
              <ScannerFrame
                width={340}
                height={340}
                style={styles.scannerFrame}
              />

              <View style={styles.scannerCopy}>
                <Text style={[styles.sphere, { fontFamily: yaro }]}>
                  сфера.
                </Text>
                <Text
                  style={[styles.scannerDescription, { fontFamily: sfRegular }]}
                >
                  Мгновенный анализ тестов на{'\n'}
                  овуляцию или беременность
                </Text>
              </View>

              <View style={styles.scanButton}>
                <Pressable
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
                        style={[
                          styles.scanButtonLabel,
                          { fontFamily: sfRegular },
                        ]}
                      >
                        {hasSavedScan
                          ? 'Сканировать снова'
                          : 'Начать сканирование'}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.photoPickerButton}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Выбрать фото теста из устройства"
                  onPress={() => {
                    void pickScanPhoto();
                  }}
                >
                  {({ pressed }) => (
                    <View
                      style={[
                        styles.photoPickerButtonContent,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.photoPickerButtonLabel,
                          { fontFamily: sfRegular },
                        ]}
                      >
                        Выбрать фото из устройства
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>

            <ContentShape
              pointerEvents="none"
              width={DESIGN_WIDTH}
              height={361}
              style={styles.contentShape}
            />

            <View style={styles.instructionNavigation}>
              <InstructionNavigation
                variant="outline"
                leftDisabled={activeInstruction === 0}
                rightDisabled={
                  activeInstruction === INSTRUCTION_SLIDE_COUNT - 1
                }
                onPrevious={() => scrollToInstruction(activeInstruction - 1)}
                onNext={() => scrollToInstruction(activeInstruction + 1)}
              />
            </View>

            <ScrollView
              ref={instructionRef}
              horizontal
              decelerationRate="fast"
              disableIntervalMomentum
              contentInsetAdjustmentBehavior="never"
              contentContainerStyle={styles.instructionsContent}
              showsHorizontalScrollIndicator={false}
              snapToInterval={INSTRUCTION_SNAP}
              onMomentumScrollEnd={handleInstructionScrollEnd}
              style={styles.instructions}
            >
              <InstructionIntroCard
                title="Инструкция по использованию"
                illustration={require('../assets/instructions/step-4-test-strip.png')}
                variant="classic"
                height={INSTRUCTION_CARD_HEIGHT}
              />

              {instructions.map((instruction, index) => (
                <InstructionCard
                  key={index}
                  step={index + 1}
                  total={instructions.length}
                  text={instruction.body}
                  variant="illustrated"
                  height={INSTRUCTION_CARD_HEIGHT}
                  illustration={instructionIllustrations[index]}
                />
              ))}
            </ScrollView>

            <View style={styles.divider} />

            <View style={styles.actions}>
              <ActionButton
                label="Инфо"
                onPress={() => showPlaceholder('Инфо')}
                icon={<InfoIcon width={19} height={19} />}
              />
              <ActionButton
                label="Купить"
                onPress={() => showPlaceholder('Купить')}
                icon={<BuyIcon width={19} height={19} />}
              />
              <ActionButton
                label="История"
                onPress={() => setHistoryVisible(true)}
                icon={<HistoryIcon width={19} height={19} />}
              />
            </View>

            <EdgeFadeGradient
              edge="top"
              height={headerTop + 60}
              style={styles.headerFadeGradient}
            />
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
          <StatusBar style="light" hidden={false} />
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
                        confidence: 'manual',
                        qualityFlags: [],
                        algorithmVersion: 'manual-v1',
                        hasLocalImage: true,
                        localImageUri: record.imageUri,
                      });
                      setScanHistory((current) =>
                        [record, ...current].sort(
                          (left, right) => right.capturedAt - left.capturedAt,
                        ),
                      );
                      setHasSavedScan(true);
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
        onClose={() => setCalendarVisible(false)}
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
    backgroundColor: '#fee8e3',
  },
  background: {
    position: 'absolute',
    left: 0,
    top: -15,
    width: DESIGN_WIDTH,
    height: 869,
  },
  header: {
    position: 'absolute',
    zIndex: 5,
    left: 16,
    width: 370,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerFadeGradient: {
    top: 0,
    zIndex: 4,
  },
  navbarFadeGradient: {
    bottom: 0,
    zIndex: 4,
  },
  headerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePill: {
    width: 156,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconOrientation: {
    transform: [{ scaleY: -1 }],
  },
  nativeGlassView: {
    overflow: 'visible',
  },
  nativeGlassContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeGlassPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassShadow: {
    shadowColor: '#260208',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 9,
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
    transform: [{ scale: 1.035 }],
  },
  scannerCard: {
    position: 'absolute',
    left: 16,
    width: 370,
    height: 370,
    borderRadius: 150,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  scannerFrame: {
    position: 'absolute',
    left: 15,
    top: 15,
  },
  scannerCopy: {
    position: 'absolute',
    top: 116,
    left: 61,
    width: 249,
    alignItems: 'center',
    gap: 4,
  },
  sphere: {
    color: '#ea4087',
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.54,
  },
  scannerDescription: {
    width: 249,
    color: '#ea4087',
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 19,
    letterSpacing: -0.34,
  },
  scanButton: {
    position: 'absolute',
    left: 86,
    top: 200,
    minWidth: 198,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: '#d31471',
  },
  scanButtonContent: {
    minWidth: 198,
    height: 46,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scanButtonLabel: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: -0.3,
  },
  photoPickerButton: {
    position: 'absolute',
    left: 86,
    top: 258,
    minWidth: 198,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.38)',
    backgroundColor: 'rgba(255,255,255,0.64)',
    overflow: 'hidden',
  },
  photoPickerButtonContent: {
    minWidth: 198,
    height: 42,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPickerButtonLabel: {
    color: '#d31471',
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: -0.28,
  },
  contentShape: {
    position: 'absolute',
    left: 0,
    top: 513,
  },
  instructionNavigation: {
    position: 'absolute',
    left: 11,
    top: 524,
    width: 380,
    height: 40,
  },
  instructions: {
    position: 'absolute',
    left: 0,
    top: 570,
    width: DESIGN_WIDTH,
    height: INSTRUCTION_CARD_HEIGHT,
  },
  instructionsContent: {
    paddingLeft: 16,
    paddingRight: 26,
    gap: INSTRUCTION_GAP,
  },
  divider: {
    position: 'absolute',
    left: 16,
    top: 713,
    width: 370,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#ededed',
  },
  actions: {
    position: 'absolute',
    left: 16,
    top: 726,
    width: 370,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButton: {
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#d31471',
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
