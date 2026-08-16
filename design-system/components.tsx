import type { BlurTint } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import type {
  ImageSourcePropType,
  PressableProps,
  StyleProp,
  TextProps,
  TextStyle,
  ViewStyle,
} from 'react-native';

import {
  androidMaterials,
  androidShadows,
  colors,
  fonts,
  motion,
  radii,
  shadows,
  spacing,
  typeScale,
} from './tokens';
import type { StoredScanRecord } from '../services/scanning';
import { FallbackGlassBackdrop } from './glass-fallback';

const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
const SvgDefs = Defs as unknown as ComponentType<PropsWithChildren>;

type EdgeFadeGradientProps = {
  edge: 'top' | 'bottom';
  height: number;
  style?: StyleProp<ViewStyle>;
};

export function EdgeFadeGradient({
  edge,
  height,
  style,
}: EdgeFadeGradientProps) {
  if (Platform.OS === 'android' && edge === 'bottom') return null;

  const isTop = edge === 'top';

  return (
    <LinearGradient
      pointerEvents="none"
      colors={
        isTop
          ? [
              'rgba(255,255,255,0.70)',
              'rgba(255,255,255,0.70)',
              'rgba(255,255,255,0)',
            ]
          : [
              'rgba(255,255,255,0)',
              'rgba(255,255,255,1)',
              'rgba(255,255,255,1)',
            ]
      }
      locations={isTop ? [0, 0.38, 1] : [0, 0.62, 1]}
      style={[styles.edgeFadeGradient, { height }, style]}
    />
  );
}

export type SegmentedSwitcherOption<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedSwitcher<T extends string>({
  accessibilityLabel,
  labelStyle,
  onChange,
  options,
  style,
  value,
}: {
  accessibilityLabel?: string;
  labelStyle?: StyleProp<TextStyle>;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedSwitcherOption<T>>;
  style?: StyleProp<ViewStyle>;
  value: T;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const position = useRef(new Animated.Value(activeIndex)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const segmentWidth = Math.max(0, (containerWidth - 8) / options.length);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    position.stopAnimation();
    if (reduceMotion) {
      position.setValue(activeIndex);
      return;
    }

    Animated.spring(position, {
      toValue: activeIndex,
      damping: 24,
      stiffness: 280,
      mass: 0.72,
      overshootClamping: true,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, position, reduceMotion]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}
      style={[styles.segmentedSwitcher, style]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentedSwitcherIndicator,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: Animated.multiply(position, segmentWidth),
                },
              ],
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <View key={option.value} style={styles.segmentedSwitcherOptionSlot}>
            <View
              pointerEvents="none"
              style={styles.segmentedSwitcherLabelSlot}
            >
              <AppText
                numberOfLines={1}
                weight={selected ? 'medium' : 'regular'}
                color={selected ? colors.text.primary : colors.text.secondary}
                style={[
                  styles.segmentedSwitcherLabel,
                  labelStyle,
                  selected
                    ? styles.segmentedSwitcherLabelSelected
                    : styles.segmentedSwitcherLabelInactive,
                ]}
              >
                {option.label}
              </AppText>
            </View>
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={styles.segmentedSwitcherOption}
            />
          </View>
        );
      })}
    </View>
  );
}

export type ScanBackgroundMotionVariant =
  | 'drift'
  | 'breathe'
  | 'diagonal'
  | 'sway'
  | 'vertical'
  | 'activeOrbit'
  | 'activeSweep'
  | 'activePulse';

type ScanBackgroundMotionProps = {
  source: ImageSourcePropType;
  variant?: ScanBackgroundMotionVariant;
  width?: number;
  height?: number;
  flipY?: boolean;
};

type ScanSpherePalette = 'pink' | 'lime' | 'pale' | 'outline';

type MovingScanSphereProps = {
  containerWidth: number;
  duration: number;
  initialPhase: number;
  palette: ScanSpherePalette;
  reduceMotion: boolean;
  size: number;
  staticX: number;
  top: number;
};

const spherePalettes = {
  pink: ['#FFD5DE', '#FF9FBC', '#F36D9B'],
  lime: ['#FCFFA5', '#EAF035', '#CAD521'],
  pale: ['#FFFFFF', '#FFECEF', '#FFD9E2'],
} as const;

function ScanSphereVisual({
  palette,
  size,
}: {
  palette: ScanSpherePalette;
  size: number;
}) {
  if (palette === 'outline') {
    return (
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle
          cx="50"
          cy="50"
          r="48.5"
          fill="rgba(255,255,255,0.035)"
          stroke="rgba(255,255,255,0.88)"
          strokeWidth="1"
        />
      </Svg>
    );
  }

  const colorsForSphere = spherePalettes[palette];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <SvgDefs>
        <RadialGradient
          id="sphereFill"
          cx="31%"
          cy="27%"
          rx="76%"
          ry="76%"
          fx="27%"
          fy="23%"
        >
          <Stop
            offset="0"
            stopColor={colorsForSphere[0]}
            stopOpacity={palette === 'pale' ? 0.82 : 0.96}
          />
          <Stop
            offset="0.48"
            stopColor={colorsForSphere[1]}
            stopOpacity={palette === 'pale' ? 0.64 : 0.92}
          />
          <Stop
            offset="1"
            stopColor={colorsForSphere[2]}
            stopOpacity={palette === 'pale' ? 0.42 : 0.88}
          />
        </RadialGradient>
      </SvgDefs>
      <Circle cx="50" cy="50" r="50" fill="url(#sphereFill)" />
      <Circle cx="34" cy="27" r="17" fill="rgba(255,255,255,0.13)" />
    </Svg>
  );
}

function MovingScanSphere({
  containerWidth,
  duration,
  initialPhase,
  palette,
  reduceMotion,
  size,
  staticX,
  top,
}: MovingScanSphereProps) {
  const progress = useRef(new Animated.Value(initialPhase)).current;

  useEffect(() => {
    let mounted = true;
    let currentAnimation: Animated.CompositeAnimation | undefined;

    progress.stopAnimation();

    if (reduceMotion) {
      progress.setValue(initialPhase);
      return () => {
        mounted = false;
      };
    }

    const runFullPass = () => {
      if (!mounted) {
        return;
      }

      progress.setValue(0);
      currentAnimation = Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      });
      currentAnimation.start(({ finished }) => {
        if (finished) {
          runFullPass();
        }
      });
    };

    progress.setValue(initialPhase);
    currentAnimation = Animated.timing(progress, {
      toValue: 1,
      duration: Math.max(1, duration * (1 - initialPhase)),
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    currentAnimation.start(({ finished }) => {
      if (finished) {
        runFullPass();
      }
    });

    return () => {
      mounted = false;
      currentAnimation?.stop();
      progress.stopAnimation();
    };
  }, [duration, initialPhase, progress, reduceMotion]);

  const edgePadding = size + 18;
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-edgePadding, containerWidth + edgePadding],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: reduceMotion ? containerWidth * staticX - size / 2 : 0,
        top,
        width: size,
        height: size,
        opacity: palette === 'pale' ? 0.72 : 1,
        transform: reduceMotion ? undefined : [{ translateX }],
      }}
    >
      <ScanSphereVisual palette={palette} size={size} />
    </Animated.View>
  );
}

const scanSphereSeeds = [
  {
    size: 0.7,
    top: 0.02,
    duration: 18000,
    phase: 0.04,
    palette: 'pink',
  },
  {
    size: 0.34,
    top: 0.13,
    duration: 14000,
    phase: 0.28,
    palette: 'lime',
  },
  {
    size: 0.42,
    top: 0.25,
    duration: 16500,
    phase: 0.52,
    palette: 'pale',
  },
  {
    size: 0.3,
    top: 0.41,
    duration: 12500,
    phase: 0.76,
    palette: 'pink',
  },
  {
    size: 0.58,
    top: 0.58,
    duration: 19500,
    phase: 0.16,
    palette: 'outline',
  },
  {
    size: 0.4,
    top: 0.72,
    duration: 15000,
    phase: 0.64,
    palette: 'lime',
  },
  {
    size: 0.82,
    top: 0.79,
    duration: 22000,
    phase: 0.88,
    palette: 'pink',
  },
] as const;

export function ScanBackgroundMotion({
  source,
  variant = 'drift',
  width = 180,
  height = 389,
  flipY = true,
}: ScanBackgroundMotionProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  const isActive =
    variant === 'activeOrbit' ||
    variant === 'activeSweep' ||
    variant === 'activePulse';

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);

    if (reduceMotion || isActive) {
      return;
    }

    const durations: Record<ScanBackgroundMotionVariant, number> = {
      drift: 14000,
      breathe: 10000,
      diagonal: 16000,
      sway: 13000,
      vertical: 18000,
      activeOrbit: 14000,
      activeSweep: 11000,
      activePulse: 12500,
    };
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durations[variant],
        easing: isActive ? Easing.linear : Easing.inOut(Easing.ease),
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();

    return () => animation.stop();
  }, [isActive, progress, reduceMotion, variant]);

  const threePoint = {
    inputRange: [0, 0.5, 1],
  };
  const translateX =
    variant === 'drift'
      ? progress.interpolate({
          ...threePoint,
          outputRange: [-3, 3, -3],
        })
      : variant === 'diagonal'
        ? progress.interpolate({
            ...threePoint,
            outputRange: [-9, 9, -9],
          })
        : variant === 'activeOrbit'
          ? progress.interpolate({
              ...threePoint,
              outputRange: [-18, 18, -18],
            })
          : variant === 'activeSweep'
            ? progress.interpolate({
                ...threePoint,
                outputRange: [-24, 24, -24],
              })
            : variant === 'activePulse'
              ? progress.interpolate({
                  ...threePoint,
                  outputRange: [-8, 8, -8],
                })
              : 0;
  const translateY =
    variant === 'drift'
      ? progress.interpolate({
          ...threePoint,
          outputRange: [-5, 6, -5],
        })
      : variant === 'diagonal'
        ? progress.interpolate({
            ...threePoint,
            outputRange: [8, -8, 8],
          })
        : variant === 'vertical'
          ? progress.interpolate({
              ...threePoint,
              outputRange: [-12, 12, -12],
            })
          : variant === 'activeOrbit'
            ? progress.interpolate({
                ...threePoint,
                outputRange: [14, -14, 14],
              })
            : variant === 'activeSweep'
              ? progress.interpolate({
                  ...threePoint,
                  outputRange: [-7, 7, -7],
                })
              : variant === 'activePulse'
                ? progress.interpolate({
                    ...threePoint,
                    outputRange: [-10, 10, -10],
                  })
                : 0;
  const scale =
    variant === 'breathe'
      ? progress.interpolate({
          ...threePoint,
          outputRange: [1.015, 1.055, 1.015],
        })
      : variant === 'sway'
        ? 1.045
        : variant === 'diagonal'
          ? 1.05
          : variant === 'vertical'
            ? 1.04
            : variant === 'activeOrbit'
              ? 1.08
              : variant === 'activeSweep'
                ? 1.12
                : variant === 'activePulse'
                  ? progress.interpolate({
                      ...threePoint,
                      outputRange: [1.05, 1.14, 1.05],
                    })
                  : 1.035;
  const rotate =
    variant === 'sway'
      ? progress.interpolate({
          ...threePoint,
          outputRange: ['-0.35deg', '0.35deg', '-0.35deg'],
        })
      : variant === 'activeOrbit'
        ? progress.interpolate({
            ...threePoint,
            outputRange: ['-0.8deg', '0.8deg', '-0.8deg'],
          })
        : '0deg';
  const horizontalOverscan = 0.04;
  const verticalOverscan = 0.04;
  const activeSpeedMultiplier =
    variant === 'activeSweep' ? 0.78 : variant === 'activePulse' ? 0.9 : 1;
  const activeSizeMultiplier =
    variant === 'activePulse' ? 1.1 : variant === 'activeSweep' ? 0.9 : 1;
  const visibleSphereCount = variant === 'activeOrbit' ? 5 : 7;

  return (
    <View style={[styles.scanBackgroundMotion, { width, height }]}>
      {isActive ? (
        <LinearGradient
          colors={['#fff9f6', '#ffefec', '#fff8f4']}
          locations={[0, 0.52, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(255,216,225,0.2)',
              'rgba(255,255,255,0)',
              'rgba(255,217,222,0.18)',
            ]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {scanSphereSeeds.slice(0, visibleSphereCount).map((sphere, index) => {
            const size = width * sphere.size * activeSizeMultiplier;
            const maxTop = Math.max(0, height - size);

            return (
              <MovingScanSphere
                key={`${variant}-${index}`}
                containerWidth={width}
                duration={sphere.duration * activeSpeedMultiplier}
                initialPhase={sphere.phase}
                palette={sphere.palette}
                reduceMotion={reduceMotion}
                size={size}
                staticX={sphere.phase}
                top={Math.min(height * sphere.top, maxTop)}
              />
            );
          })}
        </LinearGradient>
      ) : (
        <Animated.Image
          source={source}
          resizeMode="cover"
          style={[
            styles.scanBackgroundMotionImage,
            {
              width: width * (1 + horizontalOverscan * 2),
              height: height * (1 + verticalOverscan * 2),
              left: width * -horizontalOverscan,
              top: height * -verticalOverscan,
              transform: [
                { translateX },
                { translateY },
                { rotate },
                { scale },
                { scaleY: flipY ? -1 : 1 },
              ],
            },
          ]}
        />
      )}
    </View>
  );
}

type AppTextProps = PropsWithChildren<{
  style?: StyleProp<TextStyle>;
  role?: keyof typeof typeScale;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  numeric?: boolean;
  color?: string;
  numberOfLines?: number;
  onTextLayout?: TextProps['onTextLayout'];
}>;

const sfByWeight = {
  regular: fonts.sfRegular,
  medium: fonts.sfMedium,
  semibold: fonts.sfSemibold,
  bold: fonts.sfBold,
} as const;

export function AppText({
  children,
  style,
  role = 'body',
  weight = 'regular',
  numeric = false,
  color = colors.text.primary,
  numberOfLines,
  onTextLayout,
}: AppTextProps) {
  const content =
    typeof children === 'string' || typeof children === 'number'
      ? String(children)
          .split(/(сфера\.?)/gi)
          .map((segment, index) =>
            /^сфера\.?$/i.test(segment) ? (
              <Text
                key={`${segment}-${index}`}
                style={{ fontFamily: fonts.yaroRegular }}
              >
                {segment}
              </Text>
            ) : (
              segment
            ),
          )
      : children;

  return (
    <Text
      numberOfLines={numberOfLines}
      onTextLayout={onTextLayout}
      style={[
        typeScale[role],
        {
          color,
          fontFamily: sfByWeight[weight],
          fontVariant: numeric ? ['tabular-nums'] : undefined,
          includeFontPadding: false,
        },
        style,
      ]}
    >
      {content}
    </Text>
  );
}

type HeaderDateLabelProps = {
  date?: Date;
  dateColor?: string;
  label?: string;
  labelColor?: string;
};

export function HeaderDateLabel({
  date = new Date(),
  dateColor = colors.brand.primary,
  label = 'Сегодня',
  labelColor = colors.text.secondary,
}: HeaderDateLabelProps) {
  const dateParts = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).formatToParts(date);
  const day = dateParts.find((part) => part.type === 'day')?.value ?? '';
  const month = dateParts.find((part) => part.type === 'month')?.value ?? '';
  const capitalizedMonth = month
    ? `${month.charAt(0).toUpperCase()}${month.slice(1)}`
    : '';

  return (
    <View style={styles.headerDateLabel}>
      <AppText
        role="body"
        weight="medium"
        color={dateColor}
        style={styles.headerDateValue}
      >
        {`${day} ${capitalizedMonth}`.trim()}
      </AppText>
      <AppText
        role="caption"
        color={labelColor}
        style={styles.headerDateCaption}
      >
        {label}
      </AppText>
    </View>
  );
}

type LiquidGlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  variant?: GlassStyle;
  tintColor?: string;
  colorScheme?: GlassColorScheme;
  fallbackTint?: BlurTint;
  intensity?: number;
  washColor?: string;
  radius?: number;
  showFallbackDecoration?: boolean;
  androidTone?: 'light' | 'strong' | 'dark';
}>;

export function LiquidGlassSurface({
  children,
  style,
  variant = 'clear',
  tintColor,
  colorScheme = 'light',
  fallbackTint = 'systemUltraThinMaterialLight',
  intensity = 58,
  washColor = 'transparent',
  radius = radii.pill,
  showFallbackDecoration = true,
  androidTone = 'light',
}: LiquidGlassSurfaceProps) {
  return (
    <View
      pointerEvents={hasNativeLiquidGlass ? 'box-none' : 'none'}
      style={[
        styles.glassSurface,
        !hasNativeLiquidGlass && styles.clipped,
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
          style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
        >
          <View pointerEvents="none" style={styles.centerFill}>
            {children}
          </View>
        </GlassView>
      ) : (
        <>
          {Platform.OS === 'android' ? (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                androidMaterials[androidTone],
                { borderRadius: radius },
              ]}
            />
          ) : Platform.OS === 'web' ? (
            <View style={[StyleSheet.absoluteFill, styles.webGlassFallback]} />
          ) : (
            <FallbackGlassBackdrop
              decoration={showFallbackDecoration}
              intensity={intensity}
              radius={radius}
              tint={fallbackTint}
              tone="light"
              washColor={washColor}
            />
          )}
          {Platform.OS === 'web' ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: washColor }]}
            />
          ) : null}
          {showFallbackDecoration && Platform.OS === 'web' ? (
            <>
              <LinearGradient
                colors={[
                  'rgba(255,255,255,0.44)',
                  'rgba(255,255,255,0.08)',
                  'rgba(255,255,255,0.16)',
                ]}
                locations={[0, 0.48, 1]}
                start={{ x: 0.05, y: 0 }}
                end={{ x: 0.95, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View
                style={[
                  styles.fallbackStroke,
                  { borderRadius: radius },
                ]}
              />
            </>
          ) : null}
          <View pointerEvents="none" style={styles.centerFill}>
            {children}
          </View>
        </>
      )}
    </View>
  );
}

type GlassControlProps = PropsWithChildren<{
  accessibilityLabel: string;
  elevated?: boolean;
  onPress?: PressableProps['onPress'];
  style: StyleProp<ViewStyle>;
  tintColor?: string;
  washColor?: string;
}>;

export function GlassControl({
  accessibilityLabel,
  children,
  elevated = true,
  onPress,
  style,
  tintColor,
  washColor = 'transparent',
}: GlassControlProps) {
  if (hasNativeLiquidGlass) {
    return (
      <GlassView
        glassEffectStyle="clear"
        tintColor={tintColor}
        colorScheme="light"
        isInteractive
        style={[style, elevated && shadows.control]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={styles.glassPressTarget}
        >
          {children}
        </Pressable>
      </GlassView>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          style,
          androidMaterials.light,
          styles.androidGlassControlBorder,
          elevated && androidShadows.control,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => [
            StyleSheet.absoluteFillObject,
            pressed && styles.androidGlassPressed,
          ]}
        >
          <View pointerEvents="none" style={styles.androidGlassControlContent}>
            {children}
          </View>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[style, styles.fallbackGlassHost, shadows.control]}>
      <FallbackGlassBackdrop
        intensity={58}
        radius={radii.pill}
        tint="systemUltraThinMaterialLight"
        tone="light"
        washColor={washColor}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [
          styles.fallbackPressTarget,
          pressed && { transform: [{ scale: motion.pressedScale }] },
        ]}
      >
        <View pointerEvents="none" style={styles.fallbackGlassContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
}

type PrimaryButtonProps = {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  compact?: boolean;
};

export function PrimaryButton({
  label,
  icon,
  disabled = false,
  onPress,
  compact = false,
}: PrimaryButtonProps) {
  return (
    <View
      style={[
        styles.primaryButton,
        compact && styles.primaryButtonCompact,
        disabled && styles.primaryButtonDisabled,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.primaryButtonContent,
              compact && styles.primaryButtonContentCompact,
              pressed && !disabled && styles.pressed,
            ]}
          >
            {icon}
            <AppText role="label" weight="medium" color={colors.text.inverse}>
              {label}
            </AppText>
          </View>
        )}
      </Pressable>
    </View>
  );
}

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  tone?: 'white' | 'warm' | 'accent';
}>;

export function AppCard({ children, style, tone = 'white' }: AppCardProps) {
  return (
    <View
      style={[
        styles.card,
        tone === 'white' && styles.cardWhite,
        tone === 'warm' && styles.cardWarm,
        tone === 'accent' && styles.cardAccent,
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ProgressMeterProps = {
  value: number;
  total?: number;
};

export function ProgressMeter({ value, total = 24 }: ProgressMeterProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: total,
        now: value,
      }}
      style={styles.progress}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.progressBar,
            {
              backgroundColor:
                index < value ? colors.brand.success : colors.surface.divider,
            },
          ]}
        />
      ))}
    </View>
  );
}

type JournalAssessmentProps = {
  value: number;
  total?: number;
  title?: string;
  status?: string;
  leftCaption?: string;
  rightCaption?: string;
  comparisonPrimaryLabel?: string;
  comparisonSecondaryLabel?: string;
  variant?:
    | 'segments'
    | 'continuous'
    | 'week'
    | 'score'
    | 'levels'
    | 'ring'
    | 'comparison'
    | 'dots'
    | 'milestones'
    | 'balance'
    | 'matrix'
    | 'gauge'
    | 'fraction'
    | 'heatmap'
    | 'ladder'
    | 'checklist';
  previousResult?: string;
  bestResult?: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  actionVariant?: MetricActionButtonVariant;
  onPress?: PressableProps['onPress'];
};

export type MetricActionButtonVariant =
  | 'solid'
  | 'soft'
  | 'outline'
  | 'white'
  | 'burgundy'
  | 'glass'
  | 'split'
  | 'iconLeading'
  | 'textOnly'
  | 'completed';

type MetricActionButtonProps = {
  label: string;
  icon?: ReactNode;
  variant?: MetricActionButtonVariant;
  onPress?: PressableProps['onPress'];
};

export function MetricActionButton({
  label,
  icon,
  variant = 'solid',
  onPress,
}: MetricActionButtonProps) {
  const usesLightText =
    variant === 'solid' ||
    variant === 'burgundy' ||
    variant === 'split' ||
    variant === 'iconLeading' ||
    variant === 'completed';
  const labelColor = usesLightText ? colors.text.inverse : colors.brand.primary;
  const canUseProvidedIcon =
    icon &&
    (variant === 'solid' || variant === 'burgundy' || variant === 'completed');
  const arrow = canUseProvidedIcon ? (
    icon
  ) : (
    <AppText
      style={[
        styles.metricButtonArrow,
        {
          color:
            variant === 'split' || variant === 'iconLeading'
              ? colors.brand.primary
              : labelColor,
        },
      ]}
    >
      →
    </AppText>
  );

  const content =
    variant === 'split' ? (
      <>
        <AppText style={styles.metricButtonLabel} color={labelColor}>
          {label}
        </AppText>
        <View style={styles.metricButtonSplitIcon}>{arrow}</View>
      </>
    ) : variant === 'iconLeading' ? (
      <>
        <View style={styles.metricButtonLeadingIcon}>{arrow}</View>
        <AppText style={styles.metricButtonLabel} color={labelColor}>
          {label}
        </AppText>
      </>
    ) : (
      <>
        <AppText style={styles.metricButtonLabel} color={labelColor}>
          {label}
        </AppText>
        {arrow}
      </>
    );

  return (
    <View
      style={[
        styles.metricButton,
        variant === 'solid' && styles.metricButtonSolid,
        variant === 'soft' && styles.metricButtonSoft,
        variant === 'outline' && styles.metricButtonOutline,
        variant === 'white' && styles.metricButtonWhite,
        variant === 'burgundy' && styles.metricButtonBurgundy,
        variant === 'glass' && styles.metricButtonGlass,
        variant === 'split' && styles.metricButtonSplit,
        variant === 'iconLeading' && styles.metricButtonIconLeading,
        variant === 'textOnly' && styles.metricButtonTextOnly,
        variant === 'completed' && styles.metricButtonCompleted,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
      >
        {({ pressed }) => (
          <View
            style={[styles.metricButtonPressContent, pressed && styles.pressed]}
          >
            {variant === 'glass' ? (
              <LiquidGlassSurface
                variant="regular"
                colorScheme="light"
                tintColor="rgba(255,255,255,0.12)"
                radius={24}
              >
                <View style={styles.metricButtonContent}>{content}</View>
              </LiquidGlassSurface>
            ) : (
              content
            )}
          </View>
        )}
      </Pressable>
    </View>
  );
}

export type ScanActionGroupVariant =
  | 'solidPills'
  | 'softPills'
  | 'outlinePills'
  | 'whitePills'
  | 'glassPills'
  | 'segmentedSolid'
  | 'segmentedSoft'
  | 'tiles'
  | 'minimal'
  | 'floating';

type ScanAction = {
  label: string;
  icon: ReactNode;
  onPress?: PressableProps['onPress'];
};

type ScanActionGroupProps = {
  actions: ScanAction[];
  variant?: ScanActionGroupVariant;
};

export function ScanActionGroup({
  actions,
  variant = 'solidPills',
}: ScanActionGroupProps) {
  const isSegmented =
    variant === 'segmentedSolid' || variant === 'segmentedSoft';
  const usesLightText =
    variant === 'solidPills' || variant === 'segmentedSolid';
  const labelColor = usesLightText
    ? colors.text.inverse
    : variant === 'softPills' ||
        variant === 'outlinePills' ||
        variant === 'minimal'
      ? colors.brand.primary
      : colors.text.primary;

  return (
    <View
      style={[
        styles.scanActionGroup,
        isSegmented && styles.scanActionGroupSegmented,
        variant === 'segmentedSolid' && styles.scanActionGroupSegmentedSolid,
        variant === 'segmentedSoft' && styles.scanActionGroupSegmentedSoft,
      ]}
    >
      {actions.map((action, index) => {
        const content = (
          <View
            style={[
              styles.scanActionContent,
              variant === 'minimal' && styles.scanActionContentMinimal,
              variant === 'floating' && styles.scanActionContentFloating,
            ]}
          >
            <View
              style={[
                styles.scanActionIcon,
                variant === 'outlinePills' && styles.scanActionIconTransparent,
                variant === 'segmentedSoft' && styles.scanActionIconSoft,
                variant === 'tiles' && styles.scanActionIconWarm,
                variant === 'minimal' && styles.scanActionIconTransparent,
                variant === 'floating' && styles.scanActionIconFloating,
              ]}
            >
              {action.icon}
            </View>
            <AppText
              style={[
                styles.scanActionLabel,
                variant === 'floating' && styles.scanActionLabelFloating,
              ]}
              color={labelColor}
            >
              {action.label}
            </AppText>
          </View>
        );

        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.scanActionItem,
              variant === 'solidPills' && styles.scanActionSolid,
              variant === 'softPills' && styles.scanActionSoft,
              variant === 'outlinePills' && styles.scanActionOutline,
              variant === 'whitePills' && styles.scanActionWhite,
              variant === 'glassPills' && styles.scanActionGlass,
              isSegmented && styles.scanActionSegment,
              isSegmented && index > 0 && styles.scanActionSegmentDivider,
              variant === 'tiles' && styles.scanActionTile,
              variant === 'minimal' && styles.scanActionMinimal,
              variant === 'floating' && styles.scanActionFloating,
              pressed && styles.pressed,
            ]}
          >
            {variant === 'glassPills' ? (
              <LiquidGlassSurface
                variant="regular"
                colorScheme="light"
                tintColor="rgba(255,255,255,0.18)"
                radius={24}
              >
                {content}
              </LiquidGlassSurface>
            ) : (
              content
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export type InstructionCardVariant =
  | 'rail'
  | 'badge'
  | 'accent'
  | 'editorial'
  | 'progress'
  | 'glass'
  | 'numberTop'
  | 'timeline'
  | 'inverse'
  | 'minimal'
  | 'softHeader'
  | 'ring'
  | 'corner'
  | 'segments'
  | 'ticket'
  | 'illustrated';

type InstructionCardProps = {
  step: number;
  total?: number;
  text: string;
  variant?: InstructionCardVariant;
  height?: number;
  illustration?: ImageSourcePropType;
};

export function InstructionCard({
  step,
  total = 5,
  text,
  variant = 'rail',
  height = 150,
  illustration,
}: InstructionCardProps) {
  if (variant === 'illustrated') {
    return (
      <View
        style={[
          styles.instructionCard,
          styles.instructionIllustrated,
          { height },
        ]}
      >
        <View style={styles.instructionIllustratedCopy}>
          <View style={styles.instructionIllustratedMeta}>
            <View style={styles.instructionIllustratedStep}>
              <AppText
                numeric
                style={styles.instructionIllustratedStepText}
                color={colors.text.inverse}
              >
                {step}
              </AppText>
            </View>
            <TokenLabel>
              Шаг {step} из {total}
            </TokenLabel>
          </View>
          <AppText style={styles.instructionIllustratedBody}>{text}</AppText>
        </View>

        <View style={[styles.instructionIllustratedMedia, { height }]}>
          {illustration ? (
            <Image
              source={illustration}
              resizeMode="cover"
              style={[styles.instructionIllustratedImage, { height }]}
            />
          ) : (
            <AppText
              numeric
              style={styles.instructionIllustratedPlaceholder}
              color="rgba(211,20,113,0.13)"
            >
              {step}
            </AppText>
          )}
        </View>
      </View>
    );
  }

  if (variant === 'softHeader') {
    return (
      <View
        style={[
          styles.instructionCard,
          styles.instructionSoftHeader,
          { height },
        ]}
      >
        <View style={styles.instructionSoftHeaderTop}>
          <AppText
            numeric
            style={styles.instructionSoftHeaderNumber}
            color={colors.brand.primary}
          >
            {step})
          </AppText>
          <AppText role="caption" color={colors.brand.primary}>
            ШАГ {step} ИЗ {total}
          </AppText>
        </View>
        <AppText style={styles.instructionNewBody}>{text}</AppText>
      </View>
    );
  }

  if (variant === 'ring') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionRing, { height }]}
      >
        <View style={styles.instructionRingNumber}>
          <AppText
            numeric
            style={styles.instructionRingNumberText}
            color={colors.brand.primary}
          >
            {step}
          </AppText>
        </View>
        <View style={styles.instructionRingCopy}>
          <TokenLabel>
            Инструкция · {step}/{total}
          </TokenLabel>
          <AppText style={styles.instructionNewBody}>{text}</AppText>
        </View>
      </View>
    );
  }

  if (variant === 'corner') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionCorner, { height }]}
      >
        <AppText
          numeric
          style={styles.instructionCornerNumber}
          color="rgba(211,20,113,0.12)"
        >
          {step}
        </AppText>
        <View style={styles.instructionCornerCopy}>
          <TokenLabel>
            ШАГ {step} / {total}
          </TokenLabel>
          <AppText style={styles.instructionNewBody}>{text}</AppText>
        </View>
      </View>
    );
  }

  if (variant === 'segments') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionSegments, { height }]}
      >
        <View style={styles.instructionSegmentsTrack}>
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.instructionSegmentsPart,
                index < step && styles.instructionSegmentsPartFilled,
              ]}
            />
          ))}
        </View>
        <View style={styles.instructionSegmentsMeta}>
          <TokenLabel>Порядок действий</TokenLabel>
          <AppText numeric role="caption" color={colors.brand.primary}>
            {step}/{total}
          </AppText>
        </View>
        <AppText style={styles.instructionNewBody}>{text}</AppText>
      </View>
    );
  }

  if (variant === 'ticket') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionTicket, { height }]}
      >
        <View style={[styles.instructionTicketStub, { height }]}>
          <AppText
            numeric
            style={styles.instructionTicketNumber}
            color={colors.text.inverse}
          >
            {step})
          </AppText>
          <AppText numeric role="caption" color="rgba(255,255,255,0.70)">
            {step}/{total}
          </AppText>
        </View>
        <View style={styles.instructionTicketDivider} />
        <View style={styles.instructionTicketCopy}>
          <TokenLabel>Инструкция</TokenLabel>
          <AppText style={styles.instructionNewBody}>{text}</AppText>
        </View>
      </View>
    );
  }

  if (variant === 'glass') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionGlass, { height }]}
      >
        <View style={styles.instructionGlassBackdrop} />
        <LiquidGlassSurface
          variant="regular"
          colorScheme="light"
          tintColor="rgba(255,255,255,0.20)"
          washColor="rgba(255,255,255,0.20)"
          radius={30}
        >
          <View style={styles.instructionGlassContent}>
            <View style={styles.instructionGlassNumber}>
              <AppText
                numeric
                style={styles.instructionGlassNumberText}
                color={colors.brand.primary}
              >
                {step})
              </AppText>
            </View>
            <View style={styles.instructionGlassCopy}>
              <TokenLabel>
                Шаг {step} из {total}
              </TokenLabel>
              <AppText style={styles.instructionGlassBody}>{text}</AppText>
            </View>
          </View>
        </LiquidGlassSurface>
      </View>
    );
  }

  if (variant === 'numberTop') {
    return (
      <View
        style={[
          styles.instructionCard,
          styles.instructionNumberTop,
          { height },
        ]}
      >
        <View style={styles.instructionNumberTopHeader}>
          <AppText
            numeric
            style={styles.instructionNumberTopValue}
            color={colors.brand.primary}
          >
            {step})
          </AppText>
          <TokenLabel>
            {step} из {total}
          </TokenLabel>
        </View>
        <AppText style={styles.instructionNumberTopBody}>{text}</AppText>
      </View>
    );
  }

  if (variant === 'timeline') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionTimeline, { height }]}
      >
        <View style={styles.instructionTimelineRail}>
          <View style={styles.instructionTimelineLine} />
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.instructionTimelineDot,
                index < step && styles.instructionTimelineDotFilled,
              ]}
            />
          ))}
        </View>
        <View style={styles.instructionTimelineCopy}>
          <TokenLabel>Этап {step}</TokenLabel>
          <AppText style={styles.instructionTimelineBody}>{text}</AppText>
        </View>
      </View>
    );
  }

  if (variant === 'inverse') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionInverse, { height }]}
      >
        <View style={styles.instructionInverseHeader}>
          <AppText
            numeric
            style={styles.instructionInverseNumber}
            color={colors.text.inverse}
          >
            {step})
          </AppText>
          <AppText role="caption" color="rgba(255,255,255,0.68)">
            ШАГ {step} / {total}
          </AppText>
        </View>
        <AppText
          style={styles.instructionInverseBody}
          color={colors.text.inverse}
        >
          {text}
        </AppText>
      </View>
    );
  }

  if (variant === 'minimal') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionMinimal, { height }]}
      >
        <View style={styles.instructionMinimalTrack}>
          <View
            style={[
              styles.instructionMinimalFill,
              { width: `${(step / total) * 100}%` },
            ]}
          />
        </View>
        <View style={styles.instructionMinimalMeta}>
          <TokenLabel>Инструкция</TokenLabel>
          <AppText numeric role="caption" color={colors.brand.primary}>
            {step}/{total}
          </AppText>
        </View>
        <AppText style={styles.instructionMinimalBody}>{text}</AppText>
      </View>
    );
  }

  if (variant === 'badge') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionBadge, { height }]}
      >
        <View style={styles.instructionBadgeNumber}>
          <AppText
            numeric
            style={styles.instructionBadgeNumberText}
            color={colors.text.inverse}
          >
            {step}
          </AppText>
        </View>
        <View style={styles.instructionBadgeCopy}>
          <TokenLabel>
            Шаг {step} из {total}
          </TokenLabel>
          <AppText style={styles.instructionBody}>{text}</AppText>
        </View>
      </View>
    );
  }

  if (variant === 'accent') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionAccent, { height }]}
      >
        <View style={[styles.instructionAccentRail, { height }]}>
          <AppText
            numeric
            style={styles.instructionAccentNumber}
            color={colors.text.inverse}
          >
            {step})
          </AppText>
          <AppText role="caption" color="rgba(255,255,255,0.74)">
            из {total}
          </AppText>
        </View>
        <AppText style={styles.instructionAccentBody}>{text}</AppText>
      </View>
    );
  }

  if (variant === 'editorial') {
    return (
      <View
        style={[
          styles.instructionCard,
          styles.instructionEditorial,
          { height },
        ]}
      >
        <AppText
          numeric
          style={styles.instructionEditorialNumber}
          color="rgba(211,20,113,0.13)"
        >
          {step}
        </AppText>
        <View style={styles.instructionEditorialCopy}>
          <TokenLabel>
            Инструкция · {step}/{total}
          </TokenLabel>
          <AppText style={styles.instructionEditorialBody}>{text}</AppText>
        </View>
      </View>
    );
  }

  if (variant === 'progress') {
    return (
      <View
        style={[styles.instructionCard, styles.instructionProgress, { height }]}
      >
        <View style={styles.instructionProgressHeader}>
          <TokenLabel>
            Шаг {step} из {total}
          </TokenLabel>
          <View style={styles.instructionProgressDots}>
            {Array.from({ length: total }, (_, index) => (
              <View
                key={index}
                style={[
                  styles.instructionProgressDot,
                  index < step && styles.instructionProgressDotFilled,
                ]}
              />
            ))}
          </View>
        </View>
        <AppText style={styles.instructionProgressBody}>{text}</AppText>
      </View>
    );
  }

  return (
    <View style={[styles.instructionCard, styles.instructionRail, { height }]}>
      <View style={[styles.instructionRailNumber, { height }]}>
        <AppText numeric style={styles.instructionRailNumberText}>
          {step})
        </AppText>
      </View>
      <AppText style={styles.instructionRailBody}>{text}</AppText>
    </View>
  );
}

export type InstructionIntroCardVariant =
  | 'classic'
  | 'brand'
  | 'soft'
  | 'outline'
  | 'editorial'
  | 'split'
  | 'glass'
  | 'minimal'
  | 'framed'
  | 'imageHero';

type InstructionIntroCardProps = {
  title: string;
  illustration: ImageSourcePropType;
  variant?: InstructionIntroCardVariant;
  height?: number;
};

export function InstructionIntroCard({
  title,
  illustration,
  variant = 'classic',
  height = 150,
}: InstructionIntroCardProps) {
  if (variant === 'split') {
    return (
      <View
        style={[
          styles.instructionCard,
          styles.instructionIntroBase,
          styles.instructionIntroSplit,
          { height },
        ]}
      >
        <Image
          source={illustration}
          resizeMode="cover"
          style={styles.instructionIntroSplitImage}
        />
        <View style={styles.instructionIntroSplitCopy}>
          <TokenLabel>Сфера</TokenLabel>
          <AppText weight="semibold" style={styles.instructionIntroSplitTitle}>
            {title}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 'imageHero') {
    return (
      <View
        style={[
          styles.instructionCard,
          styles.instructionIntroBase,
          styles.instructionIntroHero,
          { height },
        ]}
      >
        <Image
          source={illustration}
          resizeMode="cover"
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.instructionIntroHeroTitle}>
          <AppText weight="semibold" style={styles.instructionIntroHeroText}>
            {title}
          </AppText>
        </View>
      </View>
    );
  }

  const content = (
    <View style={styles.instructionIntroContent}>
      {variant === 'editorial' ? (
        <AppText
          numeric
          style={styles.instructionIntroEditorialMark}
          color="rgba(211,20,113,0.11)"
        >
          01
        </AppText>
      ) : null}
      {variant === 'framed' ? (
        <View style={styles.instructionIntroInnerFrame} />
      ) : null}
      <AppText
        weight={variant === 'minimal' ? 'regular' : 'semibold'}
        color={variant === 'brand' ? colors.text.inverse : colors.text.primary}
        style={[
          styles.instructionIntroTitle,
          variant === 'editorial' && styles.instructionIntroEditorialTitle,
          variant === 'minimal' && styles.instructionIntroMinimalTitle,
        ]}
      >
        {title}
      </AppText>
      <Image
        source={illustration}
        resizeMode="cover"
        style={[
          styles.instructionIntroImage,
          variant === 'brand' && styles.instructionIntroBrandImage,
          variant === 'minimal' && styles.instructionIntroMinimalImage,
          variant !== 'minimal' && {
            top: height <= 130 ? 44 : 50,
            height: height <= 130 ? 72 : 82,
          },
        ]}
      />
      {variant === 'minimal' ? (
        <View style={styles.instructionIntroMinimalLine} />
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        styles.instructionCard,
        styles.instructionIntroBase,
        variant === 'classic' && styles.instructionIntroClassic,
        variant === 'brand' && styles.instructionIntroBrand,
        variant === 'soft' && styles.instructionIntroSoft,
        variant === 'outline' && styles.instructionIntroOutline,
        variant === 'editorial' && styles.instructionIntroEditorial,
        variant === 'glass' && styles.instructionIntroGlass,
        variant === 'minimal' && styles.instructionIntroMinimal,
        variant === 'framed' && styles.instructionIntroFramed,
        { height },
      ]}
    >
      {variant === 'glass' ? (
        <LiquidGlassSurface
          variant="regular"
          tintColor="rgba(255,255,255,0.20)"
          washColor="rgba(255,255,255,0.20)"
          radius={30}
        >
          {content}
        </LiquidGlassSurface>
      ) : (
        content
      )}
    </View>
  );
}

type InstructionCarouselProps = {
  instructions: string[];
  variant?: InstructionCardVariant;
  cardHeight?: number;
  illustrations?: Array<ImageSourcePropType | undefined>;
  introCard?: {
    title: string;
    illustration: ImageSourcePropType;
    variant?: InstructionIntroCardVariant;
  };
};

export function InstructionCarousel({
  instructions,
  variant = 'rail',
  cardHeight = 150,
  illustrations,
  introCard,
}: InstructionCarouselProps) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      decelerationRate="fast"
      disableIntervalMomentum
      showsHorizontalScrollIndicator={false}
      snapToInterval={370}
      style={[styles.instructionCarousel, { height: cardHeight }]}
      contentContainerStyle={styles.instructionCarouselContent}
    >
      {introCard ? (
        <InstructionIntroCard
          title={introCard.title}
          illustration={introCard.illustration}
          variant={introCard.variant}
          height={cardHeight}
        />
      ) : null}

      {instructions.map((text, index) => (
        <InstructionCard
          key={index}
          step={index + 1}
          total={instructions.length}
          text={text}
          variant={variant}
          height={cardHeight}
          illustration={illustrations?.[index]}
        />
      ))}
    </ScrollView>
  );
}

export type InstructionNavigationVariant =
  | 'original'
  | 'brand'
  | 'soft'
  | 'outline'
  | 'white'
  | 'glass'
  | 'square'
  | 'burgundy'
  | 'minimal'
  | 'double';

type InstructionNavigationProps = {
  variant?: InstructionNavigationVariant;
  leftDisabled?: boolean;
  rightDisabled?: boolean;
  onPrevious?: PressableProps['onPress'];
  onNext?: PressableProps['onPress'];
};

export function InstructionNavigation({
  variant = 'original',
  leftDisabled = true,
  rightDisabled = false,
  onPrevious,
  onNext,
}: InstructionNavigationProps) {
  const renderButton = (
    direction: 'left' | 'right',
    disabled: boolean,
    onPress?: PressableProps['onPress'],
  ) => {
    const glyphColor =
      variant === 'original' ||
      variant === 'brand' ||
      variant === 'square' ||
      variant === 'burgundy'
        ? colors.text.inverse
        : variant === 'minimal'
          ? colors.text.primary
          : colors.brand.primary;
    const button = (
      <View style={styles.instructionNavContent}>
        <Svg
          width={16}
          height={18}
          viewBox="0 0 16 18"
          style={
            direction === 'left' ? styles.instructionNavChevronLeft : undefined
          }
        >
          <Path
            d="M5 3L11 9L5 15"
            fill="none"
            stroke={glyphColor}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );

    return (
      <View
        style={[
          styles.instructionNavButton,
          variant === 'original' && styles.instructionNavOriginal,
          variant === 'brand' && styles.instructionNavBrand,
          variant === 'soft' && styles.instructionNavSoft,
          variant === 'outline' && styles.instructionNavOutline,
          variant === 'white' && styles.instructionNavWhite,
          variant === 'glass' && styles.instructionNavGlass,
          variant === 'square' && styles.instructionNavSquare,
          variant === 'burgundy' && styles.instructionNavBurgundy,
          variant === 'minimal' && styles.instructionNavMinimal,
          variant === 'double' && styles.instructionNavDouble,
          disabled && styles.instructionNavDisabled,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            direction === 'left' ? 'Предыдущий шаг' : 'Следующий шаг'
          }
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          style={styles.instructionNavPressTarget}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.instructionNavPressContent,
                pressed && !disabled && styles.pressed,
              ]}
            >
              {variant === 'glass' ? (
                <LiquidGlassSurface
                  variant="regular"
                  colorScheme="light"
                  tintColor="rgba(255,255,255,0.20)"
                  radius={20}
                >
                  {button}
                </LiquidGlassSurface>
              ) : (
                button
              )}
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.instructionNavigation}>
      {renderButton('left', leftDisabled, onPrevious)}
      {renderButton('right', rightDisabled, onNext)}
    </View>
  );
}

export function JournalAssessment({
  value,
  total = 24,
  title = 'Заполнение журнала',
  status = 'Хорошая регулярность',
  leftCaption = 'Начало месяца',
  rightCaption = 'Сегодня',
  comparisonPrimaryLabel = 'Сейчас',
  comparisonSecondaryLabel = 'Ранее',
  variant = 'segments',
  previousResult = '5/7',
  bestResult = '8/7',
  actionLabel = 'Заполнить',
  actionIcon,
  actionVariant = 'solid',
  onPress,
}: JournalAssessmentProps) {
  const percentage = Math.round((value / total) * 100);
  const completedDays = Math.round((value / total) * 7);
  const completedLevels = Math.round((value / total) * 5);
  const completedCount = Math.min(total, Math.max(0, value));
  const remainingCount = Math.max(0, total - completedCount);
  const ringRadius = 22.5;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const gaugeLength = Math.PI * 28;

  const visualization =
    variant === 'gauge' ? (
      <View style={styles.journalGauge}>
        <View style={styles.gaugeGraphic}>
          <Svg width={72} height={44} viewBox="0 0 72 44">
            <Path
              d="M8 38 A28 28 0 0 1 64 38"
              fill="none"
              stroke={colors.surface.divider}
              strokeWidth={7}
              strokeLinecap="round"
            />
            <Path
              d="M8 38 A28 28 0 0 1 64 38"
              fill="none"
              stroke={colors.brand.success}
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={gaugeLength}
              strokeDashoffset={gaugeLength * (1 - percentage / 100)}
            />
          </Svg>
          <AppText style={styles.gaugeValue}>{percentage}%</AppText>
        </View>
        <View style={styles.gaugeCopy}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.gaugeStatus}>{status}</AppText>
        </View>
      </View>
    ) : variant === 'fraction' ? (
      <View style={styles.journalFraction}>
        <AppText style={styles.fractionValue}>
          {completedCount}/{total}
        </AppText>
        <View style={styles.fractionCopy}>
          <AppText style={styles.ringTitle}>{title}</AppText>
          <AppText style={styles.ringStatus}>{status}</AppText>
        </View>
      </View>
    ) : variant === 'heatmap' ? (
      <View style={styles.journalHeatmap}>
        <View style={styles.heatmapCopy}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.heatmapStatus}>{status}</AppText>
        </View>
        <View style={styles.heatmapGrid}>
          {Array.from({ length: 14 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.heatmapCell,
                index < Math.round((percentage / 100) * 14) &&
                  styles.heatmapCellFilled,
              ]}
            />
          ))}
        </View>
      </View>
    ) : variant === 'ladder' ? (
      <View style={styles.journalLadder}>
        <View style={styles.journalTitleRow}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.levelStatus}>
            {completedCount}/{total}
          </AppText>
        </View>
        <View style={styles.ladderBars}>
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.ladderBar,
                {
                  height: 7 + index * 4,
                  backgroundColor:
                    index < completedCount
                      ? colors.brand.success
                      : colors.surface.divider,
                },
              ]}
            />
          ))}
        </View>
      </View>
    ) : variant === 'checklist' ? (
      <View style={styles.journalChecklist}>
        <AppText style={styles.journalTitle}>{title}</AppText>
        <View style={styles.checklistRows}>
          <View style={styles.checklistRow}>
            <View style={styles.checklistIcon}>
              <AppText style={styles.checklistCheck}>✓</AppText>
            </View>
            <AppText style={styles.checklistLabel}>Базовые</AppText>
            <AppText style={styles.checklistValue}>2/3</AppText>
          </View>
          <View style={styles.checklistRow}>
            <View style={styles.checklistIconMuted}>
              <AppText style={styles.checklistCheckMuted}>•</AppText>
            </View>
            <AppText style={styles.checklistLabel}>Расширенные</AppText>
            <AppText style={styles.checklistValue}>1/3</AppText>
          </View>
        </View>
      </View>
    ) : variant === 'dots' ? (
      <View style={styles.journalDots}>
        <AppText style={styles.journalTitle}>{title}</AppText>
        <View style={styles.numberedDots}>
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.numberedDot,
                index < completedCount && styles.numberedDotFilled,
              ]}
            >
              <AppText
                style={[
                  styles.numberedDotLabel,
                  index < completedCount && styles.numberedDotLabelFilled,
                ]}
              >
                {index + 1}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    ) : variant === 'milestones' ? (
      <View style={styles.journalMilestones}>
        <View style={styles.journalTitleRow}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.levelStatus}>
            {completedCount}/{total}
          </AppText>
        </View>
        <View style={styles.milestoneTrack}>
          <View style={styles.milestoneLine} />
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.milestoneNode,
                index < completedCount && styles.milestoneNodeFilled,
              ]}
            >
              {index < completedCount ? (
                <AppText style={styles.milestoneCheck}>✓</AppText>
              ) : null}
            </View>
          ))}
        </View>
        <AppText style={styles.journalResult}>{status}</AppText>
      </View>
    ) : variant === 'balance' ? (
      <View style={styles.journalBalance}>
        <AppText style={styles.journalTitle}>{title}</AppText>
        <View style={styles.balanceRow}>
          <View style={[styles.balancePill, styles.balancePillDone]}>
            <AppText style={styles.balanceValue}>{completedCount}</AppText>
            <AppText style={styles.balanceLabel}>пройдено</AppText>
          </View>
          <View style={[styles.balancePill, styles.balancePillLeft]}>
            <AppText style={styles.balanceValueMuted}>{remainingCount}</AppText>
            <AppText style={styles.balanceLabel}>осталось</AppText>
          </View>
        </View>
      </View>
    ) : variant === 'matrix' ? (
      <View style={styles.journalMatrix}>
        <View style={styles.matrixCopy}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.matrixStatus}>{status}</AppText>
        </View>
        <View style={styles.matrixGrid}>
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.matrixCell,
                index < completedCount && styles.matrixCellFilled,
              ]}
            >
              <AppText
                style={[
                  styles.matrixCellText,
                  index < completedCount && styles.matrixCellTextFilled,
                ]}
              >
                {index < completedCount ? '✓' : index + 1}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    ) : variant === 'ring' ? (
      <View style={styles.journalRing}>
        <View style={styles.ringGraphic}>
          <Svg width={58} height={58} viewBox="0 0 58 58">
            <Circle
              cx={29}
              cy={29}
              r={ringRadius}
              fill="none"
              stroke={colors.surface.divider}
              strokeWidth={7}
            />
            <Circle
              cx={29}
              cy={29}
              r={ringRadius}
              fill="none"
              stroke={colors.brand.success}
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringCircumference * (1 - percentage / 100)}
              transform="rotate(-90 29 29)"
            />
          </Svg>
          <AppText style={styles.ringValue}>{percentage}%</AppText>
        </View>
        <View style={styles.ringCopy}>
          <AppText style={styles.ringTitle}>{title}</AppText>
          <AppText style={styles.ringStatus}>{status}</AppText>
        </View>
      </View>
    ) : variant === 'comparison' ? (
      <View style={styles.journalComparison}>
        <AppText style={styles.journalTitle}>{title}</AppText>
        <View style={styles.comparisonRow}>
          <AppText style={styles.comparisonLabel}>
            {comparisonPrimaryLabel}
          </AppText>
          <View style={styles.comparisonTrack}>
            <View
              style={[styles.comparisonFill, { width: `${percentage}%` }]}
            />
          </View>
          <AppText style={styles.comparisonValue}>{percentage}%</AppText>
        </View>
        <View style={styles.comparisonRow}>
          <AppText style={styles.comparisonLabel}>
            {comparisonSecondaryLabel}
          </AppText>
          <View style={styles.comparisonTrack}>
            <View style={[styles.comparisonFillMuted, { width: '46%' }]} />
          </View>
          <AppText style={styles.comparisonValue}>46%</AppText>
        </View>
      </View>
    ) : variant === 'continuous' ? (
      <View style={styles.journalContinuous}>
        <View style={styles.journalTitleRow}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.journalPercent}>{percentage}%</AppText>
        </View>
        <View style={styles.continuousTrack}>
          <View style={[styles.continuousFill, { width: `${percentage}%` }]} />
        </View>
        <View style={styles.journalResults}>
          <AppText style={styles.journalResult}>{leftCaption}</AppText>
          <AppText style={styles.journalResult}>{rightCaption}</AppText>
        </View>
      </View>
    ) : variant === 'week' ? (
      <View style={styles.journalWeek}>
        <AppText style={styles.journalTitle}>
          Активность за последние 7 дней
        </AppText>
        <View style={styles.weekDays}>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => (
            <View key={day} style={styles.weekDay}>
              <View
                style={[
                  styles.weekDot,
                  index < completedDays && styles.weekDotFilled,
                ]}
              />
              <AppText style={styles.weekDayLabel}>{day}</AppText>
            </View>
          ))}
        </View>
      </View>
    ) : variant === 'score' ? (
      <View style={styles.journalScore}>
        <AppText style={styles.scoreValue}>{percentage}%</AppText>
        <View style={styles.scoreCopy}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.scoreStatus}>{status}</AppText>
        </View>
      </View>
    ) : variant === 'levels' ? (
      <View style={styles.journalLevels}>
        <View style={styles.journalTitleRow}>
          <AppText style={styles.journalTitle}>{title}</AppText>
          <AppText style={styles.levelStatus}>{completedLevels}/5</AppText>
        </View>
        <View style={styles.levelBars}>
          {Array.from({ length: 5 }, (_, index) => (
            <View
              key={index}
              style={[
                styles.levelBar,
                index < completedLevels && styles.levelBarFilled,
              ]}
            />
          ))}
        </View>
        <AppText style={styles.journalResult}>{status}</AppText>
      </View>
    ) : (
      <View style={styles.journalSegments}>
        <AppText style={styles.journalTitle}>{title}</AppText>

        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: total,
            now: value,
          }}
          style={styles.journalBars}
        >
          {Array.from({ length: total }, (_, index) => (
            <View
              key={index}
              style={[
                styles.journalBar,
                {
                  backgroundColor:
                    index < value
                      ? colors.brand.success
                      : colors.surface.divider,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.journalResults}>
          <AppText style={styles.journalResult}>
            Прошлый месяц {previousResult}
          </AppText>
          <AppText style={styles.journalResult}>
            Лучший результат {bestResult}
          </AppText>
        </View>
      </View>
    );

  return (
    <View style={styles.journalArea}>
      <View style={styles.journalInfo}>{visualization}</View>

      <MetricActionButton
        label={actionLabel}
        icon={actionIcon}
        variant={actionVariant}
        onPress={onPress}
      />
    </View>
  );
}

export type ScanTooltipKind =
  'qr' | 'test' | 'lowLight' | 'background' | 'locked';

export type ScanTooltipVariant =
  | 'glass'
  | 'dark'
  | 'light'
  | 'brand'
  | 'outline'
  | 'split'
  | 'status'
  | 'compact'
  | 'floating'
  | 'bubble';

const scanTooltipContent: Record<
  ScanTooltipKind,
  {
    eyebrow: string;
    message: string;
    tone: 'neutral' | 'warning' | 'success';
  }
> = {
  qr: {
    eyebrow: 'QR-код',
    message: 'Наведите камеру на QR-код',
    tone: 'neutral',
  },
  test: {
    eyebrow: 'Тест',
    message: 'Расположите тест внутри рамки',
    tone: 'neutral',
  },
  lowLight: {
    eyebrow: 'Освещение',
    message: 'Слишком темно — добавьте света',
    tone: 'warning',
  },
  background: {
    eyebrow: 'Фон',
    message: 'Переместите тест на однородный фон',
    tone: 'warning',
  },
  locked: {
    eyebrow: 'Готово',
    message: 'Отлично, не двигайте камеру',
    tone: 'success',
  },
};

function ScanTooltipGlyph({
  color,
  kind,
  size = 20,
}: {
  color: string;
  kind: ScanTooltipKind;
  size?: number;
}) {
  if (kind === 'qr') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (kind === 'test') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M5 8h14a4 4 0 0 1 0 8H5a4 4 0 0 1 0-8Z"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
        />
        <Circle cx="9" cy="12" r="1.5" fill={color} />
        <Path
          d="M14 10.5v3M17 10.5v3"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (kind === 'lowLight') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle
          cx="12"
          cy="12"
          r="3.8"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
        />
        <Path
          d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  if (kind === 'background') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M4 7h16M4 17h16M5 14l4-4 3 3 3-4 4 5"
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

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
        d="m7.8 12.2 2.7 2.7 5.9-6"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type ScanTooltipProps = {
  eyebrow?: string;
  floatingMaxWidth?: number;
  kind: ScanTooltipKind;
  message?: string;
  singleLine?: boolean;
  variant?: ScanTooltipVariant;
};

export function ScanTooltip({
  eyebrow,
  floatingMaxWidth = 300,
  kind,
  message,
  singleLine = false,
  variant = 'glass',
}: ScanTooltipProps) {
  const content = scanTooltipContent[kind];
  const tooltipMessage = message ?? content.message;
  const floatingTextLimit = Math.max(1, floatingMaxWidth - 77);
  const floatingMeasurementKey = `${tooltipMessage}:${floatingTextLimit}`;
  const [floatingMeasurement, setFloatingMeasurement] = useState({
    message: '',
    width: floatingTextLimit,
  });
  const floatingTextWidth =
    floatingMeasurement.message === floatingMeasurementKey
      ? floatingMeasurement.width
      : floatingTextLimit;

  const accentColor =
    content.tone === 'success'
      ? colors.brand.success
      : content.tone === 'warning'
        ? '#FFB45C'
        : colors.brand.primary;
  const usesLightCopy =
    variant === 'glass' ||
    variant === 'dark' ||
    variant === 'brand' ||
    variant === 'outline' ||
    variant === 'status' ||
    variant === 'bubble';
  const primaryColor = usesLightCopy ? '#FFFFFF' : colors.text.primary;
  const secondaryColor = usesLightCopy
    ? 'rgba(255,255,255,0.64)'
    : colors.text.secondary;
  const iconColor = variant === 'brand' ? '#FFFFFF' : accentColor;
  const body = (
    <>
      {variant === 'status' ? (
        <View
          style={[
            styles.scanTooltipStatusLine,
            { backgroundColor: accentColor },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.scanTooltipIcon,
          variant === 'split' && styles.scanTooltipSplitIcon,
          variant === 'floating' && styles.scanTooltipFloatingIcon,
          variant === 'brand' && styles.scanTooltipBrandIcon,
          variant === 'compact' && styles.scanTooltipCompactIcon,
          {
            backgroundColor:
              variant === 'brand'
                ? 'rgba(255,255,255,0.18)'
                : variant === 'outline' || variant === 'glass'
                  ? 'rgba(255,255,255,0.10)'
                  : `${accentColor}1F`,
          },
        ]}
      >
        <ScanTooltipGlyph
          color={iconColor}
          kind={kind}
          size={variant === 'compact' ? 18 : 20}
        />
      </View>
      <View
        style={[
          styles.scanTooltipCopy,
          (variant === 'dark' || variant === 'light') &&
            styles.scanTooltipCenteredCopy,
        ]}
      >
        {variant === 'status' || variant === 'bubble' ? (
          <AppText
            role="caption"
            weight="medium"
            color={secondaryColor}
            style={styles.scanTooltipEyebrow}
          >
            {eyebrow ?? content.eyebrow}
          </AppText>
        ) : null}
        <AppText
          role={variant === 'compact' ? 'caption' : 'label'}
          weight="medium"
          color={primaryColor}
          numberOfLines={variant === 'floating' && singleLine ? 1 : 2}
          style={styles.scanTooltipMessage}
          onTextLayout={
            variant === 'floating'
              ? (event) => {
                  if (floatingMeasurement.message === floatingMeasurementKey) {
                    return;
                  }

                  const measuredWidth = Math.ceil(
                    Math.max(
                      1,
                      ...event.nativeEvent.lines.map((line) => line.width),
                    ),
                  );
                  const nextWidth = Math.min(floatingTextLimit, measuredWidth);

                  setFloatingMeasurement({
                    message: floatingMeasurementKey,
                    width: nextWidth,
                  });
                }
              : undefined
          }
        >
          {tooltipMessage}
        </AppText>
      </View>
      {variant === 'split' ? (
        <View
          style={[
            styles.scanTooltipSplitStatus,
            { backgroundColor: accentColor },
          ]}
        />
      ) : null}
      {variant === 'bubble' ? <View style={styles.scanTooltipTail} /> : null}
    </>
  );

  if (variant === 'glass') {
    return (
      <View style={[styles.scanTooltip, styles.scanTooltipGlass]}>
        <LiquidGlassSurface
          variant="clear"
          colorScheme="auto"
          fallbackTint="default"
          washColor="transparent"
          radius={28}
          showFallbackDecoration={false}
        >
          <View style={styles.scanTooltipInner}>{body}</View>
        </LiquidGlassSurface>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.scanTooltip,
        styles.scanTooltipInner,
        variant === 'dark' && styles.scanTooltipDark,
        variant === 'light' && styles.scanTooltipLight,
        variant === 'brand' && [
          styles.scanTooltipBrand,
          { backgroundColor: accentColor },
        ],
        variant === 'outline' && styles.scanTooltipOutline,
        variant === 'split' && styles.scanTooltipSplit,
        variant === 'status' && styles.scanTooltipStatus,
        variant === 'compact' && styles.scanTooltipCompact,
        variant === 'floating' && [
          styles.scanTooltipFloating,
          { width: floatingTextWidth + 77 },
        ],
        variant === 'bubble' && styles.scanTooltipBubble,
      ]}
    >
      {body}
    </View>
  );
}

export type ScanHistoryVariant =
  | 'timeline'
  | 'cards'
  | 'compact'
  | 'calendar'
  | 'insights'
  | 'grouped'
  | 'testTypes'
  | 'archive'
  | 'comparison'
  | 'gallery';

export type ScanHistoryRecord = StoredScanRecord;

const scanHistoryRecords: ScanHistoryRecord[] = [
  {
    id: 'fixture-30-july',
    capturedAt: Date.UTC(2026, 6, 30, 11, 26),
    imageUri: '',
    day: '30',
    date: '30 июля',
    time: '14:26',
    type: 'Ovulation LH',
    result: 'Пик ЛГ',
    batch: 'A24-071',
    confidence: 96,
  },
  {
    id: 'fixture-28-july',
    capturedAt: Date.UTC(2026, 6, 28, 6, 12),
    imageUri: '',
    day: '28',
    date: '28 июля',
    time: '09:12',
    type: 'Pregnancy hCG',
    result: 'Отрицательный',
    batch: 'H24-043',
    confidence: 98,
  },
  {
    id: 'fixture-24-july',
    capturedAt: Date.UTC(2026, 6, 24, 15, 40),
    imageUri: '',
    day: '24',
    date: '24 июля',
    time: '18:40',
    type: 'Ovulation LH',
    result: 'Положительный',
    batch: 'A24-068',
    confidence: 94,
  },
];

function HistoryChevron({ color = colors.text.secondary }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="m7 4.5 4.5 4.5L7 13.5"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function HistoryFilterGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="M3 5h12M5.5 9h7M7.5 13h3"
        fill="none"
        stroke={colors.text.primary}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function HistoryStatus({
  result,
  compact = false,
  plain = false,
}: {
  result: ScanHistoryRecord['result'];
  compact?: boolean;
  plain?: boolean;
}) {
  const positive = result !== 'Отрицательный';
  const color = positive ? colors.brand.primary : colors.text.secondary;
  const backgroundColor = positive
    ? 'rgba(211,20,113,0.10)'
    : 'rgba(115,110,108,0.10)';

  return (
    <View
      style={[
        styles.historyStatus,
        compact && styles.historyStatusCompact,
        plain && styles.historyStatusPlain,
        { backgroundColor: plain ? 'transparent' : backgroundColor },
      ]}
    >
      <View style={[styles.historyStatusDot, { backgroundColor: color }]} />
      <AppText role="caption" weight="medium" color={color} numberOfLines={1}>
        {result}
      </AppText>
    </View>
  );
}

function HistoryFilter({
  labels = ['Все', 'Овуляция', 'Беременность'],
  active = 0,
  activeColor = colors.brand.burgundy,
  glass = false,
  onChange,
}: {
  labels?: string[];
  active?: number;
  activeColor?: string;
  glass?: boolean;
  onChange?: (index: number) => void;
}) {
  return (
    <View style={[styles.historyFilter, glass && styles.historyFilterGlass]}>
      {glass ? (
        <LiquidGlassSurface
          variant="clear"
          tintColor="rgba(255,255,255,0.34)"
          colorScheme="light"
          fallbackTint="systemUltraThinMaterialLight"
          intensity={64}
          washColor="rgba(255,255,255,0.16)"
          radius={19}
        />
      ) : null}
      {labels.map((label, index) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          accessibilityState={{ selected: index === active }}
          onPress={onChange ? () => onChange(index) : undefined}
          style={[
            styles.historyFilterItem,
            index === active && !glass && { backgroundColor: activeColor },
          ]}
        >
          {index === active && glass ? (
            <LiquidGlassSurface
              variant="clear"
              tintColor={activeColor}
              colorScheme="light"
              fallbackTint="systemMaterialLight"
              intensity={72}
              washColor="rgba(211,20,113,0.78)"
              radius={16}
            >
              <AppText
                role="caption"
                weight="semibold"
                color={colors.text.inverse}
                numberOfLines={1}
              >
                {label}
              </AppText>
            </LiquidGlassSurface>
          ) : (
            <AppText
              role="caption"
              weight={index === active ? 'semibold' : 'medium'}
              color={
                index === active ? colors.text.inverse : colors.text.secondary
              }
              numberOfLines={1}
            >
              {label}
            </AppText>
          )}
        </Pressable>
      ))}
    </View>
  );
}

function HistoryHeader({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.historyHeader}>
      <View style={styles.historyHeaderCopy}>
        <AppText role="title" weight="semibold">
          История сканирований
        </AppText>
        {subtitle ? (
          <AppText role="caption" color={colors.text.secondary}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <View style={styles.historyFilterButton}>
        <HistoryFilterGlyph />
      </View>
    </View>
  );
}

function TimelineHistory() {
  return (
    <>
      <HistoryHeader subtitle="3 результата в июле" />
      <HistoryFilter />
      <View style={styles.historyTimeline}>
        {scanHistoryRecords.map((record, index) => (
          <View
            key={`${record.date}-${record.time}`}
            style={styles.timelineRow}
          >
            <View style={styles.timelineRail}>
              <AppText
                numeric
                style={styles.timelineDay}
                color={index === 0 ? colors.brand.primary : colors.text.primary}
              >
                {record.day}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                июля
              </AppText>
              {index < scanHistoryRecords.length - 1 ? (
                <View style={styles.timelineLine} />
              ) : null}
            </View>
            <Pressable style={styles.timelineContent}>
              <View style={styles.historyRowTop}>
                <AppText role="label" weight="semibold">
                  {record.type}
                </AppText>
                <HistoryChevron />
              </View>
              <HistoryStatus result={record.result} compact />
              <AppText role="caption" color={colors.text.secondary}>
                {record.time} · партия {record.batch}
              </AppText>
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

function CardsHistory() {
  return (
    <>
      <HistoryHeader subtitle="Последние результаты" />
      <HistoryFilter />
      <View style={styles.historyCards}>
        {scanHistoryRecords.map((record, index) => (
          <Pressable
            key={`${record.date}-${record.time}`}
            style={[
              styles.historyResultCard,
              index === 0 && styles.historyResultCardFeatured,
            ]}
          >
            <View style={styles.historyRowTop}>
              <View style={styles.historyDatePair}>
                <AppText
                  role="caption"
                  weight="medium"
                  color={
                    index === 0
                      ? 'rgba(255,255,255,0.72)'
                      : colors.text.secondary
                  }
                >
                  {record.date.toUpperCase()} · {record.time}
                </AppText>
                <AppText
                  role="heading"
                  weight="semibold"
                  color={
                    index === 0 ? colors.text.inverse : colors.text.primary
                  }
                >
                  {record.type}
                </AppText>
              </View>
              <HistoryChevron
                color={
                  index === 0 ? 'rgba(255,255,255,0.76)' : colors.text.secondary
                }
              />
            </View>
            <View style={styles.historyCardBottom}>
              <AppText
                role="label"
                weight="semibold"
                color={
                  index === 0
                    ? colors.text.inverse
                    : record.result === 'Отрицательный'
                      ? colors.text.secondary
                      : colors.brand.primary
                }
              >
                {record.result}
              </AppText>
              <AppText
                numeric
                role="caption"
                color={
                  index === 0 ? 'rgba(255,255,255,0.72)' : colors.text.secondary
                }
              >
                {record.confidence}% · {record.batch}
              </AppText>
            </View>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function CompactHistory() {
  return (
    <>
      <HistoryHeader subtitle="Журнал результатов" />
      <HistoryFilter labels={['Все', 'LH', 'hCG']} />
      <View style={styles.compactTable}>
        <View style={styles.compactTableHeader}>
          <AppText role="caption" color={colors.text.secondary}>
            ДАТА / ТЕСТ
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            РЕЗУЛЬТАТ
          </AppText>
        </View>
        {scanHistoryRecords.map((record, index) => (
          <Pressable
            key={`${record.date}-${record.time}`}
            style={[styles.compactRow, index > 0 && styles.compactRowBorder]}
          >
            <View style={styles.compactDate}>
              <AppText numeric style={styles.compactDay}>
                {record.day}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                июл · {record.time}
              </AppText>
            </View>
            <View style={styles.compactType}>
              <AppText role="label" weight="medium">
                {record.type}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {record.batch}
              </AppText>
            </View>
            <View style={styles.compactResult}>
              <HistoryStatus result={record.result} compact />
              <AppText numeric role="caption" color={colors.text.secondary}>
                {record.confidence}%
              </AppText>
            </View>
            <HistoryChevron />
          </Pressable>
        ))}
      </View>
      <View style={styles.compactSummary}>
        <AppText role="caption" color={colors.text.secondary}>
          Июль
        </AppText>
        <AppText role="label" weight="medium">
          3 сканирования · средняя уверенность 96%
        </AppText>
      </View>
    </>
  );
}

const calendarDays = [
  '',
  '',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '',
  '',
  '',
];

function CalendarHistory() {
  return (
    <>
      <HistoryHeader subtitle="Июль 2026" />
      <HistoryFilter labels={['Месяц', 'Список']} />
      <View style={styles.historyCalendar}>
        <View style={styles.calendarMonthHeader}>
          <View style={styles.calendarPrevious}>
            <HistoryChevron color={colors.text.secondary} />
          </View>
          <AppText role="label" weight="semibold">
            Июль
          </AppText>
          <HistoryChevron color={colors.text.secondary} />
        </View>
        <View style={styles.calendarWeek}>
          {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day) => (
            <AppText
              key={day}
              role="caption"
              weight="medium"
              color={colors.text.secondary}
              style={styles.calendarWeekDay}
            >
              {day}
            </AppText>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {calendarDays.map((day, index) => {
            const hasScan = day === '24' || day === '28' || day === '30';
            const selected = day === '30';

            return (
              <View
                key={`${day}-${index}`}
                style={[
                  styles.calendarDay,
                  selected && styles.calendarDaySelected,
                ]}
              >
                <AppText
                  numeric
                  role="caption"
                  color={selected ? colors.text.inverse : colors.text.primary}
                >
                  {day}
                </AppText>
                {hasScan ? (
                  <View
                    style={[
                      styles.calendarDot,
                      selected && styles.calendarDotSelected,
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.calendarSelection}>
        <AppText role="caption" color={colors.text.secondary}>
          30 ИЮЛЯ · 14:26
        </AppText>
        <Pressable style={styles.calendarResultRow}>
          <View style={styles.calendarResultCopy}>
            <AppText role="label" weight="semibold">
              Ovulation LH
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              Пик ЛГ · уверенность 96%
            </AppText>
          </View>
          <HistoryChevron />
        </Pressable>
      </View>
    </>
  );
}

function InsightsHistory() {
  const chart = [34, 46, 30, 58, 44, 72, 88];

  return (
    <>
      <HistoryHeader subtitle="Динамика за 30 дней" />
      <HistoryFilter labels={['30 дней', '3 месяца', 'Год']} />
      <View style={styles.insightsHero}>
        <View style={styles.insightsMetric}>
          <AppText
            numeric
            style={styles.insightsMetricValue}
            color={colors.text.inverse}
          >
            7
          </AppText>
          <AppText role="caption" color="rgba(255,255,255,0.72)">
            сканирований
          </AppText>
        </View>
        <View style={styles.insightsChart}>
          {chart.map((height, index) => (
            <View key={index} style={styles.insightsBarTrack}>
              <View
                style={[
                  styles.insightsBar,
                  {
                    height,
                    opacity: index === chart.length - 1 ? 1 : 0.46,
                  },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.insightsAxis}>
          <AppText role="caption" color="rgba(255,255,255,0.58)">
            1 июл
          </AppText>
          <AppText role="caption" color="rgba(255,255,255,0.58)">
            сегодня
          </AppText>
        </View>
      </View>
      <View style={styles.insightsStats}>
        <View style={styles.insightsStat}>
          <AppText numeric role="heading" color={colors.brand.primary}>
            96%
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            средняя уверенность
          </AppText>
        </View>
        <View style={styles.insightsStatDivider} />
        <View style={styles.insightsStat}>
          <AppText numeric role="heading">
            3
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            результата в июле
          </AppText>
        </View>
      </View>
      <View style={styles.insightsRecent}>
        <AppText role="label" weight="semibold">
          Последние
        </AppText>
        {scanHistoryRecords.slice(0, 2).map((record, index) => (
          <Pressable
            key={`${record.date}-${record.time}`}
            style={[
              styles.insightsRecentRow,
              index > 0 && styles.compactRowBorder,
            ]}
          >
            <View style={styles.insightsRecentDate}>
              <AppText numeric role="heading">
                {record.day}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                июля
              </AppText>
            </View>
            <View style={styles.compactType}>
              <AppText role="label" weight="medium">
                {record.type}
              </AppText>
              <HistoryStatus result={record.result} compact />
            </View>
            <HistoryChevron />
          </Pressable>
        ))}
      </View>
    </>
  );
}

function GroupedHistory() {
  return (
    <>
      <HistoryHeader subtitle="Сгруппировано по дням" />
      <HistoryFilter labels={['Все', 'Эта неделя', 'Ранее']} />
      <View style={styles.groupedMonthHeader}>
        <AppText role="label" weight="semibold">
          Июль 2026
        </AppText>
        <AppText numeric role="caption" color={colors.text.secondary}>
          3 результата
        </AppText>
      </View>
      <View style={styles.groupedHistoryList}>
        {scanHistoryRecords.map((record, index) => (
          <View key={`${record.date}-${record.time}`} style={styles.groupedDay}>
            <View style={styles.groupedDateBlock}>
              <AppText
                numeric
                style={styles.groupedDateNumber}
                color={index === 0 ? colors.brand.primary : colors.text.primary}
              >
                {record.day}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {index === 0 ? 'сегодня' : 'июля'}
              </AppText>
            </View>
            <Pressable style={styles.groupedResultRow}>
              <View style={styles.groupedResultCopy}>
                <View style={styles.historyRowTop}>
                  <AppText role="label" weight="semibold">
                    {record.type}
                  </AppText>
                  <AppText numeric role="caption" color={colors.text.secondary}>
                    {record.time}
                  </AppText>
                </View>
                <HistoryStatus result={record.result} compact />
                <AppText role="caption" color={colors.text.secondary}>
                  Партия {record.batch} · уверенность {record.confidence}%
                </AppText>
              </View>
              <HistoryChevron />
            </Pressable>
          </View>
        ))}
      </View>
    </>
  );
}

function TestTypesHistory() {
  const ovulationRecords = scanHistoryRecords.filter(
    (record) => record.type === 'Ovulation LH',
  );
  const pregnancyRecord = scanHistoryRecords.find(
    (record) => record.type === 'Pregnancy hCG',
  );

  return (
    <>
      <HistoryHeader subtitle="Результаты по категории" />
      <View style={styles.testTypeSummaryRow}>
        <View style={[styles.testTypeSummary, styles.testTypeSummaryActive]}>
          <AppText role="caption" color="rgba(255,255,255,0.68)">
            ОВУЛЯЦИЯ · LH
          </AppText>
          <AppText
            numeric
            style={styles.testTypeSummaryValue}
            color={colors.text.inverse}
          >
            2
          </AppText>
          <AppText role="caption" color="rgba(255,255,255,0.76)">
            последний: пик ЛГ
          </AppText>
        </View>
        <View style={styles.testTypeSummary}>
          <AppText role="caption" color={colors.text.secondary}>
            БЕРЕМЕННОСТЬ · hCG
          </AppText>
          <AppText numeric style={styles.testTypeSummaryValue}>
            1
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            отрицательный
          </AppText>
        </View>
      </View>
      <View style={styles.testTypeSection}>
        <View style={styles.testTypeSectionHeader}>
          <AppText role="label" weight="semibold">
            Овуляция
          </AppText>
          <AppText role="caption" color={colors.brand.primary}>
            Смотреть все
          </AppText>
        </View>
        {ovulationRecords.map((record, index) => (
          <Pressable
            key={`${record.date}-${record.time}`}
            style={[styles.testTypeRow, index > 0 && styles.compactRowBorder]}
          >
            <View style={styles.testTypeDate}>
              <AppText numeric role="heading">
                {record.day}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                июля
              </AppText>
            </View>
            <View style={styles.compactType}>
              <HistoryStatus result={record.result} compact />
              <AppText role="caption" color={colors.text.secondary}>
                {record.time} · {record.confidence}%
              </AppText>
            </View>
            <HistoryChevron />
          </Pressable>
        ))}
      </View>
      {pregnancyRecord ? (
        <Pressable style={styles.testTypePregnancyRow}>
          <View style={styles.compactType}>
            <AppText role="label" weight="semibold">
              Беременность
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              {pregnancyRecord.date} · {pregnancyRecord.time}
            </AppText>
          </View>
          <HistoryStatus result={pregnancyRecord.result} compact />
          <HistoryChevron />
        </Pressable>
      ) : null}
    </>
  );
}

function ArchiveHistory() {
  return (
    <>
      <HistoryHeader subtitle="Архив за 2026 год" />
      <HistoryFilter labels={['2026', '2025', 'Все годы']} />
      <View style={styles.archiveHero}>
        <View>
          <AppText role="caption" color="rgba(255,255,255,0.68)">
            ВСЕГО ЗА ГОД
          </AppText>
          <AppText
            numeric
            style={styles.archiveHeroValue}
            color={colors.text.inverse}
          >
            18
          </AppText>
        </View>
        <View style={styles.archiveHeroStats}>
          <AppText role="caption" color="rgba(255,255,255,0.76)">
            12 LH
          </AppText>
          <AppText role="caption" color="rgba(255,255,255,0.76)">
            6 hCG
          </AppText>
        </View>
      </View>
      <View style={styles.archiveMonths}>
        {[
          {
            month: 'Июль',
            count: 3,
            detail: '2 LH · 1 hCG',
            open: true,
          },
          {
            month: 'Июнь',
            count: 5,
            detail: '4 LH · 1 hCG',
            open: false,
          },
          {
            month: 'Май',
            count: 4,
            detail: '3 LH · 1 hCG',
            open: false,
          },
          {
            month: 'Апрель',
            count: 6,
            detail: '3 LH · 3 hCG',
            open: false,
          },
        ].map((month, index) => (
          <Pressable
            key={month.month}
            style={[
              styles.archiveMonthRow,
              index > 0 && styles.compactRowBorder,
            ]}
          >
            <View style={styles.archiveMonthCopy}>
              <AppText role="label" weight="semibold">
                {month.month}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {month.detail}
              </AppText>
            </View>
            <View style={styles.archiveMonthCount}>
              <AppText
                numeric
                role="heading"
                color={month.open ? colors.brand.primary : colors.text.primary}
              >
                {month.count}
              </AppText>
              <View style={month.open ? styles.archiveChevronOpen : undefined}>
                <HistoryChevron />
              </View>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.archiveFootnote}>
        <AppText role="caption" color={colors.text.secondary}>
          Результаты хранятся на устройстве и доступны без интернета
        </AppText>
      </View>
    </>
  );
}

function ComparisonHistory() {
  const current = scanHistoryRecords[0];
  const previous = scanHistoryRecords[2];

  return (
    <>
      <HistoryHeader subtitle="Сравните динамику результата" />
      <HistoryFilter labels={['Овуляция', 'Беременность']} />
      <View style={styles.comparisonHero}>
        <AppText role="caption" color={colors.text.secondary}>
          ИЗМЕНЕНИЕ ЗА 6 ДНЕЙ
        </AppText>
        <View style={styles.comparisonMetricRow}>
          <AppText
            numeric
            style={styles.comparisonMetric}
            color={colors.brand.primary}
          >
            +18%
          </AppText>
          <View style={styles.comparisonTrendPill}>
            <AppText
              role="caption"
              weight="semibold"
              color={colors.brand.primary}
            >
              рост сигнала
            </AppText>
          </View>
        </View>
        <View style={styles.comparisonLineTrack}>
          <View style={styles.comparisonLineFill} />
          <View
            style={[styles.comparisonLineDot, styles.comparisonLineDotStart]}
          />
          <View
            style={[styles.comparisonLineDot, styles.comparisonLineDotEnd]}
          />
        </View>
        <View style={styles.comparisonLineLabels}>
          <AppText role="caption" color={colors.text.secondary}>
            24 июля
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            30 июля
          </AppText>
        </View>
      </View>
      <View style={styles.comparisonColumns}>
        {[previous, current].map((record, index) => (
          <Pressable
            key={`${record.date}-${record.time}`}
            style={[
              styles.comparisonResult,
              index === 1 && styles.comparisonResultCurrent,
            ]}
          >
            <AppText role="caption" color={colors.text.secondary}>
              {index === 1 ? 'ТЕКУЩИЙ' : 'ПРЕДЫДУЩИЙ'}
            </AppText>
            <AppText
              numeric
              style={styles.comparisonDay}
              color={index === 1 ? colors.brand.primary : colors.text.primary}
            >
              {record.day}
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              июля · {record.time}
            </AppText>
            <HistoryStatus result={record.result} compact />
            <AppText numeric role="caption" color={colors.text.secondary}>
              уверенность {record.confidence}%
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.comparisonNote}>
        <View style={styles.comparisonNoteDot} />
        <AppText
          role="caption"
          color={colors.text.secondary}
          style={styles.comparisonNoteText}
        >
          Интенсивность тестовой линии выросла. Последний результат
          соответствует пику ЛГ.
        </AppText>
      </View>
    </>
  );
}

function GalleryHistory({
  records = scanHistoryRecords,
  showHeader = true,
  showFilter = true,
  onResultPress,
}: {
  records?: ScanHistoryRecord[];
  showHeader?: boolean;
  showFilter?: boolean;
  onResultPress?: (record: ScanHistoryRecord) => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const filteredRecords = [...records]
    .sort((left, right) => right.capturedAt - left.capturedAt)
    .filter((record) => {
      if (activeTab === 1) {
        return record.type === 'Pregnancy hCG';
      }

      if (activeTab === 2) {
        return record.type === 'Ovulation LH';
      }

      return true;
    });
  const featuredRecord = filteredRecords[0];

  return (
    <>
      {showHeader ? <HistoryHeader subtitle="Снимки и результаты" /> : null}
      {showFilter ? (
        <HistoryFilter
          labels={['Все', 'Беременность', 'Овуляция']}
          active={activeTab}
          activeColor={colors.brand.primary}
          glass
          onChange={setActiveTab}
        />
      ) : null}
      {featuredRecord ? (
        <Pressable
          onPress={() => onResultPress?.(featuredRecord)}
          style={styles.galleryFeatured}
        >
          <View style={styles.galleryImageFrame}>
            {featuredRecord.imageUri ? (
              <Image
                source={{ uri: featuredRecord.imageUri }}
                resizeMode="cover"
                style={styles.galleryCapturedImage}
              />
            ) : (
              <AppText role="label" color={colors.text.secondary}>
                Снимок недоступен
              </AppText>
            )}
            {featuredRecord.result !== 'Пик ЛГ' ? (
              <View style={styles.galleryPlainResult}>
                <HistoryStatus result={featuredRecord.result} compact plain />
              </View>
            ) : null}
          </View>
          <View style={styles.galleryFeaturedCopy}>
            <View style={styles.compactType}>
              <AppText role="heading" weight="semibold">
                {featuredRecord.date}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {featuredRecord.type} · {featuredRecord.time}
              </AppText>
            </View>
            <HistoryChevron />
          </View>
        </Pressable>
      ) : null}
      {!featuredRecord ? (
        <View style={styles.galleryEmptyState}>
          <AppText role="heading" weight="semibold">
            Снимков пока нет
          </AppText>
          <AppText
            role="label"
            color={colors.text.secondary}
            style={styles.galleryEmptyDescription}
          >
            После первого подтверждённого сканирования здесь появится реальный
            снимок теста.
          </AppText>
        </View>
      ) : null}
      <View style={styles.galleryList}>
        {filteredRecords.slice(1).map((record, index) => (
          <Pressable
            key={record.id}
            onPress={() => onResultPress?.(record)}
            style={styles.galleryRow}
          >
            <View style={styles.galleryThumbnail}>
              {record.imageUri ? (
                <Image
                  source={{ uri: record.imageUri }}
                  resizeMode="cover"
                  style={styles.galleryCapturedImage}
                />
              ) : (
                <AppText
                  role="caption"
                  color={colors.text.secondary}
                  style={styles.galleryUnavailableText}
                >
                  Снимок недоступен
                </AppText>
              )}
            </View>
            <View style={styles.compactType}>
              <AppText role="label" weight="semibold">
                {record.date}
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                {record.type} · {record.time}
              </AppText>
              <HistoryStatus result={record.result} compact plain />
            </View>
            <HistoryChevron />
          </Pressable>
        ))}
      </View>
    </>
  );
}

export function ScanHistoryPreview({
  hideFilter = false,
  records,
  variant = 'timeline',
  standalone = false,
  onResultPress,
}: {
  hideFilter?: boolean;
  records?: ScanHistoryRecord[];
  variant?: ScanHistoryVariant;
  standalone?: boolean;
  onResultPress?: (record: ScanHistoryRecord) => void;
}) {
  return (
    <View
      style={[
        styles.scanHistoryPreview,
        standalone && styles.scanHistoryScreen,
      ]}
    >
      {variant === 'timeline' ? <TimelineHistory /> : null}
      {variant === 'cards' ? <CardsHistory /> : null}
      {variant === 'compact' ? <CompactHistory /> : null}
      {variant === 'calendar' ? <CalendarHistory /> : null}
      {variant === 'insights' ? <InsightsHistory /> : null}
      {variant === 'grouped' ? <GroupedHistory /> : null}
      {variant === 'testTypes' ? <TestTypesHistory /> : null}
      {variant === 'archive' ? <ArchiveHistory /> : null}
      {variant === 'comparison' ? <ComparisonHistory /> : null}
      {variant === 'gallery' ? (
        <GalleryHistory
          records={records}
          showFilter={!hideFilter}
          showHeader={!standalone}
          onResultPress={onResultPress}
        />
      ) : null}
    </View>
  );
}

export function TokenLabel({ children }: PropsWithChildren) {
  return (
    <AppText
      role="caption"
      color={colors.text.secondary}
      style={styles.tokenLabel}
    >
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  segmentedSwitcher: {
    width: '100%',
    height: 46,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#F0EEF0',
  },
  segmentedSwitcherIndicator: {
    position: 'absolute',
    left: 4,
    top: 4,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.surface.raised,
    shadowColor: '#251119',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentedSwitcherOptionSlot: {
    zIndex: 1,
    flex: 1,
    minHeight: 38,
  },
  segmentedSwitcherOption: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 11,
  },
  segmentedSwitcherLabelSlot: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedSwitcherLabel: {
    fontSize: 12.5,
    lineHeight: 15,
    letterSpacing: -0.16,
    textAlign: 'center',
  },
  segmentedSwitcherLabelSelected: {
    color: colors.text.primary,
    fontFamily: fonts.sfMedium,
  },
  segmentedSwitcherLabelInactive: {
    color: colors.text.secondary,
    fontFamily: fonts.sfRegular,
  },
  glassSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  clipped: {
    overflow: 'hidden',
  },
  androidGlassFallback: {
    backgroundColor: 'rgba(255,255,255,0.68)',
  },
  androidMaterialControl: {
    overflow: 'hidden',
    borderWidth: 0.8,
    borderColor: '#ECDDE2',
    backgroundColor: '#FFFDFC',
  },
  centerFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassPressTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackGlassContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackGlassHost: {
    position: 'relative',
  },
  fallbackPressTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  headerDateLabel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDateValue: {
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerDateCaption: {
    marginTop: -1,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.12,
    textAlign: 'center',
  },
  webGlassFallback: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  fallbackStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.48)',
  },
  androidGlassStroke: {
    borderWidth: 1,
    borderColor: 'rgba(74,52,61,0.10)',
  },
  androidGlassPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.98 }],
  },
  androidGlassControlClip: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  androidGlassControlBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
  },
  androidGlassMaterialFill: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 999,
    overflow: 'hidden',
  },
  androidGlassControlContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: colors.brand.primary,
  },
  primaryButtonContent: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonCompact: {
    minHeight: 40,
  },
  primaryButtonContentCompact: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.state.disabled,
  },
  pressed: {
    opacity: motion.pressedOpacity,
    transform: [{ scale: 0.985 }],
  },
  card: {
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  cardWhite: {
    backgroundColor: colors.surface.raised,
  },
  cardWarm: {
    backgroundColor: colors.surface.warm,
  },
  cardAccent: {
    backgroundColor: colors.brand.primary,
  },
  progress: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  progressBar: {
    flex: 1,
    height: 14,
    borderRadius: 3,
  },
  journalArea: {
    width: 370,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  journalInfo: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
  },
  journalSegments: {
    width: 240,
    gap: 3,
  },
  journalTitle: {
    color: '#5D5D5D',
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
  },
  journalBars: {
    width: 240,
    height: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  journalBar: {
    width: 2,
    height: 20,
    borderRadius: 1,
  },
  journalResults: {
    width: 240,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  journalResult: {
    color: '#5D5D5D',
    fontSize: 12.5,
    lineHeight: 15,
    letterSpacing: -0.25,
  },
  journalContinuous: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 5,
  },
  journalTitleRow: {
    width: 240,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  journalPercent: {
    color: colors.brand.success,
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
  },
  continuousTrack: {
    width: 240,
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: colors.surface.divider,
  },
  continuousFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.success,
  },
  journalWeek: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 7,
  },
  weekDays: {
    width: 240,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekDay: {
    width: 24,
    alignItems: 'center',
    gap: 3,
  },
  weekDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface.divider,
  },
  weekDotFilled: {
    backgroundColor: colors.brand.success,
  },
  weekDayLabel: {
    color: '#5D5D5D',
    fontSize: 11,
    lineHeight: 12,
    letterSpacing: -0.22,
  },
  journalScore: {
    width: 240,
    height: 58,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  scoreValue: {
    color: colors.brand.success,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.68,
  },
  scoreCopy: {
    flex: 1,
    paddingBottom: 3,
    gap: 4,
  },
  scoreStatus: {
    color: colors.text.primary,
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: -0.3,
  },
  journalLevels: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 5,
  },
  levelStatus: {
    color: colors.brand.success,
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
  },
  levelBars: {
    width: 240,
    height: 10,
    flexDirection: 'row',
    gap: 4,
  },
  levelBar: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface.divider,
  },
  levelBarFilled: {
    backgroundColor: colors.brand.success,
  },
  journalRing: {
    width: 240,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ringGraphic: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    position: 'absolute',
    color: colors.brand.success,
    fontSize: 13.5,
    lineHeight: 15,
    letterSpacing: -0.27,
  },
  ringCopy: {
    flex: 1,
    gap: 3,
  },
  ringTitle: {
    color: '#5D5D5D',
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: -0.3,
  },
  ringStatus: {
    color: colors.text.primary,
    fontSize: 17.5,
    lineHeight: 20,
    letterSpacing: -0.35,
  },
  journalComparison: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 3,
  },
  comparisonRow: {
    width: 240,
    height: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  comparisonLabel: {
    width: 45,
    color: '#5D5D5D',
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.24,
  },
  comparisonTrack: {
    width: 136,
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: colors.surface.divider,
  },
  comparisonFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.success,
  },
  comparisonFillMuted: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.secondary,
  },
  comparisonValue: {
    width: 41,
    color: colors.text.primary,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.24,
    textAlign: 'right',
  },
  journalDots: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 7,
  },
  numberedDots: {
    width: 240,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  numberedDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberedDotFilled: {
    backgroundColor: colors.brand.success,
  },
  numberedDotLabel: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
  },
  numberedDotLabelFilled: {
    color: colors.text.inverse,
  },
  journalMilestones: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 4,
  },
  milestoneTrack: {
    width: 240,
    height: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  milestoneLine: {
    position: 'absolute',
    left: 7,
    right: 7,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.surface.divider,
  },
  milestoneNode: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.surface.divider,
    backgroundColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneNodeFilled: {
    borderColor: colors.brand.success,
    backgroundColor: colors.brand.success,
  },
  milestoneCheck: {
    color: colors.text.inverse,
    fontSize: 9,
    lineHeight: 10,
  },
  journalBalance: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 5,
  },
  balanceRow: {
    width: 240,
    flexDirection: 'row',
    gap: 6,
  },
  balancePill: {
    flex: 1,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  balancePillDone: {
    backgroundColor: 'rgba(31,187,116,0.14)',
  },
  balancePillLeft: {
    backgroundColor: colors.surface.warm,
  },
  balanceValue: {
    color: colors.brand.success,
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.36,
  },
  balanceValueMuted: {
    color: colors.brand.primary,
    fontSize: 18,
    lineHeight: 20,
    letterSpacing: -0.36,
  },
  balanceLabel: {
    color: colors.text.primary,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: -0.22,
  },
  journalMatrix: {
    width: 240,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matrixCopy: {
    width: 112,
    gap: 4,
  },
  matrixStatus: {
    color: colors.text.primary,
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
  },
  matrixGrid: {
    width: 116,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
  },
  matrixCell: {
    width: 34,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.surface.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixCellFilled: {
    backgroundColor: colors.brand.success,
  },
  matrixCellText: {
    color: colors.text.secondary,
    fontSize: 11,
    lineHeight: 12,
    letterSpacing: -0.22,
  },
  matrixCellTextFilled: {
    color: colors.text.inverse,
  },
  journalGauge: {
    width: 240,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gaugeGraphic: {
    width: 72,
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  gaugeValue: {
    position: 'absolute',
    bottom: 0,
    color: colors.brand.success,
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
  },
  gaugeCopy: {
    flex: 1,
    gap: 4,
  },
  gaugeStatus: {
    color: colors.text.primary,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.32,
  },
  journalFraction: {
    width: 240,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fractionValue: {
    width: 58,
    color: colors.brand.success,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.68,
    textAlign: 'center',
  },
  fractionCopy: {
    flex: 1,
    gap: 3,
  },
  journalHeatmap: {
    width: 240,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heatmapCopy: {
    width: 124,
    gap: 4,
  },
  heatmapStatus: {
    color: colors.text.primary,
    fontSize: 14,
    lineHeight: 16,
    letterSpacing: -0.28,
  },
  heatmapGrid: {
    width: 102,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  heatmapCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.surface.divider,
  },
  heatmapCellFilled: {
    backgroundColor: colors.brand.success,
  },
  journalLadder: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 5,
  },
  ladderBars: {
    width: 240,
    height: 31,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  ladderBar: {
    flex: 1,
    minHeight: 7,
    borderRadius: 5,
  },
  journalChecklist: {
    width: 240,
    height: 58,
    justifyContent: 'flex-end',
    gap: 3,
  },
  checklistRows: {
    gap: 2,
  },
  checklistRow: {
    width: 240,
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistIcon: {
    width: 16,
    height: 16,
    marginRight: 5,
    borderRadius: 8,
    backgroundColor: colors.brand.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistIconMuted: {
    width: 16,
    height: 16,
    marginRight: 5,
    borderRadius: 8,
    backgroundColor: colors.surface.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistCheck: {
    color: colors.text.inverse,
    fontSize: 9,
    lineHeight: 10,
  },
  checklistCheckMuted: {
    color: colors.text.secondary,
    fontSize: 12,
    lineHeight: 12,
  },
  checklistLabel: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.24,
  },
  checklistValue: {
    color: colors.text.secondary,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.24,
  },
  metricButton: {
    width: 116,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricButtonPressContent: {
    width: 116,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricButtonSolid: {
    backgroundColor: colors.brand.primary,
  },
  metricButtonSoft: {
    backgroundColor: colors.surface.warm,
  },
  metricButtonOutline: {
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    backgroundColor: 'transparent',
  },
  metricButtonWhite: {
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  metricButtonBurgundy: {
    backgroundColor: colors.brand.burgundy,
  },
  metricButtonGlass: {
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    ...shadows.floating,
  },
  metricButtonSplit: {
    paddingLeft: 15,
    paddingRight: 5,
    justifyContent: 'space-between',
    backgroundColor: colors.brand.primary,
  },
  metricButtonIconLeading: {
    paddingLeft: 5,
    paddingRight: 12,
    justifyContent: 'flex-start',
    gap: 6,
    backgroundColor: colors.brand.primary,
  },
  metricButtonTextOnly: {
    backgroundColor: 'transparent',
  },
  metricButtonCompleted: {
    backgroundColor: colors.brand.success,
  },
  metricButtonContent: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricButtonLabel: {
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.32,
  },
  metricButtonArrow: {
    fontSize: 17,
    lineHeight: 18,
    letterSpacing: -0.34,
  },
  metricButtonSplitIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricButtonLeadingIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanActionGroup: {
    width: 370,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanActionGroupSegmented: {
    gap: 0,
    overflow: 'hidden',
    borderRadius: 24,
  },
  scanActionGroupSegmentedSolid: {
    backgroundColor: colors.brand.primary,
  },
  scanActionGroupSegmentedSoft: {
    backgroundColor: colors.surface.warm,
  },
  scanActionItem: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    overflow: 'visible',
  },
  scanActionContent: {
    ...StyleSheet.absoluteFillObject,
    paddingLeft: 5,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 7,
  },
  scanActionContentMinimal: {
    paddingHorizontal: 5,
    justifyContent: 'center',
    gap: 5,
  },
  scanActionContentFloating: {
    paddingHorizontal: 4,
    justifyContent: 'center',
    gap: 6,
  },
  scanActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanActionIconTransparent: {
    width: 24,
    height: 24,
    backgroundColor: 'transparent',
  },
  scanActionIconSoft: {
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  scanActionIconWarm: {
    backgroundColor: colors.surface.warm,
  },
  scanActionIconFloating: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  scanActionLabel: {
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: -0.3,
  },
  scanActionLabelFloating: {
    fontSize: 13,
    lineHeight: 15,
    letterSpacing: -0.26,
  },
  scanActionSolid: {
    backgroundColor: colors.brand.primary,
  },
  scanActionSoft: {
    backgroundColor: colors.surface.warm,
  },
  scanActionOutline: {
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    backgroundColor: 'transparent',
  },
  scanActionWhite: {
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  scanActionGlass: {
    backgroundColor: 'transparent',
    ...shadows.floating,
  },
  scanActionSegment: {
    borderRadius: 0,
    overflow: 'visible',
  },
  scanActionSegmentDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.42)',
  },
  scanActionTile: {
    borderRadius: 16,
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.12)',
  },
  scanActionMinimal: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(211,20,113,0.24)',
    borderRadius: 0,
  },
  scanActionFloating: {
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  instructionCard: {
    width: 360,
    height: 150,
    overflow: 'hidden',
    borderRadius: 30,
  },
  instructionRail: {
    paddingLeft: 17,
    paddingRight: 18,
    backgroundColor: colors.surface.warm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionRailNumber: {
    width: 72,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionRailNumberText: {
    fontSize: 55,
    lineHeight: 62,
    letterSpacing: -1.1,
    textAlign: 'center',
  },
  instructionRailBody: {
    flex: 1,
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionBadge: {
    padding: 18,
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    ...shadows.card,
  },
  instructionBadgeNumber: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionBadgeNumberText: {
    fontSize: 25,
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  instructionBadgeCopy: {
    flex: 1,
    gap: 7,
  },
  instructionBody: {
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionAccent: {
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
  },
  instructionAccentRail: {
    width: 82,
    height: 150,
    paddingVertical: 18,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  instructionAccentNumber: {
    fontSize: 46,
    lineHeight: 50,
    letterSpacing: -0.92,
  },
  instructionAccentBody: {
    flex: 1,
    alignSelf: 'center',
    paddingHorizontal: 17,
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.34,
  },
  instructionEditorial: {
    padding: 18,
    backgroundColor: colors.surface.rose,
    justifyContent: 'center',
  },
  instructionEditorialNumber: {
    position: 'absolute',
    right: 8,
    bottom: -20,
    fontSize: 142,
    lineHeight: 150,
    letterSpacing: -3,
  },
  instructionEditorialCopy: {
    width: 290,
    gap: 8,
  },
  instructionEditorialBody: {
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionProgress: {
    paddingHorizontal: 20,
    paddingVertical: 17,
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.12)',
  },
  instructionProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  instructionProgressDots: {
    flexDirection: 'row',
    gap: 4,
  },
  instructionProgressDot: {
    width: 18,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface.divider,
  },
  instructionProgressDotFilled: {
    backgroundColor: colors.brand.primary,
  },
  instructionProgressBody: {
    marginTop: 13,
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionGlass: {
    backgroundColor: colors.surface.rose,
  },
  instructionGlassBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface.rose,
  },
  instructionGlassContent: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  instructionGlassNumber: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionGlassNumberText: {
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.68,
  },
  instructionGlassCopy: {
    flex: 1,
    gap: 7,
  },
  instructionGlassBody: {
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionNumberTop: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.surface.warm,
  },
  instructionNumberTopHeader: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  instructionNumberTopValue: {
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -0.76,
  },
  instructionNumberTopBody: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionTimeline: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    ...shadows.card,
  },
  instructionTimelineRail: {
    width: 18,
    height: 112,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instructionTimelineLine: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.surface.divider,
  },
  instructionTimelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface.divider,
    backgroundColor: colors.surface.raised,
  },
  instructionTimelineDotFilled: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  instructionTimelineCopy: {
    flex: 1,
    gap: 9,
  },
  instructionTimelineBody: {
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionInverse: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.brand.burgundy,
  },
  instructionInverseHeader: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instructionInverseNumber: {
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.72,
  },
  instructionInverseBody: {
    marginTop: 9,
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionMinimal: {
    paddingHorizontal: 20,
    paddingTop: 17,
    paddingBottom: 16,
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: colors.surface.divider,
  },
  instructionMinimalTrack: {
    width: 320,
    height: 5,
    overflow: 'hidden',
    borderRadius: 2.5,
    backgroundColor: colors.surface.divider,
  },
  instructionMinimalFill: {
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.brand.primary,
  },
  instructionMinimalMeta: {
    marginTop: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  instructionMinimalBody: {
    marginTop: 9,
    fontSize: 16,
    lineHeight: 18.5,
    letterSpacing: -0.32,
  },
  instructionNewBody: {
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.34,
  },
  instructionSoftHeader: {
    padding: 18,
    backgroundColor: '#fff1f6',
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.10)',
  },
  instructionSoftHeaderTop: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  instructionSoftHeaderNumber: {
    fontSize: 23,
    lineHeight: 26,
    letterSpacing: -0.46,
  },
  instructionRing: {
    paddingHorizontal: 18,
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  instructionRingNumber: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionRingNumberText: {
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.72,
  },
  instructionRingCopy: {
    flex: 1,
    gap: 8,
  },
  instructionCorner: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    backgroundColor: colors.surface.warm,
    justifyContent: 'center',
  },
  instructionCornerNumber: {
    position: 'absolute',
    right: 10,
    top: -23,
    fontSize: 132,
    lineHeight: 148,
    letterSpacing: -2.64,
  },
  instructionCornerCopy: {
    width: 302,
    gap: 9,
    zIndex: 1,
  },
  instructionSegments: {
    paddingHorizontal: 20,
    paddingVertical: 17,
    backgroundColor: colors.surface.raised,
  },
  instructionSegmentsTrack: {
    height: 6,
    flexDirection: 'row',
    gap: 5,
  },
  instructionSegmentsPart: {
    flex: 1,
    borderRadius: 3,
    backgroundColor: colors.surface.divider,
  },
  instructionSegmentsPartFilled: {
    backgroundColor: colors.brand.primary,
  },
  instructionSegmentsMeta: {
    marginTop: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  instructionTicket: {
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.card,
  },
  instructionTicketStub: {
    width: 78,
    backgroundColor: colors.brand.burgundy,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  instructionTicketNumber: {
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.8,
  },
  instructionTicketDivider: {
    height: 112,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(211,20,113,0.28)',
  },
  instructionTicketCopy: {
    flex: 1,
    paddingHorizontal: 17,
    gap: 8,
  },
  instructionIllustrated: {
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.10)',
  },
  instructionIllustratedCopy: {
    flex: 1,
    paddingLeft: 17,
    paddingRight: 11,
    paddingVertical: 15,
    gap: 9,
  },
  instructionIllustratedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  instructionIllustratedStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionIllustratedStepText: {
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.32,
  },
  instructionIllustratedBody: {
    fontSize: 17,
    lineHeight: 19.5,
    letterSpacing: -0.34,
  },
  instructionIllustratedMedia: {
    width: 128,
    height: 150,
    overflow: 'hidden',
    backgroundColor: '#fffaf7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionIllustratedImage: {
    width: 128,
    height: 150,
  },
  instructionIllustratedPlaceholder: {
    fontSize: 104,
    lineHeight: 116,
    letterSpacing: -2.08,
  },
  instructionIntroBase: {
    alignItems: 'center',
  },
  instructionIntroClassic: {
    backgroundColor: colors.surface.raised,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.10)',
  },
  instructionIntroContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
  },
  instructionIntroTitle: {
    position: 'absolute',
    top: 15,
    left: 18,
    right: 18,
    zIndex: 1,
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: -0.4,
  },
  instructionIntroImage: {
    position: 'absolute',
    left: 20,
    top: 50,
    width: 320,
    height: 82,
  },
  instructionIntroBrand: {
    backgroundColor: colors.brand.burgundy,
  },
  instructionIntroBrandImage: {
    left: 18,
    width: 324,
    borderRadius: 18,
  },
  instructionIntroSoft: {
    backgroundColor: colors.surface.rose,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.08)',
  },
  instructionIntroOutline: {
    backgroundColor: colors.surface.raised,
    borderWidth: 2,
    borderColor: colors.brand.primary,
  },
  instructionIntroEditorial: {
    backgroundColor: colors.surface.warm,
  },
  instructionIntroEditorialMark: {
    position: 'absolute',
    right: 8,
    bottom: -31,
    fontSize: 126,
    lineHeight: 140,
    letterSpacing: -2.52,
  },
  instructionIntroEditorialTitle: {
    left: 20,
    right: 110,
    textAlign: 'left',
  },
  instructionIntroSplit: {
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.12)',
  },
  instructionIntroSplitImage: {
    width: 184,
    height: 150,
  },
  instructionIntroSplitCopy: {
    flex: 1,
    paddingHorizontal: 17,
    justifyContent: 'center',
    gap: 8,
  },
  instructionIntroSplitTitle: {
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: -0.4,
  },
  instructionIntroGlass: {
    backgroundColor: colors.surface.rose,
  },
  instructionIntroMinimal: {
    backgroundColor: colors.surface.raised,
    borderRadius: 0,
  },
  instructionIntroMinimalTitle: {
    top: 16,
    fontSize: 18,
    lineHeight: 21,
  },
  instructionIntroMinimalImage: {
    top: 48,
    height: 76,
  },
  instructionIntroMinimalLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 14,
    height: 2,
    backgroundColor: colors.brand.primary,
  },
  instructionIntroFramed: {
    backgroundColor: colors.surface.raised,
  },
  instructionIntroInnerFrame: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 8,
    bottom: 8,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(211,20,113,0.32)',
  },
  instructionIntroHero: {
    backgroundColor: colors.surface.raised,
  },
  instructionIntroHeroTitle: {
    position: 'absolute',
    left: 56,
    right: 56,
    top: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  instructionIntroHeroText: {
    fontSize: 17,
    lineHeight: 20,
    letterSpacing: -0.34,
  },
  instructionCarousel: {
    width: 370,
    height: 150,
  },
  instructionCarouselContent: {
    paddingRight: 10,
    gap: 10,
  },
  instructionNavigation: {
    width: 380,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  instructionNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'visible',
  },
  instructionNavPressContent: {
    flex: 1,
    borderRadius: 20,
  },
  instructionNavPressTarget: {
    ...StyleSheet.absoluteFillObject,
  },
  instructionNavContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionNavChevronLeft: {
    transform: [{ rotate: '180deg' }],
  },
  instructionNavOriginal: {
    backgroundColor: '#171717',
  },
  instructionNavBrand: {
    backgroundColor: colors.brand.primary,
  },
  instructionNavSoft: {
    backgroundColor: colors.surface.warm,
  },
  instructionNavOutline: {
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    backgroundColor: 'transparent',
  },
  instructionNavWhite: {
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  instructionNavGlass: {
    backgroundColor: 'transparent',
    ...shadows.floating,
  },
  instructionNavSquare: {
    borderRadius: 13,
    backgroundColor: colors.brand.primary,
  },
  instructionNavBurgundy: {
    backgroundColor: colors.brand.burgundy,
  },
  instructionNavMinimal: {
    backgroundColor: 'transparent',
  },
  instructionNavDouble: {
    borderWidth: 4,
    borderColor: colors.surface.warm,
    backgroundColor: colors.surface.raised,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
  },
  instructionNavDisabled: {
    opacity: 0.34,
  },
  edgeFadeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  scanBackgroundMotion: {
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: colors.surface.rose,
  },
  scanBackgroundMotionImage: {
    position: 'absolute',
  },
  scanTooltip: {
    width: 320,
    height: 56,
    borderRadius: 28,
    overflow: 'visible',
  },
  scanTooltipInner: {
    minHeight: 56,
    paddingHorizontal: 14,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanTooltipGlass: {
    backgroundColor: 'transparent',
  },
  scanTooltipDark: {
    alignSelf: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(19,19,22,0.88)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
  },
  scanTooltipLight: {
    alignSelf: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadows.card,
  },
  scanTooltipBrand: {
    shadowColor: '#260208',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },
  scanTooltipOutline: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.56)',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  scanTooltipSplit: {
    height: 58,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadows.card,
  },
  scanTooltipStatus: {
    height: 64,
    paddingLeft: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(23,23,26,0.92)',
  },
  scanTooltipCompact: {
    width: 268,
    height: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    gap: 8,
    ...shadows.card,
  },
  scanTooltipFloating: {
    width: 300,
    height: 58,
    paddingLeft: 9,
    paddingRight: 16,
    alignSelf: 'center',
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadows.floating,
  },
  scanTooltipBubble: {
    width: 300,
    height: 68,
    borderRadius: 22,
    backgroundColor: 'rgba(19,19,22,0.92)',
    ...shadows.floating,
  },
  scanTooltipIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTooltipSplitIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
  },
  scanTooltipFloatingIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    shadowColor: '#260208',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  scanTooltipBrandIcon: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  scanTooltipCompactIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  scanTooltipCopy: {
    flex: 1,
    justifyContent: 'center',
    gap: 1,
  },
  scanTooltipCenteredCopy: {
    width: 242,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
  },
  scanTooltipEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.55,
  },
  scanTooltipMessage: {
    flexShrink: 1,
  },
  scanTooltipStatusLine: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  scanTooltipSplitStatus: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  scanTooltipTail: {
    position: 'absolute',
    left: 34,
    bottom: -5,
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: 'rgba(19,19,22,0.92)',
    transform: [{ rotate: '45deg' }],
  },
  scanHistoryPreview: {
    width: 370,
    minHeight: 584,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#FAF8F8',
    gap: spacing.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,33,35,0.07)',
  },
  scanHistoryScreen: {
    minHeight: 0,
    padding: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    overflow: 'visible',
    borderWidth: 0,
  },
  historyHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  historyHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  historyFilterButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  historyFilter: {
    height: 38,
    padding: 3,
    borderRadius: 19,
    backgroundColor: '#EEEAEA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  historyFilterGlass: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  historyFilterItem: {
    flex: 1,
    height: 32,
    paddingHorizontal: spacing.xs,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTimeline: {
    marginTop: spacing.xs,
  },
  timelineRow: {
    minHeight: 128,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timelineRail: {
    width: 46,
    alignItems: 'center',
  },
  timelineDay: {
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -0.56,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    marginTop: spacing.xs,
    backgroundColor: '#DED7D5',
  },
  timelineContent: {
    flex: 1,
    minHeight: 108,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    gap: spacing.xs,
    ...shadows.card,
  },
  historyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  historyStatus: {
    minHeight: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
  },
  historyStatusCompact: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  historyStatusPlain: {
    minHeight: 18,
    paddingHorizontal: 0,
    borderRadius: 0,
  },
  historyStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  historyCards: {
    gap: spacing.sm,
  },
  historyResultCard: {
    minHeight: 126,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    justifyContent: 'space-between',
    ...shadows.card,
  },
  historyResultCardFeatured: {
    minHeight: 148,
    backgroundColor: colors.brand.burgundy,
  },
  historyDatePair: {
    flex: 1,
    gap: spacing.xs,
  },
  historyCardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  compactTable: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#DCD6D4',
  },
  compactTableHeader: {
    height: 34,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactRow: {
    minHeight: 96,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DED8D6',
  },
  compactDate: {
    width: 48,
  },
  compactDay: {
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: -0.52,
  },
  compactType: {
    flex: 1,
    gap: 4,
  },
  compactResult: {
    alignItems: 'flex-end',
    gap: 5,
  },
  compactSummary: {
    minHeight: 72,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.warm,
    justifyContent: 'center',
    gap: 4,
  },
  historyCalendar: {
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  calendarMonthHeader: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarPrevious: {
    transform: [{ rotate: '180deg' }],
  },
  calendarWeek: {
    marginTop: spacing.xs,
    flexDirection: 'row',
  },
  calendarWeekDay: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 10,
  },
  calendarGrid: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.2857%',
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  calendarDaySelected: {
    backgroundColor: colors.brand.primary,
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brand.primary,
  },
  calendarDotSelected: {
    backgroundColor: colors.text.inverse,
  },
  calendarSelection: {
    paddingTop: spacing.xs,
    gap: spacing.xs,
  },
  calendarResultRow: {
    minHeight: 82,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.rose,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  calendarResultCopy: {
    flex: 1,
    gap: 5,
  },
  insightsHero: {
    minHeight: 208,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.brand.burgundy,
  },
  insightsMetric: {
    gap: 2,
  },
  insightsMetricValue: {
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: -0.84,
  },
  insightsChart: {
    height: 90,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 7,
  },
  insightsBarTrack: {
    flex: 1,
    height: 90,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  insightsBar: {
    width: '100%',
    borderRadius: 7,
    backgroundColor: '#FF78AA',
  },
  insightsAxis: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  insightsStats: {
    minHeight: 90,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  insightsStat: {
    flex: 1,
    gap: 4,
  },
  insightsStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: 48,
    marginHorizontal: spacing.md,
    backgroundColor: '#DCD6D4',
  },
  insightsRecent: {
    gap: spacing.xs,
  },
  insightsRecentRow: {
    minHeight: 74,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  insightsRecentDate: {
    width: 52,
    alignItems: 'center',
  },
  groupedMonthHeader: {
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupedHistoryList: {
    gap: spacing.xs,
  },
  groupedDay: {
    minHeight: 116,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  groupedDateBlock: {
    width: 54,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  groupedDateNumber: {
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.64,
  },
  groupedResultRow: {
    flex: 1,
    minHeight: 108,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    ...shadows.card,
  },
  groupedResultCopy: {
    flex: 1,
    gap: 7,
  },
  testTypeSummaryRow: {
    minHeight: 142,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  testTypeSummary: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DED8D6',
  },
  testTypeSummaryActive: {
    backgroundColor: colors.brand.burgundy,
    borderColor: colors.brand.burgundy,
  },
  testTypeSummaryValue: {
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -0.76,
  },
  testTypeSection: {
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
  },
  testTypeSectionHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testTypeRow: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  testTypeDate: {
    width: 48,
    alignItems: 'center',
  },
  testTypePregnancyRow: {
    minHeight: 76,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.rose,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  archiveHero: {
    minHeight: 132,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.brand.burgundy,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  archiveHeroValue: {
    marginTop: spacing.xs,
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: -0.92,
  },
  archiveHeroStats: {
    alignItems: 'flex-end',
    gap: 5,
  },
  archiveMonths: {
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
  },
  archiveMonthRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  archiveMonthCopy: {
    flex: 1,
    gap: 4,
  },
  archiveMonthCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  archiveChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  archiveFootnote: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  comparisonHero: {
    minHeight: 174,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DED8D6',
  },
  comparisonMetricRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  comparisonMetric: {
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: -0.84,
  },
  comparisonTrendPill: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(211,20,113,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonLineTrack: {
    height: 3,
    marginTop: spacing.lg,
    borderRadius: 2,
    backgroundColor: '#E8E1DF',
  },
  comparisonLineFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand.primary,
  },
  comparisonLineDot: {
    position: 'absolute',
    top: -5,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.surface.raised,
    borderWidth: 3,
    borderColor: colors.brand.primary,
  },
  comparisonLineDotStart: {
    left: 0,
  },
  comparisonLineDotEnd: {
    right: 0,
  },
  comparisonLineLabels: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  comparisonColumns: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  comparisonResult: {
    flex: 1,
    minHeight: 188,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DED8D6',
  },
  comparisonResultCurrent: {
    backgroundColor: colors.surface.rose,
    borderColor: 'rgba(211,20,113,0.18)',
  },
  comparisonDay: {
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -0.76,
  },
  comparisonNote: {
    minHeight: 68,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface.warm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  comparisonNoteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  comparisonNoteText: {
    flex: 1,
  },
  galleryFeatured: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    overflow: 'hidden',
    ...shadows.card,
  },
  galleryImageFrame: {
    height: 190,
    backgroundColor: colors.surface.warm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryTestImage: {
    width: '100%',
    height: 64,
  },
  galleryTestImageMuted: {
    opacity: 0.62,
  },
  galleryCapturedImage: {
    width: '100%',
    height: '100%',
  },
  galleryUnavailableText: {
    textAlign: 'center',
  },
  galleryEmptyState: {
    minHeight: 230,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  galleryEmptyDescription: {
    maxWidth: 280,
    textAlign: 'center',
  },
  galleryPlainResult: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
  },
  galleryFeaturedCopy: {
    minHeight: 78,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  galleryList: {
    gap: spacing.sm,
  },
  galleryRow: {
    minHeight: 102,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DED8D6',
  },
  galleryThumbnail: {
    width: 92,
    height: 72,
    borderRadius: radii.sm,
    backgroundColor: colors.surface.warm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tokenLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
