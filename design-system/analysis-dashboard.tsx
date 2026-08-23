import { LinearGradient } from 'expo-linear-gradient';
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

import CalendarIcon from '../assets/figma/calendar-icon.svg';
import MonitoringIcon from '../assets/figma/monitoring-icon.svg';
import AndroidGraphIcon from '../assets/android-icons/graph.svg';
import ArrowUpRightIcon from '../assets/figma/arrow-card.svg';
import { AppText, GlassControl, HeaderDateLabel } from './components';
import { colors, fonts, radii, shadows, spacing } from './tokens';

const headerGlass = colors.surface.headerGlassWash;
const headerWash = colors.surface.headerGlassWash;

export function AnalysisReferenceHeader({
  date = new Date(),
  onCalendar,
  onChart,
  onDate,
}: {
  date?: Date;
  onCalendar?: () => void;
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

      <GlassControl
        accessibilityLabel="Показать ближайшие анализы"
        elevated
        onPress={onCalendar}
        tintColor={headerGlass}
        washColor={headerWash}
        style={styles.headerCircle}
      >
        <View style={styles.headerIconOrientation}>
          <CalendarIcon width={22} height={22} color={colors.brand.primary} />
        </View>
      </GlassControl>
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
        <Text numberOfLines={3} style={styles.deadlineCopy}>
          {count ? (
            <>
              {displayNoun} нужно{`\n`}сдать до{`\n`}
              <Text style={styles.deadlineStrong}>{deadline}</Text>
            </>
          ) : (
            <>
              В этом разделе{`\n`}пока нет{`\n`}
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

export function AnalysisReferencePlanCard({
  description,
  dueLabel,
  dueValue,
  hasAttachedResult = false,
  image,
  onView,
  statusLabel,
  title,
  validityLabel,
  validityValue,
}: {
  description?: string;
  dueLabel: string;
  dueValue: string;
  hasAttachedResult?: boolean;
  image?: ImageSourcePropType;
  onView?: () => void;
  statusLabel?: string;
  title: string;
  validityLabel: string;
  validityValue: string;
}) {
  return (
    <View style={styles.planCard}>
      {image ? (
        <View style={styles.planMedia}>
          <Image
            accessible
            accessibilityLabel={`Изображение: ${title}`}
            source={image}
            resizeMode="contain"
            style={styles.planImage}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0)', '#FFFFFF']}
            locations={[0.46, 1]}
            style={styles.planImageFade}
          />
        </View>
      ) : (
        <View style={styles.planNoImageMark}>
          <AppText weight="semibold" style={styles.planNoImageMarkText}>
            {title.slice(0, 1).toLocaleUpperCase('ru-RU')}
          </AppText>
        </View>
      )}

      <View style={styles.planCopy}>
        {hasAttachedResult ? (
          <View style={styles.planAttachedBadge}>
            <View style={styles.planAttachedDot} />
            <AppText
              role="caption"
              weight="semibold"
              style={styles.planAttachedText}
            >
              Результат прикреплён
            </AppText>
          </View>
        ) : null}
        {statusLabel ? (
          <View style={styles.planStatusBadge}>
            <AppText
              role="caption"
              weight="semibold"
              style={styles.planStatusText}
            >
              {statusLabel}
            </AppText>
          </View>
        ) : null}
        <AppText weight="semibold" numberOfLines={1} style={styles.planTitle}>
          {title}
        </AppText>
        {description ? (
          <AppText
            role="caption"
            color={colors.text.secondary}
            numberOfLines={2}
            style={styles.planDescription}
          >
            {description}
          </AppText>
        ) : null}
      </View>

      <View style={styles.planFooter}>
        <View style={styles.planMeta}>
          <View style={styles.planMetaCell}>
            <AppText
              role="caption"
              color={colors.text.secondary}
              style={styles.planMetaLabel}
            >
              {dueLabel}
            </AppText>
            <AppText
              role="label"
              weight="semibold"
              style={styles.planMetaValue}
            >
              {dueValue}
            </AppText>
          </View>
          <View style={styles.planMetaDivider} />
          <View style={styles.planMetaCell}>
            <AppText
              role="caption"
              color={colors.text.secondary}
              style={styles.planMetaLabel}
            >
              {validityLabel}
            </AppText>
            <AppText
              role="label"
              weight="semibold"
              style={styles.planMetaValue}
            >
              {validityValue}
            </AppText>
          </View>
        </View>

        <View style={styles.planAction}>
          <AppText
            role="caption"
            weight="semibold"
            style={styles.planActionText}
          >
            Посмотреть ↗
          </AppText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Открыть: ${title}${
          hasAttachedResult ? ', результат прикреплён' : ''
        }`}
        disabled={!onView}
        onPress={onView}
        style={StyleSheet.absoluteFillObject}
      >
        {({ pressed }) => (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              pressed && onView && styles.planCardPressedOverlay,
            ]}
          />
        )}
      </Pressable>
    </View>
  );
}

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
    height: 124,
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
    justifyContent: 'space-between',
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
  planCard: {
    position: 'relative',
    width: '100%',
    height: 208,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
    backgroundColor: colors.surface.raised,
  },
  planCardPressedOverlay: {
    backgroundColor: 'rgba(234,64,135,0.035)',
  },
  planMedia: {
    position: 'absolute',
    top: 12,
    left: 18,
    width: 88,
    height: 108,
    overflow: 'hidden',
  },
  planNoImageMark: {
    position: 'absolute',
    top: 24,
    left: 22,
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF0F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.18)',
  },
  planNoImageMarkText: {
    color: colors.brand.primary,
    fontSize: 28,
    lineHeight: 32,
  },
  planImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.16 }],
  },
  planImageFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 38,
  },
  planCopy: {
    position: 'absolute',
    top: 45,
    right: 18,
    left: 112,
  },
  planAttachedBadge: {
    position: 'absolute',
    right: 0,
    bottom: '100%',
    marginBottom: 7,
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF0F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.22)',
  },
  planAttachedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  planAttachedText: {
    color: colors.brand.primary,
    fontSize: 11.5,
    lineHeight: 14,
  },
  planStatusBadge: {
    alignSelf: 'flex-start',
    minHeight: 22,
    justifyContent: 'center',
    marginBottom: 6,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: '#F3F0F1',
  },
  planStatusText: {
    color: colors.text.secondary,
    fontSize: 11,
    lineHeight: 13,
  },
  planTitle: {
    fontSize: 20,
    lineHeight: 23,
    letterSpacing: -0.45,
  },
  planDescription: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  planFooter: {
    position: 'absolute',
    right: 20,
    bottom: 13,
    left: 14,
    height: 59,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,32,0.10)',
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  planMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planMetaCell: {
    minWidth: 0,
    gap: 1,
  },
  planMetaLabel: {
    fontSize: 13.5,
    lineHeight: 16,
  },
  planMetaValue: {
    fontSize: 16,
    lineHeight: 19,
  },
  planMetaDivider: {
    width: StyleSheet.hairlineWidth,
    height: 31,
    backgroundColor: 'rgba(33,31,32,0.12)',
  },
  planAction: {
    width: 118,
    height: 40,
    flexShrink: 0,
    borderRadius: 13,
    backgroundColor: '#F5F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planActionText: {
    fontSize: 14,
    lineHeight: 17,
  },
});
