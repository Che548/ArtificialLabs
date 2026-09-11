import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';

import MonitoringIcon from '../assets/figma/monitoring-icon.svg';
import AndroidGraphIcon from '../assets/android-icons/graph.svg';
import ArrowUpRightIcon from '../assets/figma/arrow-card.svg';
import { AppText, GlassControl, HeaderDateLabel } from './components';
import { colors, fonts, shadows, spacing } from './tokens';

const headerGlass = colors.surface.headerGlassWash;
const headerWash = colors.surface.headerGlassWash;

export function AnalysisReferenceHeader({
  date = new Date(),
  onChart,
  onDate,
}: {
  date?: Date;
  onChart?: () => void;
  onDate?: () => void;
}) {
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(date);

  return (
    <View style={styles.header}>
      <GlassControl
        accessibilityLabel="Открыть графики анализов"
        elevated
        onPress={onChart}
        tintColor={headerGlass}
        washColor={headerWash}
        style={styles.headerCircle}
      >
        {Platform.OS === 'android' ? (
          <AndroidGraphIcon width={24} height={24} />
        ) : (
          <View style={styles.headerIconOrientation}>
            <MonitoringIcon
              width={22}
              height={22}
              color={colors.brand.primary}
            />
          </View>
        )}
      </GlassControl>

      <GlassControl
        accessibilityLabel={`Показать текущие анализы. Сегодня ${dateLabel}`}
        elevated
        onPress={onDate}
        tintColor={headerGlass}
        washColor={headerWash}
        style={styles.headerDate}
      >
        <HeaderDateLabel date={date} label="Сегодня" />
      </GlassControl>

      <View
        pointerEvents="none"
        accessible={false}
        style={styles.headerCircle}
      />
    </View>
  );
}

export function AnalysisAttentionHero({
  mascot,
  onPress,
  score = 72,
}: {
  mascot: ImageSourcePropType;
  onPress?: () => void;
  score?: number;
}) {
  return (
    <View style={styles.hero}>
      <View pointerEvents="box-none" style={styles.heroActionSlot}>
        <View pointerEvents="none" style={styles.heroActionVisual}>
          <ArrowUpRightIcon width={23} height={23} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Посмотреть внимательность к здоровью"
          onPress={onPress}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.heroCopy}>
        <AppText numeric color="#16B86B" style={styles.heroScore}>
          {score}%
        </AppText>
        <Text style={styles.heroLabel}>
          Твоя <Text style={styles.heroLabelStrong}>внимательность</Text>
          {'\n'}к здоровью
        </Text>
      </View>

      <Image
        accessible={false}
        source={mascot}
        resizeMode="contain"
        style={styles.heroMascot}
      />
    </View>
  );
}

function analysisNoun(count: number) {
  const lastTwoDigits = Math.abs(count) % 100;
  const lastDigit = lastTwoDigits % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'анализов';
  if (lastDigit === 1) return 'анализ';
  if (lastDigit >= 2 && lastDigit <= 4) return 'анализа';
  return 'анализов';
}

function DeadlineCard({
  count,
  deadline,
  onPress,
}: {
  count: number;
  deadline: string;
  onPress?: () => void;
}) {
  const noun = analysisNoun(count);
  const displayNoun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const accessibilityLabel = count
    ? `${count} ${noun} нужно сдать до ${deadline}`
    : 'В этом разделе пока нет анализов';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.deadlineCard}
    >
      <View pointerEvents="none" style={styles.deadlineCardSurface} />
      <View style={styles.deadlineCardContent}>
        <AppText numeric weight="medium" style={styles.deadlineCount}>
          {count}
        </AppText>
        <View style={styles.deadlineArrow}>
          <ArrowUpRightIcon width={16} height={16} />
        </View>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          style={styles.deadlineCopy}
        >
          {count ? (
            <>
              {displayNoun} нужно{`\n`}сдать до{' '}
              <Text style={styles.deadlineStrong}>{deadline}</Text>
            </>
          ) : (
            <>
              В этом разделе{`\n`}пока нет{' '}
              <Text style={styles.deadlineStrong}>анализов</Text>
            </>
          )}
        </Text>
      </View>
    </Pressable>
  );
}

export function AnalysisDeadlineSummary({
  currentDeadline,
  currentCount,
  onCurrent,
  onUpcoming,
  style,
  upcomingDeadline,
  upcomingCount,
}: {
  currentDeadline: string;
  currentCount: number;
  onCurrent?: () => void;
  onUpcoming?: () => void;
  style?: StyleProp<ViewStyle>;
  upcomingDeadline: string;
  upcomingCount: number;
}) {
  return (
    <View style={[styles.deadlineRow, style]}>
      <DeadlineCard
        count={currentCount}
        deadline={currentDeadline}
        onPress={onCurrent}
      />
      <DeadlineCard
        count={upcomingCount}
        deadline={upcomingDeadline}
        onPress={onUpcoming}
      />
    </View>
  );
}

export { AnalysisReferencePlanCard } from './labs-analysis-card';

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.985 }],
  },
  header: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCircle: {
    width: 48,
    minWidth: 48,
    flexBasis: 48,
    flexShrink: 0,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDate: {
    width: 156,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconOrientation: {
    transform: [{ scaleY: -1 }],
  },
  hero: {
    position: 'relative',
    width: '100%',
    height: 224,
    overflow: 'visible',
    borderRadius: 38,
    backgroundColor: colors.surface.raised,
  },
  heroActionSlot: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
    width: 28,
    height: 28,
  },
  heroActionVisual: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    backgroundColor: '#ECA4C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    position: 'absolute',
    top: 75,
    left: 23,
    zIndex: 3,
  },
  heroScore: {
    fontSize: 40,
    lineHeight: 43,
    letterSpacing: -1.2,
  },
  heroLabel: {
    marginTop: 0,
    color: '#5D5A5A',
    fontFamily: fonts.sfRegular,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.4,
    includeFontPadding: false,
  },
  heroLabelStrong: {
    color: colors.text.primary,
    fontFamily: fonts.sfSemibold,
  },
  heroMascot: {
    position: 'absolute',
    right: 27,
    bottom: -11,
    zIndex: 5,
    width: 154,
    height: 90,
  },
  deadlineRow: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.md,
  },
  deadlineCard: {
    position: 'relative',
    height: 106,
    minWidth: 0,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    borderRadius: 22,
    ...shadows.card,
  },
  deadlineCardSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.06)',
    backgroundColor: '#FFFFFF',
  },
  deadlineCardContent: {
    position: 'relative',
    zIndex: 1,
    minWidth: 0,
    flex: 1,
    justifyContent: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 16,
  },
  deadlineCount: {
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.6,
  },
  deadlineArrow: {
    position: 'absolute',
    top: 12,
    right: 16,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ECA4C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadlineCopy: {
    color: colors.text.secondary,
    fontFamily: fonts.sfRegular,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: -0.25,
    includeFontPadding: false,
  },
  deadlineStrong: {
    color: colors.text.primary,
    fontFamily: fonts.sfSemibold,
  },
});
