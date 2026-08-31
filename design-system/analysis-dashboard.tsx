import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import MonitorIcon from '../assets/figma/analyses/monitor.svg';
import NotificationIcon from '../assets/figma/analyses/notif.svg';
import UploadIcon from '../assets/figma/analyses/upload.svg';
import { AppText, GlassControl } from './components';
import { fonts } from './tokens';

const ink = '#171717';
const secondary = '#5D5D5D';
const success = '#1FBB74';
const cardShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.12,
  shadowRadius: 18,
  elevation: 5,
} as const;

function ArrowIcon() {
  return (
    <Svg width={23} height={23} viewBox="0 0 23 23">
      <Path
        d="M7 16 16 7M9 7h7v7"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={25} height={25} viewBox="0 0 25 25">
      <Path
        d="m6.5 12.7 4 4 8-8"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function AnalysisReferenceHeader({
  onCalendar,
  onChart,
}: {
  date?: Date;
  onCalendar?: () => void;
  onChart?: () => void;
  onDate?: () => void;
}) {
  return (
    <View style={styles.header}>
      <GlassControl
        accessibilityLabel="Upload"
        elevated
        onPress={onChart}
        style={styles.uploadControl}
        tintColor="rgba(255,255,255,0.84)"
        washColor="rgba(255,255,255,0.72)"
      >
        <View style={styles.uploadContent}>
          <UploadIcon width={20} height={20} />
          <Text style={styles.uploadText}>Upload</Text>
        </View>
      </GlassControl>

      <Text style={styles.headerTitle}>Labs</Text>

      <View style={styles.headerActions}>
        <GlassControl
          accessibilityLabel="Notifications"
          elevated
          onPress={onCalendar}
          style={styles.headerCircle}
          tintColor="rgba(255,255,255,0.84)"
          washColor="rgba(255,255,255,0.72)"
        >
          <NotificationIcon width={20} height={20} />
        </GlassControl>
        <GlassControl
          accessibilityLabel="Display options"
          elevated
          onPress={onChart}
          style={styles.headerCircle}
          tintColor="rgba(255,255,255,0.84)"
          washColor="rgba(255,255,255,0.72)"
        >
          <MonitorIcon width={20} height={20} />
        </GlassControl>
      </View>
    </View>
  );
}

const volumeBars = Array.from({ length: 31 }, (_, index) => index < 23);

export function AnalysisAttentionHero({
  onPress,
  score = 72,
}: {
  mascot: ImageSourcePropType;
  onPress?: () => void;
  score?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Health Attention ${score}%`}
      onPress={onPress}
      style={styles.metricsCard}
    >
      <View style={styles.metricsRow}>
        <View style={[styles.metric, styles.metricWide]}>
          <Text style={styles.metricValue}>{score}%</Text>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={2}
            style={styles.metricLabel}
          >
            Health Attention{`\n`}scoring for 3 months
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={[styles.metric, styles.metricMiddle]}>
          <Text style={styles.metricValue}>3</Text>
          <Text style={styles.metricLabel}>Checks{`\n`}Recommended</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={[styles.metric, styles.metricLast]}>
          <Text style={styles.metricValue}>2</Text>
          <Text style={styles.metricLabel}>Results{`\n`}Expires soon</Text>
        </View>
      </View>

      <Text style={styles.volumeTitle}>Volume</Text>
      <View style={styles.volumeBars}>
        {volumeBars.map((active, index) => (
          <View
            key={index}
            style={[styles.volumeBar, active && styles.volumeBarActive]}
          />
        ))}
      </View>
      <View style={styles.volumeFooter}>
        <Text style={styles.volumeCopy}>
          Previous <Text style={styles.volumeStrong}>84%</Text>
        </Text>
        <Text style={styles.volumeCopy}>
          Best <Text style={styles.volumeStrong}>96%</Text>
        </Text>
      </View>
    </Pressable>
  );
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
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.deadlineCard}
    >
      <Text style={styles.deadlineCount}>{count}</Text>
      <View style={styles.deadlineArrow}>
        <ArrowIcon />
      </View>
      <Text style={styles.deadlineCopy}>
        Tests must be taken over{`\n`}the next{' '}
        <Text style={styles.deadlineStrong}>{deadline}</Text>
      </Text>
    </Pressable>
  );
}

export function AnalysisDeadlineSummary({
  currentCount,
  onCurrent,
  onUpcoming,
  style,
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
      <DeadlineCard count={2} deadline="1 Month" onPress={onCurrent} />
      <DeadlineCard count={3} deadline="3 Months" onPress={onUpcoming} />
    </View>
  );
}

function ProgressiveBlurImage({
  source,
  title,
}: {
  source: ImageSourcePropType;
  title: string;
}) {
  return (
    <View style={styles.imageFrame}>
      <Image
        accessible
        accessibilityLabel={`Image: ${title}`}
        source={source}
        resizeMode="contain"
        style={styles.analysisImage}
      />
      <View pointerEvents="none" style={styles.blurMiddleClip}>
        <Image
          source={source}
          resizeMode="contain"
          blurRadius={2}
          style={styles.analysisImage}
        />
      </View>
      <View pointerEvents="none" style={styles.blurBottomClip}>
        <Image
          source={source}
          resizeMode="contain"
          blurRadius={6}
          style={styles.analysisImage}
        />
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', '#FFFFFF']}
        locations={[0, 0.58, 1]}
        style={styles.imageFade}
      />
    </View>
  );
}

export function AnalysisReferencePlanCard({
  description,
  dueValue,
  hasAttachedResult = false,
  image,
  onView,
  statusLabel,
  title,
}: {
  description?: string;
  dueLabel: string;
  dueValue: string;
  hasAttachedResult?: boolean;
  image?: ImageSourcePropType;
  onView?: () => void;
  statusLabel?: string;
  title: string;
  validityLabel?: string;
  validityValue?: string;
}) {
  const complete = hasAttachedResult || Boolean(statusLabel);

  return (
    <View style={styles.planCard}>
      {image ? <ProgressiveBlurImage source={image} title={title} /> : null}
      <View style={styles.planHeading}>
        <Text numberOfLines={1} style={styles.planTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.planSubtitle}>
          {description}
        </Text>
      </View>
      {complete ? (
        <View style={styles.completeBadge}>
          <CheckIcon />
        </View>
      ) : (
        <View style={styles.dueBadge}>
          <Text style={styles.dueBadgeText}>{dueValue || '28d'}</Text>
        </View>
      )}

      <View style={styles.cardRule} />
      <View style={styles.cardDetails}>
        <Text numberOfLines={1} style={styles.detailLine}>
          <Text style={styles.detailStrong}>Why:</Text>{' '}
          {complete
            ? 'Screen for common urine changes'
            : 'Estimate heart and vessel risk'}
        </Text>
        <Text style={styles.detailLine}>
          <Text style={styles.detailStrong}>Result:</Text>{' '}
          {complete ? 'Added' : 'Not added'}
        </Text>
        <Text style={styles.detailLine}>
          <Text style={styles.detailStrong}>Valid for:</Text>{' '}
          {complete ? '6 months' : '12 months'}
        </Text>
      </View>
      <View style={[styles.cardRule, styles.bottomRule]} />
      <View style={styles.cardActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onView}
          style={styles.infoButton}
        >
          <Text style={styles.infoButtonText}>Info</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onView}
          style={styles.resultButton}
        >
          <Text style={styles.resultButtonText}>
            {complete ? 'View Result' : 'Add Result'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadControl: { width: 116, height: 48, borderRadius: 24 },
  uploadContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  uploadText: {
    color: ink,
    fontFamily: fonts.sfRegular,
    fontSize: 17,
    lineHeight: 21,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: -1,
    textAlign: 'center',
    color: ink,
    fontFamily: fonts.sfBold,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.5,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsCard: {
    height: 197,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    padding: 16,
    ...cardShadow,
  },
  metricsRow: { height: 91, flexDirection: 'row' },
  metric: { flex: 1, paddingLeft: 14, paddingRight: 8 },
  metricWide: { flex: 1.35, paddingLeft: 0, paddingRight: 10 },
  metricMiddle: { flex: 1.2 },
  metricLast: { paddingRight: 0 },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 91,
    marginTop: 0,
    backgroundColor: '#CCD0DC',
  },
  metricValue: {
    color: ink,
    fontFamily: fonts.stackSansNotch,
    fontWeight: '700',
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -1.5,
  },
  metricLabel: {
    marginTop: 1,
    color: secondary,
    fontFamily: fonts.sfMedium,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.25,
  },
  volumeTitle: {
    marginTop: 7,
    color: secondary,
    fontFamily: fonts.sfRegular,
    fontSize: 14,
    lineHeight: 18,
  },
  volumeBars: {
    height: 22,
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
  },
  volumeBar: { width: 2, borderRadius: 2, backgroundColor: '#E7E7E7' },
  volumeBarActive: { backgroundColor: success },
  volumeFooter: {
    marginTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  volumeCopy: {
    color: secondary,
    fontFamily: fonts.sfRegular,
    fontSize: 13.5,
    lineHeight: 17,
  },
  volumeStrong: { color: ink, fontFamily: fonts.sfSemibold },
  deadlineRow: { width: '100%', flexDirection: 'row', gap: 16 },
  deadlineCard: {
    height: 105,
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
    ...cardShadow,
  },
  deadlineCount: {
    color: ink,
    fontFamily: fonts.stackSansNotch,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
  },
  deadlineArrow: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ink,
  },
  deadlineCopy: {
    marginTop: 0,
    color: secondary,
    fontFamily: fonts.sfRegular,
    fontSize: 13.5,
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  deadlineStrong: { color: ink, fontFamily: fonts.sfSemibold },
  planCard: {
    position: 'relative',
    height: 242,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    ...cardShadow,
  },
  imageFrame: {
    position: 'absolute',
    top: 12,
    left: 16,
    width: 82,
    height: 86,
    overflow: 'hidden',
  },
  analysisImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 82,
    height: 86,
  },
  blurMiddleClip: {
    position: 'absolute',
    top: 44,
    left: 0,
    width: 82,
    height: 42,
    overflow: 'hidden',
  },
  blurBottomClip: {
    position: 'absolute',
    top: 63,
    left: 0,
    width: 82,
    height: 23,
    overflow: 'hidden',
  },
  imageFade: { ...StyleSheet.absoluteFillObject, top: 42 },
  planHeading: { position: 'absolute', top: 30, left: 98, right: 67 },
  planTitle: {
    color: ink,
    fontFamily: fonts.sfRegular,
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: -0.45,
  },
  planSubtitle: {
    marginTop: 3,
    color: secondary,
    fontFamily: fonts.sfRegular,
    fontSize: 14.5,
    lineHeight: 18,
    letterSpacing: -0.3,
  },
  dueBadge: {
    position: 'absolute',
    top: 35,
    right: 16,
    minWidth: 42,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ink,
  },
  dueBadgeText: {
    color: '#FFFFFF',
    fontFamily: fonts.sfRegular,
    fontSize: 13,
    lineHeight: 16,
  },
  completeBadge: {
    position: 'absolute',
    top: 39,
    right: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: success,
  },
  cardRule: {
    position: 'absolute',
    top: 95,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E8E8E8',
  },
  cardDetails: { position: 'absolute', top: 107, left: 16, right: 16, gap: 4 },
  detailLine: {
    color: secondary,
    fontFamily: fonts.sfRegular,
    fontSize: 16,
    lineHeight: 20,
  },
  detailStrong: { color: ink, fontFamily: fonts.sfMedium },
  bottomRule: { top: 180 },
  cardActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    height: 36,
    flexDirection: 'row',
    gap: 10,
  },
  infoButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: ink,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonText: {
    color: ink,
    fontFamily: fonts.sfRegular,
    fontSize: 15,
    lineHeight: 18,
  },
  resultButton: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ink,
  },
  resultButtonText: {
    color: '#FFFFFF',
    fontFamily: fonts.sfRegular,
    fontSize: 15,
    lineHeight: 18,
  },
});
