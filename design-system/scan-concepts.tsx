import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, GlassControl } from './components';
import { colors, radii, shadows, sizes, spacing } from './tokens';

const stripImage = require('../assets/figma/scan-screen/scan_test_strip.png');

const guideSteps = [
  {
    title: 'Подготовьте образец',
    body: 'Соберите мочу в чистую сухую ёмкость. Начните тест сразу после сбора.',
    note: 'Свежий образец даёт наиболее точный результат.',
    image: require('../assets/instructions/step_1_cup.png'),
  },
  {
    title: 'Откройте упаковку',
    body: 'Достаньте тест-полоску только перед использованием и не касайтесь реактивных зон.',
    note: 'Не используйте полоску из повреждённой упаковки.',
    image: require('../assets/instructions/step_2_package.png'),
  },
  {
    title: 'Погрузите полоску',
    body: 'Опустите реактивную часть до отметки MAX на 3-5 секунд.',
    note: 'Не погружайте тест глубже отметки MAX.',
    image: require('../assets/instructions/step_3_dip_test.png'),
  },
  {
    title: 'Положите горизонтально',
    body: 'Удалите лишнюю жидкость о край ёмкости и положите полоску на сухую ровную поверхность.',
    note: 'Цветовые зоны должны смотреть вверх.',
    image: require('../assets/instructions/step_4_test_strip.png'),
  },
  {
    title: 'Сканируйте результат',
    body: 'Подождите 3-7 минут. Затем наведите камеру на всю полоску при ровном дневном свете.',
    note: 'После 7 минут цвета могут измениться.',
    image: require('../assets/instructions/step_5_results.png'),
  },
] as const;

const variants = [
  { id: 'focus', number: '01', short: 'Фокус', title: 'Фокус' },
  { id: 'ready', number: '02', short: 'Готовность', title: 'Готовность' },
  { id: 'clinical', number: '03', short: 'Протокол', title: 'Протокол' },
  { id: 'ritual', number: '04', short: 'Ритуал', title: 'Ритуал' },
  { id: 'camera', number: '05', short: 'Камера', title: 'Камера' },
] as const;

type VariantId = (typeof variants)[number]['id'];
type ScreenMode = 'main' | 'guide';

type ScanConceptsLabProps = {
  onClose?: () => void;
};

function Symbol({
  color = colors.text.primary,
  fallback,
  name,
  size = 20,
}: {
  color?: string;
  fallback: string;
  name: SFSymbol;
  size?: number;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      weight="medium"
      tintColor={color}
      fallback={
        <AppText role="label" weight="semibold" color={color}>
          {fallback}
        </AppText>
      }
    />
  );
}

function IconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  icon: 'back' | 'close';
  onPress: () => void;
}) {
  return (
    <GlassControl
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.iconButton}
      tintColor="rgba(255,255,255,0.88)"
      washColor="rgba(255,255,255,0.54)"
    >
      <Symbol
        name={icon === 'back' ? 'chevron.left' : 'xmark'}
        fallback={icon === 'back' ? '‹' : '×'}
        size={icon === 'back' ? 21 : 19}
      />
    </GlassControl>
  );
}

function ActionButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.actionButtonPressed,
      ]}
    >
      <AppText role="body" weight="semibold" color={colors.text.inverse}>
        {label}
      </AppText>
      <Symbol name="arrow.right" fallback="→" color="#FFFFFF" size={18} />
    </Pressable>
  );
}

function VariantSelector({
  active,
  onChange,
}: {
  active: VariantId;
  onChange: (variant: VariantId) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.variantSelectorContent}
      style={styles.variantSelector}
      accessibilityLabel="Выбор варианта страницы сканирования"
    >
      {variants.map((variant) => {
        const selected = variant.id === active;
        return (
          <Pressable
            key={variant.id}
            accessibilityRole="tab"
            accessibilityLabel={`Вариант ${variant.number}: ${variant.short}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(variant.id)}
            style={({ pressed }) => [
              styles.variantTab,
              selected && styles.variantTabSelected,
              pressed && styles.variantTabPressed,
            ]}
          >
            <AppText
              numeric
              role="caption"
              weight="semibold"
              color={selected ? colors.text.inverse : colors.text.secondary}
              style={styles.variantNumber}
            >
              {variant.number}
            </AppText>
            <AppText
              role="label"
              weight={selected ? 'semibold' : 'medium'}
              color={selected ? colors.text.inverse : colors.text.primary}
            >
              {variant.short}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function StatusFact({
  children,
  icon,
}: {
  children: ReactNode;
  icon: SFSymbol;
}) {
  return (
    <View style={styles.statusFact}>
      <Symbol
        name={icon}
        fallback="•"
        size={16}
        color={colors.text.secondary}
      />
      <AppText role="caption" color={colors.text.secondary}>
        {children}
      </AppText>
    </View>
  );
}

function FocusMain({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.focusMain}>
      <View style={styles.focusCopy}>
        <AppText
          role="caption"
          weight="semibold"
          color={colors.text.secondary}
          style={styles.eyebrow}
        >
          ДОМАШНЯЯ ЛАБОРАТОРИЯ
        </AppText>
        <AppText role="display" weight="semibold" style={styles.focusTitle}>
          Один тест. Всё по шагам.
        </AppText>
        <AppText color={colors.text.secondary} style={styles.focusSubtitle}>
          Подготовьте полоску, сделайте снимок и подтвердите результат перед
          сохранением.
        </AppText>
      </View>

      <View style={styles.focusStage}>
        <View style={styles.focusHalo} />
        <Image
          source={stripImage}
          resizeMode="contain"
          accessibilityLabel="Тест-полоска для анализа мочи"
          style={styles.focusStrip}
        />
        <View style={styles.focusMeasureTop} />
        <View style={styles.focusMeasureBottom} />
      </View>

      <View style={styles.focusFooter}>
        <View style={styles.focusFacts}>
          <StatusFact icon="camera.fill">Подсказки прямо в кадре</StatusFact>
          <StatusFact icon="checkmark">
            Подтверждение перед сохранением
          </StatusFact>
        </View>
        <ActionButton label="Начать сканирование" onPress={onStart} />
      </View>
    </View>
  );
}

function ReadinessMain({ onStart }: { onStart: () => void }) {
  const [checked, setChecked] = useState(() => new Set([0, 1, 2]));
  const items = [
    'Свежий образец собран',
    'Тест-полоска рядом',
    'Есть ровный дневной свет',
  ];
  const ready = checked.size === items.length;

  const toggle = (index: number) => {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.readinessContent}
    >
      <View style={styles.readinessHeader}>
        <View style={styles.readinessScore}>
          <AppText numeric role="title" weight="semibold">
            {checked.size}/{items.length}
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            готово
          </AppText>
        </View>
        <View style={styles.readinessHeading}>
          <AppText role="title" weight="semibold">
            Быстрая проверка перед тестом
          </AppText>
          <AppText color={colors.text.secondary}>
            Три условия, от которых зависит точность сканирования.
          </AppText>
        </View>
      </View>

      <View style={styles.readinessRule} />
      <View style={styles.checklist}>
        {items.map((item, index) => {
          const selected = checked.has(index);
          return (
            <Pressable
              key={item}
              accessibilityRole="checkbox"
              accessibilityLabel={item}
              accessibilityState={{ checked: selected }}
              onPress={() => toggle(index)}
              style={({ pressed }) => [
                styles.checkRow,
                pressed && styles.rowPressed,
              ]}
            >
              <View
                style={[
                  styles.checkCircle,
                  selected && styles.checkCircleSelected,
                ]}
              >
                {selected ? (
                  <Symbol
                    name="checkmark"
                    fallback="✓"
                    size={14}
                    color="#FFFFFF"
                  />
                ) : null}
              </View>
              <AppText weight="medium" style={styles.checkLabel}>
                {item}
              </AppText>
              <AppText numeric role="caption" color={colors.text.secondary}>
                0{index + 1}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.readinessPreview}>
        <View style={styles.readinessPreviewCopy}>
          <AppText role="caption" weight="semibold" style={styles.eyebrow}>
            СЛЕДУЮЩИЙ ЭТАП
          </AppText>
          <AppText role="heading" weight="semibold">
            5 коротких шагов
          </AppText>
          <AppText role="label" color={colors.text.secondary}>
            Покажем подготовку полоски и правильный момент для фото.
          </AppText>
        </View>
        <Image
          source={stripImage}
          resizeMode="contain"
          style={styles.readinessStrip}
        />
      </View>

      <ActionButton
        disabled={!ready}
        label="Начать сканирование"
        onPress={onStart}
      />
    </ScrollView>
  );
}

function ClinicalMain({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.clinicalMain}>
      <View style={styles.clinicalMasthead}>
        <View>
          <AppText role="caption" weight="semibold" style={styles.clinicalCode}>
            ПРОФИЛЬ / ДОМАШНИЙ ТЕСТ
          </AppText>
          <AppText role="title" weight="semibold" style={styles.clinicalTitle}>
            Сканирование тест-полоски
          </AppText>
        </View>
        <View style={styles.clinicalStatus}>
          <View style={styles.liveDot} />
          <AppText role="caption" weight="semibold">
            ГОТОВО К ЗАПУСКУ
          </AppText>
        </View>
      </View>

      <View style={styles.clinicalGrid}>
        <View style={styles.clinicalStripCell}>
          <View style={styles.axisTop}>
            {['0', '25', '50', '75', '100'].map((mark) => (
              <AppText key={mark} numeric role="caption" color="#969190">
                {mark}
              </AppText>
            ))}
          </View>
          <Image
            source={stripImage}
            resizeMode="contain"
            style={styles.clinicalStrip}
          />
          <View style={styles.scanLine} />
        </View>
        <View style={styles.clinicalMeta}>
          {[
            ['Профиль', 'По QR-коду'],
            ['Материал', 'По инструкции'],
            ['Считывание', '3-7 минут'],
            ['Результат', 'С подтверждением'],
          ].map(([label, value]) => (
            <View key={label} style={styles.clinicalMetaRow}>
              <AppText role="caption" color={colors.text.secondary}>
                {label}
              </AppText>
              <AppText role="label" weight="medium">
                {value}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.clinicalFooter}>
        <AppText
          role="caption"
          color={colors.text.secondary}
          style={styles.clinicalFootnote}
        >
          Перед сохранением приложение проверит качество снимка и попросит
          подтвердить результат.
        </AppText>
        <ActionButton label="Начать сканирование" onPress={onStart} />
      </View>
    </View>
  );
}

function RitualMain({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.ritualMain}>
      <View style={styles.ritualOrb}>
        <View style={styles.ritualRingOuter} />
        <View style={styles.ritualRingInner} />
        <Image
          source={stripImage}
          resizeMode="contain"
          style={styles.ritualStrip}
        />
      </View>
      <View style={styles.ritualCopy}>
        <AppText
          role="caption"
          weight="semibold"
          color={colors.text.secondary}
          style={styles.eyebrow}
        >
          ПОДГОТОВКА БЕЗ СПЕШКИ
        </AppText>
        <AppText role="display" weight="medium" style={styles.ritualTitle}>
          Спокойно. По одному шагу.
        </AppText>
        <AppText color={colors.text.secondary} style={styles.ritualSubtitle}>
          Мы проведём через тест без спешки и подскажем точный момент для
          сканирования.
        </AppText>
      </View>
      <View style={styles.ritualFooter}>
        <View style={styles.ritualTimeline}>
          <AppText numeric role="caption" weight="semibold">
            01
          </AppText>
          <View style={styles.ritualTimelineLine} />
          <AppText numeric role="caption" color={colors.text.secondary}>
            05
          </AppText>
        </View>
        <ActionButton label="Начать сканирование" onPress={onStart} />
      </View>
    </View>
  );
}

function Corner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const positionStyle =
    position === 'tl'
      ? styles.cameraCornerTL
      : position === 'tr'
        ? styles.cameraCornerTR
        : position === 'bl'
          ? styles.cameraCornerBL
          : styles.cameraCornerBR;

  return <View style={[styles.cameraCorner, positionStyle]} />;
}

function CameraMain({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.cameraMain}>
      <View style={styles.cameraCopy}>
        <AppText role="title" weight="semibold">
          Полоска уже готова?
        </AppText>
        <AppText color={colors.text.secondary}>
          Наведите камеру. Подготовку можно открыть перед съёмкой.
        </AppText>
      </View>

      <View style={styles.cameraViewport}>
        <View style={styles.cameraNoise} />
        <View style={styles.cameraTopBar}>
          <View style={styles.cameraModePill}>
            <View style={styles.liveDotLight} />
            <AppText role="caption" weight="semibold" color="#FFFFFF">
              АВТО
            </AppText>
          </View>
          <Symbol name="info.circle" fallback="i" size={21} color="#FFFFFF" />
        </View>
        <View style={styles.cameraTarget}>
          <Corner position="tl" />
          <Corner position="tr" />
          <Corner position="bl" />
          <Corner position="br" />
          <Image
            source={stripImage}
            resizeMode="contain"
            style={styles.cameraStrip}
          />
          <View style={styles.cameraSweep} />
        </View>
        <View style={styles.cameraHint}>
          <AppText role="label" weight="medium" color="#FFFFFF">
            Расположите полоску внутри рамки
          </AppText>
          <AppText role="caption" color="rgba(255,255,255,0.68)">
            Без бликов, на ровной поверхности
          </AppText>
        </View>
      </View>

      <View style={styles.cameraFooter}>
        <ActionButton label="Начать сканирование" onPress={onStart} />
        <AppText
          role="caption"
          color={colors.text.secondary}
          style={styles.cameraPrivacy}
        >
          Снимок остаётся на устройстве. Результат сохраняется после
          подтверждения.
        </AppText>
      </View>
    </View>
  );
}

function StepProgress({ step }: { step: number }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: guideSteps.length, now: step + 1 }}
      style={styles.stepProgress}
    >
      {guideSteps.map((_, index) => (
        <View
          key={index}
          style={[
            styles.stepProgressItem,
            index <= step && styles.stepProgressItemActive,
          ]}
        />
      ))}
    </View>
  );
}

function GuideFooter({
  onBack,
  onNext,
  step,
}: {
  onBack: () => void;
  onNext: () => void;
  step: number;
}) {
  const isLast = step === guideSteps.length - 1;
  return (
    <View style={styles.guideFooter}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Предыдущий шаг"
        onPress={onBack}
        style={({ pressed }) => [
          styles.secondaryButton,
          pressed && styles.rowPressed,
        ]}
      >
        <Symbol name="chevron.left" fallback="‹" size={18} />
        <AppText role="label" weight="medium">
          Назад
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLast ? 'Открыть камеру' : 'Следующий шаг'}
        onPress={onNext}
        style={({ pressed }) => [
          styles.guideNextButton,
          pressed && styles.actionButtonPressed,
        ]}
      >
        <AppText
          role="label"
          weight="semibold"
          color="#FFFFFF"
          style={styles.guideNextLabel}
        >
          {isLast ? 'Открыть камеру' : 'Далее'}
        </AppText>
        <Symbol
          name={isLast ? 'camera.fill' : 'arrow.right'}
          fallback="→"
          size={18}
          color="#FFFFFF"
        />
      </Pressable>
    </View>
  );
}

type GuideProps = {
  onBack: () => void;
  onNext: () => void;
  step: number;
};

function FocusGuide({ onBack, onNext, step }: GuideProps) {
  const item = guideSteps[step];
  return (
    <View style={styles.focusGuide}>
      <StepProgress step={step} />
      <View style={styles.focusGuideMedia}>
        <AppText numeric weight="semibold" style={styles.focusGuideNumber}>
          0{step + 1}
        </AppText>
        <Image
          source={item.image}
          resizeMode="contain"
          style={styles.focusGuideImage}
        />
      </View>
      <View style={styles.focusGuideCopy}>
        <AppText
          role="caption"
          weight="semibold"
          color={colors.text.secondary}
          style={styles.eyebrow}
        >
          ШАГ {step + 1} ИЗ {guideSteps.length}
        </AppText>
        <AppText role="title" weight="semibold">
          {item.title}
        </AppText>
        <AppText color={colors.text.secondary}>{item.body}</AppText>
        <View style={styles.focusGuideNote}>
          <Symbol
            name="info.circle"
            fallback="i"
            color={colors.text.secondary}
            size={18}
          />
          <AppText
            role="caption"
            color={colors.text.secondary}
            style={styles.flexText}
          >
            {item.note}
          </AppText>
        </View>
      </View>
      <GuideFooter step={step} onBack={onBack} onNext={onNext} />
    </View>
  );
}

function ReadinessGuide({ onBack, onNext, step }: GuideProps) {
  const item = guideSteps[step];
  return (
    <View style={styles.readinessGuide}>
      <StepProgress step={step} />
      <View style={styles.readinessGuideHeading}>
        <AppText
          role="caption"
          weight="semibold"
          color={colors.text.secondary}
          style={styles.eyebrow}
        >
          ПРОВЕРКА {step + 1}/{guideSteps.length}
        </AppText>
        <AppText role="title" weight="semibold">
          {item.title}
        </AppText>
      </View>
      <View style={styles.readinessGuideMedia}>
        <Image
          source={item.image}
          resizeMode="contain"
          style={styles.readinessGuideImage}
        />
      </View>
      <View style={styles.readinessConfirmation}>
        <View style={styles.checkCircleSelected}>
          <Symbol name="checkmark" fallback="✓" size={14} color="#FFFFFF" />
        </View>
        <View style={styles.flexText}>
          <AppText weight="medium">Что проверить</AppText>
          <AppText role="label" color={colors.text.secondary}>
            {item.body}
          </AppText>
        </View>
      </View>
      <GuideFooter step={step} onBack={onBack} onNext={onNext} />
    </View>
  );
}

function ClinicalGuide({ onBack, onNext, step }: GuideProps) {
  const item = guideSteps[step];
  return (
    <View style={styles.clinicalGuide}>
      <View style={styles.protocolHeader}>
        <AppText role="caption" weight="semibold" style={styles.clinicalCode}>
          ПРОТОКОЛ 0{step + 1}
        </AppText>
        <AppText numeric role="caption" color={colors.text.secondary}>
          {String(step + 1).padStart(2, '0')} /{' '}
          {String(guideSteps.length).padStart(2, '0')}
        </AppText>
      </View>
      <View style={styles.protocolBody}>
        <View style={styles.protocolStepRail}>
          <AppText numeric role="display" weight="semibold">
            0{step + 1}
          </AppText>
          <View style={styles.protocolRailLine} />
          <AppText
            role="caption"
            color={colors.text.secondary}
            style={styles.protocolVerticalLabel}
          >
            ПОРЯДОК ВЫПОЛНЕНИЯ
          </AppText>
        </View>
        <View style={styles.protocolContent}>
          <AppText role="title" weight="semibold">
            {item.title}
          </AppText>
          <Image
            source={item.image}
            resizeMode="contain"
            style={styles.protocolImage}
          />
          <AppText color={colors.text.secondary}>{item.body}</AppText>
          <View style={styles.protocolNote}>
            <AppText role="caption" color={colors.text.secondary}>
              КРИТЕРИЙ
            </AppText>
            <AppText role="label" weight="medium">
              {item.note}
            </AppText>
          </View>
        </View>
      </View>
      <GuideFooter step={step} onBack={onBack} onNext={onNext} />
    </View>
  );
}

function RitualGuide({ onBack, onNext, step }: GuideProps) {
  const item = guideSteps[step];
  return (
    <View style={styles.ritualGuide}>
      <View style={styles.ritualGuideAtmosphere}>
        <View style={styles.ritualGuideCircle} />
        <Image
          source={item.image}
          resizeMode="contain"
          style={styles.ritualGuideImage}
        />
        <View style={styles.ritualGuideCounter}>
          <AppText numeric role="caption" weight="semibold">
            0{step + 1}
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            {' '}
            / 0{guideSteps.length}
          </AppText>
        </View>
      </View>
      <View style={styles.ritualGuideCopy}>
        <AppText role="title" weight="semibold">
          {item.title}
        </AppText>
        <AppText color={colors.text.secondary}>{item.body}</AppText>
        <AppText
          role="caption"
          color={colors.text.secondary}
          style={styles.ritualAside}
        >
          {item.note}
        </AppText>
      </View>
      <GuideFooter step={step} onBack={onBack} onNext={onNext} />
    </View>
  );
}

function CameraGuide({ onBack, onNext, step }: GuideProps) {
  const item = guideSteps[step];
  return (
    <View style={styles.cameraGuide}>
      <View style={styles.cameraGuideViewport}>
        <View style={styles.cameraTopBar}>
          <AppText role="caption" weight="semibold" color="#FFFFFF">
            ПОДГОТОВКА КАМЕРЫ
          </AppText>
          <AppText numeric role="caption" color="rgba(255,255,255,0.72)">
            0{step + 1}/0{guideSteps.length}
          </AppText>
        </View>
        <View style={styles.cameraGuideFrame}>
          <Corner position="tl" />
          <Corner position="tr" />
          <Corner position="bl" />
          <Corner position="br" />
          <Image
            source={item.image}
            resizeMode="contain"
            style={styles.cameraGuideImage}
          />
        </View>
        <View style={styles.cameraGuideLiveCopy}>
          <View style={styles.liveDotLight} />
          <AppText role="caption" weight="medium" color="#FFFFFF">
            {item.note}
          </AppText>
        </View>
      </View>
      <View style={styles.cameraGuideSheet}>
        <AppText
          role="caption"
          weight="semibold"
          color={colors.text.secondary}
          style={styles.eyebrow}
        >
          ПЕРЕД СЪЁМКОЙ
        </AppText>
        <AppText role="title" weight="semibold">
          {item.title}
        </AppText>
        <AppText color={colors.text.secondary}>{item.body}</AppText>
      </View>
      <GuideFooter step={step} onBack={onBack} onNext={onNext} />
    </View>
  );
}

export function ScanConceptsLab({ onClose }: ScanConceptsLabProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [variant, setVariant] = useState<VariantId>('focus');
  const [mode, setMode] = useState<ScreenMode>('main');
  const [step, setStep] = useState(0);

  const activeVariant = useMemo(
    () => variants.find((item) => item.id === variant) ?? variants[0],
    [variant],
  );

  const selectVariant = (next: VariantId) => {
    setVariant(next);
    setMode('main');
    setStep(0);
  };

  const startGuide = () => {
    setStep(0);
    setMode('guide');
  };

  const previous = () => {
    if (step > 0) setStep((current) => current - 1);
    else setMode('main');
  };

  const next = () => {
    if (step < guideSteps.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    Alert.alert(
      'Демонстрационный вариант',
      'Здесь откроется рабочая камера. После снимка вы подтвердите результат перед сохранением.',
      [{ text: 'Понятно' }],
    );
  };

  const renderMain = () => {
    if (variant === 'ready') return <ReadinessMain onStart={startGuide} />;
    if (variant === 'clinical') return <ClinicalMain onStart={startGuide} />;
    if (variant === 'ritual') return <RitualMain onStart={startGuide} />;
    if (variant === 'camera') return <CameraMain onStart={startGuide} />;
    return <FocusMain onStart={startGuide} />;
  };

  const renderGuide = () => {
    const props = { onBack: previous, onNext: next, step };
    if (variant === 'ready') return <ReadinessGuide {...props} />;
    if (variant === 'clinical') return <ClinicalGuide {...props} />;
    if (variant === 'ritual') return <RitualGuide {...props} />;
    if (variant === 'camera') return <CameraGuide {...props} />;
    return <FocusGuide {...props} />;
  };

  return (
    <View
      style={[styles.root, { paddingTop: Math.max(insets.top, spacing.sm) }]}
    >
      <View style={styles.labHeader}>
        <View style={styles.labHeaderLeading}>
          {mode === 'guide' ? (
            <IconButton
              accessibilityLabel="Вернуться к экрану сканирования"
              icon="back"
              onPress={() => setMode('main')}
            />
          ) : (
            <View style={styles.headerIndex}>
              <AppText
                numeric
                role="caption"
                weight="semibold"
                color={colors.text.secondary}
              >
                {activeVariant.number} / 05
              </AppText>
            </View>
          )}
        </View>
        <View style={styles.labHeaderCopy}>
          <AppText role="label" weight="semibold">
            {activeVariant.title}
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            {mode === 'guide' ? `Гайд: шаг ${step + 1}` : 'Экран сканирования'}
          </AppText>
        </View>
        <IconButton
          accessibilityLabel="Закрыть варианты сканирования"
          icon="close"
          onPress={onClose ?? (() => undefined)}
        />
      </View>

      <VariantSelector active={variant} onChange={selectVariant} />

      <View
        style={[
          styles.canvas,
          { minHeight: Math.max(560, height - insets.top - 132) },
        ]}
      >
        {mode === 'main' ? renderMain() : renderGuide()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  labHeader: {
    height: 52,
    paddingHorizontal: sizes.screenGutter,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labHeaderLeading: { width: 48, alignItems: 'flex-start' },
  labHeaderCopy: { alignItems: 'center', gap: 1 },
  headerIndex: { height: 44, minWidth: 44, justifyContent: 'center' },
  iconButton: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  variantSelector: { flexGrow: 0, marginTop: spacing.xs },
  variantSelectorContent: {
    paddingHorizontal: sizes.screenGutter,
    gap: 8,
    paddingBottom: spacing.sm,
  },
  variantTab: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E8E4E3',
  },
  variantTabSelected: {
    backgroundColor: colors.text.primary,
    borderColor: colors.text.primary,
  },
  variantTabPressed: { opacity: 0.72 },
  variantNumber: { letterSpacing: 0.8 },
  canvas: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
  },
  actionButton: {
    minHeight: 56,
    borderRadius: 28,
    paddingHorizontal: 22,
    backgroundColor: colors.brand.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...shadows.floating,
  },
  actionButtonDisabled: {
    backgroundColor: colors.state.disabled,
    shadowOpacity: 0,
  },
  actionButtonPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  eyebrow: { letterSpacing: 1.3 },
  flexText: { flex: 1 },
  rowPressed: { opacity: 0.65 },

  focusMain: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  focusCopy: { gap: 12, maxWidth: 330 },
  focusTitle: { maxWidth: 340 },
  focusSubtitle: { maxWidth: 330 },
  focusStage: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusHalo: {
    position: 'absolute',
    width: 252,
    height: 252,
    borderRadius: 126,
    backgroundColor: '#F3F6F5',
  },
  focusStrip: { width: 245, height: 245, transform: [{ rotate: '-8deg' }] },
  focusMeasureTop: {
    position: 'absolute',
    top: '19%',
    left: 30,
    width: 34,
    height: 1,
    backgroundColor: '#CFCCCB',
  },
  focusMeasureBottom: {
    position: 'absolute',
    right: 24,
    bottom: '18%',
    width: 54,
    height: 1,
    backgroundColor: '#CFCCCB',
  },
  focusFooter: { gap: 18 },
  focusFacts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusFact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },

  readinessContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  readinessHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  readinessScore: { minWidth: 58 },
  readinessHeading: { flex: 1, gap: 8 },
  readinessRule: {
    height: 1,
    backgroundColor: colors.surface.divider,
    marginVertical: 24,
  },
  checklist: { marginBottom: spacing.lg },
  checkRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#B9B4B2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.success,
    borderColor: colors.brand.success,
  },
  checkLabel: { flex: 1 },
  readinessPreview: {
    minHeight: 142,
    marginBottom: spacing.lg,
    backgroundColor: '#F2F5F3',
    borderRadius: radii.md,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  readinessPreviewCopy: { flex: 1, padding: spacing.md, gap: 7 },
  readinessStrip: {
    width: 120,
    height: 140,
    marginRight: -16,
    transform: [{ rotate: '12deg' }],
  },

  clinicalMain: { flex: 1, paddingTop: spacing.lg },
  clinicalMasthead: {
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-start',
    gap: 10,
  },
  clinicalCode: { letterSpacing: 1.1 },
  clinicalTitle: { marginTop: 8 },
  clinicalStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.brand.success,
  },
  clinicalGrid: {
    flex: 1,
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DAD7D5',
  },
  clinicalStripCell: {
    flex: 1,
    minHeight: 260,
    backgroundColor: '#F5F7F6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  axisTop: {
    position: 'absolute',
    top: 12,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  clinicalStrip: { width: 255, height: 230, transform: [{ rotate: '90deg' }] },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '48%',
    height: 1,
    backgroundColor: 'rgba(33,33,35,0.22)',
  },
  clinicalMeta: { flexDirection: 'row', flexWrap: 'wrap' },
  clinicalMetaRow: {
    width: '50%',
    minHeight: 62,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: '#DAD7D5',
  },
  clinicalFooter: { padding: spacing.lg, gap: spacing.md },
  clinicalFootnote: { maxWidth: 330 },

  ritualMain: { flex: 1, padding: spacing.lg, paddingTop: spacing.xl },
  ritualOrb: { height: 300, alignItems: 'center', justifyContent: 'center' },
  ritualRingOuter: {
    position: 'absolute',
    width: 284,
    height: 284,
    borderRadius: 142,
    backgroundColor: '#F8EEE9',
  },
  ritualRingInner: {
    position: 'absolute',
    width: 218,
    height: 218,
    borderRadius: 109,
    borderWidth: 1,
    borderColor: 'rgba(130,53,55,0.13)',
  },
  ritualStrip: { width: 225, height: 225, transform: [{ rotate: '7deg' }] },
  ritualCopy: { alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  ritualTitle: { textAlign: 'center' },
  ritualSubtitle: { textAlign: 'center', maxWidth: 330 },
  ritualFooter: { marginTop: 'auto', gap: spacing.lg },
  ritualTimeline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  ritualTimelineLine: { flex: 1, height: 1, backgroundColor: '#D9D4D2' },

  cameraMain: { flex: 1, paddingTop: spacing.lg },
  cameraCopy: {
    paddingHorizontal: spacing.lg,
    gap: 8,
    marginBottom: spacing.lg,
  },
  cameraViewport: {
    flex: 1,
    minHeight: 350,
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#232626',
    overflow: 'hidden',
  },
  cameraNoise: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#333735',
    opacity: 0.66,
  },
  cameraTopBar: {
    height: 54,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraModePill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  liveDotLight: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E9F57D',
  },
  cameraTarget: {
    flex: 1,
    marginHorizontal: 30,
    marginVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCorner: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#FFFFFF',
  },
  cameraCornerTL: {
    left: 0,
    top: 0,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderTopLeftRadius: 8,
  },
  cameraCornerTR: {
    right: 0,
    top: 0,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderTopRightRadius: 8,
  },
  cameraCornerBL: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 8,
  },
  cameraCornerBR: {
    right: 0,
    bottom: 0,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomRightRadius: 8,
  },
  cameraStrip: { width: 220, height: 220, transform: [{ rotate: '-4deg' }] },
  cameraSweep: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: '52%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.68)',
  },
  cameraHint: { alignItems: 'center', gap: 4, paddingBottom: spacing.lg },
  cameraFooter: { padding: spacing.md, paddingBottom: spacing.lg, gap: 10 },
  cameraPrivacy: { textAlign: 'center' },

  stepProgress: { height: 3, flexDirection: 'row', gap: 5 },
  stepProgressItem: { flex: 1, borderRadius: 2, backgroundColor: '#E6E2E1' },
  stepProgressItemActive: { backgroundColor: colors.text.primary },
  guideFooter: { flexDirection: 'row', gap: 10, marginTop: 'auto' },
  secondaryButton: {
    minWidth: 104,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#DDD8D7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  guideNextButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  guideNextLabel: { flexShrink: 0 },

  focusGuide: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  focusGuideMedia: {
    flex: 1,
    minHeight: 280,
    backgroundColor: '#F4F6F5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  focusGuideNumber: {
    position: 'absolute',
    left: 18,
    top: 12,
    fontSize: 64,
    lineHeight: 70,
    color: '#DEDAD8',
  },
  focusGuideImage: { width: '92%', height: '92%' },
  focusGuideCopy: { gap: 9 },
  focusGuideNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },

  readinessGuide: { flex: 1, padding: spacing.lg, gap: spacing.md },
  readinessGuideHeading: { gap: 8 },
  readinessGuideMedia: {
    flex: 1,
    minHeight: 220,
    borderRadius: radii.md,
    backgroundColor: '#F2F5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readinessGuideImage: { width: '92%', height: '92%' },
  readinessConfirmation: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.surface.divider,
    paddingVertical: spacing.md,
  },

  clinicalGuide: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  protocolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderColor: '#DAD7D5',
  },
  protocolBody: { flex: 1, flexDirection: 'row', minHeight: 430 },
  protocolStepRail: {
    width: 70,
    paddingTop: 4,
    alignItems: 'center',
    borderRightWidth: 1,
    borderColor: '#DAD7D5',
  },
  protocolRailLine: {
    width: 1,
    flex: 1,
    backgroundColor: '#DAD7D5',
    marginVertical: 12,
  },
  protocolVerticalLabel: {
    width: 180,
    transform: [{ rotate: '-90deg' }],
    marginBottom: 75,
    letterSpacing: 1.1,
  },
  protocolContent: { flex: 1, paddingLeft: spacing.lg, gap: spacing.md },
  protocolImage: {
    width: '100%',
    flex: 1,
    minHeight: 220,
    backgroundColor: '#F5F7F6',
  },
  protocolNote: {
    borderTopWidth: 1,
    borderColor: '#DAD7D5',
    paddingTop: spacing.sm,
    gap: 5,
  },

  ritualGuide: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: '#FFFCFA',
  },
  ritualGuideAtmosphere: {
    flex: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ritualGuideCircle: {
    position: 'absolute',
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: '#F8EEE9',
  },
  ritualGuideImage: { width: 250, height: 250 },
  ritualGuideCounter: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
  },
  ritualGuideCopy: {
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  ritualAside: { marginTop: 2, textAlign: 'center' },

  cameraGuide: { flex: 1, padding: spacing.md, gap: spacing.md },
  cameraGuideViewport: {
    flex: 1,
    minHeight: 350,
    backgroundColor: '#282C2A',
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  cameraGuideFrame: {
    flex: 1,
    marginHorizontal: 26,
    marginVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraGuideImage: { width: '94%', height: '94%' },
  cameraGuideLiveCopy: {
    minHeight: 50,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraGuideSheet: { gap: 8, paddingHorizontal: spacing.xs },
});
