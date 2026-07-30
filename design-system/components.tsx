import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { GlassColorScheme, GlassStyle } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  ColorValue,
  PressableProps,
  StyleProp,
  TextStyle,
  ViewStyle,
} from 'react-native';

import { colors, motion, radii, shadows } from './tokens';

const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

type AppTextProps = PropsWithChildren<{
  className?: string;
  style?: StyleProp<TextStyle>;
  role?: 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  numeric?: boolean;
  color?: string;
  numberOfLines?: number;
}>;

const roleClasses = {
  display: 'text-[36px] leading-[38px] tracking-[-0.8px]',
  title: 'text-[28px] leading-[31px] tracking-[-0.56px]',
  heading: 'text-[22px] leading-[25px] tracking-[-0.44px]',
  body: 'text-[17px] leading-[21px] tracking-[-0.34px]',
  label: 'text-[15px] leading-[18px] tracking-[-0.3px]',
  caption: 'text-[12px] leading-[15px] tracking-[-0.12px]',
} as const;

const weightClasses = {
  regular: 'font-sf',
  medium: 'font-sf-medium',
  semibold: 'font-sf-semibold',
  bold: 'font-sf-bold',
} as const;

export function AppText({
  children,
  className = '',
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
      className={`${roleClasses[role]} ${numeric ? 'font-yaro' : weightClasses[weight]} ${className}`}
      style={[{ color }, style]}
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
  const fallbackHighlight: readonly [ColorValue, ColorValue, ColorValue] = [
    'rgba(255,255,255,0.44)',
    'rgba(255,255,255,0.08)',
    'rgba(255,255,255,0.16)',
  ];

  return (
    <View
      pointerEvents={hasNativeLiquidGlass ? 'box-none' : 'none'}
      className={
        !hasNativeLiquidGlass
          ? 'absolute inset-0 overflow-hidden'
          : 'absolute inset-0'
      }
      style={[{ borderRadius: radius }, style]}
    >
      {hasNativeLiquidGlass ? (
        <GlassView
          glassEffectStyle={variant}
          tintColor={tintColor}
          colorScheme={colorScheme}
          isInteractive
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        >
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            {children}
          </View>
        </GlassView>
      ) : (
        <>
          {Platform.OS === 'web' ? (
            <View className="absolute inset-0 bg-white/25" />
          ) : (
            <BlurView
              tint={fallbackTint}
              intensity={intensity}
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          )}
          <View
            className="absolute inset-0"
            style={[{ backgroundColor: washColor }]}
          />
          <LinearGradient
            colors={fallbackHighlight}
            locations={[0, 0.46, 1]}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View
            className="absolute inset-0 border-[0.8px] border-white/50"
            style={[{ borderRadius: radius }]}
          />
          <View
            pointerEvents="none"
            className="absolute inset-0 items-center justify-center"
          >
            {children}
          </View>
        </>
      )}
    </View>
  );
}

type GlassControlProps = PropsWithChildren<{
  accessibilityLabel: string;
  className?: string;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
}>;

export function GlassControl({
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
      className={`min-h-12 flex-row items-center justify-center gap-3 rounded-full bg-brand-primary px-6 active:scale-[0.985] active:opacity-[0.72] ${compact ? 'min-h-10 px-4' : ''} ${disabled ? 'bg-state-disabled' : ''}`}
    >
      {icon}
      <AppText role="label" weight="medium" color={colors.text.inverse}>
        {label}
      </AppText>
    </Pressable>
  );
}

type AppCardProps = PropsWithChildren<{
  className?: string;
  style?: StyleProp<ViewStyle>;
  tone?: 'white' | 'warm' | 'accent';
}>;

export function AppCard({
  children,
  className = '',
  style,
  tone = 'white',
}: AppCardProps) {
  return (
    <View
      className={`rounded-card-lg p-4 ${tone === 'white' ? 'bg-surface-raised' : ''} ${tone === 'warm' ? 'bg-surface-warm' : ''} ${tone === 'accent' ? 'bg-brand-primary' : ''} ${className}`}
      style={style}
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
      accessibilityValue={{ min: 0, max: total, now: value }}
      className="h-6 flex-row items-center gap-[3px]"
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={`h-3.5 flex-1 rounded-[3px] ${index < value ? 'bg-brand-success' : 'bg-surface-divider'}`}
        />
      ))}
    </View>
  );
}

export function TokenLabel({ children }: PropsWithChildren) {
  return (
    <AppText
      role="caption"
      color={colors.text.secondary}
      className="uppercase tracking-[0.5px]"
    >
      {children}
    </AppText>
  );
}
