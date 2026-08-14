import { GlassContainer, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import CalendarIcon from '../assets/figma/calendar-icon.svg';
import HeaderHistoryIcon from '../assets/figma/scan-screen/header-history.svg';
import { GlassControl, HeaderDateLabel } from './components';
import { colors, shadows } from './tokens';

const hasNativeLiquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

export function AppHeader({
  centerContent,
  centerStyle,
  dateAccessibilityLabel = 'Выбрать дату',
  historyAccessibilityLabel = 'Открыть историю',
  hideRightControl = false,
  onCalendar,
  onDate,
  onHistory,
  onRightAction,
  rightAccessibilityLabel,
  rightContent,
  style,
}: {
  centerContent?: ReactNode;
  centerStyle?: StyleProp<ViewStyle>;
  dateAccessibilityLabel?: string;
  historyAccessibilityLabel?: string;
  hideRightControl?: boolean;
  onCalendar?: () => void;
  onDate?: () => void;
  onHistory?: () => void;
  onRightAction?: () => void;
  rightAccessibilityLabel?: string;
  rightContent?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <>
      <GlassControl
        accessibilityLabel={historyAccessibilityLabel}
        elevated={false}
        onPress={onHistory}
        tintColor={colors.surface.headerGlassWash}
        washColor={colors.surface.headerGlassWash}
        style={styles.headerCircle}
      >
        <HeaderHistoryIcon width={22} height={22} color="#D31471" />
      </GlassControl>

      {centerContent ? (
        <View style={[styles.centerSlot, centerStyle]}>{centerContent}</View>
      ) : (
        <GlassControl
          accessibilityLabel={dateAccessibilityLabel}
          elevated={false}
          onPress={onDate}
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
          style={styles.datePill}
        >
          <HeaderDateLabel />
        </GlassControl>
      )}

      {hideRightControl ? (
        <View style={styles.headerCircle} />
      ) : (
        <GlassControl
          accessibilityLabel={rightAccessibilityLabel ?? 'Открыть календарь'}
          elevated={false}
          onPress={rightContent ? onRightAction : onCalendar}
          tintColor={colors.surface.headerGlassWash}
          washColor={colors.surface.headerGlassWash}
          style={styles.headerCircle}
        >
          {rightContent ?? (
            <View style={styles.headerIconOrientation}>
              <CalendarIcon width={22} height={22} color="#D31471" />
            </View>
          )}
        </GlassControl>
      )}
    </>
  );

  return (
    <View style={[styles.header, style]}>
      <View pointerEvents="none" style={styles.shadowLayer}>
        <View style={[styles.headerCircle, styles.shadowSurface]} />
        <View
          style={[
            centerContent ? styles.centerSlot : styles.datePill,
            centerContent ? centerStyle : undefined,
            centerContent ? undefined : styles.shadowSurface,
          ]}
        />
        <View
          style={[
            styles.headerCircle,
            hideRightControl ? undefined : styles.shadowSurface,
          ]}
        />
      </View>

      {hasNativeLiquidGlass ? (
        <GlassContainer spacing={12} style={styles.headerContent}>
          {content}
        </GlassContainer>
      ) : (
        <View style={styles.headerContent}>{content}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: 370,
    height: 48,
  },
  headerContent: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shadowLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shadowSurface: {
    ...shadows.control,
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
  centerSlot: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconOrientation: {
    transform: [{ scaleY: -1 }],
  },
});
