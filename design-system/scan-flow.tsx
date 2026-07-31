import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import {
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
  AppText,
  LiquidGlassSurface,
  PrimaryButton,
  ScanTooltip,
  type ScanTooltipKind,
} from './components';
import {
  colors,
  motion,
  radii,
  shadows,
  spacing,
} from './tokens';
import ScanFlowFrame from '../assets/figma/scan-screen/scan-flow-frame.svg';

const hasNativeFlowGlass =
  Platform.OS === 'ios' && isLiquidGlassAvailable();

type ScanFlowStage =
  | 'briefing'
  | 'qr'
  | 'test'
  | 'processing'
  | 'result'
  | 'correction';

type ScanFlowOverlayProps = {
  headerTop: number;
  visible: boolean;
  showBriefing: boolean;
  onBriefingSeen: () => void;
  onClose: () => void;
  onComplete: (capturedUri: string) => void;
};

type FlowIconName =
  | 'close'
  | 'help'
  | 'qr'
  | 'test'
  | 'light'
  | 'surface'
  | 'steady'
  | 'check';

function FlowIcon({
  name,
  color = colors.text.primary,
  size = 22,
}: {
  name: FlowIconName;
  color?: string;
  size?: number;
}) {
  if (name === 'close') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'help') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
        />
        <Path
          d="M9.8 9.2a2.35 2.35 0 1 1 3.7 1.92c-.93.64-1.5 1.08-1.5 2.18M12 16.8v.1"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'qr') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <Rect x="8" y="8" width="3" height="3" rx="0.6" fill={color} />
        <Rect x="13" y="8" width="3" height="3" rx="0.6" fill={color} />
        <Rect x="8" y="13" width="3" height="3" rx="0.6" fill={color} />
        <Rect x="13" y="13" width="3" height="3" rx="0.6" fill={color} />
      </Svg>
    );
  }

  if (name === 'test') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect
          x="5"
          y="8"
          width="14"
          height="8"
          rx="4"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
        />
        <Circle cx="9" cy="12" r="1.6" fill={color} />
        <Path
          d="M13 10.2v3.6M16 10.2v3.6"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'light') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle
          cx="12"
          cy="12"
          r="4"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
        />
        <Path
          d="M12 2.7v2M12 19.3v2M2.7 12h2M19.3 12h2M5.4 5.4l1.4 1.4M17.2 17.2l1.4 1.4M18.6 5.4l-1.4 1.4M6.8 17.2l-1.4 1.4"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'surface') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M4 17.5 8.2 13l3.1 2.7 3.5-4 5.2 5.8"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M4 6.5h16"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (name === 'steady') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M7.2 12.7V7.8a1.5 1.5 0 0 1 3 0v3.1-5.1a1.5 1.5 0 0 1 3 0v4.7-3.7a1.5 1.5 0 0 1 3 0v4.1-2.1a1.5 1.5 0 0 1 3 0v5.4c0 4-2.6 6.1-6.4 6.1h-.9c-2.5 0-4.2-1.2-5.5-3.1l-2-2.9a1.45 1.45 0 0 1 2.3-1.75l1.5 1.45"
          fill="none"
          stroke={color}
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="12" r="10" fill={color} />
      <Path
        d="m7.8 12.1 2.7 2.7 5.8-6"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function RoundGlassButton({
  accessibilityLabel,
  darkContent = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  darkContent?: boolean;
  icon: FlowIconName;
  onPress: () => void;
}) {
  const iconElement = (
    <FlowIcon
      name={icon}
      color={darkContent ? colors.text.primary : '#ffffff'}
    />
  );

  if (hasNativeFlowGlass) {
    return (
      <GlassView
        glassEffectStyle="clear"
        colorScheme="auto"
        isInteractive
        style={styles.roundButton}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={styles.flowGlassPressTarget}
        >
          {iconElement}
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
        styles.roundButton,
        shadows.floating,
        pressed && styles.flowGlassPressed,
      ]}
    >
      <LiquidGlassSurface
        variant="clear"
        colorScheme="auto"
        fallbackTint="default"
        washColor="transparent"
        intensity={72}
        showFallbackDecoration={false}
      >
        {iconElement}
      </LiquidGlassSurface>
    </Pressable>
  );
}

function FlowHeader({
  currentStep,
  light = true,
  onClose,
  onHelp,
  showClose = true,
  top,
}: {
  currentStep?: string;
  light?: boolean;
  onClose: () => void;
  onHelp: () => void;
  showClose?: boolean;
  top: number;
}) {
  const color = light ? '#ffffff' : colors.text.primary;
  const stepLabel = currentStep ? (
    <AppText role="label" weight="medium" color={color}>
      {currentStep}
    </AppText>
  ) : null;

  return (
    <GlassContainer
      spacing={12}
      style={[styles.flowHeader, { top }]}
    >
      {showClose ? (
        <RoundGlassButton
          accessibilityLabel="Закрыть сканирование"
          darkContent={!light}
          icon="close"
          onPress={onClose}
        />
      ) : (
        <View style={styles.headerSpacer} />
      )}

      {currentStep ? (
        hasNativeFlowGlass ? (
          <GlassView
            glassEffectStyle="clear"
            colorScheme="auto"
            style={styles.stepPill}
          >
            {stepLabel}
          </GlassView>
        ) : (
          <View style={[styles.stepPill, shadows.floating]}>
            <LiquidGlassSurface
              variant="clear"
              colorScheme="auto"
              fallbackTint="default"
              washColor="transparent"
              intensity={72}
              showFallbackDecoration={false}
            >
              {stepLabel}
            </LiquidGlassSurface>
          </View>
        )
      ) : (
        <View />
      )}

      <RoundGlassButton
        accessibilityLabel="Открыть инструктаж"
        darkContent={!light}
        icon="help"
        onPress={onHelp}
      />
    </GlassContainer>
  );
}

function CameraBackdrop({
  cameraRef,
  onBarcodeScanned,
  onCameraReady,
}: {
  cameraRef?: RefObject<CameraView | null>;
  onBarcodeScanned?: (result: BarcodeScanningResult) => void;
  onCameraReady?: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const requestedPermission = useRef(false);

  useEffect(() => {
    if (
      permission &&
      !permission.granted &&
      permission.canAskAgain &&
      !requestedPermission.current
    ) {
      requestedPermission.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const granted = permission?.granted === true;

  return (
    <View style={StyleSheet.absoluteFill}>
      {granted ? (
        <CameraView
          ref={cameraRef}
          barcodeScannerSettings={
            onBarcodeScanned ? { barcodeTypes: ['qr'] } : undefined
          }
          facing="back"
          mode="picture"
          onBarcodeScanned={onBarcodeScanned}
          onCameraReady={onCameraReady}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <LinearGradient
          colors={['#251119', '#4A2433', '#170C11']}
          locations={[0, 0.52, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.94, y: 1 }}
          style={StyleSheet.absoluteFill}
        >
          <View style={styles.cameraPermissionState}>
            {permission === null ? (
              <>
                <ActivityIndicator size="small" color="#ffffff" />
                <AppText role="label" color="#ffffff">
                  Подключаем камеру…
                </AppText>
              </>
            ) : (
              <>
                <AppText
                  role="heading"
                  weight="semibold"
                  color="#ffffff"
                  style={styles.centerText}
                >
                  Нужен доступ к камере
                </AppText>
                <AppText
                  role="label"
                  color="rgba(255,255,255,0.72)"
                  style={styles.cameraPermissionCopy}
                >
                  Камера используется для QR-кода и снимка теста.
                </AppText>
                <View style={styles.cameraPermissionAction}>
                  <PrimaryButton
                    label={
                      permission.canAskAgain
                        ? 'Разрешить доступ'
                        : 'Открыть настройки'
                    }
                    onPress={() => {
                      if (permission.canAskAgain) {
                        void requestPermission();
                      } else {
                        void Linking.openSettings();
                      }
                    }}
                  />
                </View>
              </>
            )}
          </View>
        </LinearGradient>
      )}
      <View
        pointerEvents="none"
        style={styles.cameraReadabilityScrim}
      />
    </View>
  );
}

function BriefingScreen({
  headerTop,
  hideClose = false,
  onClose,
  onContinue,
}: {
  headerTop: number;
  hideClose?: boolean;
  onClose: () => void;
  onContinue: () => void;
}) {
  const items: Array<{
    icon: FlowIconName;
    title: string;
    body: string;
  }> = [
    {
      icon: 'qr',
      title: 'Сначала QR-код',
      body: 'Мы определим тип теста, партию и срок годности.',
    },
    {
      icon: 'surface',
      title: 'Подготовьте поверхность',
      body: 'Положите тест ровно на светлый однородный фон.',
    },
    {
      icon: 'light',
      title: 'Проверьте освещение',
      body: 'Избегайте теней и бликов на диагностическом окне.',
    },
  ];

  return (
    <View style={styles.briefingScreen}>
      <FlowHeader
        light={false}
        onClose={onClose}
        onHelp={() => undefined}
        showClose={!hideClose}
        top={headerTop}
      />

      <View style={styles.briefingHero}>
        <View style={styles.briefingIcon}>
          <FlowIcon name="test" color={colors.brand.primary} size={34} />
        </View>
        <AppText role="title" weight="semibold" style={styles.centerText}>
          Перед сканированием
        </AppText>
        <AppText
          role="body"
          color={colors.text.secondary}
          style={styles.briefingSubtitle}
        >
          Это займёт меньше минуты. Инструктаж показывается только перед
          первым сканированием.
        </AppText>
      </View>

      <View style={styles.briefingList}>
        {items.map((item, index) => (
          <View key={item.title} style={styles.briefingRow}>
            <View style={styles.briefingRowIcon}>
              <FlowIcon
                name={item.icon}
                color={colors.brand.primary}
                size={23}
              />
            </View>
            <View style={styles.briefingRowCopy}>
              <AppText role="body" weight="medium">
                {item.title}
              </AppText>
              <AppText role="label" color={colors.text.secondary}>
                {item.body}
              </AppText>
            </View>
            <View style={styles.briefingRowNumber}>
              <AppText numeric role="label" color={colors.brand.primary}>
                {index + 1}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.bottomAction}>
        <PrimaryButton label="Продолжить" onPress={onContinue} />
      </View>
    </View>
  );
}

function QrScannerScreen({
  headerTop,
  onClose,
  onHelp,
  onScanned,
}: {
  headerTop: number;
  onClose: () => void;
  onHelp: () => void;
  onScanned: () => void;
}) {
  const scanned = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [detected, setDetected] = useState(false);
  const { height: screenHeight, width: screenWidth } =
    useWindowDimensions();
  const frameLeft = useRef(new Animated.Value(71)).current;
  const frameTop = useRef(
    new Animated.Value(headerTop + 203),
  ).current;
  const frameSize = useRef(new Animated.Value(260)).current;
  const qrOpacity = useRef(new Animated.Value(1)).current;

  useEffect(
    () => () => {
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
      }
    },
    [],
  );

  const handleBarcodeScanned = (
    result: BarcodeScanningResult,
  ) => {
    if (scanned.current) {
      return;
    }

    scanned.current = true;
    setDetected(true);

    let originX = result.bounds.origin.x;
    let originY = result.bounds.origin.y;
    let detectedWidth = result.bounds.size.width;
    let detectedHeight = result.bounds.size.height;

    if (
      (detectedWidth <= 0 || detectedHeight <= 0) &&
      result.cornerPoints.length > 0
    ) {
      const xValues = result.cornerPoints.map((point) => point.x);
      const yValues = result.cornerPoints.map((point) => point.y);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);

      originX = minX;
      originY = minY;
      detectedWidth = maxX - minX;
      detectedHeight = maxY - minY;
    }

    const hasUsableBounds =
      Number.isFinite(originX) &&
      Number.isFinite(originY) &&
      detectedWidth > 0 &&
      detectedHeight > 0;
    const padding = 14;
    const targetSize = hasUsableBounds
      ? Math.min(
          Math.max(
            Math.max(detectedWidth, detectedHeight) + padding * 2,
            112,
          ),
          screenWidth - 32,
        )
      : 260;
    const targetLeft = hasUsableBounds
      ? Math.min(
          Math.max(
            originX + detectedWidth / 2 - targetSize / 2,
            16,
          ),
          screenWidth - targetSize - 16,
        )
      : 71;
    const maxTargetTop = Math.max(
      headerTop + 72,
      screenHeight - targetSize - 126,
    );
    const targetTop = hasUsableBounds
      ? Math.min(
          Math.max(
            originY + detectedHeight / 2 - targetSize / 2,
            headerTop + 72,
          ),
          maxTargetTop,
        )
      : headerTop + 203;

    Animated.parallel([
      Animated.timing(qrOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(frameLeft, {
        toValue: targetLeft,
        duration: 240,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(frameTop, {
        toValue: targetTop,
        duration: 240,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(frameSize, {
        toValue: targetSize,
        duration: 240,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(() => {
      completionTimer.current = setTimeout(onScanned, 360);
    });
  };

  return (
    <View style={styles.cameraScreen}>
      <CameraBackdrop
        onBarcodeScanned={handleBarcodeScanned}
      />
      <FlowHeader
        currentStep="Шаг 1 из 2"
        onClose={onClose}
        onHelp={onHelp}
        top={headerTop}
      />

      <View
        style={[
          styles.cameraTitle,
          { top: headerTop + 84 },
        ]}
      >
        <AppText
          role="heading"
          weight="semibold"
          color="#ffffff"
          style={styles.centerText}
        >
          Отсканируйте QR-код
        </AppText>
        <AppText
          role="label"
          color="rgba(255,255,255,0.68)"
          style={styles.centerText}
        >
          Код находится на упаковке теста
        </AppText>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.qrTarget,
          {
            height: frameSize,
            left: frameLeft,
            top: frameTop,
            width: frameSize,
          },
        ]}
      >
        <ScanFlowFrame
          width="100%"
          height="100%"
          style={styles.scanFlowFrame}
        />
        <Animated.View style={{ opacity: qrOpacity }}>
          <View style={styles.qrArtwork}>
            <Image
              accessible={false}
              resizeMode="contain"
              source={require('../assets/figma/scan-screen/scan-flow-qr-final.png')}
              style={styles.qrImage}
            />
          </View>
        </Animated.View>
      </Animated.View>

      <View style={styles.cameraBottomGroup}>
        <View style={styles.cameraTooltipSlot}>
          <ScanTooltip
            floatingMaxWidth={370}
            kind={detected ? 'locked' : 'qr'}
            message={
              detected
                ? 'QR-код найден'
                : 'Наведите камеру на QR-код'
            }
            singleLine
            variant="floating"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ввести код вручную"
          accessibilityState={{ disabled: detected }}
          disabled={detected}
          onPress={onScanned}
          style={({ pressed }) => [
            styles.secondaryCameraAction,
            pressed && styles.pressed,
          ]}
        >
          <AppText role="label" weight="medium" color="#ffffff">
            Ввести код вручную
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const qualityHints: Array<{
  kind: ScanTooltipKind;
  text: string;
  tone: 'neutral' | 'warning' | 'success';
}> = [
  {
    kind: 'test',
    text: 'Наведите камеру на тест',
    tone: 'neutral',
  },
  {
    kind: 'lowLight',
    text: 'Слишком темно — добавьте света',
    tone: 'warning',
  },
  {
    kind: 'background',
    text: 'Переместите тест на однородный фон',
    tone: 'warning',
  },
  {
    kind: 'locked',
    text: 'Отлично, не двигайте камеру',
    tone: 'success',
  },
];

function BatchChip({ top }: { top: number }) {
  const content = (
    <View style={styles.batchChipContent}>
      <View style={styles.batchStatus} />
      <View style={styles.batchCopy}>
        <AppText
          role="caption"
          color="rgba(255,255,255,0.66)"
        >
          Тест определён
        </AppText>
        <AppText role="label" weight="medium" color="#ffffff">
          Ovulation LH · Партия A24-071
        </AppText>
      </View>
      <AppText numeric role="caption" color="#ffffff">
        08.2027
      </AppText>
    </View>
  );

  if (hasNativeFlowGlass) {
    return (
      <GlassView
        glassEffectStyle="clear"
        colorScheme="auto"
        style={[styles.batchChip, { top }]}
      >
        {content}
      </GlassView>
    );
  }

  return (
    <View style={[styles.batchChip, { top }]}>
      <LiquidGlassSurface
        variant="clear"
        colorScheme="auto"
        fallbackTint="default"
        washColor="transparent"
        radius={20}
        showFallbackDecoration={false}
      >
        {content}
      </LiquidGlassSurface>
    </View>
  );
}

function TestScannerScreen({
  headerTop,
  onCapture,
  onClose,
  onHelp,
}: {
  headerTop: number;
  onCapture: (capturedUri: string) => void;
  onClose: () => void;
  onHelp: () => void;
}) {
  const [qualityStep, setQualityStep] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    const timers = [
      setTimeout(() => setQualityStep(1), 1300),
      setTimeout(() => setQualityStep(2), 2700),
      setTimeout(() => setQualityStep(3), 4100),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  const currentHint = qualityHints[qualityStep];
  const ready = currentHint.tone === 'success';
  const handleCapture = async () => {
    if (!ready || !cameraReady || capturing) {
      return;
    }

    setCapturing(true);

    try {
      const picture = await cameraRef.current?.takePictureAsync({
        quality: 0.82,
        shutterSound: false,
      });
      if (!picture) {
        throw new Error('Camera did not return a picture');
      }
      onCapture(picture.uri);
    } catch {
      Alert.alert(
        'Не удалось сделать снимок',
        'Проверьте доступ к камере и попробуйте ещё раз.',
      );
      setCapturing(false);
    }
  };

  return (
    <View style={styles.cameraScreen}>
      <CameraBackdrop
        cameraRef={cameraRef}
        onCameraReady={() => setCameraReady(true)}
      />
      <FlowHeader
        currentStep="Шаг 2 из 2"
        onClose={onClose}
        onHelp={onHelp}
        top={headerTop}
      />
      <BatchChip top={headerTop + 64} />

      <View
        style={[
          styles.testTarget,
          { top: headerTop + 182 },
        ]}
      >
        <ScanFlowFrame
          width="100%"
          height="100%"
          style={styles.scanFlowFrame}
        />

        <Image
          accessible={false}
          resizeMode="contain"
          source={require('../assets/figma/scan-screen/scan-test-strip.png')}
          style={styles.testStripImage}
        />
      </View>

      <View style={styles.cameraBottomGroup}>
        <View style={styles.cameraTooltipSlot}>
          <ScanTooltip
            floatingMaxWidth={370}
            kind={currentHint.kind}
            message={currentHint.text}
            singleLine
            variant="floating"
          />
        </View>

        <View style={styles.cameraPrimaryAction}>
          <PrimaryButton
            label={
              capturing
                ? 'Делаем снимок…'
                : ready
                  ? 'Сканировать тест'
                  : 'Проверяем условия'
            }
            disabled={!ready || !cameraReady || capturing}
            onPress={() => {
              void handleCapture();
            }}
          />
        </View>
      </View>
    </View>
  );
}

function ProcessingScreen() {
  return (
    <View style={styles.processingScreen}>
      <LinearGradient
        colors={['#FFF8F5', '#FEE8E3', '#FFF8F6']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.processingContent}>
        <View style={styles.processingIndicator}>
          <ActivityIndicator size="large" color={colors.brand.primary} />
        </View>
        <AppText
          role="title"
          weight="semibold"
          style={styles.centerText}
        >
          Анализируем результат
        </AppText>
        <AppText
          role="body"
          color={colors.text.secondary}
          style={styles.processingDescription}
        >
          Проверяем качество снимка и определяем контрольную и тестовую
          линии.
        </AppText>
        <View style={styles.processingSteps}>
          <View style={styles.processingStepDone}>
            <FlowIcon name="check" color={colors.brand.success} size={18} />
            <AppText role="label">Качество изображения</AppText>
          </View>
          <View style={styles.processingStepActive}>
            <View style={styles.processingDot} />
            <AppText role="label">Распознавание линий</AppText>
          </View>
        </View>
      </View>
    </View>
  );
}

function ResultPreview() {
  return (
    <View style={styles.resultPreview}>
      <LinearGradient
        colors={['#FCEDE8', '#FFF9F6']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.resultStrip}>
        <View style={styles.resultStripTip} />
        <View style={styles.resultWindow}>
          <View style={styles.resultLineStrong} />
          <View style={styles.resultLineSoft} />
          <View style={styles.resultControlLabel}>
            <AppText numeric role="caption" color={colors.text.secondary}>
              C
            </AppText>
            <AppText numeric role="caption" color={colors.text.secondary}>
              T
            </AppText>
          </View>
        </View>
      </View>
      <View style={styles.detectedBadge}>
        <FlowIcon name="check" color={colors.brand.success} size={18} />
        <AppText role="caption" weight="medium">
          Обе зоны распознаны
        </AppText>
      </View>
    </View>
  );
}

function ResultScreen({
  headerTop,
  onClose,
  onConfirm,
  onCorrection,
  onHelp,
}: {
  headerTop: number;
  onClose: () => void;
  onConfirm: () => void;
  onCorrection: () => void;
  onHelp: () => void;
}) {
  return (
    <View style={styles.resultScreen}>
      <FlowHeader
        light={false}
        onClose={onClose}
        onHelp={onHelp}
        top={headerTop}
      />

      <View style={styles.resultHeading}>
        <View style={styles.resultSuccessIcon}>
          <FlowIcon name="check" color={colors.brand.success} size={28} />
        </View>
        <AppText role="title" weight="semibold" style={styles.centerText}>
          Результат готов
        </AppText>
        <AppText
          role="label"
          color={colors.text.secondary}
          style={styles.centerText}
        >
          Проверьте, правильно ли приложение определило линии.
        </AppText>
      </View>

      <ResultPreview />

      <View style={styles.interpretationCard}>
        <View style={styles.interpretationHeader}>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              Интерпретация
            </AppText>
            <AppText role="heading" weight="semibold">
              Положительный
            </AppText>
          </View>
          <View style={styles.confidenceBadge}>
            <AppText numeric role="label" color={colors.brand.success}>
              96%
            </AppText>
          </View>
        </View>
        <View style={styles.resultRule} />
        <View style={styles.resultMeta}>
          <View style={styles.resultMetaItem}>
            <AppText role="caption" color={colors.text.secondary}>
              Тип теста
            </AppText>
            <AppText role="label" weight="medium">
              Ovulation LH
            </AppText>
          </View>
          <View style={styles.resultMetaDivider} />
          <View style={styles.resultMetaItem}>
            <AppText role="caption" color={colors.text.secondary}>
              Партия
            </AppText>
            <AppText numeric role="label" weight="medium">
              A24-071
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.resultActions}>
        <PrimaryButton label="Подтвердить результат" onPress={onConfirm} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Исправить интерпретацию"
          onPress={onCorrection}
          style={({ pressed }) => [
            styles.resultSecondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <AppText role="label" weight="medium" color={colors.brand.primary}>
            Результат определён неверно
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const correctionOptions = [
  'Вижу две линии',
  'Вижу только контрольную линию',
] as const;

function CorrectionScreen({
  headerTop,
  onClose,
  onHelp,
  onRetake,
  onSubmit,
}: {
  headerTop: number;
  onClose: () => void;
  onHelp: () => void;
  onRetake: () => void;
  onSubmit: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <View style={styles.resultScreen}>
      <FlowHeader
        light={false}
        onClose={onClose}
        onHelp={onHelp}
        top={headerTop}
      />

      <View style={styles.correctionHeading}>
        <AppText role="title" weight="semibold">
          Что вы видите на тесте?
        </AppText>
        <AppText role="body" color={colors.text.secondary}>
          Выберите вариант или переснимите тест. Итог можно подтвердить
          после проверки фотографии.
        </AppText>
      </View>

      <ResultPreview />

      <View style={styles.correctionOptions}>
        {correctionOptions.map((option, index) => {
          const active = selected === index;

          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => setSelected(index)}
              style={({ pressed }) => [
                styles.correctionOption,
                active && styles.correctionOptionActive,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.radio,
                  active && styles.radioActive,
                ]}
              >
                {active ? <View style={styles.radioDot} /> : null}
              </View>
              <AppText role="label" weight="medium">
                {option}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.correctionActions}>
        <PrimaryButton
          label="Сохранить интерпретацию"
          disabled={selected === null}
          onPress={onSubmit}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Переснять тест"
          onPress={onRetake}
          style={({ pressed }) => [
            styles.resultSecondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <AppText role="label" weight="medium" color={colors.brand.primary}>
            Переснять тест
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

export function ScanFlowOverlay({
  headerTop,
  visible,
  showBriefing,
  onBriefingSeen,
  onClose,
  onComplete,
}: ScanFlowOverlayProps) {
  const [stage, setStage] = useState<ScanFlowStage>(
    showBriefing ? 'briefing' : 'qr',
  );
  const [returnStage, setReturnStage] =
    useState<Exclude<ScanFlowStage, 'briefing'> | null>(null);
  const transition = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setReturnStage(null);
      setStage(showBriefing ? 'briefing' : 'qr');
    }
  }, [showBriefing, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    transition.setValue(0);
    const animation = Animated.timing(transition, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [stage, transition, visible]);

  useEffect(() => {
    if (!visible || stage !== 'processing') {
      return;
    }

    const timer = setTimeout(() => setStage('result'), 2100);
    return () => clearTimeout(timer);
  }, [stage, visible]);

  if (!visible) {
    return null;
  }

  const openBriefing = (
    currentStage: Exclude<ScanFlowStage, 'briefing' | 'processing'>,
  ) => {
    setReturnStage(currentStage);
    setStage('briefing');
  };
  const requestClose = () => {
    Alert.alert(
      'Завершить сканирование?',
      'Текущий прогресс сканирования не будет сохранён.',
      [
        {
          text: 'Продолжить сканирование',
          style: 'cancel',
        },
        {
          text: 'Завершить',
          style: 'destructive',
          onPress: onClose,
        },
      ],
    );
  };

  const content =
    stage === 'briefing' ? (
      <BriefingScreen
        headerTop={headerTop}
        hideClose={returnStage !== null}
        onClose={requestClose}
        onContinue={() => {
          if (returnStage) {
            const nextStage = returnStage;
            setReturnStage(null);
            setStage(nextStage);
          } else {
            onBriefingSeen();
            setStage('qr');
          }
        }}
      />
    ) : stage === 'qr' ? (
      <QrScannerScreen
        headerTop={headerTop}
        onClose={requestClose}
        onHelp={() => openBriefing('qr')}
        onScanned={() => setStage('test')}
      />
    ) : stage === 'test' ? (
      <TestScannerScreen
        headerTop={headerTop}
        onClose={requestClose}
        onHelp={() => openBriefing('test')}
        onCapture={onComplete}
      />
    ) : stage === 'processing' ? (
      <ProcessingScreen />
    ) : stage === 'correction' ? (
      <CorrectionScreen
        headerTop={headerTop}
        onClose={requestClose}
        onHelp={() => openBriefing('correction')}
        onRetake={() => setStage('test')}
        onSubmit={() => setStage('test')}
      />
    ) : (
      <ResultScreen
        headerTop={headerTop}
        onClose={requestClose}
        onConfirm={() => setStage('test')}
        onCorrection={() => setStage('correction')}
        onHelp={() => openBriefing('result')}
      />
    );

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          transform: [
            {
              translateY: transition.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        },
      ]}
    >
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    overflow: 'hidden',
    borderRadius: 40,
    backgroundColor: '#FFF8F5',
  },
  pressed: {
    opacity: motion.pressedOpacity,
    transform: [{ scale: 0.985 }],
  },
  flowGlassPressed: {
    transform: [{ scale: 1.035 }],
  },
  flowHeader: {
    position: 'absolute',
    zIndex: 6,
    left: 16,
    right: 16,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'visible',
  },
  flowGlassPressTarget: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 48,
    height: 48,
  },
  stepPill: {
    width: 156,
    height: 48,
    borderRadius: 24,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: '#170C11',
  },
  cameraReadabilityScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  cameraPermissionState: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  cameraPermissionCopy: {
    maxWidth: 290,
    lineHeight: 20,
    textAlign: 'center',
  },
  cameraPermissionAction: {
    width: 240,
    marginTop: 8,
  },
  cameraTitle: {
    position: 'absolute',
    left: 32,
    right: 32,
    alignItems: 'center',
    gap: 5,
  },
  centerText: {
    textAlign: 'center',
  },
  qrTarget: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFlowFrame: {
    ...StyleSheet.absoluteFill,
  },
  qrArtwork: {
    width: 144,
    height: 144,
    overflow: 'hidden',
    opacity: 0.5,
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  cameraBottomGroup: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 86,
    alignItems: 'center',
    gap: 18,
  },
  cameraTooltipSlot: {
    width: 370,
    alignSelf: 'center',
    alignItems: 'center',
  },
  secondaryCameraAction: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchChip: {
    position: 'absolute',
    zIndex: 4,
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 20,
  },
  batchChipContent: {
    ...StyleSheet.absoluteFill,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  batchStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.success,
  },
  batchCopy: {
    flex: 1,
    gap: 1,
  },
  testTarget: {
    position: 'absolute',
    left: 36,
    width: 330,
    height: 330,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testStripImage: {
    width: 308,
    height: 30,
    opacity: 0.5,
  },
  cameraPrimaryAction: {
    width: 260,
  },
  briefingScreen: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  briefingHero: {
    position: 'absolute',
    top: 132,
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 9,
  },
  briefingIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(211,20,113,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefingSubtitle: {
    width: 338,
    lineHeight: 20,
    textAlign: 'center',
  },
  briefingList: {
    position: 'absolute',
    top: 348,
    left: 16,
    right: 16,
    gap: 12,
  },
  briefingRow: {
    minHeight: 92,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadows.card,
  },
  briefingRowIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FDECE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefingRowCopy: {
    flex: 1,
    paddingRight: 4,
    gap: 5,
  },
  briefingRowNumber: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomAction: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 108,
  },
  processingScreen: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  processingContent: {
    position: 'absolute',
    left: 30,
    right: 30,
    top: 230,
    alignItems: 'center',
  },
  processingIndicator: {
    width: 92,
    height: 92,
    marginBottom: 28,
    borderRadius: 46,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  processingDescription: {
    maxWidth: 315,
    marginTop: 10,
    textAlign: 'center',
  },
  processingSteps: {
    width: 290,
    marginTop: 34,
    gap: 14,
  },
  processingStepDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  processingStepActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  processingDot: {
    width: 10,
    height: 10,
    marginHorizontal: 4,
    borderRadius: 5,
    backgroundColor: colors.brand.primary,
  },
  resultScreen: {
    flex: 1,
    backgroundColor: '#FFF8F5',
  },
  resultHeading: {
    position: 'absolute',
    top: 126,
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 7,
  },
  resultSuccessIcon: {
    width: 48,
    height: 48,
    marginBottom: 3,
    borderRadius: 24,
    backgroundColor: 'rgba(31,187,116,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPreview: {
    position: 'absolute',
    left: 16,
    top: 246,
    width: 370,
    height: 180,
    overflow: 'hidden',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultStrip: {
    width: 292,
    height: 70,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ rotate: '-3deg' }],
    ...shadows.card,
  },
  resultStripTip: {
    width: 82,
    alignSelf: 'stretch',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    backgroundColor: '#F7B2C8',
  },
  resultWindow: {
    width: 108,
    height: 42,
    marginLeft: 24,
    borderRadius: 13,
    backgroundColor: '#FFF3F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  resultLineStrong: {
    width: 4,
    height: 29,
    borderRadius: 2,
    backgroundColor: colors.brand.primary,
  },
  resultLineSoft: {
    width: 4,
    height: 29,
    borderRadius: 2,
    backgroundColor: 'rgba(211,20,113,0.56)',
  },
  resultControlLabel: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: -17,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detectedBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  interpretationCard: {
    position: 'absolute',
    left: 16,
    top: 442,
    width: 370,
    minHeight: 126,
    padding: 18,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  interpretationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  confidenceBadge: {
    minWidth: 58,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(31,187,116,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultRule: {
    height: 1,
    marginVertical: 13,
    backgroundColor: colors.surface.divider,
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  resultMetaItem: {
    flex: 1,
    gap: 3,
  },
  resultMetaDivider: {
    width: 1,
    backgroundColor: colors.surface.divider,
  },
  resultActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 94,
    gap: 10,
  },
  resultSecondaryButton: {
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(211,20,113,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctionHeading: {
    position: 'absolute',
    top: 132,
    left: 20,
    right: 20,
    gap: 8,
  },
  correctionOptions: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 444,
    gap: 9,
  },
  correctionOption: {
    minHeight: 54,
    paddingHorizontal: 15,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(33,33,35,0.08)',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  correctionOptionActive: {
    borderColor: colors.brand.primary,
    backgroundColor: 'rgba(211,20,113,0.06)',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.state.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.brand.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand.primary,
  },
  correctionActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 94,
    gap: 10,
  },
});
