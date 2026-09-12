import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { colors as defaultThemeColors } from './tokens';
import { fontStyle } from '../lib/font-style';
import { useEffect, useState } from 'react';
import { AppState, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { analysisCountdown, analysisTimeRemaining } from '../lib/analysis-countdown';
import RightIcon from '../assets/analyses/reference-right.svg';
import { fonts, shadows } from './tokens';

const referenceIllustration = require('../assets/analyses/reference-metabolism.png');

export function AnalysisReferencePlanCard({
  title, description, purpose, onView, onResult, image,
  readOnly = false, hasAttachedResult = false, isCompleted = false,
  dueAt, periodStartAt,
}: {
  title: string;
  dueAt?: number;
  periodStartAt?: number;
  description?: string;
  purpose?: string;
  dueLabel: string;
  dueValue: string;
  validityLabel: string;
  validityValue: string;
  image?: ImageSourcePropType;
  statusLabel?: string;
  hasAttachedResult?: boolean;
  isCompleted?: boolean;
  onView?: () => void;
  onResult?: () => void;
  readOnly?: boolean;
  resultActionLabel?: string;
}) {
  const s = useThemeStyles(createS);
  const [now, setNow] = useState(Date.now);
  const showDeadline = !isCompleted && dueAt !== undefined && Number.isFinite(dueAt);
  useEffect(() => {
    if (!showDeadline) return;
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [showDeadline, dueAt]);
  const remaining = analysisTimeRemaining(periodStartAt, dueAt, now);
  const countdown = analysisCountdown(dueAt, now);
  const deadlineText = countdown.value === 'Сегодня' ? 'Срок — сегодня' : `${countdown.label} ${countdown.value}`;
  const openDetails = onView ?? ((!readOnly || hasAttachedResult || isCompleted) ? onResult : undefined);
  return (
    <Pressable cssInterop={false} accessibilityRole="button"
      accessibilityLabel={`Информация: ${title}${showDeadline ? `. ${deadlineText}` : ''}`}
      accessibilityHint="Открыть подробности анализа"
      accessibilityState={{disabled: !openDetails}}
      disabled={!openDetails} onPress={openDetails}
      style={({pressed}) => [s.card, pressed && s.pressed]}>
      <View style={s.content}>
      <Image source={image ?? referenceIllustration} resizeMode="contain" style={s.image} accessible={false} />
      <View style={s.heading}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {description || purpose ? <Text style={s.subtitle} numberOfLines={1}>{description || purpose}</Text> : null}
      </View>
      <View style={s.arrow} pointerEvents="none" accessible={false}>
        <RightIcon width={24} height={24} />
      </View>
      </View>
      {showDeadline ? (
        <View style={s.deadline} pointerEvents="none" accessible={false}>
          <Text style={s.deadlineText}>
            {countdown.value === 'Сегодня' ? 'Срок — ' : `${countdown.label} `}
            <Text style={s.deadlineValue}>
              {countdown.value === 'Сегодня' ? 'сегодня' : countdown.value}
            </Text>
          </Text>
          {remaining !== undefined ? (
            <View style={s.timeTrack}>
              <View style={[s.timeFill, { width: `${remaining * 100}%` }]} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const createS = (colors: ThemeColors) => StyleSheet.create({
  card: {minHeight: 106,
    borderRadius: 30, backgroundColor: colors.surface.raised, paddingHorizontal: 16, paddingVertical: 8,
    ...shadows.card},
  content: {flexDirection: 'row', alignItems: 'center', gap: 10},
  deadline: {gap: 5, marginTop: 4, paddingBottom: 8},
  deadlineText: {...fontStyle(fonts.sfRegular), fontSize: 11, lineHeight: 14, color: colors.text.secondary},
  deadlineValue: {...fontStyle(fonts.sfMedium), color: colors.text.primary},
  timeTrack: {height: 3, borderRadius: 2, backgroundColor: colors.surface.canvas === '#161417' ? colors.surface.raised : '#F3E8ED', overflow: 'hidden'},
  timeFill: {height: '100%', borderRadius: 2, backgroundColor: '#EA4087'},
  image: {width: 88, height: 88, marginLeft: -10, marginRight: -4},
  heading: {flex: 1, minWidth: 0, gap: 4, marginRight: 6},
  title: {...fontStyle(fonts.sfMedium), fontSize: 19, lineHeight: 24, letterSpacing: -0.35, color: colors.text.primary},
  subtitle: {...fontStyle(fonts.sfRegular), fontSize: 15, lineHeight: 19, letterSpacing: -0.25, color: colors.text.secondary},
  arrow: {width: 30, height: 30, borderRadius: 15, backgroundColor: '#D80B76', alignItems: 'center', justifyContent: 'center'},
  pressed: {opacity: 0.7},
});

const s = createS(defaultThemeColors);
