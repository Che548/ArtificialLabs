import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { StatusBar } from 'expo-status-bar';
import type { ComponentType, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SvgProps } from 'react-native-svg';

import ContentShape from '../assets/figma/content-shape.svg';
import BabyIcon from '../assets/figma/onboarding/baby.svg';
import CycleIcon from '../assets/figma/onboarding/cycle.svg';
import HeartIcon from '../assets/figma/onboarding/heart.svg';
import { AppText } from './components';
import { colors, fonts, shadows } from './tokens';

type OnboardingGoal = 'cycle' | 'planning' | 'pregnancy';
type PregnancyDateKind = 'lastPeriod' | 'dueDate' | 'unknown';
type FirstStepVariant = 1 | 2 | 3 | 4 | 5;

export type OnboardingFlowResult = {
  displayName: string;
  goal: OnboardingGoal;
  birthDate: number;
  pregnancyStartAt?: number;
  lastPeriodStartAt?: number;
  cycleLengthDays?: number;
  postpartum?: boolean;
  postContraception?: boolean;
  medicalConditions: string[];
};

const goals: ReadonlyArray<{
  value: OnboardingGoal;
  title: string;
  description: string;
  icon: SFSymbol;
  assetIcon: ComponentType<SvgProps>;
}> = [
  {
    value: 'planning',
    title: 'Планировать беременность',
    description: 'Фертильное окно, овуляция и рекомендации для планирования',
    icon: 'heart.circle',
    assetIcon: HeartIcon,
  },
  {
    value: 'pregnancy',
    title: 'Следить за беременностью',
    description: 'Срок, этапы развития и персональная программа наблюдения',
    icon: 'figure.and.child.holdinghands',
    assetIcon: BabyIcon,
  },
  {
    value: 'cycle',
    title: 'Отслеживать цикл',
    description: 'Календарь, прогноз менструации и наблюдение за изменениями',
    icon: 'calendar',
    assetIcon: CycleIcon,
  },
];

const cycleFactors = [
  'Ничего из перечисленного',
  'Цикл нерегулярный',
  'Послеродовой период',
  'Грудное вскармливание',
  'Недавно отменила гормональную контрацепцию',
  'Есть заболевание, влияющее на цикл',
  'Не знаю',
] as const;

const diseaseOptions = [
  'СПКЯ',
  'Эндометриоз',
  'Заболевание щитовидной железы',
  'Гиперпролактинемия',
] as const;

const diseaseFactor = 'Есть заболевание, влияющее на цикл';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const selectionEase = Easing.bezier(0.22, 1, 0.36, 1);

function OnboardingShell({
  backLabel = 'Назад',
  children,
  contentTop = 480,
  nextLabel,
  nextDisabled = false,
  onBack,
  onNext,
  step,
}: {
  backLabel?: string;
  children: ReactNode;
  contentTop?: number;
  nextLabel: string;
  nextDisabled?: boolean;
  onBack: () => void;
  onNext: () => void;
  step: number;
}) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const scale = width / 402;
  const panelContentTop = Math.max(contentTop * scale, height * 0.525);
  const actionBottomPadding = Math.max(insets.bottom - 10, 16 * scale);
  const actionHeight = 46 + actionBottomPadding + 18 * scale;
  const progressBottom = actionHeight + 6 * scale;
  const scrollBottom = progressBottom + 20 * scale;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={require('../assets/figma/onboarding/background.png')}
        style={[
          styles.referenceBackground,
          {
            height: 868 * scale,
            top: -126 * scale,
            width,
          },
        ]}
      />

      <ContentShape
        pointerEvents="none"
        height={361 * scale}
        style={[styles.contentShape, { top: 413 * scale }]}
        width={width}
      />

      <View style={[styles.progressPill, { top: Math.max(insets.top + 8, 16 * scale) }]}>
        <AppText numeric role="body" weight="semibold" style={styles.progressText}>
          {step}/5
        </AppText>
      </View>

      <ScrollView
        key={`onboarding-step-${step}`}
        alwaysBounceVertical={false}
        automaticallyAdjustKeyboardInsets
        bounces={false}
        contentContainerStyle={styles.shellContentContainer}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        style={[
          styles.shellContent,
          {
            bottom: scrollBottom,
            top: panelContentTop,
          },
        ]}
      >
        {children}
      </ScrollView>

      <LinearGradient
        colors={['rgba(255,255,255,0)', '#FFFFFF']}
        pointerEvents="none"
        style={[styles.actionFade, { bottom: actionHeight }]}
      />

      <View style={[styles.stepSegments, { bottom: progressBottom }]}>
        {[1, 2, 3, 4, 5].map((item) => (
          <View key={item} style={[styles.stepSegment, item <= step && styles.stepSegmentActive]} />
        ))}
      </View>

      <View
        style={[
          styles.actionSurface,
          {
            height: actionHeight,
            paddingBottom: actionBottomPadding,
            paddingHorizontal: 16 * scale,
          },
        ]}
      >
        <View style={[styles.actionRow, { gap: 15 * scale }]}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.secondaryAction}>
            <AppText role="body" weight="semibold" color={colors.text.primary}>
              {backLabel}
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: nextDisabled }}
            disabled={nextDisabled}
            onPress={onNext}
            style={[styles.primaryAction, nextDisabled && styles.primaryActionDisabled]}
            testID="e2e-onboarding-next"
          >
            <AppText role="body" weight="semibold" color="#FFFFFF">
              {nextLabel}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function GoalGlyph({ goal, selected }: { goal: (typeof goals)[number]; selected: boolean }) {
  return (
    <View style={[styles.goalGlyph, selected && styles.goalGlyphSelected]}>
      <SymbolView
        name={goal.icon}
        tintColor={selected ? '#FFFFFF' : colors.brand.primary}
        size={22}
        type="monochrome"
      />
    </View>
  );
}

function Check({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

function GoalVariant({
  goal,
  onChange,
  variant,
}: {
  goal: OnboardingGoal;
  onChange: (goal: OnboardingGoal) => void;
  variant: FirstStepVariant;
}) {
  if (variant === 2) {
    return (
      <View style={styles.variantTwoList}>
        {goals.map((item, index) => {
          const selected = goal === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChange(item.value)}
              style={[styles.editorialChoice, selected && styles.editorialChoiceSelected]}
            >
              <AppText numeric role="caption" color={selected ? colors.brand.primary : colors.text.secondary}>
                0{index + 1}
              </AppText>
              <View style={styles.editorialText}>
                <AppText role="body" weight="semibold">{item.title}</AppText>
                <AppText role="caption" color={colors.text.secondary} style={styles.choiceDescription}>
                  {item.description}
                </AppText>
              </View>
              <Check selected={selected} />
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (variant === 3) {
    return (
      <View style={styles.variantThreeGrid}>
        {goals.map((item, index) => {
          const selected = goal === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChange(item.value)}
              style={[
                styles.posterChoice,
                index === 0 && styles.posterChoiceWide,
                selected && styles.posterChoiceSelected,
              ]}
            >
              <GoalGlyph goal={item} selected={selected} />
              <AppText role="body" weight="semibold" style={styles.posterTitle}>
                {item.title}
              </AppText>
              <Check selected={selected} />
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (variant === 4) {
    return (
      <View style={styles.pathList}>
        <View pointerEvents="none" style={styles.pathLine} />
        {goals.map((item, index) => {
          const selected = goal === item.value;
          return (
            <Pressable key={item.value} onPress={() => onChange(item.value)} style={styles.pathChoice}>
              <View style={[styles.pathIndex, selected && styles.pathIndexSelected]}>
                <AppText numeric role="label" weight="semibold" color={selected ? '#FFFFFF' : colors.text.secondary}>
                  {index + 1}
                </AppText>
              </View>
              <View style={[styles.pathCard, selected && styles.pathCardSelected]}>
                <AppText role="body" weight="semibold">{item.title}</AppText>
                <AppText role="caption" color={colors.text.secondary} style={styles.choiceDescription}>
                  {item.description}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (variant === 5) {
    return (
      <View style={styles.compactPanel}>
        <AppText role="caption" weight="semibold" color={colors.brand.primary} style={styles.compactEyebrow}>
          ВЫБЕРИТЕ ПРОГРАММУ
        </AppText>
        {goals.map((item) => {
          const selected = goal === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChange(item.value)}
              style={[styles.compactChoice, selected && styles.compactChoiceSelected]}
            >
              <GoalGlyph goal={item} selected={selected} />
              <AppText role="body" weight={selected ? 'semibold' : 'regular'} style={styles.compactChoiceText}>
                {item.title}
              </AppText>
              <SymbolView
                name={selected ? 'checkmark.circle.fill' : 'circle'}
                tintColor={selected ? colors.brand.primary : '#C9C4C5'}
                size={22}
                type="monochrome"
              />
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.goalCards}>
      {goals.map((item) => {
        const selected = goal === item.value;
        return (
          <Pressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[styles.goalCard, selected && styles.goalCardSelected]}
          >
            <GoalGlyph goal={item} selected={selected} />
            <View style={styles.goalText}>
              <AppText role="body" weight="semibold">{item.title}</AppText>
              <AppText role="caption" color={colors.text.secondary} style={styles.choiceDescription}>
                {item.description}
              </AppText>
            </View>
            <Check selected={selected} />
          </Pressable>
        );
      })}
    </View>
  );
}

function NumberWheel({
  compact = false,
  editable = false,
  label,
  max,
  min,
  suffix,
  value,
  onChange,
}: {
  compact?: boolean;
  editable?: boolean;
  label: string;
  max: number;
  min: number;
  suffix: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draftValue, setDraftValue] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraftValue(String(value));
  }, [editing, value]);

  const commitDraftValue = () => {
    const parsed = Number.parseInt(draftValue, 10);
    const nextValue = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    onChange(nextValue);
    setDraftValue(String(nextValue));
    setEditing(false);
  };

  return (
    <View style={[styles.wheelBlock, compact && styles.wheelBlockCompact]}>
      <AppText role="label" weight="medium" style={compact ? styles.compactWheelLabel : undefined}>{label}</AppText>
      <View style={styles.wheelControl}>
        <Pressable accessibilityLabel={`Уменьшить ${label}`} onPress={() => onChange(Math.max(min, value - 1))} style={[styles.wheelButton, compact && styles.wheelButtonCompact]}>
          <AppText role="heading" color={colors.brand.primary}>−</AppText>
        </Pressable>
        <View style={styles.wheelValue}>
          {editable ? (
            <TextInput
              accessibilityLabel={label}
              keyboardType="number-pad"
              maxLength={4}
              onBlur={commitDraftValue}
              onChangeText={(next) => setDraftValue(next.replace(/\D/g, ''))}
              onFocus={() => setEditing(true)}
              onSubmitEditing={commitDraftValue}
              selectTextOnFocus
              selectionColor={colors.brand.primary}
              style={styles.wheelValueInput}
              value={draftValue}
            />
          ) : (
            <AppText numeric role="display" weight="semibold">{value}</AppText>
          )}
          <AppText role="caption" color={colors.text.secondary}>{suffix}</AppText>
        </View>
        <Pressable accessibilityLabel={`Увеличить ${label}`} onPress={() => onChange(Math.min(max, value + 1))} style={[styles.wheelButton, compact && styles.wheelButtonCompact]}>
          <AppText role="heading" color={colors.brand.primary}>+</AppText>
        </Pressable>
      </View>
    </View>
  );
}

function CycleMeasure({
  label,
  max,
  min,
  unknown,
  value,
  onChange,
  onUnknownChange,
}: {
  label: string;
  max: number;
  min: number;
  unknown: boolean;
  value: number;
  onChange: (value: number) => void;
  onUnknownChange: (unknown: boolean) => void;
}) {
  const transition = useRef(new Animated.Value(unknown ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(transition, {
      duration: 260,
      easing: selectionEase,
      toValue: unknown ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [transition, unknown]);

  return (
    <View style={styles.measureColumn}>
      <View style={styles.metricCardStage}>
        <Animated.View
          pointerEvents={unknown ? 'none' : 'auto'}
          style={[
            styles.metricStateLayer,
            {
              opacity: transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [
                { translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) },
                { scale: transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] }) },
              ],
            },
          ]}
        >
          <NumberWheel compact label={label} min={min} max={max} suffix="дней" value={value} onChange={onChange} />
        </Animated.View>

        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => onUnknownChange(false)}
          pointerEvents={unknown ? 'auto' : 'none'}
          style={[
            styles.unknownMeasureCard,
            {
              opacity: transition,
              transform: [
                { translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) },
                { scale: transition.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
              ],
            },
          ]}
        >
          <AppText role="label" weight="medium" style={styles.unknownMeasureLabel}>{label}</AppText>
          <View style={styles.unknownMeasureAction}>
            <AppText role="label" weight="semibold" color={colors.brand.primary}>Указать</AppText>
          </View>
        </AnimatedPressable>
      </View>

      <AnimatedPressable
        onPress={() => onUnknownChange(true)}
        pointerEvents={unknown ? 'none' : 'auto'}
        style={[
          styles.textAction,
          {
            opacity: transition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
          },
        ]}
      >
        <AppText role="caption" weight="medium" color={colors.brand.primary}>Не знаю</AppText>
      </AnimatedPressable>
    </View>
  );
}

function ChoiceRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(selection, {
      duration: 220,
      easing: selectionEase,
      toValue: selected ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [selected, selection]);

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[
        styles.simpleChoice,
        {
          backgroundColor: selection.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#FFF7FA'] }),
          borderColor: selection.interpolate({ inputRange: [0, 1], outputRange: ['#E9E2E4', colors.brand.primary] }),
          transform: [{ scale: selection.interpolate({ inputRange: [0, 1], outputRange: [1, 1.012] }) }],
        },
      ]}
    >
      <AppText role="label" weight="medium" style={styles.simpleChoiceText}>{label}</AppText>
      <Check selected={selected} />
    </AnimatedPressable>
  );
}

function GoalPill({
  item,
  selected,
  onPress,
}: {
  item: (typeof goals)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const Icon = item.assetIcon;
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(selection, {
      duration: 240,
      easing: selectionEase,
      toValue: selected ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [selected, selection]);

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.goalPill,
        {
          backgroundColor: selection.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#FFF7FA'] }),
          borderColor: selection.interpolate({ inputRange: [0, 1], outputRange: ['#E5E1E3', '#F2A8CB'] }),
          transform: [{ scale: selection.interpolate({ inputRange: [0, 1], outputRange: [1, 1.018] }) }],
        },
      ]}
    >
      <Icon width={24} height={24} />
      <AppText role="body" weight="medium" style={styles.goalPillText}>
        {item.title}
      </AppText>
    </AnimatedPressable>
  );
}

function AnimatedFactorPill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(selection, {
      duration: 220,
      easing: selectionEase,
      toValue: selected ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [selected, selection]);

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.factorPill,
        {
          backgroundColor: selection.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#FFF7FA'] }),
          borderColor: selection.interpolate({ inputRange: [0, 1], outputRange: ['#E5E1E3', '#F2A8CB'] }),
          transform: [{ scale: selection.interpolate({ inputRange: [0, 1], outputRange: [1, 1.015] }) }],
        },
      ]}
    >
      <Animated.View
        style={{
          opacity: selection,
          transform: [{ scale: selection.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
          overflow: 'hidden',
          width: selection.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }),
        }}
      >
        <SymbolView name="checkmark" tintColor={colors.brand.primary} size={13} type="monochrome" />
      </Animated.View>
      <AppText role="caption" weight="medium" style={styles.factorPillText}>{label}</AppText>
    </AnimatedPressable>
  );
}

function DiseasePickerModal({
  customValue,
  onCancel,
  onClear,
  onCustomValueChange,
  onSave,
  onToggle,
  selected,
  visible,
}: {
  customValue: string;
  onCancel: () => void;
  onClear: () => void;
  onCustomValueChange: (value: string) => void;
  onSave: () => void;
  onToggle: (value: string) => void;
  selected: Set<string>;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const canSave = selected.size > 0 || customValue.trim().length > 0;
  const [mounted, setMounted] = useState(visible);
  const appear = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => {
        Animated.timing(appear, {
          duration: 320,
          easing: selectionEase,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
      return;
    }

    if (mounted) {
      Animated.timing(appear, {
        duration: 220,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [appear, mounted, visible]);

  return (
    <Modal
      animationType="none"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={mounted}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.diseaseModalRoot}>
        <AnimatedPressable
          accessibilityLabel="Закрыть выбор заболевания"
          onPress={onCancel}
          style={[styles.diseaseBackdrop, { opacity: appear }]}
        />
        <Animated.View
          style={[
            styles.diseaseSheet,
            {
              paddingBottom: Math.max(insets.bottom, 18),
              opacity: appear,
              transform: [
                { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [82, 0] }) },
                { scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
              ],
            },
          ]}
        >
          <View style={styles.diseaseHandle} />
          <View style={styles.diseaseHeader}>
            <View style={styles.diseaseHeaderText}>
              <AppText role="heading" weight="semibold">Заболевание</AppText>
              <AppText role="caption" color={colors.text.secondary}>Можно выбрать несколько вариантов или ввести свой.</AppText>
            </View>
            <Pressable accessibilityLabel="Закрыть" hitSlop={10} onPress={onCancel} style={styles.diseaseClose}>
              <SymbolView name="xmark" tintColor={colors.text.primary} size={15} type="monochrome" />
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            contentContainerStyle={styles.diseaseContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.diseaseOptions}>
              {diseaseOptions.map((option) => (
                <AnimatedFactorPill
                  key={option}
                  label={option}
                  onPress={() => onToggle(option)}
                  selected={selected.has(option)}
                />
              ))}
            </View>

            <View style={styles.diseaseInputBlock}>
              <AppText role="label" weight="medium">Другой вариант</AppText>
              <TextInput
                autoCapitalize="sentences"
                onChangeText={onCustomValueChange}
                placeholder="Введите название заболевания"
                placeholderTextColor="#9A9495"
                returnKeyType="done"
                style={styles.diseaseInput}
                value={customValue}
              />
            </View>
          </ScrollView>

          <View style={styles.diseaseActions}>
            <Pressable accessibilityRole="button" onPress={onClear} style={styles.diseaseClearAction}>
              <AppText role="label" weight="medium" color={colors.text.secondary}>Не указывать</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!canSave}
              onPress={onSave}
              style={[styles.diseaseSaveAction, !canSave && styles.diseaseSaveActionDisabled]}
            >
              <AppText role="label" weight="semibold" color="#FFFFFF">Сохранить</AppText>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function OnboardingPreviewFlow({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete?: (result: OnboardingFlowResult) => Promise<void> | void;
}) {
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState<OnboardingGoal>('planning');
  const [birthYear, setBirthYear] = useState(1996);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date());
  const [cycleLength, setCycleLength] = useState(28);
  const [periodLength, setPeriodLength] = useState(5);
  const [dateUnknown, setDateUnknown] = useState(false);
  const [cycleUnknown, setCycleUnknown] = useState(false);
  const [periodUnknown, setPeriodUnknown] = useState(false);
  const [pregnancyDateKind, setPregnancyDateKind] = useState<PregnancyDateKind>('lastPeriod');
  const [factors, setFactors] = useState<Set<string>>(new Set(['Ничего из перечисленного']));
  const [selectedDiseases, setSelectedDiseases] = useState<Set<string>>(new Set());
  const [customDisease, setCustomDisease] = useState('');
  const [diseaseModalVisible, setDiseaseModalVisible] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;

  const transitionContent = (update: () => void, direction: 1 | -1) => {
    if (transitioning) return;
    setTransitioning(true);

    Animated.parallel([
      Animated.timing(contentOpacity, {
        duration: 110,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateX, {
        duration: 110,
        easing: Easing.in(Easing.quad),
        toValue: -8 * direction,
        useNativeDriver: true,
      }),
    ]).start(() => {
      update();
      contentOpacity.setValue(0);
      contentTranslateX.setValue(10 * direction);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(contentOpacity, {
            duration: 260,
            easing: selectionEase,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(contentTranslateX, {
            duration: 260,
            easing: selectionEase,
            toValue: 0,
            useNativeDriver: true,
          }),
        ]).start(() => setTransitioning(false));
      });
    });
  };

  const toggleFactor = (factor: string) => {
    if (factor === diseaseFactor) {
      setDiseaseModalVisible(true);
      return;
    }

    setFactors((current) => {
      if (factor === 'Ничего из перечисленного') return new Set([factor]);
      const next = new Set(current);
      next.delete('Ничего из перечисленного');
      if (next.has(factor)) next.delete(factor);
      else next.add(factor);
      return next.size ? next : new Set(['Ничего из перечисленного']);
    });
  };

  const toggleDisease = (disease: string) => {
    setSelectedDiseases((current) => {
      const next = new Set(current);
      if (next.has(disease)) next.delete(disease);
      else next.add(disease);
      return next;
    });
  };

  const clearDiseases = () => {
    setSelectedDiseases(new Set());
    setCustomDisease('');
    setFactors((current) => {
      const next = new Set(current);
      next.delete(diseaseFactor);
      return next.size ? next : new Set(['Ничего из перечисленного']);
    });
    setDiseaseModalVisible(false);
  };

  const saveDiseases = () => {
    if (selectedDiseases.size === 0 && !customDisease.trim()) return;
    setFactors((current) => {
      const next = new Set(current);
      next.delete('Ничего из перечисленного');
      next.add(diseaseFactor);
      return next;
    });
    setDiseaseModalVisible(false);
  };

  const complete = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmissionError(undefined);

    const selectedDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12,
    ).getTime();
    const dueDateOffset = 280 * 24 * 60 * 60 * 1000;
    const medicalConditions = [...selectedDiseases];
    if (customDisease.trim()) medicalConditions.push(customDisease.trim());

    try {
      await onComplete?.({
        displayName: name.trim() || 'Пользователь',
        goal,
        birthDate: new Date(birthYear, 0, 1, 12).getTime(),
        pregnancyStartAt:
          goal === 'pregnancy' && pregnancyDateKind !== 'unknown'
            ? pregnancyDateKind === 'dueDate'
              ? selectedDate - dueDateOffset
              : selectedDate
            : undefined,
        lastPeriodStartAt:
          goal !== 'pregnancy' && !dateUnknown ? selectedDate : undefined,
        cycleLengthDays:
          goal !== 'pregnancy' && !cycleUnknown ? cycleLength : undefined,
        postpartum: factors.has('Послеродовой период') || undefined,
        postContraception:
          factors.has('Недавно отменила гормональную контрацепцию') || undefined,
        medicalConditions,
      });
      transitionContent(() => setCompleted(true), 1);
    } catch (cause) {
      console.error('Onboarding failed', cause);
      setSubmissionError('Не удалось сохранить данные. Попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <OnboardingShell
        nextLabel="Открыть"
        onBack={() => {
          transitionContent(() => {
            setCompleted(false);
            setStep(5);
          }, -1);
        }}
        onNext={onClose}
        step={5}
        contentTop={505}
      >
        <Animated.View style={[styles.completeScreen, { opacity: contentOpacity, transform: [{ translateX: contentTranslateX }] }] }>
          <View style={styles.completeGlyph}>
            <SymbolView name="checkmark" tintColor="#FFFFFF" size={34} type="monochrome" />
          </View>
          <AppText role="display" weight="semibold" style={styles.completeTitle}>
            Готово
          </AppText>
          <AppText role="body" color={colors.text.secondary} style={styles.completeText}>
            Программа наблюдения создана. Точность прогнозов будет повышаться по мере заполнения данных и сканирования тестов.
          </AppText>
        </Animated.View>
      </OnboardingShell>
    );
  }

  return (
    <>
      <OnboardingShell
      backLabel="Назад"
      contentTop={step === 1 ? 500 : 480}
      nextLabel={step === 5 ? 'Начать' : 'Далее'}
      nextDisabled={submitting}
      onBack={step === 1 ? onClose : () => transitionContent(() => setStep(step - 1), -1)}
      onNext={() => {
        if (step < 5) transitionContent(() => setStep(step + 1), 1);
        else void complete();
      }}
      step={step}
    >
      <Animated.View
        style={[
          styles.content,
          step === 1 && styles.firstStepContent,
          { opacity: contentOpacity, transform: [{ translateX: contentTranslateX }] },
        ]}
      >
        {step === 1 ? (
          <>
            <AppText role="display" weight="semibold" style={[styles.title, styles.centeredTitle]}>
              Для чего вы хотите{`\n`}использовать Сферу?
            </AppText>
            <View accessibilityRole="radiogroup" style={styles.goalPillList}>
              {goals.map((item) => (
                <GoalPill
                  item={item}
                  key={item.value}
                  onPress={() => setGoal(item.value)}
                  selected={goal === item.value}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <AppText role="display" weight="semibold" style={[styles.title, styles.centeredTitle]}>Немного о вас</AppText>
            <NumberWheel editable label="Год рождения" min={1940} max={2010} suffix="год" value={birthYear} onChange={setBirthYear} />
            <View style={styles.fieldBlock}>
              <AppText role="label" weight="medium">Как к вам обращаться?</AppText>
              <TextInput testID="e2e-onboarding-name" value={name} onChangeText={setName} placeholder="Имя — необязательно" placeholderTextColor="#9A9495" style={styles.field} />
            </View>
          </>
        ) : null}

        {step === 3 ? (
          <>
            {goal === 'pregnancy' ? (
              <>
                <AppText role="display" weight="semibold" style={[styles.title, styles.centeredTitle]}>Какая дата вам известна?</AppText>
                <View style={styles.simpleChoiceList}>
                  <ChoiceRow label="Первый день последней менструации" selected={pregnancyDateKind === 'lastPeriod'} onPress={() => setPregnancyDateKind('lastPeriod')} />
                  <ChoiceRow label="Предполагаемая дата родов" selected={pregnancyDateKind === 'dueDate'} onPress={() => setPregnancyDateKind('dueDate')} />
                  <ChoiceRow label="Пока не знаю" selected={pregnancyDateKind === 'unknown'} onPress={() => setPregnancyDateKind('unknown')} />
                </View>
              </>
            ) : (
              <>
                <AppText role="display" weight="semibold" style={[styles.title, styles.centeredTitle]}>Когда началась последняя менструация?</AppText>
                <View style={styles.dateStepCard}>
                  <AppText role="body" weight="semibold" style={styles.dateStepLabel}>
                    {dateUnknown ? 'Дата не указана' : 'Дата начала'}
                  </AppText>
                  {dateUnknown ? (
                    <Pressable accessibilityRole="button" onPress={() => setDateUnknown(false)} style={styles.dateRestoreAction}>
                      <AppText role="label" weight="semibold" color={colors.brand.primary}>Указать дату</AppText>
                    </Pressable>
                  ) : (
                    <View style={styles.datePickerSurface}>
                      <DateTimePicker
                        value={date}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'compact' : 'default'}
                        onChange={(_, next) => next && setDate(next)}
                        accentColor={colors.brand.primary}
                        style={styles.datePickerControl}
                      />
                    </View>
                  )}
                </View>
                {!dateUnknown ? (
                  <Pressable accessibilityRole="button" onPress={() => setDateUnknown(true)} style={styles.dateUnknownAction}>
                    <SymbolView name="questionmark.circle" tintColor={colors.brand.primary} size={17} type="monochrome" />
                    <AppText role="label" weight="medium" color={colors.brand.primary}>Не помню дату</AppText>
                  </Pressable>
                ) : null}
              </>
            )}
          </>
        ) : null}

        {step === 4 ? (
          <>
            {goal === 'pregnancy' ? (
              <>
                <AppText role="display" weight="semibold" style={[styles.title, styles.centeredTitle]}>Выберите дату</AppText>
                <AppText role="label" color={colors.text.secondary} style={[styles.description, styles.centeredDescription]}>
                  {pregnancyDateKind === 'dueDate' ? 'Предполагаемая дата родов' : pregnancyDateKind === 'lastPeriod' ? 'Первый день последней менструации' : 'Дату можно добавить позже'}
                </AppText>
                {pregnancyDateKind !== 'unknown' ? (
                  <View style={styles.questionBlock}>
                    <DateTimePicker value={date} mode="date" display={Platform.OS === 'ios' ? 'compact' : 'default'} onChange={(_, next) => next && setDate(next)} accentColor={colors.brand.primary} />
                  </View>
                ) : (
                  <View style={styles.note}>
                    <SymbolView name="info.circle" tintColor={colors.brand.primary} size={19} type="monochrome" />
                    <AppText role="caption" color={colors.text.secondary} style={styles.noteText}>Мы начнём без даты. Её можно будет указать в профиле.</AppText>
                  </View>
                )}
              </>
            ) : (
              <>
                <AppText role="display" weight="semibold" style={[styles.title, styles.centeredTitle]}>Расскажите о цикле</AppText>
                <View style={styles.measureGrid}>
                  <CycleMeasure label="Длина цикла" min={20} max={45} unknown={cycleUnknown} value={cycleLength} onChange={setCycleLength} onUnknownChange={setCycleUnknown} />
                  <CycleMeasure label="Менструация" min={2} max={10} unknown={periodUnknown} value={periodLength} onChange={setPeriodLength} onUnknownChange={setPeriodUnknown} />
                </View>
              </>
            )}
          </>
        ) : null}

        {step === 5 ? (
          <>
            <AppText role="display" weight="semibold" style={[styles.title, styles.centeredTitle]}>Что может влиять на цикл?</AppText>
            <AppText role="label" color={colors.text.secondary} style={[styles.description, styles.centeredDescription]}>Можно выбрать несколько вариантов.</AppText>
            <View style={styles.factorPills}>
              {cycleFactors.map((factor) => {
                const selected = factors.has(factor);
                return (
                  <AnimatedFactorPill key={factor} label={factor} onPress={() => toggleFactor(factor)} selected={selected} />
                );
              })}
            </View>
            {submissionError ? (
              <AppText role="caption" color={colors.state.error} style={styles.submissionError}>
                {submissionError}
              </AppText>
            ) : null}
          </>
        ) : null}
      </Animated.View>
      </OnboardingShell>
      <DiseasePickerModal
        customValue={customDisease}
        onCancel={() => setDiseaseModalVisible(false)}
        onClear={clearDiseases}
        onCustomValueChange={setCustomDisease}
        onSave={saveDiseases}
        onToggle={toggleDisease}
        selected={selectedDiseases}
        visible={diseaseModalVisible}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  referenceBackground: { position: 'absolute', left: 0 },
  contentShape: { position: 'absolute', zIndex: 2, left: 0 },
  progressPill: {
    position: 'absolute',
    zIndex: 10,
    left: '50%',
    width: 156,
    height: 48,
    marginLeft: -78,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.92)',
    ...shadows.floating,
  },
  progressText: { fontSize: 23, lineHeight: 27, color: colors.brand.primary },
  shellContent: { position: 'absolute', zIndex: 4, left: 0, right: 0 },
  shellContentContainer: { paddingBottom: 36 },
  content: { paddingHorizontal: 20, gap: 12 },
  firstStepContent: { paddingHorizontal: 28, gap: 28, alignItems: 'center' },
  centeredTitle: { textAlign: 'center', alignSelf: 'stretch' },
  centeredDescription: { textAlign: 'center', alignSelf: 'stretch' },
  goalPillList: { alignSelf: 'stretch', alignItems: 'center', gap: 10 },
  goalPill: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#E5E1E3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  goalPillSelected: { borderColor: '#F2A8CB', backgroundColor: '#FFF7FA' },
  goalPillText: { fontSize: 18, lineHeight: 22 },
  actionFade: {
    position: 'absolute',
    zIndex: 7,
    left: 0,
    right: 0,
    height: 38,
  },
  stepSegments: {
    position: 'absolute',
    zIndex: 9,
    left: '50%',
    width: 280,
    marginLeft: -140,
    flexDirection: 'row',
    gap: 8,
  },
  stepSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#E4E1E2' },
  stepSegmentActive: { backgroundColor: colors.brand.primary },
  actionSurface: {
    position: 'absolute',
    zIndex: 8,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: '#FFFFFF',
  },
  actionRow: { height: 46, flexDirection: 'row' },
  secondaryAction: {
    flex: 1,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F1F3',
    borderWidth: 1,
    borderColor: '#EEE3E7',
  },
  primaryAction: {
    flex: 1,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  primaryActionDisabled: { opacity: 0.55 },
  submissionError: { textAlign: 'center', marginTop: 4 },
  title: { fontSize: 24, lineHeight: 27, letterSpacing: -0.45 },
  description: { fontSize: 14, lineHeight: 18 },
  variantHeader: { gap: 10 },
  variantTitleBlock: { gap: 5 },
  variantPicker: { gap: 7 },
  variantChip: { width: 36, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECE7E9' },
  variantChipActive: { backgroundColor: colors.brand.primary },
  goalCards: { gap: 9 },
  goalCard: { minHeight: 78, padding: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: '#EEE7E9', ...shadows.card },
  goalCardSelected: { borderColor: colors.brand.primary, backgroundColor: '#FFF7FA' },
  goalGlyph: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7E4EC' },
  goalGlyphSelected: { backgroundColor: colors.brand.primary },
  goalText: { flex: 1, gap: 2 },
  choiceDescription: { marginTop: 2, fontSize: 12, lineHeight: 15 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#C8C1C3', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.brand.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.brand.primary },
  variantTwoList: { borderTopWidth: 1, borderColor: '#DDD6D8' },
  editorialChoice: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#DDD6D8', flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  editorialChoiceSelected: { paddingHorizontal: 12, marginHorizontal: -12, backgroundColor: '#FFF7FA' },
  editorialText: { flex: 1 },
  variantThreeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  posterChoice: { width: '48%', minHeight: 128, padding: 13, borderRadius: 22, justifyContent: 'space-between', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECE5E7' },
  posterChoiceWide: { width: '100%', minHeight: 104 },
  posterChoiceSelected: { backgroundColor: '#FCE6EF', borderColor: colors.brand.primary },
  posterTitle: { maxWidth: 190 },
  pathList: { gap: 10, position: 'relative' },
  pathLine: { position: 'absolute', left: 19, top: 19, bottom: 19, width: 1, backgroundColor: '#D8CED1' },
  pathChoice: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pathIndex: { zIndex: 1, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEE8EA', borderWidth: 4, borderColor: '#FFFFFF' },
  pathIndexSelected: { backgroundColor: colors.brand.primary },
  pathCard: { flex: 1, padding: 12, borderRadius: 18, backgroundColor: '#FFFFFF' },
  pathCardSelected: { backgroundColor: '#FCEAF1', borderWidth: 1, borderColor: colors.brand.primary },
  compactPanel: { padding: 7, borderRadius: 24, backgroundColor: '#FFFFFF', ...shadows.card },
  compactEyebrow: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 5 },
  compactChoice: { minHeight: 60, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18 },
  compactChoiceSelected: { backgroundColor: '#FAEDF2' },
  compactChoiceText: { flex: 1 },
  wheelBlock: { padding: 14, gap: 10, borderRadius: 22, backgroundColor: '#FFFFFF', ...shadows.card },
  wheelBlockCompact: { flex: 1, minHeight: 126, paddingHorizontal: 10, paddingVertical: 12 },
  compactWheelLabel: { minHeight: 34, textAlign: 'center', fontSize: 14, lineHeight: 17 },
  wheelControl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wheelButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8EDF1' },
  wheelButtonCompact: { width: 34, height: 34, borderRadius: 17 },
  wheelValue: { alignItems: 'center' },
  wheelValueInput: {
    width: 92,
    height: 39,
    paddingHorizontal: 4,
    paddingVertical: 0,
    textAlign: 'center',
    color: colors.text.primary,
    fontFamily: fonts.sfSemibold,
    fontSize: 32,
    lineHeight: 36,
    fontVariant: ['tabular-nums'],
  },
  measureGrid: { flexDirection: 'row', gap: 10 },
  measureColumn: { flex: 1, alignItems: 'stretch', gap: 3 },
  metricCardStage: { height: 126, position: 'relative' },
  metricStateLayer: { ...StyleSheet.absoluteFillObject },
  unknownMeasureCard: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  unknownMeasureLabel: { alignSelf: 'stretch', textAlign: 'center', fontSize: 14, lineHeight: 17 },
  unknownMeasureAction: {
    minWidth: 96,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FCEAF2',
  },
  fieldBlock: { padding: 14, gap: 8, borderRadius: 22, backgroundColor: '#FFFFFF' },
  field: { height: 46, borderRadius: 14, paddingHorizontal: 13, backgroundColor: '#F2EFF0', color: colors.text.primary, fontFamily: fonts.sfRegular, fontSize: 16 },
  dateStepCard: {
    minHeight: 150,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dateStepLabel: { textAlign: 'center' },
  datePickerSurface: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerControl: {
    alignSelf: 'center',
    transform: [{ translateX: Platform.OS === 'ios' ? -4 : 0 }],
  },
  dateRestoreAction: {
    minWidth: 142,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FCEAF2',
  },
  dateUnknownAction: {
    alignSelf: 'center',
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1D8E3',
  },
  questionBlock: { padding: 14, gap: 10, borderRadius: 22, backgroundColor: '#FFFFFF' },
  simpleChoiceList: { gap: 8 },
  simpleChoice: { minHeight: 52, paddingHorizontal: 14, borderRadius: 17, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E2E4' },
  simpleChoiceSelected: { borderColor: colors.brand.primary, backgroundColor: '#FFF7FA' },
  simpleChoiceText: { flex: 1 },
  calendar: { alignSelf: 'stretch' },
  factorList: { gap: 7 },
  factorChoice: { minHeight: 52, paddingHorizontal: 13, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E9E2E4' },
  factorChoiceSelected: { borderColor: '#E9A4C3', backgroundColor: '#FFF7FA' },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#C8C1C3', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primary },
  factorText: { flex: 1 },
  factorPills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  factorPill: {
    minHeight: 38,
    maxWidth: '100%',
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E1E3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    backgroundColor: '#FFFFFF',
  },
  factorPillSelected: { borderColor: '#F2A8CB', backgroundColor: '#FFF7FA' },
  factorPillText: { flexShrink: 1, fontSize: 13, lineHeight: 16 },
  textAction: { alignSelf: 'center', paddingVertical: 2, paddingHorizontal: 8 },
  note: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: 16, backgroundColor: '#F9EAF0' },
  noteText: { flex: 1, lineHeight: 17 },
  completeScreen: { paddingHorizontal: 30, paddingTop: 2, alignItems: 'center' },
  completeGlyph: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand.primary, marginBottom: 11 },
  completeTitle: { textAlign: 'center', fontFamily: fonts.sfSemibold },
  completeText: { marginTop: 9, textAlign: 'center', lineHeight: 22 },
  diseaseModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  diseaseBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(43,31,36,0.22)' },
  diseaseSheet: {
    maxHeight: '78%',
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  diseaseHandle: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    marginBottom: 16,
    borderRadius: 3,
    backgroundColor: '#DED9DB',
  },
  diseaseHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  diseaseHeaderText: { flex: 1, gap: 4 },
  diseaseClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3EFF0',
  },
  diseaseContent: { paddingTop: 20, paddingBottom: 18, gap: 20 },
  diseaseOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingHorizontal: 3 },
  diseaseInputBlock: { gap: 8 },
  diseaseInput: {
    height: 50,
    paddingHorizontal: 15,
    borderRadius: 17,
    backgroundColor: '#F3EFF0',
    color: colors.text.primary,
    fontFamily: fonts.sfRegular,
    fontSize: 16,
  },
  diseaseActions: { flexDirection: 'row', gap: 12, paddingTop: 8 },
  diseaseClearAction: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F1F2',
  },
  diseaseSaveAction: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  diseaseSaveActionDisabled: { opacity: 0.38 },
});
