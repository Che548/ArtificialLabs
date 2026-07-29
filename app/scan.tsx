import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { useFonts } from 'expo-font';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import {
  Alert,
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
const hasNativeLiquidGlass =
  Platform.OS === 'ios' && isLiquidGlassAvailable();

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
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: washColor },
            ]}
          />
          <LinearGradient
            colors={highlightColors}
            locations={[0, 0.42, 1]}
            start={{ x: 0.04, y: 0 }}
            end={{ x: 0.96, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[styles.glassInnerStroke, { borderRadius: radius }]}
          />
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
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
      style={({ pressed }) => [
        styles.actionButton,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.actionIconCircle}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function ScanScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const instructionRef = useRef<ScrollViewType>(null);
  const [activeInstruction, setActiveInstruction] = useState(0);
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
    const nextIndex = Math.max(
      0,
      Math.min(instructions.length - 1, index),
    );
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
    setActiveInstruction(
      Math.max(0, Math.min(instructions.length - 1, index)),
    );
  };

  const showPlaceholder = (title: string) => {
    Alert.alert(title, 'Раздел будет подключён к соответствующему сценарию.');
  };

  return (
    <View style={styles.root}>
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
              source={require('../assets/figma/scan-screen/background.png')}
              resizeMode="cover"
              style={styles.background}
            />

            <GlassContainer
              spacing={12}
              style={[styles.header, { top: headerTop }]}
            >
              <GlassControl
                accessibilityLabel="Открыть историю"
                onPress={() => showPlaceholder('История')}
                style={styles.headerCircle}
              >
                <HeaderHistoryIcon width={22} height={22} />
              </GlassControl>

              <GlassControl
                accessibilityLabel="Выбрать дату"
                onPress={() => showPlaceholder('Выбор даты')}
                style={styles.datePill}
              >
                <Text style={[styles.dateText, { fontFamily: sfRegular }]}>
                  <Text style={{ fontFamily: yaro }}>21</Text> июля
                </Text>
              </GlassControl>

              <GlassControl
                accessibilityLabel="Открыть календарь"
                onPress={() => showPlaceholder('Календарь')}
                style={styles.headerCircle}
              >
                <View style={styles.headerIconOrientation}>
                  <CalendarIcon width={22} height={22} />
                </View>
              </GlassControl>
            </GlassContainer>

            <View style={[styles.scannerCard, { top: scannerTop }]}>
              <ScannerFrame
                width={339}
                height={339}
                style={styles.scannerFrame}
              />

              <View style={styles.scannerCopy}>
                <Text style={[styles.sphere, { fontFamily: yaro }]}>
                  сфера.
                </Text>
                <Text
                  style={[
                    styles.scannerDescription,
                    { fontFamily: sfRegular },
                  ]}
                >
                  Мгновенный анализ тестов на{'\n'}
                  овуляцию или беременность
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Начать сканирование"
                onPress={() => showPlaceholder('Сканирование')}
                style={({ pressed }) => [
                  styles.scanButton,
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
              style={({ pressed }) => [
                styles.previousButton,
                activeInstruction === 0 && styles.arrowDisabled,
                pressed && styles.arrowPressed,
              ]}
            >
              <NextIcon width={40} height={40} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Следующий шаг"
              accessibilityState={{
                disabled:
                  activeInstruction === instructions.length - 1,
              }}
              disabled={activeInstruction === instructions.length - 1}
              onPress={() => scrollToInstruction(activeInstruction + 1)}
              style={({ pressed }) => [
                styles.nextButton,
                activeInstruction === instructions.length - 1 &&
                  styles.arrowDisabled,
                pressed && styles.arrowPressed,
              ]}
            >
              <NextIcon width={40} height={40} />
            </Pressable>

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
              {instructions.map((instruction, index) => (
                <View key={instruction.title} style={styles.instructionCard}>
                  <View style={styles.instructionNumberRow}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.instructionNumber,
                        { fontFamily: yaro },
                      ]}
                    >
                      {`${index + 1}”`}
                    </Text>
                  </View>
                  <View style={styles.instructionCopy}>
                    <Text
                      style={[
                        styles.instructionTitle,
                        { fontFamily: sfMedium },
                      ]}
                    >
                      {instruction.title}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.instructionBody,
                        { fontFamily: sfRegular },
                      ]}
                    >
                      {instruction.body}
                    </Text>
                  </View>
                </View>
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
                onPress={() => showPlaceholder('История')}
                icon={<HistoryIcon width={19} height={19} />}
              />
            </View>
          </View>
        </View>
      </View>
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
    transform: [{ scaleY: -1 }],
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
  dateText: {
    color: '#212123',
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.36,
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
    borderRadius: 50,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  scannerFrame: {
    position: 'absolute',
    left: 16,
    top: 16,
  },
  scannerCopy: {
    position: 'absolute',
    top: 105,
    left: 40,
    width: 290,
    alignItems: 'center',
    gap: 5,
  },
  sphere: {
    color: '#ea4087',
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.64,
  },
  scannerDescription: {
    width: 290,
    color: '#ea4087',
    textAlign: 'center',
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: -0.38,
  },
  scanButton: {
    position: 'absolute',
    left: 86,
    top: 200,
    minWidth: 198,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 23,
    backgroundColor: '#d31471',
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
  contentShape: {
    position: 'absolute',
    left: 0,
    top: 513,
  },
  previousButton: {
    position: 'absolute',
    left: 11,
    top: 524,
    width: 40,
    height: 40,
    transform: [{ rotate: '180deg' }],
  },
  nextButton: {
    position: 'absolute',
    right: 11,
    top: 524,
    width: 40,
    height: 40,
  },
  arrowPressed: {
    opacity: 0.64,
  },
  arrowDisabled: {
    opacity: 0.7,
  },
  instructions: {
    position: 'absolute',
    left: 0,
    top: 591,
    width: DESIGN_WIDTH,
    height: 100,
  },
  instructionsContent: {
    paddingLeft: 16,
    paddingRight: 26,
    gap: INSTRUCTION_GAP,
  },
  instructionCard: {
    width: INSTRUCTION_CARD_WIDTH,
    height: 100,
    paddingLeft: 23,
    paddingRight: 16,
    borderRadius: 30,
    backgroundColor: '#fdece5',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionNumberRow: {
    width: 68,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateX: -6 }, { translateY: 3 }],
  },
  instructionNumber: {
    width: 68,
    height: 100,
    color: '#171717',
    fontSize: 62,
    lineHeight: 100,
    letterSpacing: -1.24,
    textAlign: 'center',
  },
  instructionCopy: {
    width: 245,
    gap: 3,
    justifyContent: 'center',
  },
  instructionTitle: {
    color: '#171717',
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
  instructionBody: {
    color: '#171717',
    fontSize: 17,
    lineHeight: 19,
    letterSpacing: -0.34,
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
    paddingLeft: 5,
    paddingRight: 18,
    borderRadius: 24,
    backgroundColor: '#d31471',
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
