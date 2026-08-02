import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { deleteAsync } from "expo-file-system/legacy";
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AccessibilityInfo,
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
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import {
  AppText,
  LiquidGlassSurface,
  PrimaryButton,
  ScanTooltip,
  type ScanTooltipKind,
} from "./components";
import { colors, motion, radii, shadows, spacing } from "./tokens";
import ScanFlowFrame from "../assets/figma/scan-screen/scan-flow-frame.svg";
import type { AnalysisResult } from "../modules/strip-cv";
import {
  scanningService,
  type ActiveCvConfiguration,
  type PendingScanRecord,
  type StoredScanRecord,
} from "../services/scanning";

const hasNativeFlowGlass = Platform.OS === "ios" && isLiquidGlassAvailable();

type ScanFlowStage =
  "briefing" | "qr" | "test" | "processing" | "result" | "correction";

type PageTransitionIntent =
  | "forward"
  | "back"
  | "fade"
  | "result"
  | "modal";

type ScanFlowOverlayProps = {
  headerTop: number;
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

  if (name === "help") {
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

  if (name === "qr") {
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

  if (name === "test") {
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

  if (name === "light") {
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

  if (name === "surface") {
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

  if (name === "steady") {
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

  if (name === "error") {
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
      color={
        iconColor ??
        (darkContent ? colors.text.primary : '#ffffff')
      }
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
  leadingIcon = 'close',
  light = true,
  onClose,
  onHelp,
  showClose = true,
  showHelp = true,
  top,
}: {
  currentStep?: string;
  leadingIcon?: 'back' | 'close';
  light?: boolean;
  onClose: () => void;
  onHelp: () => void;
  showClose?: boolean;
  showHelp?: boolean;
  top: number;
}) {
  const color = light ? "#ffffff" : colors.text.primary;
  const stepLabel = currentStep ? (
    <AppText role="label" weight="medium" color={color}>
      {currentStep}
    </AppText>
  ) : null;

  return (
    <GlassContainer spacing={12} style={[styles.flowHeader, { top }]}>
      {showClose ? (
        <RoundGlassButton
          accessibilityLabel={
            leadingIcon === 'back'
              ? 'Вернуться к истории'
              : 'Закрыть сканирование'
          }
          darkContent={!light}
          icon={leadingIcon}
          iconColor={
            leadingIcon === 'back'
              ? colors.brand.primary
              : undefined
          }
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
    // Browsers require camera permission requests to happen from a user gesture.
    // Keep the explicit button visible on web instead of opening a browser-level
    // permission sheet from an effect, which can leave the sheet non-interactive
    // on mobile Safari/Chrome.
    if (Platform.OS === "web") {
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
    <View style={StyleSheet.absoluteFillObject}>
      {granted ? (
        <CameraView
          ref={cameraRef}
          barcodeScannerSettings={
            onBarcodeScanned ? { barcodeTypes: ["qr"] } : undefined
          }
          facing="back"
          mode="picture"
          onBarcodeScanned={onBarcodeScanned}
          onCameraReady={onCameraReady}
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <LinearGradient
          colors={["#251119", "#4A2433", "#170C11"]}
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
                        ? "Разрешить доступ"
                        : "Открыть настройки"
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
  const items: Array<{
    icon: FlowIconName;
    title: string;
    body: string;
  }> = [
    {
      icon: "qr",
      title: "Сначала QR-код",
      body: "Мы определим тип теста, партию и срок годности.",
    },
    {
      icon: "surface",
      title: "Подготовьте поверхность",
      body: "Положите тест ровно на светлый однородный фон.",
    },
    {
      icon: "light",
      title: "Проверьте освещение",
      body: "Избегайте теней и бликов на диагностическом окне.",
    },
  ];

  return (
    <View style={styles.briefingScreen}>
      <FlowHeader
        light={false}
        onClose={onClose}
        onHelp={() => undefined}
        showClose={!hideClose}
        showHelp={false}
        top={headerTop}
      />

      <View style={styles.briefingHero}>
        <AppText role="title" weight="semibold" style={styles.centerText}>
          Перед сканированием
        </AppText>
        <AppText
          role="body"
          color={colors.text.secondary}
          style={styles.briefingSubtitle}
        >
          Это займёт меньше минуты. Инструктаж показывается только перед первым
          сканированием.
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
  onScanned: (data?: string) => void;
}) {
  const scanned = useRef(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detected, setDetected] = useState(false);
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
              source={require("../assets/figma/scan-screen/scan-flow-qr-final.png")}
              style={styles.qrImage}
            />
          </View>
        </Animated.View>
      </Animated.View>

      <View style={styles.cameraBottomGroup}>
        <View style={styles.cameraTooltipSlot}>
          <ScanTooltip
            floatingMaxWidth={370}
            kind={detected ? "locked" : "qr"}
            message={detected ? "QR-код найден" : "Наведите камеру на QR-код"}
            singleLine
            variant="floating"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ввести код вручную"
          accessibilityState={{ disabled: detected }}
          disabled={detected}
          onPress={() => onScanned()}
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

type CvLiveHint = {
  kind: ScanTooltipKind;
  text: string;
  tone: "neutral" | "warning" | "success";
};

const initialCvHint: CvLiveHint = {
  kind: "test",
  text: "Наведите камеру на тест",
  tone: "neutral",
};

const cvReasonHints: Record<string, CvLiveHint> = {
  unsupported_or_too_small_image: {
    kind: "test",
    text: "Разместите весь тест внутри рамки",
    tone: "warning",
  },
  geometry_unreliable: {
    kind: "test",
    text: "Разместите тест целиком внутри рамки",
    tone: "warning",
  },
  geometry_edge_support_insufficient: {
    kind: "test",
    text: "Края теста не видны — измените положение",
    tone: "warning",
  },
  degenerate_projective_geometry: {
    kind: "test",
    text: "Держите камеру параллельно тесту",
    tone: "warning",
  },
  retake_more_overhead: {
    kind: "test",
    text: "Снимайте тест строго сверху",
    tone: "warning",
  },
  check_detected_corners: {
    kind: "test",
    text: "Совместите края теста с рамкой",
    tone: "warning",
  },
  strip_endpoints_out_of_frame: {
    kind: "test",
    text: "Покажите тест в кадре целиком",
    tone: "warning",
  },
  strip_resolution_too_low: {
    kind: "test",
    text: "Приблизьте камеру к тесту",
    tone: "warning",
  },
  move_closer: {
    kind: "test",
    text: "Приблизьте камеру к тесту",
    tone: "warning",
  },
  image_too_blurry: {
    kind: "test",
    text: "Изображение размыто — зафиксируйте камеру",
    tone: "warning",
  },
  hold_camera_steady: {
    kind: "test",
    text: "Зафиксируйте камеру",
    tone: "warning",
  },
  exposure_clipping: {
    kind: "lowLight",
    text: "Слишком ярко — уберите прямой свет",
    tone: "warning",
  },
  adjust_exposure: {
    kind: "lowLight",
    text: "Измените освещение теста",
    tone: "warning",
  },
  glare_crosses_control_line: {
    kind: "lowLight",
    text: "Блик перекрывает контрольную зону",
    tone: "warning",
  },
  reduce_glare: {
    kind: "lowLight",
    text: "Уберите блики с поверхности теста",
    tone: "warning",
  },
  broad_shadow_or_illumination_gradient: {
    kind: "background",
    text: "Сделайте освещение равномерным",
    tone: "warning",
  },
  broad_stain_or_smeared_line: {
    kind: "background",
    text: "Зона результата размыта или загрязнена",
    tone: "warning",
  },
  insufficient_valid_membrane_pixels: {
    kind: "background",
    text: "Положите тест на однородный светлый фон",
    tone: "warning",
  },
  control_not_detected: {
    kind: "test",
    text: "Контрольная линия пока не распознана",
    tone: "warning",
  },
  control_denominator_too_small: {
    kind: "test",
    text: "Контрольная линия слишком слабая",
    tone: "warning",
  },
  ambiguous_extra_line_peak: {
    kind: "test",
    text: "В зоне результата видны лишние отметки",
    tone: "warning",
  },
  color_calibration_validation_failed: {
    kind: "background",
    text: "Цвет снимка искажён — измените освещение",
    tone: "warning",
  },
};

function getCvLiveHint(result: AnalysisResult, validStreak: number): CvLiveHint {
  if (result.status === "valid" && validStreak >= 2) {
    return {
      kind: "locked",
      text: "Условия подходят — не двигайте камеру",
      tone: "success",
    };
  }

  const reasonHint = result.reason_codes
    .map((code) => cvReasonHints[code])
    .find((hint) => hint !== undefined);

  return reasonHint ?? {
    kind: "test",
    text:
      result.status === "valid"
        ? "Проверяем стабильность кадра"
        : "Совместите тест с рамкой",
    tone: result.status === "valid" ? "neutral" : "warning",
  };
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
      >
        {content}
      </LiquidGlassSurface>
    </View>
  );
}

function TestScannerScreen({
  configuration,
  headerTop,
  onCapture,
  onClose,
  onHelp,
}: {
  configuration: ActiveCvConfiguration;
  headerTop: number;
  onCapture: (imageUri: string) => void;
  onClose: () => void;
  onHelp: () => void;
}) {
  const [currentHint, setCurrentHint] = useState<CvLiveHint>(initialCvHint);
  const [ready, setReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const previewBusy = useRef(false);
  const validStreak = useRef(0);

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

        const result = await scanningService.analyze(previewUri);
        if (!active) {
          return;
        }

        validStreak.current =
          result.status === "valid" ? validStreak.current + 1 : 0;
        const nextHint = getCvLiveHint(result, validStreak.current);
        setCurrentHint(nextHint);
        setReady(nextHint.tone === "success");
      } catch {
        if (active) {
          validStreak.current = 0;
          setReady(false);
          setCurrentHint(initialCvHint);
        }
      } finally {
        if (previewUri) {
          void deleteAsync(previewUri, { idempotent: true }).catch(() => undefined);
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
  }, [cameraReady, capturing, configuration]);

  const handleCapture = async () => {
    if (!ready || !cameraReady || capturing || previewBusy.current) {
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
        throw new Error("Camera returned no local image URI.");
      }
      onCapture(photo.uri);
    } catch {
      Alert.alert(
        "Не удалось сделать снимок",
        "Проверьте доступ к камере и попробуйте ещё раз.",
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
          source={require("../assets/figma/scan-screen/scan-test-strip.png")}
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
                ? "Делаем снимок…"
                : ready
                  ? "Сканировать тест"
                  : "Проверяем условия"
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
        colors={["#FFF8F5", "#FEE8E3", "#FFF8F6"]}
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

function ResultPreview({
  analysisResult,
  imageUri,
  savedResult,
}: {
  analysisResult?: AnalysisResult | null;
  imageUri?: string | null;
  savedResult?: ScanResultData['result'];
}) {
  const usesAnalysis = analysisResult !== undefined;
  const controlDetected = usesAnalysis
    ? analysisResult?.peaks.control.detected === true
    : true;
  const testDetected = usesAnalysis
    ? analysisResult?.peaks.test.detected === true
    : savedResult !== 'Отрицательный';
  const detectionLabel = !controlDetected
    ? "Контрольная зона не распознана"
    : testDetected
      ? "Обе зоны распознаны"
      : "Распознана контрольная зона";
  const needsRetake =
    analysisResult?.status === "invalid" || !controlDetected;

  return (
    <View style={styles.resultPreview}>
      {imageUri ? (
        <Image
          accessible
          accessibilityLabel="Снимок отсканированного теста"
          resizeMode="cover"
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
      <View style={styles.detectedBadge}>
        <FlowIcon
          name={needsRetake ? "error" : "check"}
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
  const canConfirm =
    usesSavedResult ||
    (result?.status === "valid" && result.signal.classification !== null);
  const needsRetake =
    !usesSavedResult && (Boolean(error) || result?.status === "invalid");
  const heading = error
    ? "Не удалось выполнить анализ"
    : result?.status === "invalid"
      ? "Нужен новый снимок"
      : result?.status === "review"
        ? "Требуется проверка"
        : "Результат готов";
  const interpretation = error
    ? "Ошибка анализа"
    : result?.status === "invalid"
      ? "Недействительный снимок"
      : result?.status === "review"
        ? "Не сохраняется"
        : result?.signal.classification === "POS"
          ? "Положительный"
          : result?.signal.classification === "NEG"
            ? "Отрицательный"
            : result?.signal.value !== null &&
                result?.signal.value !== undefined
              ? `T/C ${result.signal.value.toFixed(3)}`
              : "Без классификации";
  const confidence = Math.round(
    100 *
      Math.max(
        0,
        Math.min(
          1,
          result?.quality.peak_pair_confidence ??
            result?.quality.locator_confidence ??
            0,
        ),
      ),
  );
  const qualityMessage = result?.reason_codes
    .map((code) => cvReasonHints[code]?.text)
    .find((message) => message !== undefined);
  const displayedResult =
    usesSavedResult
      ? savedResult.result === 'Пик ЛГ'
        ? 'Положительный'
        : savedResult.result
      : interpretation;
  const displayedConfidence = usesSavedResult
    ? savedResult.confidence
    : confidence;
  const displayedType = usesSavedResult
    ? savedResult.type
    : configuration?.product.label ?? defaultScanResult.type;
  const displayedBatch = usesSavedResult
    ? savedResult.batch
    : configuration?.product.batch ?? defaultScanResult.batch;

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
                name={needsRetake ? "error" : "check"}
                color={
                  needsRetake ? colors.state.error : colors.brand.success
                }
                size={28}
              />
            </View>
            <AppText
              role="title"
              weight="semibold"
              style={styles.centerText}
            >
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
          {usesSavedResult
            ? 'Проверьте, правильно ли приложение определило линии.'
            : error ??
              qualityMessage ??
              (canConfirm
                ? "Проверьте, правильно ли приложение определило линии."
                : "Измерение не будет сохранено — переснимите тест.")}
        </AppText>
      </View>

      <ResultPreview
        analysisResult={usesSavedResult ? undefined : result}
        imageUri={usesSavedResult ? savedResult.imageUri : imageUri}
        savedResult={usesSavedResult ? savedResult.result : undefined}
      />

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

      <View style={styles.resultActions}>
        <PrimaryButton
          disabled={isCompleting}
          label={
            isCompleting
              ? "Сохраняем результат…"
              : canConfirm
                ? "Подтвердить результат"
                : "Переснять тест"
          }
          onPress={canConfirm ? onConfirm : () => onRetake?.()}
        />
        {canConfirm ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Исправить интерпретацию"
            disabled={isCompleting}
            onPress={onCorrection}
            style={({ pressed }) => [
              styles.resultSecondaryButton,
              isCompleting && { opacity: 0.5 },
              pressed && styles.pressed,
            ]}
          >
            <AppText role="label" weight="medium" color={colors.brand.primary}>
              Результат определён неверно
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const correctionOptions = [
  "Вижу две линии",
  "Вижу только контрольную линию",
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
          Выберите вариант или переснимите тест. Итог можно подтвердить
          после проверки.
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
            onSubmit(
              selected === 0 ? 'Положительный' : 'Отрицательный',
            )
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
            <AppText
              role="label"
              weight="medium"
              color={colors.brand.primary}
            >
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
  visible,
  showBriefing,
  onBriefingSeen,
  onClose,
  onComplete,
}: ScanFlowOverlayProps) {
  const [stage, setStage] = useState<ScanFlowStage>(
    showBriefing ? "briefing" : "qr",
  );
  const [returnStage, setReturnStage] = useState<Exclude<
    ScanFlowStage,
    "briefing"
  > | null>(null);
  const [configuration, setConfiguration] = useState(
    scanningService.getConfiguration(),
  );
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const analysisRequestId = useRef(0);
  const capturedImageUriRef = useRef<string | null>(null);
  const completingRef = useRef(false);
  const mountedRef = useRef(true);
  const transition = useRef(new Animated.Value(1)).current;
  const transitionIntent = useRef<PageTransitionIntent>("fade");
  const skipNextStageAnimation = useRef(true);

  const updateCapturedImageUri = (uri: string | null) => {
    capturedImageUriRef.current = uri;
    if (mountedRef.current) {
      setCapturedImageUri(uri);
    }
  };

  const discardCapturedImage = async () => {
    const uri = capturedImageUriRef.current;
    capturedImageUriRef.current = null;
    if (mountedRef.current) {
      setCapturedImageUri(null);
    }
    if (uri) {
      await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  };

  useEffect(
    () => () => {
      mountedRef.current = false;
      const uri = capturedImageUriRef.current;
      if (uri) {
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
      void discardCapturedImage();
      setConfiguration(scanningService.resetConfiguration());
      setStage(showBriefing ? "briefing" : "qr");
    } else {
      analysisRequestId.current += 1;
    }
  }, [showBriefing, visible]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
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
        : transitionIntent.current === "fade"
          ? 160
          : transitionIntent.current === "result"
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
    currentStage: Exclude<ScanFlowStage, "briefing" | "processing">,
  ) => {
    setReturnStage(currentStage);
    navigateToStage("briefing", "modal");
  };
  const requestClose = () => {
    Alert.alert(
      "Завершить сканирование?",
      "Текущий прогресс сканирования не будет сохранён.",
      [
        {
          text: "Продолжить сканирование",
          style: "cancel",
        },
        {
          text: "Завершить",
          style: "destructive",
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
    navigateToStage("test", "back");
  };
  const completeScan = (
    correctedResult?: 'Положительный' | 'Отрицательный',
  ) => {
    if (completingRef.current) {
      return;
    }

    if (!capturedImageUri) {
      Alert.alert(
        "Снимок не найден",
        "Переснимите тест, чтобы сохранить результат.",
      );
      return;
    }

    const confidence = Math.round(
      100 *
        Math.max(
          0,
          Math.min(
            1,
            analysisResult?.quality.peak_pair_confidence ??
              analysisResult?.quality.locator_confidence ??
              0,
          ),
        ),
    );
    const productIdentity = `${configuration.product.label} ${configuration.assayProfile.id}`.toLowerCase();
    const type = /pregnancy|hcg|беремен/.test(productIdentity)
      ? 'Pregnancy hCG'
      : 'Ovulation LH';
    const detectedResult =
      analysisResult?.signal.classification === "POS" ||
      (analysisResult?.signal.classification === null &&
        analysisResult?.peaks.test.detected)
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

  const content =
    stage === "briefing" ? (
      <BriefingScreen
        headerTop={headerTop}
        hideClose={returnStage !== null}
        onClose={requestClose}
        onContinue={() => {
          if (returnStage) {
            const nextStage = returnStage;
            setReturnStage(null);
            navigateToStage(nextStage, "back");
          } else {
            onBriefingSeen();
            navigateToStage("qr", "forward");
          }
        }}
      />
    ) : stage === "qr" ? (
      <QrScannerScreen
        headerTop={headerTop}
        onClose={requestClose}
        onHelp={() => openBriefing("qr")}
        onScanned={(data) => {
          if (!data) {
            return;
          }

          try {
            if (!scanningService.applyQrConfiguration(data)) {
              Alert.alert(
                "QR-код не распознан",
                "Наведите камеру на QR-код из упаковки теста.",
              );
              return;
            }
          } catch (error) {
            Alert.alert(
              "Профиль QR-кода отклонён",
              error instanceof Error
                ? error.message
                : "Некорректный профиль.",
            );
            return;
          }
          setConfiguration(scanningService.getConfiguration());
          navigateToStage("test", "forward");
        }}
      />
    ) : stage === "test" ? (
      <TestScannerScreen
        configuration={configuration}
        headerTop={headerTop}
        onClose={requestClose}
        onHelp={() => openBriefing("test")}
        onCapture={(imageUri) => {
          const requestId = ++analysisRequestId.current;
          updateCapturedImageUri(imageUri);
          setAnalysisResult(null);
          setAnalysisError(null);
          navigateToStage("processing", "fade");
          void scanningService
            .analyze(imageUri)
            .then((result) => {
              if (analysisRequestId.current !== requestId) {
                return;
              }
              setAnalysisResult(result);
              navigateToStage("result", "result");
            })
            .catch((error: unknown) => {
              if (analysisRequestId.current !== requestId) {
                return;
              }
              setAnalysisError(
                error instanceof Error
                  ? error.message
                  : "Неизвестная ошибка анализа.",
              );
              navigateToStage("result", "result");
            });
        }}
      />
    ) : stage === "processing" ? (
      <ProcessingScreen />
    ) : stage === 'correction' ? (
      <ScanCorrectionScreen
        headerTop={headerTop}
        imageUri={capturedImageUri}
        onClose={requestClose}
        onHelp={() => openBriefing("correction")}
        onRetake={retakeTest}
        onSubmit={completeScan}
        result={analysisResult}
      />
    ) : (
      <ScanResultScreen
        configuration={configuration}
        error={analysisError}
        headerTop={headerTop}
        imageUri={capturedImageUri}
        onClose={requestClose}
        onConfirm={() => completeScan()}
        onCorrection={() => navigateToStage("correction", "forward")}
        onHelp={() => openBriefing("result")}
        onRetake={retakeTest}
        result={analysisResult}
        isCompleting={isCompleting}
      />
    );

  const transitionTransform = reduceMotion
    ? []
    : transitionIntent.current === "forward"
      ? [
          {
            translateX: transition.interpolate({
              inputRange: [0, 1],
              outputRange: [28, 0],
            }),
          },
        ]
      : transitionIntent.current === "back"
        ? [
            {
              translateX: transition.interpolate({
                inputRange: [0, 1],
                outputRange: [-28, 0],
              }),
            },
          ]
        : transitionIntent.current === "modal"
          ? [
              {
                translateY: transition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ]
          : transitionIntent.current === "result"
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
    overflow: "hidden",
    borderRadius: 40,
    backgroundColor: "#FFF8F5",
  },
  pageTransition: {
    ...StyleSheet.absoluteFillObject,
  },
  pressed: {
    opacity: motion.pressedOpacity,
    transform: [{ scale: 0.985 }],
  },
  flowGlassPressed: {
    transform: [{ scale: 1.035 }],
  },
  flowHeader: {
    position: "absolute",
    zIndex: 6,
    left: 16,
    right: 16,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "visible",
  },
  flowGlassPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 48,
    height: 48,
  },
  stepPill: {
    width: 156,
    height: 48,
    borderRadius: 24,
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraScreen: {
    flex: 1,
    backgroundColor: "#170C11",
  },
  cameraReadabilityScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  cameraPermissionState: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  cameraPermissionCopy: {
    maxWidth: 290,
    lineHeight: 20,
    textAlign: "center",
  },
  cameraPermissionAction: {
    width: 240,
    marginTop: 8,
  },
  cameraTitle: {
    position: "absolute",
    left: 32,
    right: 32,
    alignItems: "center",
    gap: 5,
  },
  centerText: {
    textAlign: "center",
  },
  qrTarget: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  scanFlowFrame: {
    ...StyleSheet.absoluteFillObject,
  },
  qrArtwork: {
    width: 144,
    height: 144,
    overflow: "hidden",
    opacity: 0.3,
  },
  qrImage: {
    width: "100%",
    height: "100%",
  },
  cameraBottomGroup: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 86,
    alignItems: "center",
    gap: 18,
  },
  cameraTooltipSlot: {
    width: 370,
    alignSelf: "center",
    alignItems: "center",
  },
  secondaryCameraAction: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  batchChip: {
    position: "absolute",
    zIndex: 4,
    left: 16,
    right: 16,
    height: 56,
    borderRadius: 20,
  },
  batchChipContent: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
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
    position: "absolute",
    left: 36,
    width: 330,
    height: 330,
    alignItems: "center",
    justifyContent: "center",
  },
  testStripImage: {
    width: 308,
    height: 30,
    opacity: 0.3,
  },
  cameraPrimaryAction: {
    width: 260,
  },
  briefingScreen: {
    flex: 1,
    backgroundColor: "#FFF8F5",
  },
  briefingHero: {
    position: "absolute",
    top: 205,
    left: 24,
    right: 24,
    alignItems: "center",
    gap: 9,
  },
  briefingSubtitle: {
    width: 338,
    lineHeight: 20,
    textAlign: "center",
  },
  briefingList: {
    position: "absolute",
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
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.card,
  },
  briefingRowIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FDECE5",
    alignItems: "center",
    justifyContent: "center",
  },
  briefingRowCopy: {
    flex: 1,
    paddingRight: 4,
    gap: 5,
  },
  briefingRowNumber: {
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomAction: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 108,
  },
  processingScreen: {
    flex: 1,
    backgroundColor: "#FFF8F5",
  },
  processingContent: {
    position: "absolute",
    left: 30,
    right: 30,
    top: 230,
    alignItems: "center",
  },
  processingIndicator: {
    width: 92,
    height: 92,
    marginBottom: 28,
    borderRadius: 46,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card,
  },
  processingDescription: {
    maxWidth: 315,
    marginTop: 10,
    textAlign: "center",
  },
  processingSteps: {
    width: 290,
    marginTop: 34,
    gap: 14,
  },
  processingStepDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  processingStepActive: {
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: "#FFF8F5",
  },
  resultHeading: {
    position: "absolute",
    top: 126,
    left: 24,
    right: 24,
    alignItems: "center",
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
    backgroundColor: "rgba(31,187,116,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultErrorIcon: {
    backgroundColor: "rgba(217,56,56,0.12)",
  },
  resultPreview: {
    position: "absolute",
    left: 16,
    top: 246,
    width: 370,
    height: 180,
    overflow: "hidden",
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  resultCapturedImage: {
    width: "100%",
    height: "100%",
  },
  resultImageUnavailable: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FCEDE8",
  },
  resultStrip: {
    width: 292,
    height: 70,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    transform: [{ rotate: "-3deg" }],
    ...shadows.card,
  },
  resultStripTip: {
    width: 82,
    alignSelf: "stretch",
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    backgroundColor: "#F7B2C8",
  },
  resultWindow: {
    width: 108,
    height: 42,
    marginLeft: 24,
    borderRadius: 13,
    backgroundColor: "#FFF3F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "rgba(211,20,113,0.56)",
  },
  resultControlLabel: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: -17,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detectedBadge: {
    position: "absolute",
    right: 14,
    bottom: 14,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.88)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  interpretationCard: {
    position: "absolute",
    left: 16,
    top: 442,
    width: 370,
    minHeight: 126,
    padding: 18,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    ...shadows.card,
  },
  interpretationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  confidenceBadge: {
    minWidth: 58,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "rgba(31,187,116,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  resultRule: {
    height: 1,
    marginVertical: 13,
    backgroundColor: colors.surface.divider,
  },
  resultMeta: {
    flexDirection: "row",
    alignItems: "stretch",
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
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 94,
    gap: 10,
  },
  resultSecondaryButton: {
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(211,20,113,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  correctionHeading: {
    position: "absolute",
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
    position: "absolute",
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
    borderColor: "rgba(33,33,35,0.08)",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  correctionOptionActive: {
    borderColor: colors.brand.primary,
    backgroundColor: "rgba(211,20,113,0.06)",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.state.disabled,
    alignItems: "center",
    justifyContent: "center",
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
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 94,
    gap: 10,
  },
});
