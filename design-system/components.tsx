import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import {
  GlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type {
  GlassColorScheme,
  GlassStyle,
} from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  ColorValue,
  PressableProps,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';

import {
  colors,
  fonts,
  motion,
  radii,
  shadows,
  spacing,
  typeScale,
} from './tokens';

const hasNativeLiquidGlass =
  Platform.OS === 'ios' && isLiquidGlassAvailable();

type AppTextProps = PropsWithChildren<{
  style?: StyleProp<TextStyle>;
  role?: keyof typeof typeScale;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  numeric?: boolean;
  color?: string;
  numberOfLines?: number;
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
}: AppTextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        typeScale[role],
        {
          color,
          fontFamily: numeric ? fonts.yaroRegular : sfByWeight[weight],
        },
        style,
      ]}
    >
      {children}
    </Text>
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
}: LiquidGlassSurfaceProps) {
  const fallbackHighlight: readonly [
    ColorValue,
    ColorValue,
    ColorValue,
  ] = [
    'rgba(255,255,255,0.44)',
    'rgba(255,255,255,0.08)',
    'rgba(255,255,255,0.16)',
  ];

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
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        >
          <View pointerEvents="none" style={styles.centerFill}>
            {children}
          </View>
        </GlassView>
      ) : (
        <>
          {Platform.OS === 'web' ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.webGlassFallback,
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
            colors={fallbackHighlight}
            locations={[0, 0.46, 1]}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.fallbackStroke,
              { borderRadius: radius },
            ]}
          />
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
  onPress?: PressableProps['onPress'];
  style: StyleProp<ViewStyle>;
}>;

export function GlassControl({
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
        !hasNativeLiquidGlass && shadows.floating,
        pressed &&
          !hasNativeLiquidGlass && {
            transform: [{ scale: motion.pressedScale }],
          },
      ]}
    >
      <LiquidGlassSurface>{children}</LiquidGlassSurface>
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.primaryButtonCompact,
        disabled && styles.primaryButtonDisabled,
        pressed && styles.pressed,
      ]}
    >
      {icon}
      <AppText
        role="label"
        weight="medium"
        color={colors.text.inverse}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  tone?: 'white' | 'warm' | 'accent';
}>;

export function AppCard({
  children,
  style,
  tone = 'white',
}: AppCardProps) {
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

export function ProgressMeter({
  value,
  total = 24,
}: ProgressMeterProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: value }}
      style={styles.progress}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.progressBar,
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
  );
}

export function TokenLabel({
  children,
}: PropsWithChildren) {
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
  glassSurface: {
    ...StyleSheet.absoluteFillObject,
  },
  clipped: {
    overflow: 'hidden',
  },
  centerFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webGlassFallback: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  fallbackStroke: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.48)',
  },
  primaryButton: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryButtonCompact: {
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
  tokenLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

