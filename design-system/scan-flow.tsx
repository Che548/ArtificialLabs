import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { deleteAsync } from 'expo-file-system/legacy';
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  PanResponder,
  StyleSheet,
  TextInput,
  type StyleProp,
  type GestureResponderEvent,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import {
  AppText,
  InstructionCard,
  LiquidGlassSurface,
  PrimaryButton,
  ScanTooltip,
  type ScanTooltipKind,
} from './components';
import {
  androidShadows,
  colors,
  motion,
  radii,
  shadows,
  spacing,
} from './tokens';
import ScanFlowFrame from '../assets/figma/scan-screen/scan-flow-frame.svg';
import type { AnalysisResult } from '../modules/strip-cv';
import {
  deriveDetectedInterpretation,
  getAnalysisDecision,
  getScanOverlayGeometry,
  getAnalysisConfidence,
  scanningService,
  type ActiveCvConfiguration,
  type PendingScanRecord,
  type StoredScanRecord,
} from '../services/scanning';
import type {
  OverlayPoint,
  ScanOverlayGeometry,
} from '../services/scanning/scan-overlay-geometry';

const hasNativeFlowGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

const briefingInstructions = [
  'Соберите мочу в чистую сухую емкость.',
  'Вскройте фольгированную упаковку и достаньте тест-полоску.',
  'Опустите тест-полоску в мочу до отметки ”MAX” на 3–5 секунд.',
  'Достаньте тест-полоску и положите её на ровную сухую поверхность.',
  'Спустя 3-7 минут отсканируйте результат в приложении.',
];

const briefingIllustrations = [
  require('../assets/instructions/step_1_cup.png'),
  require('../assets/instructions/step_2_package.png'),
  require('../assets/instructions/step_3_dip_test.png'),
  require('../assets/instructions/step_4_test_strip.png'),
  require('../assets/instructions/step_5_results.png'),
];

type NativeCameraControls = {
  focusAt?: (point: { x: number; y: number }) => Promise<void>;
  setExposureCompensation?: (value: number) => Promise<void>;
};

type CameraViewWithNativeControls = CameraView & {
  _cameraRef?: {
    current?: NativeCameraControls | null;
  };
};

type CameraPoint = {
  x: number;
  y: number;
};

function getNativeCameraControls(
  camera: CameraView | null,
): NativeCameraControls | null {
  return (
    (camera as CameraViewWithNativeControls | null)?._cameraRef?.current ?? null
  );
}

type ScanFlowStage =
  'briefing' | 'qr' | 'test' | 'processing' | 'result' | 'correction';

type PageTransitionIntent = 'forward' | 'back' | 'fade' | 'result' | 'modal';

type ScanFlowOverlayProps = {
  headerTop: number;
  initialImageUri?: string | null;
  visible: boolean;
  showBriefing: boolean;
  onBriefingSeen: () => void;
  onClose: () => void;
  onComplete: (record: PendingScanRecord) => void | Promise<void>;
};

type FlowIconName =
  | 'back'
  | 'close'
  | 'help'
  | 'qr'
  | 'test'
  | 'light'
  | 'surface'
  | 'steady'
  | 'check'
  | 'error';

function FlowIcon({
  name,
  color = colors.text.primary,
  size = 22,
}: {
  name: FlowIconName;
  color?: string;
  size?: number;
}) {
  if (name === 'back') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="m14.5 6-6 6 6 6"
          fill="none"
          stroke={color}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

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

  if (name === 'error') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="10" fill={color} />
        <Path
          d="m8.4 8.4 7.2 7.2m0-7.2-7.2 7.2"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
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
  iconColor,
  onPress,
}: {
  accessibilityLabel: string;
  darkContent?: boolean;
  icon: FlowIconName;
  iconColor?: string;
  onPress: () => void;
}) {
  const iconElement = (
    <FlowIcon
      name={icon}
      color={iconColor ?? (darkContent ? colors.text.primary : '#ffffff')}
    />
  );

  if (hasNativeFlowGlass) {
    return (
      <GlassView
        glassEffectStyle="clear"
        colorScheme="auto"
        isInteractive
        style={[styles.roundButton, shadows.control]}
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
        Platform.OS === 'android' ? androidShadows.control : shadows.control,
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
        androidTone={darkContent ? 'light' : 'dark'}
      >
        {iconElement}
      </LiquidGlassSurface>
    </Pressable>
  );
}

function FlowGlassGroup({
  children,
  spacing,
  style,
}: PropsWithChildren<{
  spacing: number;
  style: StyleProp<ViewStyle>;
}>) {
  return hasNativeFlowGlass ? (
    <GlassContainer spacing={spacing} style={style}>
      {children}
    </GlassContainer>
  ) : (
    <View style={style}>{children}</View>
  );
}

function FlowHeader({
  currentStep,
  emphasizeCurrentStep = false,
  leadingIcon = 'close',
  light = true,
  onClose,
  onHelp,
  showClose = true,
  showHelp = true,
  top,
}: {
  currentStep?: string;
  emphasizeCurrentStep?: boolean;
  leadingIcon?: 'back' | 'close';
  light?: boolean;
  onClose: () => void;
  onHelp: () => void;
  showClose?: boolean;
  showHelp?: boolean;
  top: number;
}) {
  const color = light ? '#ffffff' : colors.text.primary;
  const stepLabel = currentStep ? (
    <AppText
      numeric={emphasizeCurrentStep}
      role={emphasizeCurrentStep ? 'body' : 'label'}
      weight={emphasizeCurrentStep ? 'semibold' : 'medium'}
      color={emphasizeCurrentStep ? colors.brand.primary : color}
      style={emphasizeCurrentStep ? styles.briefingProgressText : undefined}
    >
      {currentStep}
    </AppText>
  ) : null;

  return (
    <FlowGlassGroup spacing={12} style={[styles.flowHeader, { top }]}>
      {showClose ? (
        <RoundGlassButton
          accessibilityLabel={
            leadingIcon === 'back'
              ? 'Вернуться к истории'
              : 'Закрыть сканирование'
          }
          darkContent={!light}
          icon={leadingIcon}
          iconColor={leadingIcon === 'back' ? colors.brand.primary : undefined}
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
            style={[styles.stepPill, shadows.control]}
          >
            {stepLabel}
          </GlassView>
        ) : (
          <View style={[styles.stepPill, shadows.control]}>
            <LiquidGlassSurface
              variant="clear"
              colorScheme="auto"
              fallbackTint="default"
              washColor="transparent"
              intensity={72}
              showFallbackDecoration={false}
              androidTone={light ? 'dark' : 'light'}
            >
              {stepLabel}
            </LiquidGlassSurface>
          </View>
        )
      ) : (
        <View />
      )}

      {showHelp ? (
        <RoundGlassButton
          accessibilityLabel="Открыть инструктаж"
          darkContent={!light}
          icon="help"
          onPress={onHelp}
        />
      ) : (
        <View style={styles.headerSpacer} />
      )}
    </FlowGlassGroup>
  );
}

function CameraBackdrop({
  cameraRef,
  onBarcodeScanned,
  onCameraReady,
  autofocus = 'off',
  onCameraLayout,
  onFocusTap,
}: {
  cameraRef?: RefObject<CameraView | null>;
  onBarcodeScanned?: (result: BarcodeScanningResult) => void;
  onCameraReady?: () => void;
  autofocus?: 'on' | 'off';
  onCameraLayout?: (layout: { width: number; height: number }) => void;
  onFocusTap?: (event: GestureResponderEvent) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const requestedPermission = useRef(false);

  useEffect(() => {
    // Browsers require camera permission requests to happen from a user gesture.
    // Keep the explicit button visible on web instead of opening a browser-level
    // permission sheet from an effect, which can leave the sheet non-interactive
    // on mobile Safari/Chrome.
    if (Platform.OS === 'web') {
      return;
    }

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
    <View
      onLayout={(event) => {
        onCameraLayout?.({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        });
      }}
      style={StyleSheet.absoluteFillObject}
    >
      {granted ? (
        <>
          <CameraView
            ref={cameraRef}
            barcodeScannerSettings={
              onBarcodeScanned ? { barcodeTypes: ['qr'] } : undefined
            }
            facing="back"
            mode="picture"
            autofocus={autofocus}
            onBarcodeScanned={onBarcodeScanned}
            onCameraReady={onCameraReady}
            onTouchEnd={onFocusTap}
            style={StyleSheet.absoluteFillObject}
          />
        </>
      ) : (
        <LinearGradient
          colors={['#251119', '#4A2433', '#170C11']}
          locations={[0, 0.52, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.94, y: 1 }}
          style={StyleSheet.absoluteFillObject}
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
      <View pointerEvents="none" style={styles.cameraReadabilityScrim} />
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
  const [activeStep, setActiveStep] = useState(0);
  const [stepTransitioning, setStepTransitioning] = useState(false);
  const stepProgress = useRef(new Animated.Value(1)).current;
  const stepDirection = useRef(1);
  const isFirstStep = activeStep === 0;
  const isLastStep = activeStep === briefingInstructions.length - 1;

  const moveToStep = (nextStep: number, direction: 1 | -1) => {
    if (stepTransitioning) return;

    stepDirection.current = direction;
    setStepTransitioning(true);
    Animated.timing(stepProgress, {
      toValue: 0,
      duration: 130,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        setStepTransitioning(false);
        return;
      }

      setActiveStep(nextStep);
      stepProgress.setValue(0);
      Animated.timing(stepProgress, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setStepTransitioning(false));
    });
  };

  const goBack = () => {
    if (!isFirstStep) moveToStep(activeStep - 1, -1);
  };

  const goNext = () => {
    if (stepTransitioning) return;
    if (isLastStep) {
      onContinue();
      return;
    }
    moveToStep(activeStep + 1, 1);
  };

  return (
    <View style={styles.briefingScreen}>
      <FlowHeader
        currentStep={`${activeStep + 1}/${briefingInstructions.length}`}
        emphasizeCurrentStep
        light={false}
        onClose={onClose}
        onHelp={() => undefined}
        showClose={!hideClose}
        showHelp={false}
        top={headerTop}
      />

      <View style={[styles.briefingContent, { paddingTop: headerTop + 64 }]}>
        <View style={styles.briefingHero}>
          <AppText role="title" weight="semibold" style={styles.centerText}>
            Перед сканированием
          </AppText>
          <AppText
            role="body"
            color={colors.text.secondary}
            style={styles.briefingSubtitle}
          >
            Выполните пять шагов перед сканированием тест-полоски.
          </AppText>
        </View>

        <Animated.View
          style={[
            styles.briefingStepStage,
            {
              opacity: stepProgress,
              transform: [
                {
                  translateX: stepProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12 * stepDirection.current, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <InstructionCard
            height={150}
            illustration={briefingIllustrations[activeStep]}
            step={activeStep + 1}
            text={briefingInstructions[activeStep]}
            total={briefingInstructions.length}
            variant="illustrated"
          />
        </Animated.View>

        <View style={styles.briefingActions}>
          <View
            style={[
              styles.briefingSecondaryAction,
              isFirstStep && styles.briefingSecondaryActionDisabled,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад"
              accessibilityState={{ disabled: isFirstStep }}
              disabled={isFirstStep || stepTransitioning}
              onPress={goBack}
              style={({ pressed }) => [
                styles.briefingActionPressTarget,
                pressed && styles.briefingActionPressed,
              ]}
            >
              <AppText role="label" weight="medium">
                ‹ Назад
              </AppText>
            </Pressable>
          </View>

          <View
            style={[
              styles.briefingPrimaryAction,
              stepTransitioning && styles.briefingPrimaryActionDisabled,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isLastStep ? 'Продолжить' : 'Далее'}
              accessibilityState={{ disabled: stepTransitioning }}
              disabled={stepTransitioning}
              onPress={goNext}
              style={({ pressed }) => [
                styles.briefingActionPressTarget,
                pressed && styles.briefingActionPressed,
              ]}
            >
              <AppText role="label" weight="medium" color={colors.text.inverse}>
                {isLastStep ? 'Продолжить  ›' : 'Далее  ›'}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function QrScannerScreen({
  headerTop,
  onClose,
  onHelp,
  onManualCode,
  onScanned,
}: {
  headerTop: number;
  onClose: () => void;
  onHelp: () => void;
  onManualCode: (data: string) => string | null;
  onScanned: (data?: string) => void;
}) {
  const scanned = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detected, setDetected] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualCodeError, setManualCodeError] = useState<string | null>(null);
  const [manualCodeVisible, setManualCodeVisible] = useState(false);
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const frameLeft = useRef(new Animated.Value(71)).current;
  const frameTop = useRef(new Animated.Value(headerTop + 203)).current;
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

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
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
          Math.max(Math.max(detectedWidth, detectedHeight) + padding * 2, 112),
          screenWidth - 32,
        )
      : 260;
    const targetLeft = hasUsableBounds
      ? Math.min(
          Math.max(originX + detectedWidth / 2 - targetSize / 2, 16),
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
      completionTimer.current = setTimeout(() => onScanned(result.data), 360);
    });
  };

  const closeManualCode = () => {
    Keyboard.dismiss();
    setManualCodeError(null);
    setManualCodeVisible(false);
  };

  const submitManualCode = () => {
    const normalizedCode = manualCode.trim();

    if (!normalizedCode) {
      setManualCodeError('Введите код с упаковки теста.');
      return;
    }

    const error = onManualCode(normalizedCode);
    if (error) {
      setManualCodeError(error);
      return;
    }

    setManualCode('');
    closeManualCode();
  };

  return (
    <View style={styles.cameraScreen}>
      <CameraBackdrop onBarcodeScanned={handleBarcodeScanned} />
      <FlowHeader
        currentStep="Шаг 1 из 2"
        onClose={onClose}
        onHelp={onHelp}
        top={headerTop}
      />

      <View style={[styles.cameraTitle, { top: headerTop + 84 }]}>
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
              source={require('../assets/figma/scan-screen/scan_flow_qr_final.png')}
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
            message={detected ? 'QR-код найден' : 'Наведите камеру на QR-код'}
            singleLine
            variant="floating"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ввести код вручную"
          accessibilityState={{ disabled: detected }}
          disabled={detected}
          onPress={() => {
            setManualCodeError(null);
            setManualCodeVisible(true);
          }}
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

      <Modal
        animationType="fade"
        onRequestClose={closeManualCode}
        statusBarTranslucent
        transparent
        visible={manualCodeVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.manualCodeModalRoot}
        >
          <Pressable
            accessibilityLabel="Закрыть ввод кода"
            onPress={closeManualCode}
            style={StyleSheet.absoluteFillObject}
          >
            <View style={styles.manualCodeBackdrop} />
          </Pressable>

          <View style={styles.manualCodeCard}>
            <View style={styles.manualCodeHeader}>
              <AppText role="heading" weight="semibold">
                Введите код
              </AppText>
              <AppText
                role="label"
                color={colors.text.secondary}
                style={styles.manualCodeSubtitle}
              >
                Код указан рядом с QR-кодом на упаковке теста.
              </AppText>
            </View>

            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              accessibilityLabel="Код с упаковки теста"
              onChangeText={(value) => {
                setManualCode(value);
                if (manualCodeError) {
                  setManualCodeError(null);
                }
              }}
              onSubmitEditing={submitManualCode}
              placeholder="Код с упаковки"
              placeholderTextColor="rgba(115,110,108,0.48)"
              returnKeyType="done"
              selectionColor={colors.brand.primary}
              style={styles.manualCodeInput}
              value={manualCode}
            />

            {manualCodeError ? (
              <AppText
                role="caption"
                color={colors.brand.primary}
                style={styles.manualCodeError}
              >
                {manualCodeError}
              </AppText>
            ) : null}

            <View style={styles.manualCodeActions}>
              <View style={styles.manualCodeActionSlot}>
                <View style={styles.manualCodeCancelButton}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Отменить ввод кода"
                    onPress={closeManualCode}
                  >
                    {({ pressed }) => (
                      <View
                        style={[
                          styles.manualCodeCancelContent,
                          pressed && styles.pressed,
                        ]}
                      >
                        <AppText
                          role="label"
                          weight="medium"
                          color={colors.brand.primary}
                        >
                          Отмена
                        </AppText>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
              <View style={styles.manualCodeActionSlot}>
                <PrimaryButton label="Продолжить" onPress={submitManualCode} />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

type CvLiveHint = {
  kind: ScanTooltipKind;
  text: string;
  tone: 'neutral' | 'warning' | 'success';
};

const initialCvHint: CvLiveHint = {
  kind: 'test',
  text: 'Наведите камеру на тест',
  tone: 'neutral',
};

const cvReasonHints: Record<string, CvLiveHint> = {
  unsupported_or_too_small_image: {
    kind: 'test',
    text: 'Разместите весь тест внутри рамки',
    tone: 'warning',
  },
  geometry_unreliable: {
    kind: 'test',
    text: 'Разместите тест целиком внутри рамки',
    tone: 'warning',
  },
  geometry_edge_support_insufficient: {
    kind: 'test',
    text: 'Края теста не видны — измените положение',
    tone: 'warning',
  },
  degenerate_projective_geometry: {
    kind: 'test',
    text: 'Держите камеру параллельно тесту',
    tone: 'warning',
  },
  retake_more_overhead: {
    kind: 'test',
    text: 'Снимайте тест строго сверху',
    tone: 'warning',
  },
  check_detected_corners: {
    kind: 'test',
    text: 'Совместите края теста с рамкой',
    tone: 'warning',
  },
  strip_endpoints_out_of_frame: {
    kind: 'test',
    text: 'Покажите тест в кадре целиком',
    tone: 'warning',
  },
  strip_resolution_too_low: {
    kind: 'test',
    text: 'Приблизьте камеру к тесту',
    tone: 'warning',
  },
  move_closer: {
    kind: 'test',
    text: 'Приблизьте камеру к тесту',
    tone: 'warning',
  },
  image_too_blurry: {
    kind: 'test',
    text: 'Изображение размыто — зафиксируйте камеру',
    tone: 'warning',
  },
  hold_camera_steady: {
    kind: 'test',
    text: 'Зафиксируйте камеру',
    tone: 'warning',
  },
  exposure_clipping: {
    kind: 'lowLight',
    text: 'Слишком ярко — уберите прямой свет',
    tone: 'warning',
  },
  adjust_exposure: {
    kind: 'lowLight',
    text: 'Измените освещение теста',
    tone: 'warning',
  },
  glare_crosses_control_line: {
    kind: 'lowLight',
    text: 'Блик перекрывает контрольную зону',
    tone: 'warning',
  },
  reduce_glare: {
    kind: 'lowLight',
    text: 'Уберите блики с поверхности теста',
    tone: 'warning',
  },
  broad_shadow_or_illumination_gradient: {
    kind: 'background',
    text: 'Сделайте освещение равномерным',
    tone: 'warning',
  },
  broad_stain_or_smeared_line: {
    kind: 'background',
    text: 'Зона результата размыта или загрязнена',
    tone: 'warning',
  },
  insufficient_valid_membrane_pixels: {
    kind: 'background',
    text: 'Положите тест на однородный светлый фон',
    tone: 'warning',
  },
  control_not_detected: {
    kind: 'test',
    text: 'Контрольная линия пока не распознана',
    tone: 'warning',
  },
  control_denominator_too_small: {
    kind: 'test',
    text: 'Контрольная линия слишком слабая',
    tone: 'warning',
  },
  ambiguous_extra_line_peak: {
    kind: 'test',
    text: 'В зоне результата видны лишние отметки',
    tone: 'warning',
  },
  color_calibration_validation_failed: {
    kind: 'background',
    text: 'Цвет снимка искажён — измените освещение',
    tone: 'warning',
  },
};

function getCvLiveHint(
  result: AnalysisResult,
  validStreak: number,
): CvLiveHint {
  if (getAnalysisDecision(result) === 'reportable' && validStreak >= 2) {
    return {
      kind: 'locked',
      text: 'Условия подходят — не двигайте камеру',
      tone: 'success',
    };
  }

  const reasonHint = result.reason_codes
    .map((code) => cvReasonHints[code])
    .find((hint) => hint !== undefined);

  return (
    reasonHint ?? {
      kind: 'test',
      text:
        result.status === 'valid'
          ? 'Проверяем стабильность кадра'
          : 'Совместите тест с рамкой',
      tone: result.status === 'valid' ? 'neutral' : 'warning',
    }
  );
}

function BatchChip({
  configuration,
  top,
}: {
  configuration: ActiveCvConfiguration;
  top: number;
}) {
  const content = (
    <View style={styles.batchChipContent}>
      <View style={styles.batchStatus} />
      <View style={styles.batchCopy}>
        <AppText role="caption" color="rgba(255,255,255,0.66)">
          Тест определён
        </AppText>
        <AppText role="label" weight="medium" color="#ffffff">
          {configuration.product.label} · {configuration.product.batch}
        </AppText>
      </View>
      <AppText numeric role="caption" color="#ffffff">
        {configuration.product.expiresAt}
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
        androidTone="dark"
      >
        {content}
      </LiquidGlassSurface>
    </View>
  );
}

function TestScannerScreen({
  configuration,
  headerTop,
  useLegacyPipeline,
  onCapture,
  onClose,
  onHelp,
}: {
  configuration: ActiveCvConfiguration;
  headerTop: number;
  useLegacyPipeline: boolean;
  onCapture: (imageUri: string) => void;
  onClose: () => void;
  onHelp: () => void;
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [currentHint, setCurrentHint] = useState<CvLiveHint>(initialCvHint);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [focusMode, setFocusMode] = useState<'on' | 'off'>('off');
  const [focusPoint, setFocusPoint] = useState<CameraPoint | null>(null);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [exposureCompensation, setExposureCompensation] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const previewBusy = useRef(false);
  const validStreak = useRef(0);
  const focusResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exposureControlHeight = 204;
  const exposureRailHeight = 120;
  const exposureTrackTop = 24;
  const exposureTrackHeight = exposureRailHeight - exposureTrackTop;
  const exposureThumbSize = 22;
  const exposureTrackTravel = exposureTrackHeight - exposureThumbSize;
  const exposureValue = useRef(0);

  useEffect(
    () => () => {
      if (focusResetTimer.current) {
        clearTimeout(focusResetTimer.current);
      }
    },
    [],
  );

  const focusAt = (locationX: number, locationY: number) => {
    setFocusPoint({ x: locationX, y: locationY });

    const cameraWidth = cameraLayout.width || Math.max(1, windowWidth);
    const cameraHeight = cameraLayout.height || Math.max(1, windowHeight);
    const nativeControls = getNativeCameraControls(cameraRef.current);
    const focusPromise = nativeControls?.focusAt?.({
      x: Math.max(0, Math.min(1, locationX / cameraWidth)),
      y: Math.max(0, Math.min(1, locationY / cameraHeight)),
    });
    void focusPromise?.catch(() => undefined);

    // Keep the stock autofocus prop as a fallback for devices that do not
    // support focus-point metering.
    setFocusMode('off');
    requestAnimationFrame(() => setFocusMode('on'));

    if (focusResetTimer.current) {
      clearTimeout(focusResetTimer.current);
    }
    focusResetTimer.current = setTimeout(() => {
      setFocusMode('off');
      setFocusPoint(null);
      focusResetTimer.current = null;
    }, 900);
  };

  const handleFocusTap = (event: GestureResponderEvent) => {
    focusAt(event.nativeEvent.locationX, event.nativeEvent.locationY);
  };

  const handleFocusSurfaceTap = (event: GestureResponderEvent) => {
    focusAt(
      event.nativeEvent.locationX,
      event.nativeEvent.locationY + headerTop + 120,
    );
  };

  const setExposureValue = (value: number) => {
    const nextValue = Math.max(-1, Math.min(1, value));
    exposureValue.current = nextValue;
    setExposureCompensation(nextValue);
    const exposurePromise = getNativeCameraControls(
      cameraRef.current,
    )?.setExposureCompensation?.(nextValue);
    void exposurePromise?.catch(() => undefined);
  };

  const updateExposureFromRail = (locationY: number) => {
    const trackY = Math.max(
      0,
      Math.min(exposureTrackTravel, locationY - exposureTrackTop),
    );
    setExposureValue(1 - (trackY / exposureTrackTravel) * 2);
  };

  const adjustExposure = (delta: number) => {
    setExposureValue(exposureValue.current + delta);
  };

  const exposureResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) =>
        updateExposureFromRail(event.nativeEvent.locationY),
      onPanResponderMove: (event) =>
        updateExposureFromRail(event.nativeEvent.locationY),
    }),
  ).current;

  useEffect(() => {
    if (!cameraReady || capturing) {
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextCheck = (delay = 900) => {
      if (active) {
        timer = setTimeout(() => {
          void inspectCurrentFrame();
        }, delay);
      }
    };

    const inspectCurrentFrame = async () => {
      if (!active || previewBusy.current) {
        scheduleNextCheck();
        return;
      }

      previewBusy.current = true;
      let previewUri: string | null = null;

      try {
        const photo = await cameraRef.current?.takePictureAsync({
          quality: 0.3,
          skipProcessing: true,
          base64: false,
          exif: false,
          shutterSound: false,
        });
        previewUri = photo?.uri ?? null;
        if (!previewUri || !active) {
          return;
        }

        const result = await scanningService.analyze(previewUri, {
          useLegacyPipeline,
          includeRectifiedImage: false,
        });
        if (!active) {
          return;
        }

        validStreak.current =
          getAnalysisDecision(result) === 'reportable'
            ? validStreak.current + 1
            : 0;
        const nextHint = getCvLiveHint(result, validStreak.current);
        setCurrentHint(nextHint);
      } catch {
        if (active) {
          validStreak.current = 0;
          setCurrentHint(initialCvHint);
        }
      } finally {
        if (previewUri) {
          void deleteAsync(previewUri, { idempotent: true }).catch(
            () => undefined,
          );
        }
        previewBusy.current = false;
        scheduleNextCheck();
      }
    };

    scheduleNextCheck(500);
    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [cameraReady, capturing, configuration, useLegacyPipeline]);

  const handleCapture = async () => {
    if (!cameraReady || capturing || previewBusy.current) {
      return;
    }

    setCapturing(true);

    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 1,
        skipProcessing: false,
        base64: false,
        exif: true,
        shutterSound: false,
      });
      if (!photo?.uri) {
        throw new Error('Camera returned no local image URI.');
      }
      onCapture(photo.uri);
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
        autofocus={focusMode}
        cameraRef={cameraRef}
        onCameraReady={() => setCameraReady(true)}
        onCameraLayout={setCameraLayout}
        onFocusTap={handleFocusTap}
      />
      <FlowHeader
        currentStep="Шаг 2 из 2"
        onClose={onClose}
        onHelp={onHelp}
        top={headerTop}
      />
      <BatchChip configuration={configuration} top={headerTop + 64} />

      <View style={[styles.testTarget, { top: headerTop + 182 }]}>
        <ScanFlowFrame
          width="100%"
          height="100%"
          style={styles.scanFlowFrame}
        />

        <Image
          accessible={false}
          resizeMode="contain"
          source={require('../assets/figma/scan-screen/scan_test_strip.png')}
          style={styles.testStripImage}
        />
      </View>
      <Pressable
        accessibilityLabel="Фокус камеры"
        accessibilityRole="button"
        onPressIn={handleFocusSurfaceTap}
        style={[styles.cameraFocusSurface, { top: headerTop + 120 }]}
      />
      {focusPoint ? (
        <View
          pointerEvents="none"
          style={[
            styles.cameraFocusReticle,
            { left: focusPoint.x - 28, top: focusPoint.y - 28 },
          ]}
        />
      ) : null}
      <View
        accessibilityLabel="Экспозиция камеры"
        accessibilityRole="adjustable"
        style={[styles.exposureControl, { top: headerTop + 238 }]}
      >
        <Pressable
          accessibilityLabel="Увеличить экспозицию"
          accessibilityRole="button"
          onPress={() => adjustExposure(0.2)}
          style={styles.exposureButton}
        >
          <AppText color="#FFFFFF" role="label" weight="bold">
            +
          </AppText>
        </Pressable>
        <View
          {...exposureResponder.panHandlers}
          style={styles.exposureRailTouch}
        >
          <View pointerEvents="none" style={styles.exposureIcon}>
            <FlowIcon color="#FFFFFF" name="light" size={18} />
          </View>
          <View pointerEvents="none" style={styles.exposureTrack} />
          <View
            pointerEvents="none"
            style={[
              styles.exposureThumb,
              {
                top:
                  exposureTrackTop +
                  ((1 - exposureCompensation) / 2) * exposureTrackTravel,
              },
            ]}
          />
        </View>
        <Pressable
          accessibilityLabel="Уменьшить экспозицию"
          accessibilityRole="button"
          onPress={() => adjustExposure(-0.2)}
          style={[styles.exposureButton, styles.exposureButtonBottom]}
        >
          <AppText color="#FFFFFF" role="label" weight="bold">
            −
          </AppText>
        </Pressable>
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
                : !cameraReady
                  ? 'Подготавливаем камеру'
                  : useLegacyPipeline
                    ? 'Сканировать legacy-профиль'
                    : 'Сканировать тест'
            }
            disabled={!cameraReady || capturing}
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
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.processingContent}>
        <View style={styles.processingIndicator}>
          <ActivityIndicator size="large" color={colors.brand.primary} />
        </View>
        <AppText role="title" weight="semibold" style={styles.centerText}>
          Анализируем результат
        </AppText>
        <AppText
          role="body"
          color={colors.text.secondary}
          style={styles.processingDescription}
        >
          Проверяем качество снимка и определяем контрольную и тестовую линии.
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

function overlayPath(points: readonly OverlayPoint[] | null): string | null {
  if (!points || points.length < 2) {
    return null;
  }
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest
    .map((point) => `L ${point.x} ${point.y}`)
    .join(' ')} ${points.length > 2 ? 'Z' : ''}`;
}

function ScanResultOverlay({ geometry }: { geometry: ScanOverlayGeometry }) {
  const stripPath = overlayPath(geometry.strip);
  const tilePath = overlayPath(geometry.calibrationTile);
  const controlWindowPath = overlayPath(geometry.controlWindow);
  const testWindowPath = overlayPath(geometry.testWindow);
  const controlPeakPath = overlayPath(geometry.controlPeak);
  const testPeakPath = overlayPath(geometry.testPeak);

  if (
    !stripPath &&
    !tilePath &&
    !controlWindowPath &&
    !testWindowPath &&
    !controlPeakPath &&
    !testPeakPath
  ) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.scanResultOverlay}>
      <Svg height="100%" width="100%" style={StyleSheet.absoluteFillObject}>
        {stripPath ? (
          <Path
            d={stripPath}
            fill="rgba(40,220,120,0.08)"
            stroke="#28dc78"
            strokeWidth={3}
          />
        ) : null}
        {tilePath ? (
          <Path
            d={tilePath}
            fill="rgba(39,196,255,0.08)"
            stroke="#27c4ff"
            strokeDasharray="6 4"
            strokeWidth={2}
          />
        ) : null}
        {controlWindowPath ? (
          <Path
            d={controlWindowPath}
            fill="rgba(24,150,125,0.08)"
            stroke="#18967d"
            strokeDasharray="4 3"
            strokeWidth={2}
          />
        ) : null}
        {testWindowPath ? (
          <Path
            d={testWindowPath}
            fill="rgba(220,72,105,0.08)"
            stroke="#dc4869"
            strokeDasharray="4 3"
            strokeWidth={2}
          />
        ) : null}
        {controlPeakPath ? (
          <Path d={controlPeakPath} stroke="#18967d" strokeWidth={4} />
        ) : null}
        {testPeakPath ? (
          <Path d={testPeakPath} stroke="#dc4869" strokeWidth={4} />
        ) : null}
      </Svg>
      <View style={styles.scanResultOverlayLegend}>
        <View style={styles.scanResultOverlayLegendRow}>
          <View
            style={[
              styles.scanResultOverlaySwatch,
              styles.scanResultOverlayStripSwatch,
            ]}
          />
          <AppText role="caption" color="#ffffff">
            Полоска
          </AppText>
        </View>
        <View style={styles.scanResultOverlayLegendRow}>
          <View
            style={[
              styles.scanResultOverlaySwatch,
              styles.scanResultOverlayControlSwatch,
            ]}
          />
          <AppText role="caption" color="#ffffff">
            C
          </AppText>
        </View>
        <View style={styles.scanResultOverlayLegendRow}>
          <View
            style={[
              styles.scanResultOverlaySwatch,
              styles.scanResultOverlayTestSwatch,
            ]}
          />
          <AppText role="caption" color="#ffffff">
            T
          </AppText>
        </View>
      </View>
    </View>
  );
}

function ResultPreview({
  analysisResult,
  configuration,
  imageUri,
  savedResult,
  previewTop,
  showAnalysisOverlay = false,
}: {
  analysisResult?: AnalysisResult | null;
  configuration?: ActiveCvConfiguration;
  imageUri?: string | null;
  savedResult?: ScanResultData['result'];
  previewTop?: number;
  showAnalysisOverlay?: boolean;
}) {
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
  const usesAnalysis = analysisResult !== undefined;
  const controlDetected = usesAnalysis
    ? analysisResult?.peaks.control.detected === true
    : true;
  const testDetected = usesAnalysis
    ? analysisResult?.peaks.test.detected === true
    : savedResult !== 'Отрицательный';
  const needsRetake =
    usesAnalysis &&
    getAnalysisDecision(analysisResult ?? null) !== 'reportable';
  const detectionLabel = needsRetake
    ? !controlDetected
      ? 'Контрольная зона не распознана'
      : 'Результат нельзя подтвердить'
    : testDetected
      ? 'Обе зоны распознаны'
      : 'Распознана контрольная зона';
  const overlayGeometry =
    showAnalysisOverlay &&
    analysisResult &&
    configuration &&
    imageSize &&
    viewSize.width > 0 &&
    viewSize.height > 0
      ? getScanOverlayGeometry(
          analysisResult,
          configuration,
          imageSize,
          viewSize,
          'contain',
        )
      : null;

  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setViewSize({ width, height });
      }}
      style={[
        styles.resultPreview,
        previewTop !== undefined && { top: previewTop },
      ]}
    >
      {imageUri ? (
        <Image
          accessible
          accessibilityLabel="Снимок отсканированного теста"
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source;
            setImageSize({ width, height });
          }}
          resizeMode="contain"
          source={{ uri: imageUri }}
          style={styles.resultCapturedImage}
        />
      ) : (
        <View style={styles.resultImageUnavailable}>
          <AppText role="label" color={colors.text.secondary}>
            Снимок теста недоступен
          </AppText>
        </View>
      )}
      {overlayGeometry ? (
        <ScanResultOverlay geometry={overlayGeometry} />
      ) : null}
      {analysisResult?.rectified_image_uri ? (
        <View style={styles.rectifiedPreviewCard}>
          <AppText
            role="caption"
            color={colors.text.secondary}
            style={styles.rectifiedPreviewLabel}
          >
            После гомографии
          </AppText>
          <Image
            accessible
            accessibilityLabel="Извлечённая тест-полоска после гомографии"
            resizeMode="contain"
            source={{ uri: analysisResult.rectified_image_uri }}
            style={styles.rectifiedPreviewImage}
          />
        </View>
      ) : null}
      <View style={styles.detectedBadge}>
        <FlowIcon
          name={needsRetake ? 'error' : 'check'}
          color={needsRetake ? colors.state.error : colors.brand.success}
          size={18}
        />
        <AppText role="caption" weight="medium">
          {detectionLabel}
        </AppText>
      </View>
    </View>
  );
}

export type ScanResultData = Pick<
  StoredScanRecord,
  'batch' | 'confidence' | 'imageUri' | 'result' | 'type'
>;

const defaultScanResult: ScanResultData = {
  batch: 'A24-071',
  confidence: 96,
  imageUri: '',
  result: 'Положительный',
  type: 'Ovulation LH',
};

export function ScanResultScreen({
  fromHistory = false,
  configuration,
  useLegacyPipeline = false,
  headerTop,
  imageUri,
  error,
  result,
  onClose,
  onConfirm,
  onCorrection,
  onHelp,
  onRetake,
  isCompleting = false,
  hideReadyHeading = false,
  resultData,
}: {
  fromHistory?: boolean;
  configuration?: ActiveCvConfiguration;
  useLegacyPipeline?: boolean;
  headerTop: number;
  imageUri?: string | null;
  error?: string | null;
  result?: AnalysisResult | null;
  onClose: () => void;
  onConfirm: () => void;
  onCorrection: () => void;
  onHelp: () => void;
  onRetake?: () => void;
  isCompleting?: boolean;
  hideReadyHeading?: boolean;
  resultData?: ScanResultData;
}) {
  const usesSavedResult = fromHistory || resultData !== undefined;
  const savedResult = resultData ?? defaultScanResult;
  const analysisDecision = getAnalysisDecision(result ?? null, error);
  const reportableAnalysis = analysisDecision === 'reportable';
  const controlDetected =
    usesSavedResult || result?.peaks.control.detected === true;
  const canConfirm = usesSavedResult || reportableAnalysis;
  const needsRetake =
    !usesSavedResult && (!controlDetected || analysisDecision !== 'reportable');
  const heading = needsRetake
    ? 'Требуется переснять'
    : useLegacyPipeline
      ? 'Тестовый результат'
      : 'Результат готов';
  const interpretation =
    result?.signal.classification === 'POS'
      ? 'Положительный'
      : result?.signal.classification === 'NEG'
        ? 'Отрицательный'
        : result?.peaks.test.detected
          ? 'Положительный'
          : 'Отрицательный';
  const confidence = Math.round(100 * getAnalysisConfidence(result ?? null));
  // Corner alignment is live-camera guidance only. It must never become the
  // result-screen verdict; the centralized analysis decision above controls
  // reportable/review/retake state.
  const qualityMessage = result?.reason_codes
    // These messages guide the live camera only; neither must become the
    // explanation for a failed result screen.
    .filter(
      (code) =>
        code !== 'check_detected_corners' &&
        code !== 'move_closer' &&
        code !== 'strip_resolution_too_low',
    )
    .map((code) => cvReasonHints[code]?.text)
    .find((message) => message !== undefined);
  const issueExplanation =
    error ??
    qualityMessage ??
    (result?.status === 'valid'
      ? 'Результат распознан недостаточно уверенно. Сделайте новый снимок при хорошем освещении.'
      : result?.status === 'review'
        ? 'Качество снимка нельзя подтвердить. Сделайте новый снимок и переснимите тест.'
        : 'Не удалось уверенно распознать тест на снимке. Разместите его целиком в кадре и переснимите.');
  const displayedResult = usesSavedResult
    ? savedResult.result === 'Пик ЛГ'
      ? 'Положительный'
      : savedResult.result
    : interpretation;
  const previewConfiguration =
    useLegacyPipeline && !usesSavedResult
      ? scanningService.getConfiguration({ useLegacyPipeline: true })
      : configuration;
  const displayedConfidence = usesSavedResult
    ? savedResult.confidence
    : confidence;
  const displayedType = usesSavedResult
    ? savedResult.type
    : (previewConfiguration?.product.label ?? defaultScanResult.type);
  const displayedBatch = usesSavedResult
    ? savedResult.batch
    : (previewConfiguration?.product.batch ?? defaultScanResult.batch);
  const resultDescription = needsRetake
    ? issueExplanation
    : useLegacyPipeline
      ? 'Тестовый legacy-профиль: результат прошёл общие проверки.'
      : canConfirm
        ? 'Проверьте, правильно ли приложение определило линии.'
        : issueExplanation;
  const resultActionLabel = isCompleting
    ? 'Сохраняем результат…'
    : needsRetake
      ? 'Переснять тест'
      : canConfirm
        ? 'Подтвердить результат'
        : 'Переснять тест';
  const handleResultAction = () => {
    if (needsRetake) {
      onRetake?.();
    } else if (canConfirm) {
      onConfirm();
    } else {
      onRetake?.();
    }
  };

  return (
    <View style={styles.resultScreen}>
      <FlowHeader
        leadingIcon={fromHistory ? 'back' : 'close'}
        light={false}
        onClose={onClose}
        onHelp={onHelp}
        showHelp={!fromHistory}
        top={headerTop}
      />

      <View
        style={[
          styles.resultHeading,
          fromHistory && styles.historyResultHeading,
        ]}
      >
        {!hideReadyHeading ? (
          <>
            <View
              style={[
                styles.resultSuccessIcon,
                needsRetake && styles.resultErrorIcon,
              ]}
            >
              <FlowIcon
                name={needsRetake ? 'error' : 'check'}
                color={needsRetake ? colors.state.error : colors.brand.success}
                size={28}
              />
            </View>
            <AppText role="title" weight="semibold" style={styles.centerText}>
              {usesSavedResult ? 'Результат готов' : heading}
            </AppText>
          </>
        ) : null}
        <AppText
          role={fromHistory ? 'body' : 'label'}
          color={fromHistory ? '#171717' : colors.text.secondary}
          style={[
            styles.centerText,
            fromHistory && styles.historyResultDescription,
          ]}
        >
          {resultDescription}
        </AppText>
      </View>

      <ResultPreview
        analysisResult={usesSavedResult ? undefined : result}
        configuration={previewConfiguration}
        imageUri={usesSavedResult ? savedResult.imageUri : imageUri}
        previewTop={!fromHistory && !hideReadyHeading ? 282 : undefined}
        savedResult={usesSavedResult ? savedResult.result : undefined}
        showAnalysisOverlay={useLegacyPipeline && !usesSavedResult}
      />

      {canConfirm ? (
        <View style={styles.interpretationCard}>
          <View style={styles.interpretationHeader}>
            <View>
              <AppText role="caption" color={colors.text.secondary}>
                Интерпретация
              </AppText>
              <AppText role="heading" weight="semibold">
                {displayedResult}
              </AppText>
            </View>
            <View style={styles.confidenceBadge}>
              <AppText numeric role="label" color={colors.brand.success}>
                {displayedConfidence}%
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
                {displayedType}
              </AppText>
            </View>
            <View style={styles.resultMetaDivider} />
            <View style={styles.resultMetaItem}>
              <AppText role="caption" color={colors.text.secondary}>
                Партия
              </AppText>
              <AppText numeric role="label" weight="medium">
                {displayedBatch}
              </AppText>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.resultIssueCard}>
          <View style={styles.resultIssueHeader}>
            <View style={styles.resultIssueIcon}>
              <FlowIcon name="error" color={colors.state.error} size={18} />
            </View>
            <AppText role="label" weight="medium">
              Почему нужна новая фотография
            </AppText>
          </View>
          <AppText role="body" color={colors.text.secondary}>
            {issueExplanation}
          </AppText>
        </View>
      )}

      <View style={styles.resultActions}>
        <PrimaryButton
          disabled={isCompleting}
          label={resultActionLabel}
          onPress={handleResultAction}
        />
        {canConfirm || needsRetake ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              canConfirm
                ? 'Результат определен неверно?'
                : 'Ввести результат вручную'
            }
            disabled={isCompleting}
            onPress={onCorrection}
            style={({ pressed }) => [
              styles.resultSecondaryButton,
              isCompleting && { opacity: 0.5 },
              pressed && styles.pressed,
            ]}
          >
            <AppText
              role="label"
              weight="medium"
              color={colors.brand.primary}
              style={styles.resultSecondaryButtonLabel}
            >
              {canConfirm
                ? 'Результат определен неверно?'
                : 'Ввести результат вручную'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const correctionOptions = [
  'Вижу две линии',
  'Вижу только контрольную линию',
] as const;

export function ScanCorrectionScreen({
  fromHistory = false,
  headerTop,
  imageUri,
  onClose,
  onHelp,
  onRetake,
  onSubmit,
  result,
  resultData,
}: {
  fromHistory?: boolean;
  headerTop: number;
  imageUri?: string | null;
  onClose: () => void;
  onHelp: () => void;
  onRetake: () => void;
  onSubmit: (result: 'Положительный' | 'Отрицательный') => void;
  result?: AnalysisResult | null;
  resultData?: ScanResultData;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <View style={styles.resultScreen}>
      <FlowHeader
        leadingIcon={fromHistory ? 'back' : 'close'}
        light={false}
        onClose={onClose}
        onHelp={onHelp}
        showHelp={!fromHistory}
        top={headerTop}
      />

      <View
        style={[
          styles.correctionHeading,
          fromHistory && styles.historyCorrectionHeading,
        ]}
      >
        {!fromHistory ? (
          <AppText role="title" weight="semibold">
            Что вы видите на тесте?
          </AppText>
        ) : null}
        <AppText
          role="body"
          color={fromHistory ? '#171717' : colors.text.secondary}
          style={[
            fromHistory && styles.centerText,
            fromHistory && styles.historyResultDescription,
          ]}
        >
          Выберите вариант или переснимите тест. Итог можно подтвердить после
          проверки.
        </AppText>
      </View>

      <ResultPreview
        analysisResult={fromHistory ? undefined : result}
        imageUri={fromHistory ? resultData?.imageUri : imageUri}
        savedResult={fromHistory ? resultData?.result : undefined}
      />

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
              <View style={[styles.radio, active && styles.radioActive]}>
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
          onPress={() =>
            onSubmit(selected === 0 ? 'Положительный' : 'Отрицательный')
          }
        />
        {!fromHistory ? (
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
        ) : null}
      </View>
    </View>
  );
}

export function ScanFlowOverlay({
  headerTop,
  initialImageUri = null,
  visible,
  showBriefing,
  onBriefingSeen,
  onClose,
  onComplete,
}: ScanFlowOverlayProps) {
  const [stage, setStage] = useState<ScanFlowStage>(
    initialImageUri ? 'processing' : showBriefing ? 'briefing' : 'qr',
  );
  const [returnStage, setReturnStage] = useState<Exclude<
    ScanFlowStage,
    'briefing'
  > | null>(null);
  const [configuration, setConfiguration] = useState(
    scanningService.getConfiguration(),
  );
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [useLegacyPipeline, setUseLegacyPipeline] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const analysisRequestId = useRef(0);
  const capturedImageUriRef = useRef<string | null>(null);
  const capturedImageOwnedRef = useRef(false);
  const completingRef = useRef(false);
  const mountedRef = useRef(true);
  const transition = useRef(new Animated.Value(1)).current;
  const transitionIntent = useRef<PageTransitionIntent>('fade');
  const skipNextStageAnimation = useRef(true);

  const updateCapturedImageUri = (uri: string | null, owned = true) => {
    capturedImageUriRef.current = uri;
    capturedImageOwnedRef.current = owned;
    if (mountedRef.current) {
      setCapturedImageUri(uri);
    }
  };

  const discardCapturedImage = async () => {
    const uri = capturedImageUriRef.current;
    const owned = capturedImageOwnedRef.current;
    capturedImageUriRef.current = null;
    capturedImageOwnedRef.current = false;
    if (mountedRef.current) {
      setCapturedImageUri(null);
    }
    if (uri && owned) {
      await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  };

  useEffect(
    () => () => {
      mountedRef.current = false;
      const uri = capturedImageUriRef.current;
      const owned = capturedImageOwnedRef.current;
      if (uri && owned) {
        void deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    if (visible) {
      analysisRequestId.current += 1;
      completingRef.current = false;
      setIsCompleting(false);
      skipNextStageAnimation.current = true;
      transition.setValue(1);
      setReturnStage(null);
      setAnalysisResult(null);
      setAnalysisError(null);
      setUseLegacyPipeline(false);
      void discardCapturedImage();
      setConfiguration(scanningService.resetConfiguration());
      setStage(showBriefing ? 'briefing' : 'qr');
    } else {
      analysisRequestId.current += 1;
    }
  }, [initialImageUri, showBriefing, visible]);

  useEffect(() => {
    if (!visible || !initialImageUri) {
      return;
    }

    const requestId = ++analysisRequestId.current;
    updateCapturedImageUri(initialImageUri, false);
    setUseLegacyPipeline(true);
    setAnalysisResult(null);
    setAnalysisError(null);
    navigateToStage('processing', 'fade');
    void scanningService
      .analyze(initialImageUri, {
        useLegacyPipeline: true,
        includeRectifiedImage: true,
      })
      .then((result) => {
        if (analysisRequestId.current !== requestId) {
          return;
        }
        setAnalysisResult(result);
        navigateToStage('result', 'result');
      })
      .catch((error: unknown) => {
        if (analysisRequestId.current !== requestId) {
          return;
        }
        setAnalysisError(
          error instanceof Error
            ? error.message
            : 'Неизвестная ошибка анализа.',
        );
        navigateToStage('result', 'result');
      });
  }, [initialImageUri, visible]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (skipNextStageAnimation.current) {
      skipNextStageAnimation.current = false;
      transition.setValue(1);
      return;
    }

    const animation = Animated.timing(transition, {
      toValue: 1,
      duration: reduceMotion
        ? 120
        : transitionIntent.current === 'fade'
          ? 160
          : transitionIntent.current === 'result'
            ? 220
            : 260,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [stage, transition, visible]);

  if (!visible) {
    return null;
  }

  const navigateToStage = (
    nextStage: ScanFlowStage,
    intent: PageTransitionIntent,
  ) => {
    transitionIntent.current = intent;
    transition.stopAnimation();
    transition.setValue(0);
    setStage(nextStage);
  };

  const openBriefing = (
    currentStage: Exclude<ScanFlowStage, 'briefing' | 'processing'>,
  ) => {
    setReturnStage(currentStage);
    navigateToStage('briefing', 'modal');
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
          onPress: () => {
            analysisRequestId.current += 1;
            void discardCapturedImage().finally(onClose);
          },
        },
      ],
    );
  };
  const retakeTest = () => {
    analysisRequestId.current += 1;
    void discardCapturedImage();
    setAnalysisResult(null);
    setAnalysisError(null);
    navigateToStage('test', 'back');
  };
  const completeScan = (
    correctedResult?: 'Положительный' | 'Отрицательный',
  ) => {
    if (completingRef.current) {
      return;
    }

    if (!capturedImageUri) {
      Alert.alert(
        'Снимок не найден',
        'Переснимите тест, чтобы сохранить результат.',
      );
      return;
    }

    const confidence = Math.round(100 * getAnalysisConfidence(analysisResult));
    const productIdentity =
      `${configuration.product.label} ${configuration.assayProfile.id}`.toLowerCase();
    const type = /pregnancy|hcg|беремен/.test(productIdentity)
      ? 'Pregnancy hCG'
      : 'Ovulation LH';
    const detectedResult =
      deriveDetectedInterpretation(analysisResult) === 'positive'
        ? 'Положительный'
        : 'Отрицательный';

    completingRef.current = true;
    setIsCompleting(true);
    void Promise.resolve(
      onComplete({
        batch: configuration.product.batch,
        confidence,
        imageUri: capturedImageUri,
        result: correctedResult ?? detectedResult,
        type,
        resultSource:
          correctedResult !== undefined
            ? 'manual'
            : analysisResult
              ? 'stripcv'
              : 'manual',
        algorithmVersion: analysisResult?.algorithm_version ?? 'manual-v1',
        analysisStatus: analysisResult?.status,
        qualityFlags: analysisResult?.reason_codes ?? [],
        calibrationVersion: analysisResult?.assay_profile.version,
        signalRatio: analysisResult?.signal.value ?? undefined,
      }),
    )
      .then(() => discardCapturedImage())
      .catch(() => {
        completingRef.current = false;
        if (mountedRef.current) {
          setIsCompleting(false);
        }
      });
  };

  const applyQrData = (data: string) => {
    try {
      if (!scanningService.applyQrConfiguration(data)) {
        return {
          title: 'QR-код не распознан',
          message: 'Проверьте код с упаковки теста и попробуйте ещё раз.',
        };
      }
    } catch (error) {
      return {
        title: 'Профиль QR-кода отклонён',
        message:
          error instanceof Error ? error.message : 'Некорректный профиль.',
      };
    }

    setConfiguration(scanningService.getConfiguration());
    navigateToStage('test', 'forward');
    return null;
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
            navigateToStage(nextStage, 'back');
          } else {
            onBriefingSeen();
            navigateToStage('qr', 'forward');
          }
        }}
      />
    ) : stage === 'qr' ? (
      <QrScannerScreen
        headerTop={headerTop}
        onClose={requestClose}
        onHelp={() => openBriefing('qr')}
        onManualCode={(data) => {
          setConfiguration(scanningService.applyManualBatchCode(data));
          navigateToStage('test', 'forward');
          return null;
        }}
        onScanned={(data) => {
          if (!data) {
            return;
          }

          const error = applyQrData(data);
          if (error) {
            Alert.alert(error.title, error.message);
          }
        }}
      />
    ) : stage === 'test' ? (
      <TestScannerScreen
        useLegacyPipeline={useLegacyPipeline}
        configuration={configuration}
        headerTop={headerTop}
        onClose={requestClose}
        onHelp={() => openBriefing('test')}
        onCapture={(imageUri) => {
          const requestId = ++analysisRequestId.current;
          updateCapturedImageUri(imageUri);
          setAnalysisResult(null);
          setAnalysisError(null);
          navigateToStage('processing', 'fade');
          void scanningService
            .analyze(imageUri, {
              useLegacyPipeline,
              includeRectifiedImage: true,
            })
            .then((result) => {
              if (analysisRequestId.current !== requestId) {
                return;
              }
              setAnalysisResult(result);
              navigateToStage('result', 'result');
            })
            .catch((error: unknown) => {
              if (analysisRequestId.current !== requestId) {
                return;
              }
              setAnalysisError(
                error instanceof Error
                  ? error.message
                  : 'Неизвестная ошибка анализа.',
              );
              navigateToStage('result', 'result');
            });
        }}
      />
    ) : stage === 'processing' ? (
      <ProcessingScreen />
    ) : stage === 'correction' ? (
      <ScanCorrectionScreen
        headerTop={headerTop}
        imageUri={capturedImageUri}
        onClose={requestClose}
        onHelp={() => openBriefing('correction')}
        onRetake={retakeTest}
        onSubmit={completeScan}
        result={analysisResult}
      />
    ) : (
      <ScanResultScreen
        useLegacyPipeline={useLegacyPipeline}
        configuration={configuration}
        error={analysisError}
        headerTop={headerTop}
        imageUri={capturedImageUri}
        onClose={requestClose}
        onConfirm={() => completeScan()}
        onCorrection={() => navigateToStage('correction', 'forward')}
        onHelp={() => openBriefing('result')}
        onRetake={retakeTest}
        result={analysisResult}
        isCompleting={isCompleting}
      />
    );

  const transitionTransform = reduceMotion
    ? []
    : transitionIntent.current === 'forward'
      ? [
          {
            translateX: transition.interpolate({
              inputRange: [0, 1],
              outputRange: [28, 0],
            }),
          },
        ]
      : transitionIntent.current === 'back'
        ? [
            {
              translateX: transition.interpolate({
                inputRange: [0, 1],
                outputRange: [-28, 0],
              }),
            },
          ]
        : transitionIntent.current === 'modal'
          ? [
              {
                translateY: transition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ]
          : transitionIntent.current === 'result'
            ? [
                {
                  translateY: transition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ]
            : [];

  return (
    <View style={styles.overlay}>
      <Animated.View
        style={[
          styles.pageTransition,
          {
            opacity: transition.interpolate({
              inputRange: [0, 1],
              outputRange: [0.94, 1],
            }),
            transform: transitionTransform,
          },
        ]}
      >
        {content}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    overflow: 'hidden',
    borderRadius: 40,
    backgroundColor: '#FFF8F5',
  },
  pageTransition: {
    ...StyleSheet.absoluteFillObject,
  },
  pressed: {
    opacity: motion.pressedOpacity,
    transform: [{ scale: 0.985 }],
  },
  flowGlassPressed: {
    opacity: Platform.OS === 'android' ? 0.94 : 1,
    transform: [{ scale: Platform.OS === 'android' ? 0.98 : 1.035 }],
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
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  cameraPermissionState: {
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
  },
  qrArtwork: {
    width: 144,
    height: 144,
    overflow: 'hidden',
    opacity: 0.3,
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
  manualCodeModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  manualCodeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(23,12,17,0.30)',
  },
  manualCodeCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 20,
    borderRadius: 30,
    backgroundColor: colors.surface.raised,
    gap: 16,
    ...shadows.floating,
  },
  manualCodeHeader: {
    gap: 5,
  },
  manualCodeSubtitle: {
    lineHeight: 18,
  },
  manualCodeInput: {
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(234,64,135,0.20)',
    backgroundColor: '#F8F5F6',
    color: colors.text.primary,
    fontFamily: 'SFProDisplay-Regular',
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  manualCodeError: {
    marginTop: -8,
    paddingHorizontal: 2,
  },
  manualCodeActions: {
    flexDirection: 'row',
    gap: 10,
  },
  manualCodeActionSlot: {
    flex: 1,
  },
  manualCodeCancelButton: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    overflow: 'hidden',
  },
  manualCodeCancelContent: {
    minHeight: 48,
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
    ...StyleSheet.absoluteFillObject,
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
    opacity: 0.3,
  },
  cameraFocusReticle: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFBE63',
    zIndex: 6,
  },
  cameraFocusSurface: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 180,
    zIndex: 5,
  },
  exposureControl: {
    position: 'absolute',
    right: 12,
    width: 48,
    height: 204,
    borderRadius: 24,
    backgroundColor: 'rgba(17, 10, 13, 0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    alignItems: 'center',
    zIndex: 8,
  },
  exposureButton: {
    position: 'absolute',
    top: 4,
    width: 40,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  exposureButtonBottom: {
    top: undefined,
    bottom: 4,
  },
  exposureRailTouch: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    height: 120,
    alignItems: 'center',
  },
  exposureIcon: {
    position: 'absolute',
    top: 2,
  },
  exposureTrack: {
    position: 'absolute',
    top: 24,
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  exposureThumb: {
    position: 'absolute',
    left: 13,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#FFBE63',
  },
  cameraPrimaryAction: {
    width: 260,
  },
  briefingScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  briefingContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 104,
  },
  briefingHero: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 9,
  },
  briefingSubtitle: {
    width: '100%',
    maxWidth: 338,
    lineHeight: 20,
    textAlign: 'center',
  },
  briefingStepStage: {
    width: 360,
    alignItems: 'center',
    marginTop: 28,
  },
  briefingProgressText: {
    fontSize: 23,
    lineHeight: 27,
  },
  briefingActions: {
    width: 358,
    alignSelf: 'center',
    height: 46,
    flexDirection: 'row',
    gap: 15,
    marginTop: 32,
    zIndex: 2,
  },
  briefingSecondaryAction: {
    width: 171.5,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: '#ECEBEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefingSecondaryActionDisabled: {
    opacity: 0.5,
  },
  briefingPrimaryAction: {
    width: 171.5,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  briefingPrimaryActionDisabled: {
    backgroundColor: colors.state.disabled,
    shadowOpacity: 0,
  },
  briefingActionPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  briefingActionPressed: {
    transform: [{ scale: 1.025 }],
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
  historyResultHeading: {
    top: 168,
  },
  historyResultDescription: {
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: -0.38,
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
  resultErrorIcon: {
    backgroundColor: 'rgba(217,56,56,0.12)',
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
  scanResultOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  scanResultOverlayLegend: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.58)',
    gap: 3,
  },
  scanResultOverlayLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scanResultOverlaySwatch: {
    width: 10,
    height: 3,
    borderRadius: 2,
  },
  scanResultOverlayStripSwatch: {
    backgroundColor: '#28dc78',
  },
  scanResultOverlayControlSwatch: {
    backgroundColor: '#18967d',
  },
  scanResultOverlayTestSwatch: {
    backgroundColor: '#dc4869',
  },
  resultCapturedImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F7F1ED',
  },
  resultImageUnavailable: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FCEDE8',
  },
  rectifiedPreviewCard: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 4,
    width: 164,
    height: 72,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 5,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
  },
  rectifiedPreviewLabel: {
    fontSize: 10,
    lineHeight: 12,
  },
  rectifiedPreviewImage: {
    width: '100%',
    height: 43,
    marginTop: 2,
    backgroundColor: '#F8F8F8',
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
    zIndex: 3,
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
    top: 480,
    width: 370,
    minHeight: 126,
    padding: 18,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  resultIssueCard: {
    position: 'absolute',
    left: 16,
    top: 480,
    width: 370,
    minHeight: 126,
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(217,56,56,0.16)',
    backgroundColor: '#FFF1F0',
    gap: 12,
  },
  resultIssueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  resultIssueIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(217,56,56,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
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
  resultSecondaryButtonLabel: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  correctionHeading: {
    position: 'absolute',
    top: 132,
    left: 20,
    right: 20,
    gap: 8,
  },
  historyCorrectionHeading: {
    top: 168,
    alignItems: 'center',
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
