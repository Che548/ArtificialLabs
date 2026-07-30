import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFonts } from 'expo-font';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import {
  Image,
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

import { useHealthStore } from '../lib/health-store';
import type { ScanResult } from '../lib/health-types';
import { persistScanImage } from '../lib/local-files';

import ContentShape from '../assets/figma/content-shape.svg';
import CalendarIcon from '../assets/figma/calendar-icon.svg';
import BuyIcon from '../assets/figma/scan-screen/buy.svg';
import HeaderHistoryIcon from '../assets/figma/scan-screen/header-history.svg';
import HistoryIcon from '../assets/figma/scan-screen/history.svg';
import InfoIcon from '../assets/figma/scan-screen/info.svg';
import NextIcon from '../assets/figma/scan-screen/next.svg';
import ScanIcon from '../assets/figma/scan-screen/scan.svg';
import ScannerFrame from '../assets/figma/scan-screen/scanner-frame.svg';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const FONT_SF_REGULAR = 'SFProDisplay-Regular';
const FONT_SF_MEDIUM = 'SFProDisplay-Medium';
const FONT_YARO_RG = 'YaroRg-Regular';
const INSTRUCTION_CARD_WIDTH = 360;
const INSTRUCTION_GAP = 10;
const INSTRUCTION_SNAP = INSTRUCTION_CARD_WIDTH + INSTRUCTION_GAP;
const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

const instructions = [
  {
    title: 'Ознакомление',
    body: 'Вскройте коробку, внимательно\nизучите инструкции.',
  },
  {
    title: 'Анализ и подготовка',
    body: 'Используйте тест и разместите\nего на однотонном фоне.',
  },
  {
    title: 'Проверьте освещение',
    body: 'Избегайте теней, бликов и\nслишком тёмных мест.',
  },
  {
    title: 'Наведите камеру',
    body: 'Поместите весь тест в рамку\nи держите телефон неподвижно.',
  },
];

type GlassControlProps = {
  accessibilityLabel: string;
  className?: string;
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
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
          isInteractive
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
  className = '',
  children,
  onPress,
  style,
}: GlassControlProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={className}
      style={({ pressed }) => [
        style,
        !hasNativeLiquidGlass && styles.glassShadow,
        pressed && !hasNativeLiquidGlass && styles.fallbackPressed,
      ]}
    >
      <LiquidGlassSurface
        variant="clear"
        colorScheme="light"
        fallbackTint="systemUltraThinMaterialLight"
        intensity={58}
        washColor="transparent"
        highlight="light"
      >
        {children}
      </LiquidGlassSurface>
    </Pressable>
  );
}

type ActionButtonProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

function ActionButton({ icon, label, onPress }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-12 flex-row items-center justify-center gap-3 rounded-full bg-brand-primary py-0 pl-[5px] pr-[18px] active:opacity-[0.72]"
    >
      <View className="h-[38px] w-[38px] items-center justify-center rounded-full bg-white">
        {icon}
      </View>
      <Text className="font-sf text-[15px] leading-[17px] tracking-[-0.3px] text-white">
        {label}
      </Text>
    </Pressable>
  );
}

export default function ScanScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const instructionRef = useRef<ScrollViewType>(null);
  const cameraRef = useRef<CameraView>(null);
  const { addScanResult, readOnly, scanResults } = useHealthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [activeInstruction, setActiveInstruction] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string>();
  const [testSystemKey, setTestSystemKey] = useState<
    'pregnancy-strip' | 'ovulation-strip'
  >('pregnancy-strip');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fontsLoaded] = useFonts({
    [FONT_SF_REGULAR]: require('../assets/fonts/SF-Pro-Display-Regular.otf'),
    [FONT_SF_MEDIUM]: require('../assets/fonts/SF-Pro-Display-Medium.otf'),
    [FONT_YARO_RG]: require('../assets/fonts/Yaro-Rg-Regular.otf'),
  });

  const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
  const headerTop = Math.max(16, insets.top / scale + 12);
  const scannerTop = Math.max(110, headerTop + 62);
  const sfRegular = fontsLoaded
    ? FONT_SF_REGULAR
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';
  const sfMedium = fontsLoaded
    ? FONT_SF_MEDIUM
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif-medium';
  const yaro = fontsLoaded
    ? FONT_YARO_RG
    : Platform.OS === 'ios'
      ? 'System'
      : 'sans-serif';

  const scrollToInstruction = (index: number) => {
    const nextIndex = Math.max(0, Math.min(instructions.length - 1, index));
    setActiveInstruction(nextIndex);
    instructionRef.current?.scrollTo({
      x: nextIndex * INSTRUCTION_SNAP,
      animated: true,
    });
  };

  const handleInstructionScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const index = Math.round(
      event.nativeEvent.contentOffset.x / INSTRUCTION_SNAP,
    );
    setActiveInstruction(Math.max(0, Math.min(instructions.length - 1, index)));
  };

  const showPlaceholder = (title: string) => {
    setNotice(`${title}: раздел будет подключён к соответствующему сценарию.`);
  };

  const openCamera = async () => {
    if (readOnly) {
      setNotice('В web-демо камера и сохранение медицинских данных отключены.');
      return;
    }
    const status = permission?.granted ? permission : await requestPermission();
    if (!status.granted) {
      setNotice(
        'Нужен доступ к камере. Разрешите его в настройках устройства и повторите.',
      );
      return;
    }
    setCameraOpen(true);
  };

  const capture = async () => {
    const picture = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (!picture) return;
    setCapturedUri(await persistScanImage(picture.uri));
    setCameraOpen(false);
  };

  const pickImage = async () => {
    if (readOnly) {
      setNotice('В web-демо сохранение медицинских данных отключено.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (!result.canceled) {
      setCapturedUri(await persistScanImage(result.assets[0].uri));
      setCameraOpen(false);
    }
  };

  const saveConfirmedResult = async (
    confirmedValue: ScanResult['confirmedValue'],
  ) => {
    if (!capturedUri) return;
    setSaving(true);
    try {
      await addScanResult({
        testSystemKey,
        capturedAt: Date.now(),
        confirmedValue,
        confidence: 'manual',
        qualityFlags: [],
        algorithmVersion: 'manual-v1',
        hasLocalImage: true,
        localImageUri: capturedUri,
      });
      setCapturedUri(undefined);
      setNotice('Результат сохранён. Фото осталось только на этом устройстве.');
    } catch (cause) {
      console.error('Saving scan result failed', cause);
      setNotice('Не удалось сохранить результат. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-surface-rose">
      <StatusBar style="dark" hidden={false} />
      <View
        style={{
          width: DESIGN_WIDTH * scale,
          height: DESIGN_HEIGHT * scale,
        }}
      >
        <View
          className="h-[874px] w-[402px] origin-top-left"
          style={{ transform: [{ scale }] }}
        >
          <View className="h-[874px] w-[402px] overflow-hidden rounded-card-xl bg-surface-rose">
            <Image
              source={require('../assets/figma/scan-screen/background.png')}
              resizeMode="cover"
              className="absolute -top-[15px] left-0 h-[869px] w-[402px] -scale-y-100"
            />

            <GlassContainer
              spacing={12}
              style={[styles.header, { top: headerTop }]}
            >
              <GlassControl
                accessibilityLabel="Открыть историю"
                onPress={() => setHistoryOpen(true)}
                className="h-12 w-12 items-center justify-center rounded-full"
              >
                <HeaderHistoryIcon width={22} height={22} />
              </GlassControl>

              <GlassControl
                accessibilityLabel="Выбрать дату"
                onPress={() => showPlaceholder('Выбор даты')}
                className="h-12 w-[156px] items-center justify-center rounded-full"
              >
                <Text
                  className="text-[18px] leading-5 tracking-[-0.36px] text-ink"
                  style={{ fontFamily: sfRegular }}
                >
                  <Text style={{ fontFamily: yaro }}>21</Text> июля
                </Text>
              </GlassControl>

              <GlassControl
                accessibilityLabel="Открыть календарь"
                onPress={() => showPlaceholder('Календарь')}
                className="h-12 w-12 items-center justify-center rounded-full"
              >
                <View className="-scale-y-100">
                  <CalendarIcon width={22} height={22} />
                </View>
              </GlassControl>
            </GlassContainer>

            <View
              className="absolute left-4 h-[370px] w-[370px] overflow-hidden rounded-[50px] bg-white/20"
              style={{ top: scannerTop }}
            >
              <ScannerFrame
                width={339}
                height={339}
                style={styles.scannerFrame}
              />

              <View className="absolute left-10 top-[105px] w-[290px] items-center gap-[5px]">
                <Text
                  className="text-[32px] leading-[35px] tracking-[-0.64px] text-brand-soft"
                  style={{ fontFamily: yaro }}
                >
                  сфера.
                </Text>
                <Text
                  className="w-[290px] text-center text-[19px] leading-[22px] tracking-[-0.38px] text-brand-soft"
                  style={{ fontFamily: sfRegular }}
                >
                  Мгновенный анализ тестов на{'\n'}
                  овуляцию или беременность
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Начать сканирование"
                onPress={() => void openCamera()}
                className="absolute left-[86px] top-[200px] h-[46px] min-w-[198px] flex-row items-center justify-center gap-2.5 rounded-full bg-brand-primary px-3.5 active:opacity-[0.72]"
              >
                <ScanIcon width={20} height={20} />
                <Text
                  className="text-[15px] leading-[17px] tracking-[-0.3px] text-white"
                  style={{ fontFamily: sfRegular }}
                >
                  Начать сканирование
                </Text>
              </Pressable>
            </View>

            <ContentShape
              pointerEvents="none"
              width={DESIGN_WIDTH}
              height={361}
              style={styles.contentShape}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Предыдущий шаг"
              accessibilityState={{
                disabled: activeInstruction === 0,
              }}
              disabled={activeInstruction === 0}
              onPress={() => scrollToInstruction(activeInstruction - 1)}
              className={`absolute left-[11px] top-[524px] h-10 w-10 rotate-180 active:opacity-[0.64] ${activeInstruction === 0 ? 'opacity-70' : ''}`}
            >
              <NextIcon width={40} height={40} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Следующий шаг"
              accessibilityState={{
                disabled: activeInstruction === instructions.length - 1,
              }}
              disabled={activeInstruction === instructions.length - 1}
              onPress={() => scrollToInstruction(activeInstruction + 1)}
              className={`absolute right-[11px] top-[524px] h-10 w-10 active:opacity-[0.64] ${activeInstruction === instructions.length - 1 ? 'opacity-70' : ''}`}
            >
              <NextIcon width={40} height={40} />
            </Pressable>

            <ScrollView
              ref={instructionRef}
              horizontal
              decelerationRate="fast"
              disableIntervalMomentum
              contentInsetAdjustmentBehavior="never"
              contentContainerClassName="gap-2.5 pl-4 pr-[26px]"
              showsHorizontalScrollIndicator={false}
              snapToInterval={INSTRUCTION_SNAP}
              onMomentumScrollEnd={handleInstructionScrollEnd}
              className="absolute left-0 top-[591px] h-[100px] w-[402px]"
            >
              {instructions.map((instruction, index) => (
                <View
                  key={instruction.title}
                  className="h-[100px] w-[360px] flex-row items-center gap-2 rounded-card-lg bg-surface-warm pl-[23px] pr-4"
                >
                  <View className="h-[100px] w-[68px] -translate-x-1.5 translate-y-[3px] items-center justify-center">
                    <Text
                      numberOfLines={1}
                      className="h-[100px] w-[68px] text-center text-[62px] leading-[100px] tracking-[-1.24px] text-[#171717]"
                      style={{ fontFamily: yaro }}
                    >
                      {`${index + 1}”`}
                    </Text>
                  </View>
                  <View className="w-[245px] justify-center gap-[3px]">
                    <Text
                      className="text-[20px] leading-[22px] tracking-[-0.4px] text-[#171717]"
                      style={{ fontFamily: sfMedium }}
                    >
                      {instruction.title}
                    </Text>
                    <Text
                      numberOfLines={2}
                      className="text-[17px] leading-[19px] tracking-[-0.34px] text-[#171717]"
                      style={{ fontFamily: sfRegular }}
                    >
                      {instruction.body}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View className="absolute left-4 top-[713px] h-0.5 w-[370px] rounded bg-surface-divider" />

            <View className="absolute left-4 top-[726px] h-12 w-[370px] flex-row items-center justify-between">
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
                onPress={() => setHistoryOpen(true)}
                icon={<HistoryIcon width={19} height={19} />}
              />
            </View>
            {notice ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть уведомление"
                onPress={() => setNotice(null)}
                className="absolute bottom-[92px] left-4 right-4 z-10 rounded-2xl bg-ink/90 px-4 py-3 active:opacity-80"
              >
                <Text className="font-sf text-[14px] leading-[18px] text-white">
                  {notice}
                </Text>
              </Pressable>
            ) : null}

            {cameraOpen ? (
              <View className="absolute inset-0 z-50 bg-black">
                <CameraView
                  ref={cameraRef}
                  facing="back"
                  style={StyleSheet.absoluteFill}
                />
                <View className="absolute left-5 right-5 top-12 flex-row justify-between">
                  <Pressable
                    onPress={() => setCameraOpen(false)}
                    className="h-11 items-center justify-center rounded-full bg-black/60 px-5"
                  >
                    <Text className="font-sf-medium text-[14px] text-white">
                      Закрыть
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void pickImage()}
                    className="h-11 items-center justify-center rounded-full bg-black/60 px-5"
                  >
                    <Text className="font-sf-medium text-[14px] text-white">
                      Из галереи
                    </Text>
                  </Pressable>
                </View>
                <View className="absolute bottom-14 left-0 right-0 items-center">
                  <Pressable
                    accessibilityLabel="Сделать снимок"
                    onPress={() => void capture()}
                    className="h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white bg-white/30"
                  >
                    <View className="h-[56px] w-[56px] rounded-full bg-white" />
                  </Pressable>
                </View>
              </View>
            ) : null}

            {capturedUri ? (
              <View className="absolute inset-0 z-50 justify-end bg-black/40 p-4 pb-[90px]">
                <View className="rounded-[30px] bg-white p-5">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-sf-semibold text-[21px] text-ink">
                      Подтвердите результат
                    </Text>
                    <Pressable
                      onPress={() => setCapturedUri(undefined)}
                      className="h-10 w-10 items-center justify-center rounded-full bg-[#f2f2f7]"
                    >
                      <Text className="text-[22px] text-ink">×</Text>
                    </Pressable>
                  </View>
                  <Image
                    source={{ uri: capturedUri }}
                    resizeMode="cover"
                    className="mt-3 h-[170px] w-full rounded-2xl bg-[#f2f2f7]"
                  />
                  <Text className="text-text-secondary mt-3 font-sf text-[13px] leading-[18px]">
                    Автоматическое распознавание пока не выполняется. Выберите
                    тип теста и визуально подтверждённый результат.
                  </Text>
                  <View className="mt-3 flex-row gap-2">
                    {(['pregnancy-strip', 'ovulation-strip'] as const).map(
                      (key) => (
                        <Pressable
                          key={key}
                          onPress={() => setTestSystemKey(key)}
                          className={`h-9 flex-1 items-center justify-center rounded-full ${testSystemKey === key ? 'bg-brand-primary' : 'bg-[#f2f2f7]'}`}
                        >
                          <Text
                            className={`font-sf-medium text-[12px] ${testSystemKey === key ? 'text-white' : 'text-ink'}`}
                          >
                            {key === 'pregnancy-strip'
                              ? 'Беременность'
                              : 'Овуляция'}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                  <View className="mt-3 flex-row gap-2">
                    {(
                      [
                        ['negative', 'Отрицательный'],
                        ['positive', 'Положительный'],
                        ['invalid', 'Недействителен'],
                      ] as const
                    ).map(([value, label]) => (
                      <Pressable
                        key={value}
                        disabled={saving}
                        onPress={() => void saveConfirmedResult(value)}
                        className="min-h-11 flex-1 items-center justify-center rounded-2xl border border-brand-primary px-1"
                      >
                        <Text className="text-center font-sf-medium text-[11px] text-brand-primary">
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            ) : null}

            {historyOpen ? (
              <View className="absolute inset-0 z-50 justify-end bg-black/30 p-4 pb-[90px]">
                <View className="max-h-[620px] rounded-[30px] bg-white p-5">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-sf-semibold text-[22px] text-ink">
                      История тестов
                    </Text>
                    <Pressable
                      onPress={() => setHistoryOpen(false)}
                      className="h-10 w-10 items-center justify-center rounded-full bg-[#f2f2f7]"
                    >
                      <Text className="text-[22px] text-ink">×</Text>
                    </Pressable>
                  </View>
                  <ScrollView className="mt-2">
                    {scanResults.filter((item) => !item.deletedAt).length ? (
                      scanResults
                        .filter((item) => !item.deletedAt)
                        .map((result) => (
                          <View
                            key={result.localId}
                            className="mt-3 rounded-2xl bg-[#f2f2f7] p-4"
                          >
                            <Text className="font-sf-semibold text-[15px] text-ink">
                              {result.testSystemKey === 'ovulation-strip'
                                ? 'Тест на овуляцию'
                                : 'Тест на беременность'}
                            </Text>
                            <Text className="text-text-secondary mt-1 font-sf text-[13px]">
                              {new Date(result.capturedAt).toLocaleString(
                                'ru-RU',
                              )}{' '}
                              ·{' '}
                              {
                                {
                                  positive: 'положительный',
                                  negative: 'отрицательный',
                                  invalid: 'недействительный',
                                }[result.confirmedValue]
                              }
                            </Text>
                            <Text className="text-text-secondary mt-1 font-sf text-[11px]">
                              Подтверждено пользователем · фото только на
                              устройстве
                            </Text>
                          </View>
                        ))
                    ) : (
                      <Text className="text-text-secondary py-8 text-center font-sf text-[14px]">
                        Сохранённых тестов пока нет.
                      </Text>
                    )}
                  </ScrollView>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute',
    zIndex: 5,
    left: 16,
    width: 370,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nativeGlassView: {
    overflow: 'visible',
  },
  nativeGlassContent: {
    ...StyleSheet.absoluteFill,
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
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
  },
  glassSurfaceClipped: {
    overflow: 'hidden',
  },
  glassInnerStroke: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.52)',
  },
  fallbackPressed: {
    transform: [{ scale: 1.035 }],
  },
  scannerFrame: {
    position: 'absolute',
    left: 16,
    top: 16,
  },
  contentShape: {
    position: 'absolute',
    left: 0,
    top: 513,
  },
});
