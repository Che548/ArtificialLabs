import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText, SegmentedSwitcher } from './components';
import { colors, motion, radii, shadows, spacing } from './tokens';

export type AnalysisTabKey = 'current' | 'upcoming' | 'completed';
export type AnalysisTabsVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type AnalysisMetricsVariant =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20;
export type AnalysisMetricsBentoVariant =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type AnalysisCardVariant =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29
  | 30
  | 31
  | 32
  | 33
  | 34
  | 35;
export type AnalysisCardActionVariant =
  1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

type AnalysisMetricTileProps = {
  value: string;
  label: string;
  accent?: 'primary' | 'success' | 'burgundy';
};

const metricAccentColors = {
  primary: colors.brand.primary,
  success: colors.brand.success,
  burgundy: colors.brand.burgundy,
} as const;

export function AnalysisMetricTile({
  value,
  label,
  accent = 'primary',
}: AnalysisMetricTileProps) {
  return (
    <View style={styles.metricTile}>
      <View
        style={[
          styles.metricAccent,
          { backgroundColor: metricAccentColors[accent] },
        ]}
      />
      <AppText
        numeric
        weight="medium"
        color={metricAccentColors[accent]}
        style={styles.metricValue}
      >
        {value}
      </AppText>
      <AppText
        role="caption"
        color={colors.text.secondary}
        style={styles.metricLabel}
      >
        {label}
      </AppText>
    </View>
  );
}

type AnalysisTabsProps = {
  activeTab: AnalysisTabKey;
  onChange: (tab: AnalysisTabKey) => void;
  variant?: AnalysisTabsVariant;
};

const analysisTabs: Array<{ key: AnalysisTabKey; label: string }> = [
  { key: 'current', label: 'Текущие' },
  { key: 'upcoming', label: 'Ближайшие' },
  { key: 'completed', label: 'Сдано' },
];

export function AnalysisTabs({
  activeTab,
  onChange,
  variant = 1,
}: AnalysisTabsProps) {
  if (variant === 2) {
    return (
      <SegmentedSwitcher
        accessibilityLabel="Раздел анализов"
        options={analysisTabs.map((tab) => ({
          value: tab.key,
          label: tab.label,
        }))}
        value={activeTab}
        onChange={onChange}
        labelStyle={styles.tabLabel}
      />
    );
  }

  const isInverse = variant === 6;
  const usesDarkActiveText = variant === 7 || variant === 9;

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.tabs,
        variant === 3 && styles.tabsUnderline,
        variant === 4 && styles.tabsOutlined,
        variant === 5 && styles.tabsFloating,
        variant === 6 && styles.tabsInverse,
        variant === 7 && styles.tabsSoft,
        variant === 8 && styles.tabsBadged,
        variant === 9 && styles.tabsTopAccent,
        variant === 10 && styles.tabsCompact,
      ]}
    >
      {analysisTabs.map((tab) => {
        const active = tab.key === activeTab;
        const displayLabel =
          variant === 10
            ? tab.key === 'current'
              ? 'Сейчас'
              : tab.key === 'upcoming'
                ? '3 месяца'
                : 'Архив'
            : tab.label;
        const inactiveColor = isInverse
          ? 'rgba(255,255,255,0.66)'
          : colors.text.secondary;
        const activeColor = usesDarkActiveText
          ? colors.text.primary
          : variant === 3 || variant === 4 || variant === 5 || variant === 8
            ? colors.brand.primary
            : colors.text.inverse;

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={styles.tabPressable}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.tab,
                  variant === 3 && styles.tabUnderline,
                  variant === 4 && styles.tabOutlined,
                  variant === 5 && styles.tabFloating,
                  variant === 6 && styles.tabInverse,
                  variant === 7 && styles.tabSoft,
                  variant === 8 && styles.tabBadged,
                  variant === 9 && styles.tabTopAccent,
                  variant === 10 && styles.tabCompact,
                  active && styles.tabActive,
                  active && variant === 3 && styles.tabUnderlineActive,
                  active && variant === 4 && styles.tabOutlinedActive,
                  active && variant === 5 && styles.tabFloatingActive,
                  active && variant === 6 && styles.tabInverseActive,
                  active && variant === 7 && styles.tabSoftActive,
                  active && variant === 8 && styles.tabBadgedActive,
                  active && variant === 9 && styles.tabTopAccentActive,
                  active && variant === 10 && styles.tabCompactActive,
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  weight={active ? 'medium' : 'regular'}
                  color={active ? activeColor : inactiveColor}
                  numberOfLines={1}
                  style={[
                    styles.tabLabel,
                    variant === 10 && styles.tabLabelCompact,
                  ]}
                >
                  {displayLabel}
                </AppText>
                {variant === 8 ? (
                  <View
                    style={[styles.tabBadge, active && styles.tabBadgeActive]}
                  >
                    <AppText
                      numeric
                      role="caption"
                      color={
                        active ? colors.text.inverse : colors.text.secondary
                      }
                      style={styles.tabBadgeText}
                    >
                      {tab.key === 'current'
                        ? 2
                        : tab.key === 'upcoming'
                          ? 3
                          : 0}
                    </AppText>
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

type AnalysisMetricsBlockProps = {
  variant?: AnalysisMetricsVariant;
};

const metricItems = [
  {
    value: '72%',
    label: 'внимания к здоровью',
    accent: colors.brand.primary,
  },
  {
    value: '2',
    label: 'анализа в этом месяце',
    accent: colors.brand.burgundy,
  },
  {
    value: '1',
    label: 'анализ в следующем месяце',
    accent: colors.brand.success,
  },
] as const;

function MetricCompact({
  item,
  inverse = false,
  style,
}: {
  item: (typeof metricItems)[number];
  inverse?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.metricCompact, style]}>
      <AppText
        numeric
        weight="medium"
        color={inverse ? colors.text.inverse : item.accent}
        style={styles.metricCompactValue}
      >
        {item.value}
      </AppText>
      <AppText
        role="caption"
        color={inverse ? 'rgba(255,255,255,0.68)' : colors.text.secondary}
        style={styles.metricCompactLabel}
      >
        {item.label}
      </AppText>
    </View>
  );
}

function MetricsBentoHero({
  style,
  inverse = false,
}: {
  style?: StyleProp<ViewStyle>;
  inverse?: boolean;
}) {
  return (
    <View style={style}>
      <AppText
        numeric
        color={inverse ? colors.text.inverse : colors.brand.primary}
        style={styles.bentoValue}
      >
        72%
      </AppText>
      <AppText
        role="caption"
        color={inverse ? 'rgba(255,255,255,0.68)' : colors.text.secondary}
      >
        индекс внимания к здоровью
      </AppText>
    </View>
  );
}

function MetricsBentoMini({
  item,
  style,
  contentStyle,
  inverse = false,
}: {
  item: (typeof metricItems)[number];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  inverse?: boolean;
}) {
  return (
    <View style={style}>
      <MetricCompact item={item} inverse={inverse} style={contentStyle} />
    </View>
  );
}

export function AnalysisMetricsBentoBlock({
  variant = 1,
}: {
  variant?: AnalysisMetricsBentoVariant;
}) {
  if (variant === 1) {
    return (
      <View style={styles.metricsBento}>
        <MetricsBentoHero style={styles.metricsBentoHero} />
        <View style={styles.metricsBentoSide}>
          {metricItems.slice(1).map((item) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={styles.metricsBentoMini}
            />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 2) {
    return (
      <View style={styles.metricsBento02}>
        <MetricsBentoHero style={styles.metricsBento02Hero} />
        <View style={styles.metricsBento02Side}>
          {metricItems.slice(1).map((item) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={styles.metricsBento02Mini}
              contentStyle={styles.metricsBento02MiniContent}
            />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 3) {
    return (
      <View style={styles.metricsBento03}>
        <MetricsBentoHero style={styles.metricsBento03Hero} />
        <View style={styles.metricsBento03Bottom}>
          {metricItems.slice(1).map((item) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={styles.metricsBento03Mini}
            />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 4) {
    return (
      <View style={styles.metricsBento04}>
        <View style={styles.metricsBento04Side}>
          {metricItems.slice(1).map((item) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={styles.metricsBento04Mini}
            />
          ))}
        </View>
        <MetricsBentoHero style={styles.metricsBento04Hero} />
      </View>
    );
  }

  if (variant === 5) {
    return (
      <View style={styles.metricsBento05}>
        <MetricsBentoHero style={styles.metricsBento05Hero} />
        {metricItems.slice(1).map((item) => (
          <MetricsBentoMini
            key={item.label}
            item={item}
            style={styles.metricsBento05Mini}
          />
        ))}
      </View>
    );
  }

  if (variant === 6) {
    return (
      <View style={styles.metricsBento06}>
        <MetricsBentoHero style={styles.metricsBento06Hero} />
        <View style={styles.metricsBento06Side}>
          {metricItems.slice(1).map((item, index) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={[
                styles.metricsBento06Mini,
                index > 0 && styles.metricsBento06MiniBorder,
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 7) {
    return (
      <View style={styles.metricsBento07}>
        <MetricsBentoHero style={styles.metricsBento07Hero} inverse />
        <View style={styles.metricsBento07FloatingRow}>
          {metricItems.slice(1).map((item) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={styles.metricsBento07Mini}
            />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 8) {
    return (
      <LinearGradient
        colors={['#FCE6F0', '#FFF8FB', '#F1FAF5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.metricsBento08}
      >
        <MetricsBentoHero style={styles.metricsBento08Hero} />
        <View style={styles.metricsBento08Side}>
          {metricItems.slice(1).map((item) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={styles.metricsBento08Mini}
            />
          ))}
        </View>
      </LinearGradient>
    );
  }

  if (variant === 9) {
    return (
      <View style={styles.metricsBento09}>
        <MetricsBentoHero style={styles.metricsBento09Hero} />
        <View style={styles.metricsBento09Side}>
          {metricItems.slice(1).map((item) => (
            <MetricsBentoMini
              key={item.label}
              item={item}
              style={styles.metricsBento09Mini}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.metricsBento10}>
      <MetricsBentoHero style={styles.metricsBento10Hero} />
      <View style={styles.metricsBento10Pills}>
        {metricItems.slice(1).map((item) => (
          <MetricsBentoMini
            key={item.label}
            item={item}
            style={styles.metricsBento10Pill}
          />
        ))}
      </View>
    </View>
  );
}

export function AnalysisMetricsBlock({
  variant = 1,
}: AnalysisMetricsBlockProps) {
  if (variant === 1) {
    return (
      <View style={styles.metricsTilesRow}>
        <AnalysisMetricTile value="72%" label="внимания к здоровью" />
        <AnalysisMetricTile
          value="2"
          label="анализа в этом месяце"
          accent="burgundy"
        />
        <AnalysisMetricTile
          value="1"
          label="анализ в следующем месяце"
          accent="success"
        />
      </View>
    );
  }

  if (variant === 2) {
    return (
      <View style={styles.metricsUnified}>
        {metricItems.map((item, index) => (
          <View
            key={item.label}
            style={[
              styles.metricsUnifiedItem,
              index > 0 && styles.metricsUnifiedDivider,
            ]}
          >
            <MetricCompact item={item} />
          </View>
        ))}
      </View>
    );
  }

  if (variant === 3) {
    return (
      <View style={styles.metricsRows}>
        {metricItems.map((item) => (
          <View key={item.label} style={styles.metricsRowItem}>
            <View
              style={[styles.metricDot, { backgroundColor: item.accent }]}
            />
            <AppText
              role="label"
              color={colors.text.secondary}
              style={styles.metricsRowLabel}
            >
              {item.label}
            </AppText>
            <AppText numeric weight="medium" color={item.accent}>
              {item.value}
            </AppText>
          </View>
        ))}
      </View>
    );
  }

  if (variant === 4) {
    return (
      <View style={styles.metricsBento}>
        <View style={styles.metricsBentoHero}>
          <AppText
            numeric
            color={colors.brand.primary}
            style={styles.bentoValue}
          >
            72%
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            индекс внимания к здоровью
          </AppText>
        </View>
        <View style={styles.metricsBentoSide}>
          {metricItems.slice(1).map((item) => (
            <View key={item.label} style={styles.metricsBentoMini}>
              <MetricCompact item={item} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (variant === 5) {
    return (
      <View style={styles.metricsGaugePanel}>
        <View style={styles.metricsGauge}>
          <View style={styles.metricsGaugeInner}>
            <AppText
              numeric
              weight="medium"
              color={colors.brand.primary}
              style={styles.metricsGaugeValue}
            >
              72%
            </AppText>
          </View>
        </View>
        <View style={styles.metricsGaugeCopy}>
          <AppText role="label" weight="medium">
            Внимание к здоровью
          </AppText>
          <View style={styles.metricsGaugeCounters}>
            {metricItems.slice(1).map((item) => (
              <MetricCompact key={item.label} item={item} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (variant === 6) {
    return (
      <View style={styles.metricsSoftBand}>
        {metricItems.map((item) => (
          <MetricCompact key={item.label} item={item} />
        ))}
      </View>
    );
  }

  if (variant === 7) {
    return (
      <View style={styles.metricsOutlined}>
        {metricItems.map((item) => (
          <View key={item.label} style={styles.metricsOutlinedItem}>
            <View style={styles.metricsOutlinedHeader}>
              <View
                style={[styles.metricDot, { backgroundColor: item.accent }]}
              />
              <AppText role="caption" color={colors.text.secondary}>
                Метрика
              </AppText>
            </View>
            <MetricCompact item={item} />
          </View>
        ))}
      </View>
    );
  }

  if (variant === 8) {
    return (
      <View style={styles.metricsDark}>
        <AppText role="label" weight="medium" color={colors.text.inverse}>
          Здоровье в фокусе
        </AppText>
        <View style={styles.metricsDarkRow}>
          {metricItems.map((item) => (
            <MetricCompact key={item.label} item={item} inverse />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 9) {
    return (
      <View style={styles.metricsCapsules}>
        {metricItems.map((item) => (
          <View key={item.label} style={styles.metricCapsule}>
            <AppText numeric weight="medium" color={item.accent}>
              {item.value}
            </AppText>
            <AppText
              role="caption"
              color={colors.text.secondary}
              numberOfLines={2}
              style={styles.metricCapsuleLabel}
            >
              {item.label}
            </AppText>
          </View>
        ))}
      </View>
    );
  }

  if (variant === 10) {
    return (
      <View style={styles.metricsProgressPanel}>
        <View style={styles.metricsProgressHeader}>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              Внимание к здоровью
            </AppText>
            <AppText
              numeric
              color={colors.brand.primary}
              style={styles.progressValue}
            >
              72%
            </AppText>
          </View>
          <View style={styles.metricsProgressCounters}>
            <MetricCompact item={metricItems[1]} />
            <MetricCompact item={metricItems[2]} />
          </View>
        </View>
        <View style={styles.metricsProgressTrack}>
          <View style={styles.metricsProgressFill} />
        </View>
      </View>
    );
  }

  if (variant === 11) {
    return (
      <View style={styles.metricsMonthOverview}>
        <View style={styles.metricsMonthOverviewTop}>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              Ближайший анализ
            </AppText>
            <AppText role="heading" weight="semibold">
              14 августа
            </AppText>
          </View>
          <AppText
            numeric
            color={colors.brand.primary}
            style={styles.metricsNewHeroValue}
          >
            6 дней
          </AppText>
        </View>
        <View style={styles.metricsMonthOverviewBottom}>
          <View style={styles.metricsMonthOverviewStat}>
            <AppText numeric weight="medium" color={colors.brand.burgundy}>
              Натощак
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              подготовка
            </AppText>
          </View>
          <View style={styles.metricsMonthOverviewStat}>
            <AppText numeric weight="medium" color={colors.brand.success}>
              Готово
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              направление
            </AppText>
          </View>
          <View style={styles.metricsMonthOverviewTrack}>
            <View style={styles.metricsMonthOverviewFill} />
          </View>
        </View>
      </View>
    );
  }

  if (variant === 12) {
    return (
      <View style={styles.metricsCalendarCompare}>
        <View style={styles.metricsCalendarCompareMonth}>
          <AppText role="caption" color={colors.text.secondary}>
            ТЕКУЩИЕ
          </AppText>
          <AppText numeric style={styles.metricsCalendarCompareValue}>
            02
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            к сдаче
          </AppText>
        </View>
        <View style={styles.metricsCalendarCompareDivider} />
        <View style={styles.metricsCalendarCompareMonth}>
          <AppText role="caption" color={colors.text.secondary}>
            РЕЗУЛЬТАТЫ
          </AppText>
          <AppText numeric style={styles.metricsCalendarCompareValue}>
            01
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            не просмотрен
          </AppText>
        </View>
        <View style={styles.metricsCalendarCompareScore}>
          <AppText numeric weight="medium" color={colors.brand.primary}>
            6 дн
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            до срока
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 13) {
    const rows = [
      ['Нужно сдать', '2 анализа', colors.brand.primary],
      ['Ждёт просмотра', '1 результат', colors.brand.burgundy],
      ['Скоро устареет', '1 заключение', colors.brand.success],
    ] as const;
    return (
      <View style={styles.metricsClinicalTable}>
        {rows.map(([label, value, accent], index) => (
          <View
            key={label}
            style={[
              styles.metricsClinicalRow,
              index > 0 && styles.metricsClinicalRowBorder,
            ]}
          >
            <AppText role="label" color={colors.text.secondary}>
              {label}
            </AppText>
            <AppText numeric weight="semibold" color={accent}>
              {value}
            </AppText>
          </View>
        ))}
      </View>
    );
  }

  if (variant === 14) {
    return (
      <View style={styles.metricsFocusRail}>
        <View style={styles.metricsFocusRailScore}>
          <AppText
            numeric
            color={colors.brand.primary}
            style={styles.metricsFocusRailValue}
          >
            4
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            из 6 сдано
          </AppText>
        </View>
        <View style={styles.metricsFocusRailPlan}>
          <AppText role="caption" color={colors.text.secondary}>
            ОСТАЛОСЬ ПО ПЛАНУ
          </AppText>
          <View style={styles.metricsFocusRailLine}>
            <View style={styles.metricsFocusRailPoint}>
              <View style={styles.metricsFocusRailDotCurrent} />
              <AppText numeric weight="semibold">
                1
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                до 14 авг
              </AppText>
            </View>
            <View style={styles.metricsFocusRailConnector} />
            <View style={styles.metricsFocusRailPoint}>
              <View style={styles.metricsFocusRailDotNext} />
              <AppText numeric weight="semibold">
                1
              </AppText>
              <AppText role="caption" color={colors.text.secondary}>
                в сентябре
              </AppText>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (variant === 15) {
    return (
      <View style={styles.metricsTwoMonthPlan}>
        <View style={styles.metricsTwoMonthHeading}>
          <AppText role="label" weight="medium">
            Подготовка к сдаче
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            для 3 обследований
          </AppText>
        </View>
        <View style={styles.metricsTwoMonthGrid}>
          <View style={styles.metricsTwoMonthCell}>
            <AppText role="caption" color={colors.text.secondary}>
              Натощак
            </AppText>
            <AppText numeric style={styles.metricsTwoMonthValue}>
              1
            </AppText>
          </View>
          <View style={styles.metricsTwoMonthCell}>
            <AppText role="caption" color={colors.text.secondary}>
              Без подготовки
            </AppText>
            <AppText numeric style={styles.metricsTwoMonthValue}>
              2
            </AppText>
          </View>
          <View style={styles.metricsTwoMonthAttention}>
            <AppText role="caption" color={colors.text.secondary}>
              направлений готово
            </AppText>
            <AppText numeric weight="semibold" color={colors.brand.primary}>
              3
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  if (variant === 16) {
    return (
      <View style={styles.metricsEditorialSummary}>
        <View style={styles.metricsEditorialHero}>
          <AppText
            numeric
            color={colors.brand.primary}
            style={styles.metricsEditorialValue}
          >
            1
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            результат ожидает просмотра
          </AppText>
        </View>
        <View style={styles.metricsEditorialCounts}>
          <View style={styles.metricsEditorialCount}>
            <AppText numeric style={styles.metricsEditorialCountValue}>
              12
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              документов в архиве
            </AppText>
          </View>
          <View style={styles.metricsEditorialCount}>
            <AppText numeric style={styles.metricsEditorialCountValue}>
              5 авг
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              последний добавлен
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  if (variant === 17) {
    return (
      <View style={styles.metricsPlanTimeline}>
        <View style={styles.metricsPlanTimelineHeader}>
          <AppText role="label" weight="medium">
            Актуальность результата
          </AppText>
          <AppText numeric weight="semibold" color={colors.brand.primary}>
            30 дней
          </AppText>
        </View>
        <View style={styles.metricsPlanTimelineRail}>
          <View style={styles.metricsPlanTimelineConnector} />
          <View style={styles.metricsPlanTimelineStep}>
            <View style={styles.metricsPlanTimelineDotCurrent} />
            <AppText numeric weight="semibold">
              14
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              авг · сдать
            </AppText>
          </View>
          <View style={styles.metricsPlanTimelineStep}>
            <View style={styles.metricsPlanTimelineDotNext} />
            <AppText numeric weight="semibold">
              16
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              авг · результат
            </AppText>
          </View>
          <View style={styles.metricsPlanTimelineStep}>
            <View style={styles.metricsPlanTimelineDotEmpty} />
            <AppText numeric weight="semibold">
              15
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              сен · обновить
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  if (variant === 18) {
    return (
      <LinearGradient
        colors={['#FCE8F2', '#FFF8FB', '#F4FBF7']}
        locations={[0, 0.58, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.metricsGlassPanel}
      >
        <View style={styles.metricsGlassCellHero}>
          <AppText
            numeric
            color={colors.brand.primary}
            style={styles.metricsGlassValue}
          >
            12
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            документов
          </AppText>
        </View>
        <View style={styles.metricsGlassCell}>
          <AppText numeric weight="medium" color={colors.brand.burgundy}>
            3
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            типа анализов
          </AppText>
        </View>
        <View style={styles.metricsGlassCell}>
          <AppText numeric weight="medium" color={colors.brand.success}>
            1
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            добавлен недавно
          </AppText>
        </View>
      </LinearGradient>
    );
  }

  if (variant === 19) {
    return (
      <View style={styles.metricsReportTicket}>
        <View style={styles.metricsReportTicketHeader}>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              СЛЕДУЮЩЕЕ ДЕЙСТВИЕ
            </AppText>
            <AppText role="heading" weight="semibold">
              Исследования крови
            </AppText>
          </View>
          <AppText
            numeric
            color={colors.brand.primary}
            style={styles.metricsReportTicketScore}
          >
            6 дн
          </AppText>
        </View>
        <View style={styles.metricsReportTicketRule} />
        <View style={styles.metricsReportTicketFooter}>
          <AppText role="caption" color={colors.text.secondary}>
            Сдать до
          </AppText>
          <AppText numeric weight="semibold">
            14 августа
          </AppText>
          <View style={styles.metricsReportTicketDivider} />
          <AppText role="caption" color={colors.text.secondary}>
            Актуален
          </AppText>
          <AppText numeric weight="semibold">
            30 дней
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.metricsProgressLadder}>
      {[
        ['План анализов выполнен', '4 из 6', '67%', colors.brand.primary],
        ['Результаты просмотрены', '5 из 6', '83%', colors.brand.burgundy],
        ['Документы прикреплены', '3 из 6', '50%', colors.brand.success],
      ].map(([label, value, width, accent]) => (
        <View key={label} style={styles.metricsProgressLadderRow}>
          <View style={styles.metricsProgressLadderHeading}>
            <AppText role="caption" color={colors.text.secondary}>
              {label}
            </AppText>
            <AppText numeric weight="semibold" color={accent}>
              {value}
            </AppText>
          </View>
          <View style={styles.metricsProgressLadderTrack}>
            <View
              style={[
                styles.metricsProgressLadderFill,
                { width: width as `${number}%`, backgroundColor: accent },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export type AnalysisPlanCardProps = {
  title: string;
  description?: string;
  category: string;
  dueLabel: string;
  dueValue: string;
  validityLabel: string;
  validityValue: string;
  image: ImageSourcePropType;
  imagePosition?: 'center' | 'top' | 'bottom';
  tone?: 'rose' | 'lilac' | 'pearl';
  status?: string;
  actionLabel?: string;
  actionIcon?: ReactNode;
  onView?: () => void;
  variant?: AnalysisCardVariant;
  actionVariant?: AnalysisCardActionVariant;
};

const referenceTimelineTicks = [
  13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 30, 13, 13,
  13, 13, 13,
];

const referenceImageBlurBands = Array.from({ length: 16 }, (_, index) => ({
  intensity: Math.round((index / 15) * 100),
  top: `${(index / 16) * 100}%` as `${number}%`,
  height: `${100 / 16 + 1}%` as `${number}%`,
}));

type AnalysisReferenceCardProps = {
  title: string;
  description: string;
  dueLabel: string;
  dueValue: string;
  status: string;
  validityValue: string;
  image: ImageSourcePropType;
  onView?: () => void;
  variant?: AnalysisCardVariant;
  actionVariant?: AnalysisCardActionVariant;
};

const calendarCardNotes: Partial<Record<AnalysisCardVariant, string>> = {
  26: 'Результат актуален 30 дней',
  27: 'Натощак · 8–12 часов без еды',
  28: 'Напомним 12 августа',
  29: 'Результат будет готов через 1–2 дня',
  31: 'Повторное обследование через 30 дней',
  32: 'Направление действует до 14 августа',
  33: 'Приём без записи · Пн–Сб',
  34: 'Результат будет готов через 1–2 дня',
  35: 'Заключение будет актуально 30 дней',
};

function AnalysisReferenceCardAction({
  title,
  onView,
  variant,
}: {
  title: string;
  onView?: () => void;
  variant: AnalysisCardVariant;
}) {
  if (variant === 10 || variant >= 16) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Открыть: ${title}`}
      onPress={onView}
      style={({ pressed }) => [
        styles.exactCardButton,
        variant === 1 && styles.exactCardButtonReference,
        variant === 2 && styles.exactCardButtonOutline,
        variant === 3 && styles.exactCardButtonSoft,
        variant === 4 && styles.exactCardButtonSquare,
        variant === 5 && styles.exactCardButtonLabel,
        variant === 6 && styles.exactCardButtonDark,
        variant === 7 && styles.exactCardButtonLabelFilled,
        variant === 8 && styles.exactCardButtonRing,
        variant === 9 && styles.exactCardButtonMinimal,
        variant === 11 && styles.exactCardButtonCalendar,
        variant === 12 && styles.exactCardButtonValidity,
        variant === 13 && styles.exactCardButtonSummary,
        variant === 14 && styles.exactCardButtonRoute,
        variant === 15 && styles.exactCardButtonPriority,
        variant !== 1 && styles.exactCardButtonInline,
        pressed && styles.pressed,
      ]}
    >
      <AppText
        weight="semibold"
        color={
          variant === 1 || variant === 6 || variant === 13 || variant === 15
            ? '#FFFFFF'
            : colors.brand.primary
        }
        style={styles.exactCardArrow}
      >
        ↗
      </AppText>
    </Pressable>
  );
}

function AnalysisProminentAction({
  title,
  onView,
  variant,
}: {
  title: string;
  onView?: () => void;
  variant: AnalysisCardVariant;
}) {
  return (
    <View
      style={[
        styles.exactProminentAction,
        variant === 17 && styles.exactProminentActionBurgundy,
        variant === 18 && styles.exactProminentActionPill,
        variant === 19 && styles.exactProminentActionDark,
        variant === 20 && styles.exactProminentActionWide,
        variant === 21 && styles.exactProminentActionSoft,
        variant === 22 && styles.exactProminentActionTicket,
        variant === 23 && styles.exactProminentActionOutline,
        variant === 24 && styles.exactProminentActionSquare,
        variant === 25 && styles.exactProminentActionAgenda,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Посмотреть: ${title}`}
        onPress={onView}
        style={({ pressed }) => [
          styles.exactProminentActionPressable,
          pressed && styles.pressed,
        ]}
      >
        <AppText
          role="caption"
          weight="semibold"
          color={
            variant === 21 || variant === 23 ? colors.brand.primary : '#FFFFFF'
          }
          numberOfLines={1}
        >
          Посмотреть ↗
        </AppText>
      </Pressable>
    </View>
  );
}

function MinimalCalendarAction({
  variant,
  title,
  onView,
}: {
  variant: AnalysisCardVariant;
  title: string;
  onView?: () => void;
}) {
  const isDark = variant === 27;
  const isIconOnly = variant === 30;

  return (
    <View
      style={[
        styles.minimalCalendarAction,
        variant === 27 && styles.minimalCalendarActionDark,
        variant === 28 && styles.minimalCalendarActionOutline,
        variant === 29 && styles.minimalCalendarActionUnderline,
        variant === 30 && styles.minimalCalendarActionIcon,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Посмотреть: ${title}`}
        onPress={onView}
        style={({ pressed }) => [
          styles.minimalCalendarActionPressable,
          pressed && styles.pressed,
        ]}
      >
        <AppText
          role="caption"
          weight="semibold"
          color={isDark ? '#FFFFFF' : colors.text.primary}
          numberOfLines={1}
        >
          {isIconOnly ? '→' : 'Посмотреть →'}
        </AppText>
      </Pressable>
    </View>
  );
}

function AnalysisCalendarRibbonDetails({
  variant,
  actionVariant,
  title,
  onView,
}: {
  variant: AnalysisCardVariant;
  actionVariant: AnalysisCardActionVariant;
  title: string;
  onView?: () => void;
}) {
  const dates = [8, 9, 10, 11, 12, 13, 14];
  const weekdays = ['Сб', 'Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт'];
  const action = (
    <View style={styles.calendarActionSlot}>
      <AnalysisCardAction
        variant={actionVariant}
        title={title}
        onPress={onView}
      />
    </View>
  );

  if (variant === 26) {
    return (
      <View style={styles.minimalCalendarMeta}>
        <View style={styles.minimalCalendarRange}>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              Сегодня
            </AppText>
            <AppText numeric role="label" weight="semibold">
              8 августа
            </AppText>
          </View>
          <View style={styles.minimalCalendarRangeLine} />
          <View style={styles.minimalCalendarRangeEnd}>
            <AppText role="caption" color={colors.text.secondary}>
              Сдать до
            </AppText>
            <AppText numeric role="label" weight="semibold">
              14 августа
            </AppText>
          </View>
        </View>
        <MinimalCalendarAction
          variant={variant}
          title={title}
          onView={onView}
        />
      </View>
    );
  }

  if (variant === 27) {
    return (
      <View style={styles.minimalCalendarMeta}>
        <View style={styles.minimalCalendarWeek}>
          <View style={styles.minimalCalendarWeekHeading}>
            <AppText role="caption" weight="semibold">
              Окно сдачи
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              8–14 августа
            </AppText>
          </View>
          <View style={styles.minimalCalendarWeekDays}>
            {dates.map((date) => (
              <AppText
                key={date}
                numeric
                role="caption"
                weight={date === 14 ? 'semibold' : 'regular'}
                color={
                  date === 14 ? colors.text.primary : colors.text.secondary
                }
                style={
                  date === 14 ? styles.minimalCalendarWeekDeadline : undefined
                }
              >
                {date}
              </AppText>
            ))}
          </View>
        </View>
        <MinimalCalendarAction
          variant={variant}
          title={title}
          onView={onView}
        />
      </View>
    );
  }

  if (variant === 28) {
    return (
      <View style={styles.minimalCalendarMeta}>
        <View style={styles.minimalCalendarDeadline}>
          <AppText
            numeric
            weight="medium"
            style={styles.minimalCalendarDeadlineNumber}
          >
            14
          </AppText>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              августа
            </AppText>
            <AppText role="label" weight="semibold">
              крайний срок
            </AppText>
          </View>
        </View>
        <MinimalCalendarAction
          variant={variant}
          title={title}
          onView={onView}
        />
      </View>
    );
  }

  if (variant === 29) {
    return (
      <View style={styles.minimalCalendarMeta}>
        <View style={styles.minimalCalendarJourney}>
          <View style={styles.minimalCalendarJourneyLine} />
          {[
            ['Сегодня', '8 авг'],
            ['Сдать', '14 авг'],
            ['Результат', '16 авг'],
          ].map(([label, value], index) => (
            <View key={label} style={styles.minimalCalendarJourneyItem}>
              <View
                style={[
                  styles.minimalCalendarJourneyDot,
                  index === 1 && styles.minimalCalendarJourneyDotActive,
                ]}
              />
              <AppText role="caption" color={colors.text.secondary}>
                {label}
              </AppText>
              <AppText numeric role="caption" weight="semibold">
                {value}
              </AppText>
            </View>
          ))}
        </View>
        <MinimalCalendarAction
          variant={variant}
          title={title}
          onView={onView}
        />
      </View>
    );
  }

  if (variant === 30) {
    return (
      <View style={styles.minimalCalendarMeta}>
        <View style={styles.minimalCalendarSummary}>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              Сдать до
            </AppText>
            <AppText role="label" weight="semibold">
              14 августа
            </AppText>
          </View>
          <View style={styles.minimalCalendarSummaryDivider} />
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              Актуален
            </AppText>
            <AppText role="label" weight="semibold">
              30 дней
            </AppText>
          </View>
        </View>
        {action}
      </View>
    );
  }

  if (variant === 31) {
    return (
      <View style={styles.calendarVariantMeta}>
        <View style={styles.calendarValidityContent}>
          <View style={styles.calendarValidityStep}>
            <View style={styles.calendarValidityDotActive} />
            <View>
              <AppText role="caption" color={colors.text.secondary}>
                Сдать
              </AppText>
              <AppText role="caption" weight="semibold">
                14 августа
              </AppText>
            </View>
          </View>
          <View style={styles.calendarValidityConnector} />
          <View style={styles.calendarValidityStep}>
            <View style={styles.calendarValidityDot} />
            <View>
              <AppText role="caption" color={colors.text.secondary}>
                Актуален до
              </AppText>
              <AppText
                role="caption"
                weight="semibold"
                color={colors.brand.burgundy}
              >
                13 сентября
              </AppText>
            </View>
          </View>
        </View>
        {action}
      </View>
    );
  }

  if (variant === 32) {
    return (
      <View style={styles.calendarVariantMeta}>
        <View style={styles.calendarMiniMonth}>
          <View style={styles.calendarMiniMonthHeader}>
            <AppText role="caption" weight="semibold">
              Август 2026
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              срок направления
            </AppText>
          </View>
          <View style={styles.calendarMiniMonthDates}>
            {dates.map((date) => (
              <View
                key={date}
                style={[
                  styles.calendarMiniMonthDate,
                  date === 14 && styles.calendarMiniMonthDateActive,
                ]}
              >
                <AppText
                  numeric
                  role="caption"
                  weight="semibold"
                  color={date === 14 ? '#FFFFFF' : colors.text.primary}
                >
                  {date}
                </AppText>
              </View>
            ))}
          </View>
        </View>
        {action}
      </View>
    );
  }

  if (variant === 33) {
    return (
      <View style={styles.calendarVariantMeta}>
        <View style={styles.calendarVariantContent}>
          <View style={styles.calendarVariantHeading}>
            <AppText role="caption" weight="semibold">
              Дни приёма лаборатории
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              до 14 авг
            </AppText>
          </View>
          <View style={styles.calendarAvailabilityRow}>
            {dates.map((date, index) => {
              const unavailable = weekdays[index] === 'Вс';
              return (
                <View
                  key={date}
                  style={[
                    styles.calendarAvailabilityDay,
                    unavailable && styles.calendarAvailabilityDayDisabled,
                    date === 14 && styles.calendarAvailabilityDayDeadline,
                  ]}
                >
                  <AppText
                    numeric
                    role="caption"
                    weight="semibold"
                    color={
                      date === 14
                        ? '#FFFFFF'
                        : unavailable
                          ? '#BDB6B9'
                          : colors.text.primary
                    }
                  >
                    {date}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
        {action}
      </View>
    );
  }

  if (variant === 34) {
    const stages = [
      { label: 'Сдать', value: '14 авг' },
      { label: 'Результат', value: '16 авг' },
      { label: 'Актуален', value: '15 сен' },
    ];

    return (
      <View style={styles.calendarVariantMeta}>
        <View style={styles.calendarResultJourney}>
          {stages.map((stage, index) => (
            <View key={stage.label} style={styles.calendarResultStage}>
              <View style={styles.calendarResultStageTop}>
                <View
                  style={[
                    styles.calendarResultDot,
                    index === 0 && styles.calendarResultDotActive,
                  ]}
                />
                {index < stages.length - 1 ? (
                  <View style={styles.calendarResultLine} />
                ) : null}
              </View>
              <AppText role="caption" color={colors.text.secondary}>
                {stage.label}
              </AppText>
              <AppText numeric role="caption" weight="semibold">
                {stage.value}
              </AppText>
            </View>
          ))}
        </View>
        {action}
      </View>
    );
  }

  return (
    <View style={styles.calendarVariantMeta}>
      <View style={styles.calendarWindowSummary}>
        <View style={styles.calendarWindowMonth}>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.primary}
          >
            АВГ
          </AppText>
          <AppText numeric weight="medium" style={styles.calendarWindowDate}>
            8–14
          </AppText>
        </View>
        <View style={styles.calendarWindowSummaryCopy}>
          <AppText role="caption" weight="semibold">
            Окно сдачи
          </AppText>
          <View style={styles.calendarValidityBadge}>
            <AppText role="caption" color={colors.brand.burgundy}>
              + 30 дней актуальности
            </AppText>
          </View>
        </View>
      </View>
      {action}
    </View>
  );
}

function AnalysisReferenceCardDetails({
  variant,
  actionVariant,
  dueLabel,
  dueValue,
  status,
  validityValue,
  title,
  onView,
}: {
  variant: AnalysisCardVariant;
  actionVariant: AnalysisCardActionVariant;
  dueLabel: string;
  dueValue: string;
  status: string;
  validityValue: string;
  title: string;
  onView?: () => void;
}) {
  const statusNumber = status.match(/\d+/)?.[0] ?? status;

  if (variant >= 26) {
    return (
      <AnalysisCalendarRibbonDetails
        variant={variant}
        actionVariant={actionVariant}
        title={title}
        onView={onView}
      />
    );
  }

  if (variant === 1) {
    return (
      <>
        <View style={styles.exactTimeline}>
          {referenceTimelineTicks.map((height, index) => (
            <View
              key={`${height}-${index}`}
              style={[
                styles.exactTimelineTick,
                { height },
                index === 16 && styles.exactTimelineTickActive,
              ]}
            />
          ))}
        </View>
        <View style={styles.exactDatesRow}>
          <AppText role="caption" color="#5E5A59" style={styles.exactDateText}>
            {dueLabel}{' '}
            <AppText role="caption" weight="semibold">
              {dueValue}
            </AppText>
          </AppText>
          <AppText role="caption" color="#5E5A59" style={styles.exactDateText}>
            Осталось{' '}
            <AppText role="caption" weight="semibold">
              {status}
            </AppText>
          </AppText>
        </View>
      </>
    );
  }

  if (variant === 2) {
    return (
      <View style={styles.exactMetaChips}>
        <View style={styles.exactMetaChip}>
          <AppText role="caption" color={colors.text.secondary}>
            {dueLabel}
          </AppText>
          <AppText role="label" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.exactMetaChip}>
          <AppText role="caption" color={colors.text.secondary}>
            Осталось
          </AppText>
          <AppText role="label" weight="semibold" color={colors.brand.burgundy}>
            {status}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 3) {
    return (
      <View style={styles.exactDeadlineRow}>
        <View style={styles.exactDeadlineDate}>
          <AppText numeric weight="medium" style={styles.exactDeadlineNumber}>
            14
          </AppText>
          <View>
            <AppText role="label" weight="semibold">
              Августа
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              крайний срок
            </AppText>
          </View>
        </View>
        <View style={styles.exactDeadlineStatus}>
          <View style={styles.exactStatusDot} />
          <AppText role="caption" weight="medium" color={colors.brand.burgundy}>
            {status}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 4) {
    return (
      <View style={styles.exactMetaGrid}>
        <View style={styles.exactMetaGridCell}>
          <AppText role="caption" color={colors.text.secondary}>
            Дедлайн
          </AppText>
          <AppText role="label" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.exactMetaGridDivider} />
        <View style={styles.exactMetaGridCell}>
          <AppText role="caption" color={colors.text.secondary}>
            До завершения
          </AppText>
          <AppText role="label" weight="semibold" color={colors.brand.burgundy}>
            {status}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 5) {
    return (
      <View style={styles.exactDotTimeline}>
        <View style={styles.exactDotTimelineTrack}>
          <View style={styles.exactDotTimelineFill} />
          <View
            style={[
              styles.exactDotTimelineDot,
              styles.exactDotTimelineDotStart,
            ]}
          />
          <View
            style={[
              styles.exactDotTimelineDot,
              styles.exactDotTimelineDotCurrent,
            ]}
          />
          <View
            style={[styles.exactDotTimelineDot, styles.exactDotTimelineDotEnd]}
          />
        </View>
        <View style={styles.exactDotTimelineLabels}>
          <AppText role="caption" color={colors.text.secondary}>
            Сегодня
          </AppText>
          <AppText role="caption" weight="semibold">
            {dueValue}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 6) {
    return (
      <View style={styles.exactChecklist}>
        <View style={styles.exactChecklistRow}>
          <View style={styles.exactChecklistIndex}>
            <AppText
              numeric
              role="caption"
              weight="semibold"
              color={colors.brand.primary}
            >
              1
            </AppText>
          </View>
          <AppText
            role="caption"
            color={colors.text.secondary}
            style={styles.exactChecklistLabel}
          >
            Сдать анализ до
          </AppText>
          <AppText role="caption" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.exactChecklistRow}>
          <View style={styles.exactChecklistIndex}>
            <AppText
              numeric
              role="caption"
              weight="semibold"
              color={colors.brand.primary}
            >
              2
            </AppText>
          </View>
          <AppText
            role="caption"
            color={colors.text.secondary}
            style={styles.exactChecklistLabel}
          >
            До дедлайна
          </AppText>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.burgundy}
          >
            {status}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 7) {
    return (
      <View style={styles.exactStatusBand}>
        <View>
          <AppText role="caption" color={colors.text.secondary}>
            {dueLabel}
          </AppText>
          <AppText role="label" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.exactStatusBandValue}>
          <AppText role="caption" color={colors.text.secondary}>
            Осталось
          </AppText>
          <AppText role="label" weight="semibold" color={colors.brand.burgundy}>
            {status}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 8) {
    return (
      <View style={styles.exactProgressMeta}>
        <View style={styles.exactProgressLabels}>
          <AppText role="caption" color={colors.text.secondary}>
            Срок до {dueValue}
          </AppText>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.burgundy}
          >
            {status}
          </AppText>
        </View>
        <View style={styles.exactProgressTrack}>
          <LinearGradient
            colors={['#F04D98', '#D80D72']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.exactProgressFill}
          />
        </View>
        <View style={styles.exactProgressTicks}>
          {Array.from({ length: 8 }, (_, index) => (
            <View key={index} style={styles.exactProgressTick} />
          ))}
        </View>
      </View>
    );
  }

  if (variant === 9) {
    return (
      <View style={styles.exactEditorialMeta}>
        <View style={styles.exactEditorialRule} />
        <View style={styles.exactEditorialRow}>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              {dueLabel.toUpperCase()}
            </AppText>
            <AppText
              role="heading"
              weight="medium"
              style={styles.exactEditorialDate}
            >
              {dueValue}
            </AppText>
          </View>
          <View style={styles.exactEditorialStatus}>
            <AppText role="caption" color={colors.text.secondary}>
              ОСТАЛОСЬ
            </AppText>
            <AppText role="label" weight="semibold">
              {status}
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  if (variant === 10) {
    return (
      <View style={styles.exactGlassMeta}>
        <View style={styles.exactGlassMetaItem}>
          <AppText role="caption" color={colors.text.secondary}>
            до
          </AppText>
          <AppText role="caption" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.exactGlassMetaItem}>
          <AppText role="caption" color={colors.text.secondary}>
            осталось
          </AppText>
          <AppText role="caption" weight="semibold">
            {status}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Посмотреть: ${title}`}
          onPress={onView}
          style={({ pressed }) => [
            styles.exactGlassAction,
            pressed && styles.pressed,
          ]}
        >
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.primary}
          >
            Посмотреть ↗
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (variant === 11) {
    const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const dates = [10, 11, 12, 13, 14, 15, 16];

    return (
      <View style={styles.exactCalendarWeek}>
        {weekDays.map((day, index) => (
          <View key={day} style={styles.exactCalendarDay}>
            <AppText role="caption" color={colors.text.secondary}>
              {day}
            </AppText>
            <View
              style={[
                styles.exactCalendarDate,
                dates[index] === 14 && styles.exactCalendarDateActive,
              ]}
            >
              <AppText
                numeric
                role="caption"
                weight="semibold"
                color={dates[index] === 14 ? '#FFFFFF' : colors.text.primary}
              >
                {dates[index]}
              </AppText>
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (variant === 12) {
    return (
      <View style={styles.exactValidityWindow}>
        <View style={styles.exactValidityHeading}>
          <AppText role="caption" color={colors.text.secondary}>
            Окно актуальности
          </AppText>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.burgundy}
          >
            {validityValue}
          </AppText>
        </View>
        <View style={styles.exactValidityTrack}>
          <LinearGradient
            colors={['#F6C9DE', '#D31471']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.exactValidityFill}
          />
          <View
            style={[
              styles.exactValidityHandle,
              styles.exactValidityHandleStart,
            ]}
          />
          <View
            style={[styles.exactValidityHandle, styles.exactValidityHandleEnd]}
          />
        </View>
        <View style={styles.exactValidityLabels}>
          <AppText role="caption" color={colors.text.secondary}>
            Сегодня
          </AppText>
          <AppText role="caption" weight="semibold">
            {dueValue}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 13) {
    return (
      <View style={styles.exactDeadlineSummary}>
        <View style={styles.exactDeadlineSummaryHero}>
          <AppText
            numeric
            weight="medium"
            style={styles.exactDeadlineSummaryNumber}
          >
            {statusNumber}
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            дней осталось
          </AppText>
        </View>
        <View style={styles.exactDeadlineSummaryDivider} />
        <View style={styles.exactDeadlineSummaryDate}>
          <AppText role="caption" color={colors.text.secondary}>
            {dueLabel}
          </AppText>
          <AppText role="label" weight="semibold">
            {dueValue}
          </AppText>
          <View style={styles.exactDeadlineSummaryPulse} />
        </View>
      </View>
    );
  }

  if (variant === 14) {
    const routeSteps = ['Назначено', 'Сдать', 'Результат'];

    return (
      <View style={styles.exactRouteMeta}>
        <View style={styles.exactRouteTrack} />
        {routeSteps.map((step, index) => (
          <View key={step} style={styles.exactRouteStep}>
            <View
              style={[
                styles.exactRouteNode,
                index === 0 && styles.exactRouteNodeComplete,
                index === 1 && styles.exactRouteNodeActive,
              ]}
            >
              <AppText
                numeric
                role="caption"
                weight="semibold"
                color={index < 2 ? '#FFFFFF' : colors.text.secondary}
              >
                {index === 0 ? '✓' : index + 1}
              </AppText>
            </View>
            <AppText
              role="caption"
              weight={index === 1 ? 'semibold' : 'regular'}
              color={index === 1 ? colors.text.primary : colors.text.secondary}
            >
              {step}
            </AppText>
          </View>
        ))}
        <AppText role="caption" weight="semibold" style={styles.exactRouteDate}>
          до {dueValue}
        </AppText>
      </View>
    );
  }

  if (variant === 16) {
    return (
      <View style={styles.exactCountdownMeta}>
        <View style={styles.exactCountdownCopy}>
          <AppText numeric weight="medium" style={styles.exactCountdownNumber}>
            {statusNumber}
          </AppText>
          <View>
            <AppText role="caption" color={colors.text.secondary}>
              дней до сдачи
            </AppText>
            <AppText role="label" weight="semibold">
              До {dueValue}
            </AppText>
          </View>
        </View>
        <AnalysisCardAction variant={10} title={title} onPress={onView} />
      </View>
    );
  }

  if (variant === 17) {
    const dates = [8, 9, 10, 11, 12, 13, 14];

    return (
      <View style={styles.exactCalendarRibbonMeta}>
        <View style={styles.exactCalendarRibbonContent}>
          <View style={styles.exactCalendarRibbonHeading}>
            <AppText role="caption" weight="semibold">
              Окно сдачи
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              до 14 августа
            </AppText>
          </View>
          <View style={styles.exactCalendarRibbon}>
            {dates.map((date) => (
              <View
                key={date}
                style={[
                  styles.exactCalendarRibbonDay,
                  date === 8 && styles.exactCalendarRibbonToday,
                  date === 14 && styles.exactCalendarRibbonDeadline,
                ]}
              >
                <AppText
                  numeric
                  role="caption"
                  weight="semibold"
                  color={date === 14 ? '#FFFFFF' : colors.text.primary}
                >
                  {date}
                </AppText>
              </View>
            ))}
          </View>
        </View>
        <AnalysisCardAction variant={10} title={title} onPress={onView} />
      </View>
    );
  }

  if (variant === 18) {
    return (
      <View style={styles.exactRangeMeta}>
        <View style={styles.exactRangeDates}>
          <View style={styles.exactRangeDateBlock}>
            <AppText role="caption" color={colors.text.secondary}>
              Сегодня
            </AppText>
            <AppText numeric role="label" weight="semibold">
              08 АВГ
            </AppText>
          </View>
          <View style={styles.exactRangeLine}>
            <View style={styles.exactRangeLineFill} />
          </View>
          <View style={[styles.exactRangeDateBlock, styles.exactRangeDateEnd]}>
            <AppText role="caption" color={colors.text.secondary}>
              Сдать до
            </AppText>
            <AppText
              numeric
              role="label"
              weight="semibold"
              color={colors.brand.burgundy}
            >
              14 АВГ
            </AppText>
          </View>
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  if (variant === 19) {
    return (
      <View style={styles.exactBigDateMeta}>
        <View style={styles.exactBigDateBadge}>
          <AppText
            numeric
            weight="medium"
            color="#FFFFFF"
            style={styles.exactBigDateNumber}
          >
            14
          </AppText>
          <AppText
            role="caption"
            weight="semibold"
            color="rgba(255,255,255,0.76)"
          >
            АВГУСТА
          </AppText>
        </View>
        <View style={styles.exactBigDateCopy}>
          <AppText role="caption" color={colors.text.secondary}>
            Крайний срок
          </AppText>
          <AppText role="label" weight="semibold" color={colors.brand.burgundy}>
            {status}
          </AppText>
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  if (variant === 20) {
    const days = ['Сб', 'Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт'];

    return (
      <View style={styles.exactWeekCountdownMeta}>
        <View style={styles.exactWeekCountdownHeading}>
          <AppText role="caption" color={colors.text.secondary}>
            Неделя до сдачи
          </AppText>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.burgundy}
          >
            {dueValue}
          </AppText>
        </View>
        <View style={styles.exactWeekCountdownRow}>
          {days.map((day, index) => (
            <View
              key={day}
              style={[
                styles.exactWeekCountdownDay,
                index === 0 && styles.exactWeekCountdownToday,
                index === 6 && styles.exactWeekCountdownEnd,
              ]}
            >
              <AppText
                role="caption"
                weight="semibold"
                color={index === 6 ? '#FFFFFF' : colors.text.primary}
              >
                {day}
              </AppText>
            </View>
          ))}
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  if (variant === 21) {
    const milestones = [
      { label: 'Сегодня', value: '08.08', active: true },
      { label: 'Напомнить', value: '12.08', active: false },
      { label: 'Сдать', value: '14.08', active: false },
    ];

    return (
      <View style={styles.exactMilestonesMeta}>
        <View style={styles.exactMilestonesList}>
          {milestones.map((item, index) => (
            <View key={item.label} style={styles.exactMilestoneItem}>
              <View
                style={[
                  styles.exactMilestoneDot,
                  item.active && styles.exactMilestoneDotActive,
                ]}
              />
              {index < milestones.length - 1 ? (
                <View style={styles.exactMilestoneConnector} />
              ) : null}
              <AppText role="caption" color={colors.text.secondary}>
                {item.label}
              </AppText>
              <AppText numeric role="caption" weight="semibold">
                {item.value}
              </AppText>
            </View>
          ))}
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  if (variant === 22) {
    return (
      <View style={styles.exactTicketMeta}>
        <View style={styles.exactTicketDate}>
          <AppText role="caption" color={colors.text.secondary}>
            ДЕДЛАЙН
          </AppText>
          <View style={styles.exactTicketDateRow}>
            <AppText numeric weight="medium" style={styles.exactTicketNumber}>
              14
            </AppText>
            <AppText role="label" weight="semibold">
              АВГ
            </AppText>
          </View>
        </View>
        <View style={styles.exactTicketDivider} />
        <View style={styles.exactTicketStatus}>
          <AppText role="caption" color={colors.text.secondary}>
            Осталось
          </AppText>
          <AppText role="label" weight="semibold" color={colors.brand.burgundy}>
            {statusNumber} дней
          </AppText>
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  if (variant === 23) {
    return (
      <View style={styles.exactGaugeMeta}>
        <View style={styles.exactGaugeRing}>
          <View style={styles.exactGaugeRingInner}>
            <AppText
              numeric
              role="label"
              weight="semibold"
              color={colors.brand.burgundy}
            >
              {statusNumber}
            </AppText>
          </View>
        </View>
        <View style={styles.exactGaugeCopy}>
          <AppText role="caption" color={colors.text.secondary}>
            Индикатор срока
          </AppText>
          <AppText role="label" weight="semibold">
            Сдать до {dueValue}
          </AppText>
          <View style={styles.exactGaugeTrack}>
            <View style={styles.exactGaugeFill} />
          </View>
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  if (variant === 24) {
    return (
      <View style={styles.exactCompareMeta}>
        <View style={styles.exactCompareDate}>
          <AppText role="caption" color={colors.text.secondary}>
            СЕГОДНЯ
          </AppText>
          <AppText numeric weight="medium" style={styles.exactCompareNumber}>
            08
          </AppText>
        </View>
        <View style={styles.exactCompareArrow}>
          <AppText role="label" color={colors.brand.primary}>
            →
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            {statusNumber} дней
          </AppText>
        </View>
        <View style={styles.exactCompareDate}>
          <AppText role="caption" color={colors.text.secondary}>
            ДЕДЛАЙН
          </AppText>
          <AppText
            numeric
            weight="medium"
            color={colors.brand.burgundy}
            style={styles.exactCompareNumber}
          >
            14
          </AppText>
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  if (variant === 25) {
    return (
      <View style={styles.exactAgendaMeta}>
        <View style={styles.exactAgendaDateBadge}>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.primary}
          >
            АВГ
          </AppText>
          <AppText numeric weight="medium" style={styles.exactAgendaNumber}>
            14
          </AppText>
        </View>
        <View style={styles.exactAgendaCopy}>
          <View style={styles.exactAgendaStatusRow}>
            <View style={styles.exactAgendaStatusDot} />
            <AppText
              role="caption"
              weight="semibold"
              color={colors.brand.burgundy}
            >
              Запланировано
            </AppText>
          </View>
          <AppText role="caption" color={colors.text.secondary}>
            Пятница · до 18:00
          </AppText>
        </View>
        <AnalysisProminentAction
          title={title}
          onView={onView}
          variant={variant}
        />
      </View>
    );
  }

  return (
    <View style={styles.exactPriorityMeta}>
      <View style={styles.exactPriorityHeading}>
        <View>
          <AppText role="caption" color={colors.text.secondary}>
            Срок приближается
          </AppText>
          <AppText role="label" weight="semibold">
            До {dueValue}
          </AppText>
        </View>
        <View style={styles.exactPriorityBadge}>
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.burgundy}
          >
            {status}
          </AppText>
        </View>
      </View>
      <View style={styles.exactPrioritySegments}>
        {Array.from({ length: 5 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.exactPrioritySegment,
              index < 4 && styles.exactPrioritySegmentActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function AnalysisReferenceCard({
  title,
  description,
  dueLabel,
  dueValue,
  status,
  validityValue,
  image,
  onView,
  variant = 1,
  actionVariant = 10,
}: AnalysisReferenceCardProps) {
  return (
    <View
      style={[
        styles.exactCard,
        variant === 2 && styles.exactCard02,
        variant === 3 && styles.exactCard03,
        variant === 4 && styles.exactCard04,
        variant === 5 && styles.exactCard05,
        variant === 6 && styles.exactCard06,
        variant === 7 && styles.exactCard07,
        variant === 8 && styles.exactCard08,
        variant === 9 && styles.exactCard09,
        variant === 10 && styles.exactCard10,
        variant === 11 && styles.exactCard11,
        variant === 12 && styles.exactCard12,
        variant === 13 && styles.exactCard13,
        variant === 14 && styles.exactCard14,
        variant === 15 && styles.exactCard15,
        variant === 16 && styles.exactCard16,
        variant === 17 && styles.exactCard17,
        variant === 18 && styles.exactCard18,
        variant === 19 && styles.exactCard19,
        variant === 20 && styles.exactCard20,
        variant === 21 && styles.exactCard21,
        variant === 22 && styles.exactCard22,
        variant === 23 && styles.exactCard23,
        variant === 24 && styles.exactCard24,
        variant === 25 && styles.exactCard25,
        variant === 26 && styles.exactCard26,
        variant === 27 && styles.exactCard27,
        variant === 28 && styles.exactCard28,
        variant === 29 && styles.exactCard29,
        variant === 30 && styles.exactCard30,
        variant === 31 && styles.exactCard31,
        variant === 32 && styles.exactCard32,
        variant === 33 && styles.exactCard33,
        variant === 34 && styles.exactCard34,
        variant === 35 && styles.exactCard35,
      ]}
    >
      <View style={styles.exactCardMedia}>
        <Image
          accessible
          accessibilityLabel={`Изображение: ${title}`}
          source={image}
          resizeMode="contain"
          style={styles.exactCardImage}
        />
        <View pointerEvents="none" style={styles.exactCardImageBlur}>
          {referenceImageBlurBands.map((band) => (
            <BlurView
              key={band.top}
              intensity={band.intensity}
              tint="light"
              experimentalBlurMethod="dimezisBlurView"
              style={[
                styles.exactCardImageBlurBand,
                { top: band.top, height: band.height },
              ]}
            />
          ))}
        </View>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.68)', '#FFFFFF']}
          locations={[0, 0.58, 1]}
          style={styles.exactCardImageFade}
        />
      </View>

      {variant === 1 ? (
        <>
          <View style={styles.exactCardCopy}>
            <AppText
              weight="semibold"
              numberOfLines={1}
              style={styles.exactCardTitle}
            >
              {title}
            </AppText>
            <AppText
              role="caption"
              color="#5E5A59"
              numberOfLines={2}
              style={styles.exactCardDescription}
            >
              {description}
            </AppText>
          </View>
          <AnalysisReferenceCardAction
            title={title}
            onView={onView}
            variant={variant}
          />
        </>
      ) : (
        <View
          style={[
            styles.exactCardHeaderAlternative,
            variant >= 16 && styles.exactCardHeaderProminent,
            variant === 30 && styles.minimalCardHeaderCentered,
          ]}
        >
          {variant < 16 ? (
            <View style={styles.exactCardHeaderActionRow}>
              <AnalysisReferenceCardAction
                title={title}
                onView={onView}
                variant={variant}
              />
            </View>
          ) : null}
          <AppText
            weight="semibold"
            numberOfLines={1}
            style={styles.exactCardTitle}
          >
            {title}
          </AppText>
          <AppText
            role="caption"
            color="#5E5A59"
            numberOfLines={2}
            style={styles.exactCardDescription}
          >
            {description}
          </AppText>
          {variant >= 26 && calendarCardNotes[variant] ? (
            <View style={styles.calendarCardHeaderNote}>
              {variant >= 31 ? (
                <View style={styles.calendarCardHeaderNoteDot} />
              ) : null}
              <AppText
                role="caption"
                color={colors.text.secondary}
                numberOfLines={1}
                style={styles.calendarCardHeaderNoteText}
              >
                {calendarCardNotes[variant]}
              </AppText>
            </View>
          ) : null}
        </View>
      )}
      <AnalysisReferenceCardDetails
        variant={variant}
        actionVariant={actionVariant}
        dueLabel={dueLabel}
        dueValue={dueValue}
        status={status}
        validityValue={validityValue}
        title={title}
        onView={onView}
      />
    </View>
  );
}

const cardTones = {
  rose: {
    background: '#FFF3F3',
    pill: '#FADFE8',
  },
  lilac: {
    background: '#F8F3FB',
    pill: '#EDE0F4',
  },
  pearl: {
    background: '#F5F5F5',
    pill: '#E9E7E7',
  },
} as const;

const cardVariantSurfaces: Record<
  AnalysisCardVariant,
  { background: string; pill: string }
> = {
  1: { background: '#FFF3F3', pill: '#FADFE8' },
  2: { background: '#F3F0FA', pill: '#E8DFF3' },
  3: { background: '#EEF6F2', pill: '#DCEDE5' },
  4: { background: '#F7F1ED', pill: '#EDE2DC' },
  5: { background: '#FFFFFF', pill: '#F2EDF0' },
  6: { background: '#F4F1F6', pill: '#E9E1ED' },
  7: { background: '#FFF0E9', pill: '#F7DDD2' },
  8: { background: '#F1F4F5', pill: '#E2EAEC' },
  9: { background: '#F5F3F3', pill: '#ECE7E8' },
  10: { background: '#F7F1F4', pill: '#F1E4EA' },
  11: { background: '#FFFFFF', pill: '#F4EEF1' },
  12: { background: '#FFFDFE', pill: '#F6EAF0' },
  13: { background: '#FFFFFF', pill: '#F3EDF0' },
  14: { background: '#FFFCFD', pill: '#F5EAF0' },
  15: { background: '#FFFDFD', pill: '#F9E8F0' },
  16: { background: '#FFFDFE', pill: '#F7E8EF' },
  17: { background: '#FFFCFD', pill: '#F4E8ED' },
  18: { background: '#FFFFFF', pill: '#F3ECEF' },
  19: { background: '#FBF8F9', pill: '#ECE4E7' },
  20: { background: '#FFFDFD', pill: '#F8EAF0' },
  21: { background: '#FFFFFF', pill: '#F5EEF1' },
  22: { background: '#FFF9FB', pill: '#F5E5EC' },
  23: { background: '#FFFFFF', pill: '#F1E9ED' },
  24: { background: '#FFFCFD', pill: '#F6E9EF' },
  25: { background: '#FFFDFE', pill: '#F3E8ED' },
  26: { background: '#FFFDFE', pill: '#F5E8EE' },
  27: { background: '#FFFFFF', pill: '#F3E9ED' },
  28: { background: '#FFFCFD', pill: '#F5E8EE' },
  29: { background: '#FFFFFF', pill: '#F1E9EC' },
  30: { background: '#FFFDFE', pill: '#F7E8EF' },
  31: { background: '#FFFCFD', pill: '#F4E8ED' },
  32: { background: '#FFFFFF', pill: '#F3E9ED' },
  33: { background: '#FFFDFD', pill: '#F7E8EF' },
  34: { background: '#FFFFFF', pill: '#F2E9EC' },
  35: { background: '#FFFDFE', pill: '#F5E8EE' },
};

type AnalysisCardActionProps = {
  label?: string;
  title?: string;
  inverse?: boolean;
  variant?: AnalysisCardActionVariant;
  icon?: ReactNode;
  onPress?: () => void;
};

export function AnalysisCardAction({
  label = 'Посмотреть',
  title,
  inverse = false,
  variant = 1,
  icon,
  onPress,
}: AnalysisCardActionProps) {
  const text = label;
  const lightText = inverse || [1, 2, 6, 11, 15].includes(variant);
  const darkText = variant === 9;
  const splitGlyph = false;

  return (
    <View
      style={[
        styles.cardAction,
        variant === 1 && styles.cardActionArrow,
        variant === 2 && styles.cardActionLink,
        variant === 3 && styles.cardActionSolid,
        variant === 4 && styles.cardActionSoft,
        variant === 5 && styles.cardActionOutline,
        variant === 6 && styles.cardActionWide,
        variant === 7 && styles.cardActionDark,
        variant === 8 && styles.cardActionSplit,
        variant === 9 && styles.cardActionMinimal,
        variant === 10 && styles.cardActionGlass,
        variant === 11 && styles.cardActionSquareSolid,
        variant === 12 && styles.cardActionStatusPill,
        variant === 13 && styles.cardActionEditorialLink,
        variant === 14 && styles.cardActionFramedSplit,
        variant === 15 && styles.cardActionBurgundyWide,
        inverse && styles.cardActionInverse,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title ? `${text}: ${title}` : text}
        onPress={onPress}
        style={({ pressed }) => [
          styles.cardActionPressable,
          splitGlyph && styles.cardActionPressableSplit,
          pressed && styles.pressed,
        ]}
      >
        {variant === 5 && icon ? icon : null}
        {variant === 12 ? <View style={styles.cardActionStatusDot} /> : null}
        <AppText
          role="caption"
          weight="semibold"
          color={
            lightText
              ? colors.text.inverse
              : darkText
                ? colors.text.primary
                : colors.brand.primary
          }
          numberOfLines={1}
        >
          {splitGlyph ? text : `${text} ↗`}
        </AppText>
        {splitGlyph ? (
          <View
            style={[
              styles.cardActionGlyph,
              variant === 7 && styles.cardActionGlyphSplit,
              variant === 14 && styles.cardActionGlyphFramed,
              inverse && styles.cardActionGlyphInverse,
            ]}
          >
            <AppText
              role="caption"
              weight="semibold"
              color={inverse ? colors.text.inverse : colors.brand.primary}
              style={styles.cardActionGlyphText}
            >
              ↗
            </AppText>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function AnalysisCardMeta({
  variant,
  dueLabel,
  dueValue,
  validityLabel,
  validityValue,
}: {
  variant: AnalysisCardVariant;
  dueLabel: string;
  dueValue: string;
  validityLabel: string;
  validityValue: string;
}) {
  if (variant === 2) {
    return (
      <View style={styles.metaChips}>
        <View style={styles.metaChip}>
          <AppText role="caption" color={colors.text.secondary}>
            {dueLabel}
          </AppText>
          <AppText role="caption" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.metaChip}>
          <AppText role="caption" color={colors.text.secondary}>
            {validityLabel}
          </AppText>
          <AppText role="caption" weight="semibold">
            {validityValue}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 3) {
    return (
      <View style={styles.metaCalendar}>
        <AppText numeric color={colors.brand.primary} style={styles.metaDay}>
          14
        </AppText>
        <View style={styles.metaCalendarCopy}>
          <AppText role="label" weight="medium">
            августа
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            крайний срок сдачи
          </AppText>
        </View>
        <View style={styles.metaValidityBadge}>
          <AppText role="caption" weight="medium" color={colors.brand.primary}>
            {validityValue}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 4) {
    return (
      <View style={styles.metaTimeline}>
        <View style={styles.metaTimelineDot} />
        <View style={styles.metaTimelineLine} />
        <View style={styles.metaTimelineCopy}>
          <AppText role="caption" color={colors.text.secondary}>
            Сегодня
          </AppText>
          <AppText role="caption" weight="semibold">
            До {dueValue}
          </AppText>
        </View>
        <AppText role="caption" color={colors.text.secondary}>
          {validityValue}
        </AppText>
      </View>
    );
  }

  if (variant === 5) {
    return (
      <View style={styles.metaSplitCells}>
        <View style={styles.metaSplitCell}>
          <AppText role="caption" color={colors.text.secondary}>
            Дедлайн
          </AppText>
          <AppText role="label" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.metaSplitCell}>
          <AppText role="caption" color={colors.text.secondary}>
            Период
          </AppText>
          <AppText role="label" weight="semibold">
            {validityValue}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 6) {
    return (
      <View style={styles.metaChecklist}>
        <View style={styles.metaChecklistRow}>
          <View style={styles.metaCheck}>
            <AppText role="caption" color={colors.brand.primary}>
              1
            </AppText>
          </View>
          <AppText role="caption" color={colors.text.secondary}>
            Сдать до
          </AppText>
          <AppText role="caption" weight="semibold" style={styles.metaPush}>
            {dueValue}
          </AppText>
        </View>
        <View style={styles.metaChecklistRow}>
          <View style={styles.metaCheck}>
            <AppText role="caption" color={colors.brand.primary}>
              2
            </AppText>
          </View>
          <AppText role="caption" color={colors.text.secondary}>
            Актуальность
          </AppText>
          <AppText role="caption" weight="semibold" style={styles.metaPush}>
            {validityValue}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 7) {
    return (
      <View style={styles.metaBand}>
        <View>
          <AppText role="caption" color={colors.text.secondary}>
            Окно сдачи
          </AppText>
          <AppText role="label" weight="semibold">
            до {dueValue}
          </AppText>
        </View>
        <View style={styles.metaBandDivider} />
        <View>
          <AppText role="caption" color={colors.text.secondary}>
            Результат действует
          </AppText>
          <AppText role="label" weight="semibold">
            {validityValue}
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 8) {
    return (
      <View style={styles.metaProgress}>
        <View style={styles.metaProgressLabels}>
          <AppText role="caption" color={colors.text.secondary}>
            Срок сдачи
          </AppText>
          <AppText role="caption" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.metaProgressTrack}>
          <View style={styles.metaProgressFill} />
        </View>
        <AppText role="caption" color={colors.text.secondary}>
          Актуально ещё {validityValue}
        </AppText>
      </View>
    );
  }

  if (variant === 9) {
    return (
      <View style={styles.metaEditorial}>
        <View>
          <AppText role="caption" color={colors.text.secondary}>
            {dueLabel}
          </AppText>
          <AppText role="heading" weight="medium">
            {dueValue}
          </AppText>
        </View>
        <AppText role="caption" color={colors.text.secondary}>
          Обследование сохраняет актуальность {validityValue}
        </AppText>
      </View>
    );
  }

  if (variant === 10) {
    return (
      <View style={styles.metaGlassRow}>
        <View style={styles.metaGlassItem}>
          <AppText role="caption" color={colors.text.secondary}>
            до
          </AppText>
          <AppText role="caption" weight="semibold">
            {dueValue}
          </AppText>
        </View>
        <View style={styles.metaGlassItem}>
          <AppText role="caption" color={colors.text.secondary}>
            период
          </AppText>
          <AppText role="caption" weight="semibold">
            {validityValue}
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.referenceMeta}>
      <View style={styles.planCardMetaRow}>
        <AppText role="caption" color={colors.text.secondary}>
          {dueLabel}
        </AppText>
        <AppText role="caption" weight="semibold">
          {dueValue}
        </AppText>
      </View>
      <View style={styles.planCardMetaRow}>
        <AppText role="caption" color={colors.text.secondary}>
          {validityLabel}
        </AppText>
        <AppText role="caption" weight="semibold">
          {validityValue}
        </AppText>
      </View>
    </View>
  );
}

export function AnalysisPlanCard({
  title,
  description,
  category,
  dueLabel,
  dueValue,
  validityLabel,
  validityValue,
  image,
  imagePosition = 'center',
  tone = 'rose',
  status,
  actionLabel = 'Подробнее',
  actionIcon,
  onView,
  variant = 1,
  actionVariant = 10,
}: AnalysisPlanCardProps) {
  return (
    <AnalysisReferenceCard
      title={title}
      description={description ?? category}
      dueLabel={dueLabel}
      dueValue={dueValue}
      status={status?.replace(/^Осталось\s*/i, '') ?? validityValue}
      validityValue={validityValue}
      image={image}
      onView={onView}
      variant={variant}
      actionVariant={actionVariant}
    />
  );
}

const styles = StyleSheet.create({
  metricTile: {
    minHeight: 112,
    flex: 1,
    overflow: 'hidden',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.10)',
    backgroundColor: colors.surface.raised,
    paddingHorizontal: 12,
    paddingTop: 15,
    paddingBottom: 12,
    ...shadows.card,
  },
  metricAccent: {
    position: 'absolute',
    top: 0,
    left: 12,
    width: 24,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  metricValue: {
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.7,
  },
  metricLabel: {
    marginTop: 5,
    fontSize: 11.5,
    lineHeight: 14,
  },
  metricCompact: {
    flex: 1,
    gap: 3,
  },
  metricCompactValue: {
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.5,
  },
  metricCompactLabel: {
    fontSize: 11,
    lineHeight: 13,
  },
  metricsTilesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  metricsUnified: {
    minHeight: 106,
    flexDirection: 'row',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.10)',
    backgroundColor: colors.surface.raised,
    paddingVertical: spacing.md,
    ...shadows.card,
  },
  metricsUnifiedItem: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  metricsUnifiedDivider: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.surface.divider,
  },
  metricsRows: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    paddingHorizontal: spacing.md,
    ...shadows.card,
  },
  metricsRowItem: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  metricsRowLabel: {
    flex: 1,
  },
  metricsBento: {
    minHeight: 150,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsBentoHero: {
    flex: 1.1,
    justifyContent: 'flex-end',
    borderRadius: radii.md,
    backgroundColor: '#FFF0F6',
    padding: spacing.md,
  },
  bentoValue: {
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: -1.4,
  },
  metricsBentoSide: {
    flex: 1,
    gap: spacing.xs,
  },
  metricsBentoMini: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    padding: spacing.sm,
  },
  metricsBento02: {
    minHeight: 174,
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: 32,
    backgroundColor: colors.surface.raised,
    padding: spacing.sm,
    ...shadows.card,
  },
  metricsBento02Hero: {
    flex: 1.12,
    justifyContent: 'flex-end',
    borderRadius: 25,
    backgroundColor: '#FFF0F6',
    padding: spacing.md,
  },
  metricsBento02Side: {
    flex: 1,
    gap: spacing.sm,
  },
  metricsBento02Mini: {
    flex: 1,
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#F8F5F6',
    paddingHorizontal: spacing.sm,
  },
  metricsBento02MiniContent: {
    flex: 0,
  },
  metricsBento03: {
    minHeight: 158,
    gap: spacing.xs,
  },
  metricsBento03Hero: {
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: '#FFF0F6',
    padding: spacing.md,
  },
  metricsBento03Bottom: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsBento03Mini: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    padding: spacing.sm,
  },
  metricsBento04: {
    minHeight: 150,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsBento04Side: {
    flex: 1,
    gap: spacing.xs,
  },
  metricsBento04Mini: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    padding: spacing.sm,
  },
  metricsBento04Hero: {
    flex: 1.18,
    justifyContent: 'flex-end',
    borderRadius: radii.lg,
    backgroundColor: '#FFF0F6',
    padding: spacing.md,
  },
  metricsBento05: {
    minHeight: 136,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsBento05Hero: {
    flex: 1.55,
    justifyContent: 'flex-end',
    borderRadius: radii.lg,
    backgroundColor: '#FFF0F6',
    padding: spacing.md,
  },
  metricsBento05Mini: {
    flex: 0.78,
    justifyContent: 'flex-end',
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    padding: spacing.sm,
  },
  metricsBento06: {
    minHeight: 142,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
    backgroundColor: colors.surface.raised,
  },
  metricsBento06Hero: {
    flex: 1.15,
    justifyContent: 'flex-end',
    backgroundColor: '#FFF0F6',
    padding: spacing.md,
  },
  metricsBento06Side: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  metricsBento06Mini: {
    flex: 1,
    justifyContent: 'center',
  },
  metricsBento06MiniBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  metricsBento07: {
    position: 'relative',
    minHeight: 164,
    overflow: 'hidden',
    borderRadius: radii.lg,
    backgroundColor: colors.brand.burgundy,
    padding: spacing.md,
    paddingBottom: 65,
    ...shadows.floating,
  },
  metricsBento07Hero: {
    flex: 1,
    justifyContent: 'space-between',
  },
  metricsBento07FloatingRow: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    left: spacing.sm,
    height: 58,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsBento07Mini: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metricsBento08: {
    minHeight: 150,
    flexDirection: 'row',
    gap: spacing.xs,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.92)',
    padding: spacing.sm,
    ...shadows.card,
  },
  metricsBento08Hero: {
    flex: 1.15,
    justifyContent: 'flex-end',
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.54)',
    padding: spacing.md,
  },
  metricsBento08Side: {
    flex: 1,
    gap: spacing.xs,
  },
  metricsBento08Mini: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.66)',
    padding: spacing.sm,
  },
  metricsBento09: {
    minHeight: 148,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricsBento09Hero: {
    flex: 1.15,
    justifyContent: 'flex-end',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.30)',
    padding: spacing.md,
  },
  metricsBento09Side: {
    flex: 1,
    gap: spacing.sm,
  },
  metricsBento09Mini: {
    flex: 1,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
    padding: spacing.sm,
  },
  metricsBento10: {
    minHeight: 148,
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderRadius: 30,
    backgroundColor: '#FFF0F6',
    padding: spacing.md,
  },
  metricsBento10Hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metricsBento10Pills: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsBento10Pill: {
    flex: 1,
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metricsGaugePanel: {
    minHeight: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    padding: spacing.md,
    ...shadows.card,
  },
  metricsGauge: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 56,
    borderWidth: 12,
    borderColor: colors.brand.primary,
    borderRightColor: '#F2D5E3',
  },
  metricsGaugeInner: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 38,
    backgroundColor: '#FFF5F9',
  },
  metricsGaugeValue: {
    fontSize: 24,
    lineHeight: 27,
  },
  metricsGaugeCopy: {
    flex: 1,
    gap: spacing.md,
  },
  metricsGaugeCounters: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricsSoftBand: {
    minHeight: 118,
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: '#FDE9F1',
    padding: spacing.md,
  },
  metricsOutlined: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsOutlinedItem: {
    minHeight: 122,
    flex: 1,
    justifyContent: 'space-between',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(130,53,55,0.18)',
    padding: spacing.sm,
  },
  metricsOutlinedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricsDark: {
    minHeight: 142,
    gap: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.brand.burgundy,
    padding: spacing.md,
    ...shadows.floating,
  },
  metricsDarkRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricsCapsules: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metricCapsule: {
    minHeight: 66,
    flexGrow: 1,
    flexBasis: 105,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.raised,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...shadows.card,
  },
  metricCapsuleLabel: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 12,
  },
  metricsProgressPanel: {
    minHeight: 136,
    gap: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    padding: spacing.md,
    ...shadows.card,
  },
  metricsProgressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  progressValue: {
    marginTop: 2,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -0.8,
  },
  metricsProgressCounters: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metricsProgressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: '#F0E2E8',
  },
  metricsProgressFill: {
    width: '72%',
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
  },
  metricsMonthOverview: {
    minHeight: 144,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.12)',
    backgroundColor: colors.surface.raised,
    padding: spacing.md,
  },
  metricsMonthOverviewTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  metricsNewHeroValue: {
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  metricsMonthOverviewBottom: {
    position: 'relative',
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.xl,
    paddingBottom: 12,
  },
  metricsMonthOverviewStat: {
    gap: 2,
  },
  metricsMonthOverviewTrack: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 3,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: '#F0E4E9',
  },
  metricsMonthOverviewFill: {
    width: '72%',
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
  },
  metricsCalendarCompare: {
    minHeight: 136,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
    paddingVertical: spacing.md,
  },
  metricsCalendarCompareMonth: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  metricsCalendarCompareDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface.divider,
  },
  metricsCalendarCompareValue: {
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -0.8,
  },
  metricsCalendarCompareScore: {
    width: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radii.pill,
    backgroundColor: '#FFF0F6',
  },
  metricsClinicalTable: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
    backgroundColor: colors.surface.raised,
    paddingHorizontal: spacing.md,
  },
  metricsClinicalRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metricsClinicalRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
  },
  metricsFocusRail: {
    minHeight: 142,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    ...shadows.card,
  },
  metricsFocusRailScore: {
    width: 108,
    justifyContent: 'center',
    backgroundColor: '#FFF0F6',
    paddingHorizontal: spacing.md,
  },
  metricsFocusRailValue: {
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: -1.4,
  },
  metricsFocusRailPlan: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  metricsFocusRailLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metricsFocusRailPoint: {
    width: 56,
    gap: 2,
  },
  metricsFocusRailConnector: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    marginTop: 5,
    backgroundColor: '#D8D3D5',
  },
  metricsFocusRailDotCurrent: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand.burgundy,
  },
  metricsFocusRailDotNext: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand.success,
  },
  metricsTwoMonthPlan: {
    minHeight: 152,
    gap: spacing.sm,
  },
  metricsTwoMonthHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  metricsTwoMonthGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metricsTwoMonthCell: {
    flex: 1,
    justifyContent: 'space-between',
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
    padding: spacing.sm,
  },
  metricsTwoMonthValue: {
    fontSize: 34,
    lineHeight: 36,
  },
  metricsTwoMonthAttention: {
    flex: 1.25,
    justifyContent: 'space-between',
    borderRadius: radii.md,
    backgroundColor: '#FFF0F6',
    padding: spacing.sm,
  },
  metricsEditorialSummary: {
    minHeight: 150,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  metricsEditorialHero: {
    flex: 1.2,
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: colors.brand.primary,
    paddingBottom: spacing.sm,
  },
  metricsEditorialValue: {
    fontSize: 54,
    lineHeight: 56,
    letterSpacing: -1.8,
  },
  metricsEditorialCounts: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricsEditorialCount: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.divider,
    paddingTop: spacing.sm,
  },
  metricsEditorialCountValue: {
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -0.7,
  },
  metricsPlanTimeline: {
    minHeight: 140,
    gap: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.raised,
    padding: spacing.md,
  },
  metricsPlanTimelineHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  metricsPlanTimelineRail: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricsPlanTimelineConnector: {
    position: 'absolute',
    top: 5,
    right: 34,
    left: 5,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D6D1D3',
  },
  metricsPlanTimelineStep: {
    zIndex: 1,
    width: 72,
    gap: 2,
  },
  metricsPlanTimelineDotCurrent: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.brand.burgundy,
  },
  metricsPlanTimelineDotNext: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.brand.success,
  },
  metricsPlanTimelineDotEmpty: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BEB8BA',
    backgroundColor: colors.surface.raised,
  },
  metricsGlassPanel: {
    minHeight: 142,
    flexDirection: 'row',
    gap: spacing.xs,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.94)',
    padding: spacing.sm,
    ...shadows.card,
  },
  metricsGlassCellHero: {
    flex: 1.25,
    justifyContent: 'flex-end',
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.58)',
    padding: spacing.sm,
  },
  metricsGlassValue: {
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1,
  },
  metricsGlassCell: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 3,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.58)',
    padding: spacing.sm,
  },
  metricsReportTicket: {
    minHeight: 144,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#DCD7D9',
    backgroundColor: '#FFFFFF',
    padding: spacing.md,
  },
  metricsReportTicketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  metricsReportTicketScore: {
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1,
  },
  metricsReportTicketRule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
    backgroundColor: '#CFC9CB',
  },
  metricsReportTicketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metricsReportTicketDivider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    marginHorizontal: spacing.xs,
    backgroundColor: colors.surface.divider,
  },
  metricsProgressLadder: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  metricsProgressLadderRow: {
    gap: 6,
  },
  metricsProgressLadderHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  metricsProgressLadderTrack: {
    height: 7,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: '#EEE8EA',
  },
  metricsProgressLadderFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(115,110,108,0.12)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    padding: 4,
  },
  tab: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: 6,
  },
  tabPressable: {
    flex: 1,
  },
  tabActive: {
    backgroundColor: colors.brand.primary,
    ...shadows.card,
  },
  tabLabel: {
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: -0.16,
    textAlign: 'center',
  },
  tabsRegistration: {
    height: 46,
    borderWidth: 0,
    borderRadius: 14,
    backgroundColor: '#F0EEF0',
    padding: 4,
  },
  tabRegistration: {
    minHeight: 38,
    borderRadius: 11,
  },
  tabRegistrationActive: {
    backgroundColor: colors.surface.raised,
    shadowColor: '#251119',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabsUnderline: {
    gap: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    borderBottomColor: '#D8D3D4',
    backgroundColor: 'transparent',
    padding: 0,
  },
  tabUnderline: {
    minHeight: 46,
    borderRadius: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabUnderlineActive: {
    backgroundColor: 'transparent',
    borderBottomColor: colors.brand.primary,
    shadowOpacity: 0,
    elevation: 0,
  },
  tabsOutlined: {
    gap: spacing.xs,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  tabOutlined: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#D8D0D2',
    backgroundColor: 'transparent',
  },
  tabOutlinedActive: {
    borderColor: colors.brand.primary,
    backgroundColor: '#FFF3F8',
    shadowOpacity: 0,
    elevation: 0,
  },
  tabsFloating: {
    gap: spacing.xs,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 0,
  },
  tabFloating: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: 'rgba(255,255,255,0.64)',
    ...shadows.card,
  },
  tabFloatingActive: {
    backgroundColor: '#FFF0F6',
    borderColor: 'rgba(211,20,113,0.26)',
  },
  tabsInverse: {
    borderWidth: 0,
    backgroundColor: colors.brand.burgundy,
  },
  tabInverse: {
    backgroundColor: 'transparent',
  },
  tabInverseActive: {
    backgroundColor: colors.brand.primary,
  },
  tabsSoft: {
    borderWidth: 0,
    backgroundColor: '#FDE9F1',
  },
  tabSoft: {
    backgroundColor: 'transparent',
  },
  tabSoftActive: {
    backgroundColor: colors.surface.raised,
  },
  tabsBadged: {
    minHeight: 52,
    gap: spacing.xxs,
    borderWidth: 0,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    padding: 5,
    ...shadows.card,
  },
  tabBadged: {
    minHeight: 42,
    flexDirection: 'row',
    gap: 5,
  },
  tabBadgedActive: {
    backgroundColor: '#FFF0F6',
    shadowOpacity: 0,
    elevation: 0,
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#EEE9EB',
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: colors.brand.primary,
  },
  tabBadgeText: {
    fontSize: 9.5,
    lineHeight: 11,
  },
  tabsTopAccent: {
    minHeight: 50,
    borderWidth: 0,
    borderRadius: radii.md,
    backgroundColor: '#EEE9EB',
    padding: 4,
  },
  tabTopAccent: {
    minHeight: 42,
    overflow: 'hidden',
    borderRadius: radii.sm,
  },
  tabTopAccentActive: {
    borderTopWidth: 3,
    borderTopColor: colors.brand.primary,
    backgroundColor: colors.surface.raised,
  },
  tabsCompact: {
    alignSelf: 'flex-start',
    gap: 2,
    borderWidth: 0,
    backgroundColor: '#F1ECEE',
    padding: 3,
  },
  tabCompact: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  tabCompactActive: {
    backgroundColor: colors.brand.primary,
  },
  tabLabelCompact: {
    fontSize: 10.5,
    lineHeight: 12,
  },
  exactCard: {
    position: 'relative',
    width: '100%',
    height: 210,
    overflow: 'hidden',
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
  },
  exactCard02: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.12)',
  },
  exactCard03: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 48,
    borderBottomRightRadius: 48,
    borderBottomLeftRadius: 22,
    backgroundColor: '#FFFDFE',
  },
  exactCard04: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,31,32,0.10)',
  },
  exactCard05: {
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,13,114,0.14)',
  },
  exactCard06: {
    borderTopLeftRadius: 42,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 42,
    borderBottomLeftRadius: 18,
  },
  exactCard07: {
    borderRadius: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.08)',
  },
  exactCard08: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 52,
    borderBottomLeftRadius: 26,
    backgroundColor: '#FFFDFE',
  },
  exactCard09: {
    borderRadius: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(33,31,32,0.14)',
  },
  exactCard10: {
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadows.card,
  },
  exactCard11: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
  },
  exactCard12: {
    borderTopLeftRadius: 46,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 46,
    backgroundColor: '#FFFDFE',
  },
  exactCard13: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 46,
    borderBottomRightRadius: 26,
    borderBottomLeftRadius: 46,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.10)',
  },
  exactCard14: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.12)',
    backgroundColor: '#FFFCFD',
  },
  exactCard15: {
    borderRadius: 26,
    backgroundColor: '#FFFDFD',
    ...shadows.card,
  },
  exactCard16: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,13,114,0.12)',
  },
  exactCard17: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(130,53,55,0.10)',
    backgroundColor: '#FFFCFD',
  },
  exactCard18: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 42,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.12)',
  },
  exactCard19: {
    borderRadius: 34,
    backgroundColor: '#FBF8F9',
    ...shadows.card,
  },
  exactCard20: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.16)',
  },
  exactCard21: {
    borderTopLeftRadius: 48,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 48,
    borderBottomLeftRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.12)',
  },
  exactCard22: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.14)',
    backgroundColor: '#FFF9FB',
  },
  exactCard23: {
    borderRadius: 0,
    borderLeftWidth: 4,
    borderLeftColor: colors.brand.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.12)',
  },
  exactCard24: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 52,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 52,
    backgroundColor: '#FFFCFD',
  },
  exactCard25: {
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.10)',
    backgroundColor: '#FFFDFE',
    ...shadows.card,
  },
  exactCard26: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAE8E9',
    backgroundColor: '#FFFFFF',
  },
  exactCard27: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAE8E9',
    backgroundColor: '#FFFFFF',
  },
  exactCard28: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAE8E9',
    backgroundColor: '#FFFFFF',
  },
  exactCard29: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EAE8E9',
    backgroundColor: '#FFFFFF',
  },
  exactCard30: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#EAE8E9',
    backgroundColor: '#FFFFFF',
  },
  exactCard31: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.11)',
    backgroundColor: '#FFFCFD',
  },
  exactCard32: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 44,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,13,114,0.12)',
    backgroundColor: '#FFFFFF',
  },
  exactCard33: {
    borderRadius: 22,
    backgroundColor: '#FFFDFD',
    ...shadows.card,
  },
  exactCard34: {
    borderRadius: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(33,31,32,0.13)',
    backgroundColor: '#FFFFFF',
  },
  exactCard35: {
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.10)',
    backgroundColor: '#FFFDFE',
    ...shadows.card,
  },
  exactCardMedia: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 102,
    height: 126,
    overflow: 'hidden',
  },
  exactCardImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.24 }],
  },
  exactCardImageFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 44,
  },
  exactCardImageBlur: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 44,
    overflow: 'hidden',
  },
  exactCardImageBlurBand: {
    position: 'absolute',
    right: 0,
    left: 0,
  },
  exactCardCopy: {
    position: 'absolute',
    top: 53,
    right: 46,
    left: 112,
  },
  exactCardCopyAlternative: {
    top: 45,
    right: 16,
  },
  exactCardCopyWithLabelAction: {
    top: 50,
  },
  exactCardHeaderAlternative: {
    position: 'absolute',
    top: 16,
    right: 16,
    left: 112,
  },
  exactCardHeaderProminent: {
    top: 20,
  },
  minimalCardHeaderCentered: {
    top: 46,
  },
  calendarCardHeaderNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  calendarCardHeaderNoteDot: {
    width: 5,
    height: 5,
    flexShrink: 0,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  calendarCardHeaderNoteText: {
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 12,
  },
  exactCardHeaderActionRow: {
    height: 29,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  exactCardTitle: {
    fontSize: 18,
    lineHeight: 21,
    letterSpacing: -0.32,
  },
  exactCardDescription: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 14,
    letterSpacing: -0.08,
  },
  exactCardButton: {
    position: 'absolute',
    top: 16,
    left: 299,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFF1F7',
  },
  exactCardButtonReference: {
    top: 68,
    left: 302,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.brand.primary,
  },
  exactCardButtonOutline: {
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.34)',
    backgroundColor: '#FFFFFF',
  },
  exactCardButtonSoft: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF0F7',
  },
  exactCardButtonSquare: {
    borderRadius: 9,
    backgroundColor: '#FFF0F7',
  },
  exactCardButtonLabel: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,13,114,0.24)',
    backgroundColor: '#FFFFFF',
  },
  exactCardButtonDark: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.brand.burgundy,
  },
  exactCardButtonLabelFilled: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFE6F1',
  },
  exactCardButtonRing: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#F8D8E7',
    backgroundColor: '#FFFFFF',
  },
  exactCardButtonMinimal: {
    left: 303,
    backgroundColor: 'transparent',
  },
  exactCardButtonCalendar: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,13,114,0.28)',
    backgroundColor: '#FFFFFF',
  },
  exactCardButtonValidity: {
    width: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#FBE7F0',
  },
  exactCardButtonSummary: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.brand.burgundy,
  },
  exactCardButtonRoute: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#F5D4E3',
    backgroundColor: '#FFFFFF',
  },
  exactCardButtonPriority: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brand.primary,
  },
  exactCardButtonInline: {
    position: 'relative',
    top: 0,
    left: 0,
  },
  exactCardButtonText: {
    fontSize: 10.5,
    lineHeight: 13,
  },
  exactCardArrow: {
    fontSize: 11,
    lineHeight: 13,
  },
  exactMetaChips: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    left: 14,
    height: 52,
    flexDirection: 'row',
    gap: 8,
  },
  exactMetaChip: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
    borderRadius: 16,
    backgroundColor: '#F8F5F6',
    paddingHorizontal: 12,
  },
  exactDeadlineRow: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    left: 16,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,32,0.12)',
    paddingTop: 10,
  },
  exactDeadlineDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exactDeadlineNumber: {
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1,
  },
  exactDeadlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 15,
    backgroundColor: '#FFF0F6',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  exactStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  exactMetaGrid: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    left: 14,
    height: 56,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.12)',
    borderRadius: 12,
  },
  exactMetaGridCell: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
  },
  exactMetaGridDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(33,31,32,0.12)',
  },
  exactDotTimeline: {
    position: 'absolute',
    right: 16,
    bottom: 15,
    left: 16,
    height: 52,
    justifyContent: 'flex-end',
  },
  exactDotTimelineTrack: {
    position: 'relative',
    height: 14,
    justifyContent: 'center',
  },
  exactDotTimelineFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: '#DED9DB',
  },
  exactDotTimelineDot: {
    position: 'absolute',
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#BDB7B9',
  },
  exactDotTimelineDotStart: {
    left: 0,
  },
  exactDotTimelineDotCurrent: {
    left: '68%',
    width: 10,
    height: 10,
    top: 2,
    borderWidth: 2,
    borderColor: '#F9D4E5',
    backgroundColor: colors.brand.primary,
  },
  exactDotTimelineDotEnd: {
    right: 0,
  },
  exactDotTimelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  exactChecklist: {
    position: 'absolute',
    right: 15,
    bottom: 13,
    left: 15,
    gap: 5,
  },
  exactChecklistRow: {
    height: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exactChecklistIndex: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: '#FFF0F7',
  },
  exactChecklistLabel: {
    flex: 1,
  },
  exactStatusBand: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF3F8',
    paddingHorizontal: 18,
  },
  exactStatusBandValue: {
    alignItems: 'flex-end',
  },
  exactProgressMeta: {
    position: 'absolute',
    right: 16,
    bottom: 15,
    left: 16,
  },
  exactProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exactProgressTrack: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: '#EEE9EB',
  },
  exactProgressFill: {
    width: '72%',
    height: '100%',
    borderRadius: 4,
  },
  exactProgressTicks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingHorizontal: 2,
  },
  exactProgressTick: {
    width: 1,
    height: 4,
    backgroundColor: '#C9C3C5',
  },
  exactEditorialMeta: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    left: 16,
    height: 62,
  },
  exactEditorialRule: {
    height: 1,
    backgroundColor: 'rgba(33,31,32,0.18)',
  },
  exactEditorialRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 7,
  },
  exactEditorialDate: {
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.35,
  },
  exactEditorialStatus: {
    alignItems: 'flex-end',
  },
  exactGlassMeta: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    left: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.10)',
    backgroundColor: '#F8F5F6',
    padding: 5,
  },
  exactGlassMetaItem: {
    flex: 1,
    paddingLeft: 8,
  },
  exactGlassAction: {
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    ...shadows.card,
  },
  exactCalendarWeek: {
    position: 'absolute',
    right: 13,
    bottom: 12,
    left: 13,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,32,0.10)',
    paddingTop: 7,
  },
  exactCalendarDay: {
    width: 39,
    alignItems: 'center',
    gap: 3,
  },
  exactCalendarDate: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  exactCalendarDateActive: {
    backgroundColor: colors.brand.primary,
  },
  exactValidityWindow: {
    position: 'absolute',
    right: 16,
    bottom: 13,
    left: 16,
    height: 58,
  },
  exactValidityHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exactValidityTrack: {
    position: 'relative',
    height: 8,
    justifyContent: 'center',
  },
  exactValidityFill: {
    height: 4,
    borderRadius: 2,
  },
  exactValidityHandle: {
    position: 'absolute',
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: colors.brand.primary,
  },
  exactValidityHandleStart: {
    left: 0,
  },
  exactValidityHandleEnd: {
    right: 0,
  },
  exactValidityLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  exactDeadlineSummary: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    left: 14,
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#F8F5F6',
    paddingHorizontal: 14,
  },
  exactDeadlineSummaryHero: {
    width: 116,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  exactDeadlineSummaryNumber: {
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: -1,
    color: colors.brand.burgundy,
  },
  exactDeadlineSummaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
    backgroundColor: 'rgba(33,31,32,0.12)',
  },
  exactDeadlineSummaryDate: {
    flex: 1,
    gap: 2,
    paddingLeft: 14,
  },
  exactDeadlineSummaryPulse: {
    position: 'absolute',
    right: 0,
    top: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  exactRouteMeta: {
    position: 'absolute',
    right: 16,
    bottom: 12,
    left: 16,
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exactRouteTrack: {
    position: 'absolute',
    top: 13,
    right: 42,
    left: 42,
    height: 2,
    backgroundColor: '#E3DDE0',
  },
  exactRouteStep: {
    width: 78,
    alignItems: 'center',
    gap: 4,
  },
  exactRouteNode: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8D1D4',
    backgroundColor: '#FFFFFF',
  },
  exactRouteNodeComplete: {
    borderColor: colors.brand.burgundy,
    backgroundColor: colors.brand.burgundy,
  },
  exactRouteNodeActive: {
    borderWidth: 3,
    borderColor: '#F6D5E4',
    backgroundColor: colors.brand.primary,
  },
  exactRouteDate: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  exactPriorityMeta: {
    position: 'absolute',
    right: 14,
    bottom: 13,
    left: 14,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FFF1F7',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  exactPriorityHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exactPriorityBadge: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  exactPrioritySegments: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 7,
  },
  exactPrioritySegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E5DDE0',
  },
  exactPrioritySegmentActive: {
    backgroundColor: colors.brand.primary,
  },
  exactProminentAction: {
    zIndex: 4,
    width: 108,
    height: 38,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  exactProminentActionPressable: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  exactProminentActionBurgundy: {
    borderRadius: 19,
    backgroundColor: colors.brand.burgundy,
  },
  exactProminentActionPill: {
    width: 104,
    borderRadius: 19,
  },
  exactProminentActionDark: {
    width: 104,
    borderRadius: 12,
    backgroundColor: '#282426',
    shadowColor: '#282426',
  },
  exactProminentActionWide: {
    position: 'absolute',
    right: 0,
    bottom: 1,
    width: 112,
    borderRadius: 10,
  },
  exactProminentActionSoft: {
    width: 106,
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.20)',
    borderRadius: 16,
    backgroundColor: '#FFF0F7',
    shadowOpacity: 0,
    elevation: 0,
  },
  exactProminentActionTicket: {
    width: 104,
    borderRadius: 9,
    backgroundColor: colors.brand.burgundy,
  },
  exactProminentActionOutline: {
    width: 104,
    borderWidth: 2,
    borderColor: colors.brand.primary,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0,
    elevation: 0,
  },
  exactProminentActionSquare: {
    width: 104,
    borderRadius: 8,
  },
  exactProminentActionAgenda: {
    width: 108,
    borderRadius: 19,
    backgroundColor: colors.brand.burgundy,
  },
  exactCountdownMeta: {
    position: 'absolute',
    right: 14,
    bottom: 13,
    left: 14,
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,32,0.10)',
    paddingTop: 9,
  },
  exactCountdownCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  exactCountdownNumber: {
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -1.4,
    color: colors.brand.burgundy,
  },
  exactCalendarRibbonMeta: {
    position: 'absolute',
    right: 13,
    bottom: 13,
    left: 13,
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  exactCalendarRibbonContent: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  exactCalendarRibbonHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exactCalendarRibbon: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 15,
    backgroundColor: '#F7F2F4',
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  exactCalendarRibbonDay: {
    width: 22,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  exactCalendarRibbonToday: {
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.28)',
    backgroundColor: '#FFFFFF',
  },
  exactCalendarRibbonDeadline: {
    backgroundColor: colors.brand.primary,
  },
  exactRangeMeta: {
    position: 'absolute',
    right: 13,
    bottom: 13,
    left: 13,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exactRangeDates: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  exactRangeDateBlock: {
    gap: 2,
  },
  exactRangeDateEnd: {
    alignItems: 'flex-end',
  },
  exactRangeLine: {
    flex: 1,
    height: 8,
    justifyContent: 'center',
    marginHorizontal: 7,
  },
  exactRangeLineFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: '#E4B8CC',
  },
  exactBigDateMeta: {
    position: 'absolute',
    right: 12,
    bottom: 11,
    left: 12,
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exactBigDateBadge: {
    width: 58,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.brand.burgundy,
  },
  exactBigDateNumber: {
    fontSize: 31,
    lineHeight: 32,
    letterSpacing: -0.9,
  },
  exactBigDateCopy: {
    flex: 1,
    gap: 3,
  },
  exactWeekCountdownMeta: {
    position: 'absolute',
    right: 12,
    bottom: 11,
    left: 12,
    height: 70,
    paddingRight: 122,
  },
  exactWeekCountdownHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exactWeekCountdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exactWeekCountdownDay: {
    width: 24,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F0F2',
  },
  exactWeekCountdownToday: {
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.30)',
    backgroundColor: '#FFFFFF',
  },
  exactWeekCountdownEnd: {
    backgroundColor: colors.brand.primary,
  },
  exactMilestonesMeta: {
    position: 'absolute',
    right: 13,
    bottom: 12,
    left: 15,
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exactMilestonesList: {
    flex: 1,
    gap: 3,
  },
  exactMilestoneItem: {
    position: 'relative',
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
  },
  exactMilestoneDot: {
    position: 'absolute',
    left: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#CFC7CA',
  },
  exactMilestoneDotActive: {
    backgroundColor: colors.brand.primary,
  },
  exactMilestoneConnector: {
    position: 'absolute',
    top: 12,
    bottom: -9,
    left: 2.5,
    width: 1,
    backgroundColor: '#DED7DA',
  },
  exactTicketMeta: {
    position: 'absolute',
    right: 11,
    bottom: 11,
    left: 11,
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.14)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  exactTicketDate: {
    gap: 1,
  },
  exactTicketDateRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  exactTicketNumber: {
    fontSize: 28,
    lineHeight: 29,
    letterSpacing: -0.8,
  },
  exactTicketDivider: {
    height: 42,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D7CDD1',
  },
  exactTicketStatus: {
    flex: 1,
    gap: 2,
  },
  exactGaugeMeta: {
    position: 'absolute',
    right: 13,
    bottom: 12,
    left: 13,
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exactGaugeRing: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    borderWidth: 6,
    borderColor: '#F1C5D9',
    borderTopColor: colors.brand.primary,
    borderRightColor: colors.brand.primary,
  },
  exactGaugeRingInner: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
  },
  exactGaugeCopy: {
    flex: 1,
    gap: 2,
  },
  exactGaugeTrack: {
    height: 3,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: '#E8E0E3',
    marginTop: 4,
  },
  exactGaugeFill: {
    width: '68%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.brand.primary,
  },
  exactCompareMeta: {
    position: 'absolute',
    right: 12,
    bottom: 11,
    left: 12,
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exactCompareDate: {
    alignItems: 'center',
  },
  exactCompareNumber: {
    fontSize: 27,
    lineHeight: 29,
    letterSpacing: -0.8,
  },
  exactCompareArrow: {
    flex: 1,
    alignItems: 'center',
  },
  exactAgendaMeta: {
    position: 'absolute',
    right: 12,
    bottom: 11,
    left: 12,
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,32,0.10)',
    paddingTop: 7,
  },
  exactAgendaDateBadge: {
    width: 50,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FFF0F7',
  },
  exactAgendaNumber: {
    fontSize: 25,
    lineHeight: 26,
    letterSpacing: -0.7,
  },
  exactAgendaCopy: {
    flex: 1,
    gap: 4,
  },
  exactAgendaStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  exactAgendaStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  minimalCalendarMeta: {
    position: 'absolute',
    right: 14,
    bottom: 13,
    left: 14,
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EAE8E9',
    paddingTop: 10,
  },
  minimalCalendarAction: {
    minWidth: 88,
    height: 34,
    flexShrink: 0,
  },
  minimalCalendarActionDark: {
    minWidth: 102,
    borderRadius: 6,
    backgroundColor: '#2F2C2D',
  },
  minimalCalendarActionOutline: {
    minWidth: 104,
    borderWidth: 1,
    borderColor: '#D7D3D5',
    borderRadius: 6,
  },
  minimalCalendarActionUnderline: {
    minWidth: 96,
    borderBottomWidth: 1,
    borderBottomColor: '#A39EA0',
  },
  minimalCalendarActionIcon: {
    minWidth: 34,
    width: 34,
    borderWidth: 1,
    borderColor: '#D7D3D5',
    borderRadius: 6,
  },
  minimalCalendarActionPressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimalCalendarRange: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  minimalCalendarRangeLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#CAC6C8',
    marginHorizontal: 9,
  },
  minimalCalendarRangeEnd: {
    alignItems: 'flex-end',
  },
  minimalCalendarWeek: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  minimalCalendarWeekHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  minimalCalendarWeekDays: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  minimalCalendarWeekDeadline: {
    borderBottomWidth: 1,
    borderBottomColor: colors.text.primary,
  },
  minimalCalendarDeadline: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  minimalCalendarDeadlineNumber: {
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -1.2,
  },
  minimalCalendarJourney: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  minimalCalendarJourneyLine: {
    position: 'absolute',
    top: 5,
    right: 27,
    left: 4,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D8D4D6',
  },
  minimalCalendarJourneyItem: {
    zIndex: 1,
    gap: 1,
  },
  minimalCalendarJourneyDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#BDB8BA',
    backgroundColor: '#FFFFFF',
    marginBottom: 2,
  },
  minimalCalendarJourneyDotActive: {
    borderColor: colors.text.primary,
    backgroundColor: colors.text.primary,
  },
  minimalCalendarSummary: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  minimalCalendarSummaryDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: '#D8D4D6',
  },
  calendarVariantMeta: {
    position: 'absolute',
    right: 12,
    bottom: 11,
    left: 12,
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calendarVariantContent: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  calendarActionSlot: {
    zIndex: 4,
    width: 120,
    flexShrink: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  calendarVariantHeading: {
    minHeight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarDateRibbon: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 13,
    backgroundColor: '#F6F1F3',
    paddingHorizontal: 5,
  },
  calendarDateCell: {
    width: 23,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calendarDateToday: {
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.30)',
    backgroundColor: '#FFFFFF',
  },
  calendarDateDeadline: {
    backgroundColor: colors.brand.primary,
  },
  calendarDaysBadge: {
    borderRadius: 9,
    backgroundColor: '#FFF0F7',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  calendarWeekRibbon: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,32,0.10)',
    paddingTop: 5,
  },
  calendarWeekCell: {
    width: 23,
    alignItems: 'center',
    gap: 1,
  },
  calendarRangeContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarRangePoint: {
    gap: 2,
  },
  calendarRangePointEnd: {
    alignItems: 'flex-end',
  },
  calendarRangeBridge: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
  },
  calendarRangeBridgeLine: {
    position: 'absolute',
    right: 0,
    left: 0,
    height: 1,
    backgroundColor: '#E2C5D2',
  },
  calendarCheckpointTrack: {
    position: 'relative',
    height: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  calendarCheckpointLine: {
    position: 'absolute',
    top: 6,
    right: 5,
    left: 5,
    height: 2,
    backgroundColor: '#E6DCE0',
  },
  calendarCheckpointItem: {
    width: 30,
    alignItems: 'center',
    gap: 4,
  },
  calendarCheckpointDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: '#F6D7E5',
    backgroundColor: colors.brand.primary,
  },
  calendarCheckpointDotEnd: {
    borderColor: '#E7BACF',
    backgroundColor: colors.brand.burgundy,
  },
  calendarCountdownHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarCountdownDeadline: {
    fontSize: 30,
    lineHeight: 31,
    letterSpacing: -0.8,
    color: colors.brand.primary,
  },
  calendarSegmentTrack: {
    flexDirection: 'row',
    gap: 3,
  },
  calendarSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#EED9E3',
  },
  calendarSegmentDeadline: {
    backgroundColor: colors.brand.primary,
  },
  calendarValidityContent: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  calendarValidityStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  calendarValidityDot: {
    zIndex: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#D9C9D0',
    backgroundColor: '#FFFFFF',
  },
  calendarValidityDotActive: {
    zIndex: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#F4CDDF',
    backgroundColor: colors.brand.primary,
  },
  calendarValidityConnector: {
    position: 'absolute',
    top: 18,
    bottom: 18,
    left: 4,
    width: 1,
    backgroundColor: '#DED3D8',
  },
  calendarMiniMonth: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  calendarMiniMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarMiniMonthDates: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarMiniMonthDate: {
    width: 24,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F5F1F3',
  },
  calendarMiniMonthDateActive: {
    backgroundColor: colors.brand.primary,
  },
  calendarAvailabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarAvailabilityDay: {
    width: 24,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#F6F1F3',
  },
  calendarAvailabilityDayDisabled: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DDD5D8',
    backgroundColor: '#FFFFFF',
  },
  calendarAvailabilityDayDeadline: {
    backgroundColor: colors.brand.burgundy,
  },
  calendarResultJourney: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  calendarResultStage: {
    width: 58,
    gap: 2,
  },
  calendarResultStageTop: {
    position: 'relative',
    height: 13,
    justifyContent: 'center',
  },
  calendarResultDot: {
    zIndex: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#D9CCD2',
    backgroundColor: '#FFFFFF',
  },
  calendarResultDotActive: {
    borderColor: '#F3C7DB',
    backgroundColor: colors.brand.primary,
  },
  calendarResultLine: {
    position: 'absolute',
    top: 6,
    right: -12,
    left: 7,
    height: 1,
    backgroundColor: '#DED4D8',
  },
  calendarWindowSummary: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  calendarWindowMonth: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#FFF0F7',
  },
  calendarWindowDate: {
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.5,
  },
  calendarWindowSummaryCopy: {
    flex: 1,
    gap: 5,
  },
  calendarValidityBadge: {
    alignSelf: 'flex-start',
    borderRadius: 9,
    backgroundColor: '#F7EEF2',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  exactTimeline: {
    position: 'absolute',
    top: 140,
    right: 16,
    left: 16,
    height: 31,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  exactTimelineTick: {
    width: 2,
    borderRadius: 1,
    backgroundColor: '#AAA7A6',
  },
  exactTimelineTickActive: {
    backgroundColor: '#969291',
  },
  exactDatesRow: {
    position: 'absolute',
    top: 177,
    right: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exactDateText: {
    fontSize: 11.5,
    lineHeight: 14,
    letterSpacing: -0.08,
  },
  referenceCard: {
    position: 'relative',
    minHeight: 240,
    overflow: 'hidden',
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.08)',
    ...shadows.card,
  },
  referenceCard01: {
    minHeight: 236,
    borderTopLeftRadius: 52,
    borderTopRightRadius: 34,
    borderBottomRightRadius: 52,
    borderBottomLeftRadius: 34,
    backgroundColor: '#FFF3F3',
  },
  referenceCard02: {
    minHeight: 292,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 76,
    borderBottomRightRadius: 28,
    borderBottomLeftRadius: 52,
    borderColor: 'rgba(109,75,136,0.12)',
    backgroundColor: '#F3F0FA',
  },
  referenceCard03: {
    minHeight: 318,
    borderRadius: 64,
    borderColor: 'rgba(44,105,76,0.12)',
    backgroundColor: '#EEF6F2',
  },
  referenceCard04: {
    minHeight: 220,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 42,
    borderBottomRightRadius: 42,
    borderBottomLeftRadius: 18,
    borderColor: 'rgba(93,70,57,0.14)',
    backgroundColor: '#F7F1ED',
  },
  referenceCard05: {
    minHeight: 278,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(33,33,35,0.12)',
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0,
    elevation: 0,
  },
  referenceCard06: {
    minHeight: 270,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 48,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(98,69,111,0.18)',
    backgroundColor: '#F4F1F6',
    shadowOpacity: 0,
    elevation: 0,
  },
  referenceCard07: {
    minHeight: 356,
    borderRadius: 72,
    backgroundColor: '#FFF0E9',
  },
  referenceCard08: {
    minHeight: 246,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 54,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 54,
    borderColor: 'rgba(55,86,94,0.12)',
    backgroundColor: '#F1F4F5',
  },
  referenceCard09: {
    minHeight: 286,
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(130,53,55,0.16)',
    backgroundColor: '#F5F3F3',
    shadowOpacity: 0,
    elevation: 0,
  },
  referenceCard10: {
    minHeight: 350,
    borderTopLeftRadius: 58,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 58,
    borderBottomLeftRadius: 26,
    borderColor: 'rgba(255,255,255,0.76)',
    backgroundColor: '#F7F1F4',
  },
  referenceMedia: {
    position: 'absolute',
    zIndex: 0,
    overflow: 'hidden',
  },
  referenceMedia01: {
    bottom: -18,
    left: -14,
    width: 166,
    height: 228,
  },
  referenceMedia02: {
    top: -22,
    right: 18,
    width: 174,
    height: 232,
  },
  referenceMedia03: {
    top: -24,
    left: 8,
    width: 188,
    height: 250,
  },
  referenceMedia04: {
    top: 0,
    bottom: 0,
    left: 8,
    width: 112,
    height: undefined,
  },
  referenceMedia05: {
    bottom: -18,
    left: 102,
    width: 170,
    height: 240,
  },
  referenceMedia06: {
    top: -24,
    right: -6,
    width: 164,
    height: 226,
  },
  referenceMedia07: {
    top: -30,
    left: 72,
    width: 226,
    height: 276,
  },
  referenceMedia08: {
    bottom: -22,
    left: -4,
    width: 154,
    height: 226,
  },
  referenceMedia09: {
    right: -10,
    bottom: -20,
    width: 156,
    height: 248,
  },
  referenceMedia10: {
    top: -34,
    right: 18,
    width: 214,
    height: 270,
  },
  referenceAura: {
    position: 'absolute',
    right: 18,
    bottom: 34,
    left: 18,
    height: 56,
    borderRadius: 28,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 4,
  },
  referenceImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  referenceImageSmallTop: {
    top: 8,
    right: 8,
    bottom: undefined,
    left: 8,
    width: 96,
    height: 118,
  },
  referenceBottomFade: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: 76,
  },
  referenceBottomFadeLong: {
    top: 72,
    height: undefined,
  },
  referenceCardBody: {
    zIndex: 1,
    minHeight: 240,
    padding: spacing.md,
  },
  referenceBody01: {
    minHeight: 236,
    marginLeft: 126,
    paddingLeft: spacing.sm,
  },
  referenceBody02: {
    minHeight: 292,
    paddingRight: 142,
    paddingBottom: spacing.lg,
  },
  referenceBody03: {
    minHeight: 318,
    marginLeft: 154,
    paddingTop: spacing.lg,
    paddingLeft: spacing.sm,
  },
  referenceBody04: {
    minHeight: 220,
    marginLeft: 104,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    paddingLeft: spacing.sm,
  },
  referenceBody05: {
    minHeight: 278,
    paddingBottom: 128,
    paddingHorizontal: spacing.lg,
  },
  referenceBody06: {
    minHeight: 270,
    paddingRight: 126,
    paddingLeft: spacing.md,
  },
  referenceBody07: {
    minHeight: 356,
    paddingTop: 196,
    paddingHorizontal: spacing.lg,
  },
  referenceBody08: {
    minHeight: 246,
    marginLeft: 122,
    paddingLeft: spacing.sm,
  },
  referenceBody09: {
    minHeight: 286,
    marginRight: 118,
    paddingLeft: 0,
    paddingRight: spacing.sm,
  },
  referenceBody10: {
    minHeight: 204,
    margin: spacing.sm,
    marginTop: 136,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.84)',
    ...shadows.card,
  },
  referenceCardTitle: {
    marginTop: 10,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.45,
  },
  referenceMeta: {
    marginTop: 12,
    gap: 7,
  },
  metaChips: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  metaChip: {
    minWidth: 98,
    gap: 2,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.68)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metaCalendar: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  metaDay: {
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: -1.2,
  },
  metaCalendarCopy: {
    flex: 1,
    gap: 1,
  },
  metaValidityBadge: {
    borderRadius: radii.pill,
    backgroundColor: '#FADFE8',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaTimeline: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand.primary,
  },
  metaTimelineLine: {
    width: 28,
    height: 1,
    backgroundColor: 'rgba(211,20,113,0.28)',
  },
  metaTimelineCopy: {
    flex: 1,
    gap: 1,
  },
  metaSplitCells: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metaSplitCell: {
    flex: 1,
    gap: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(130,53,55,0.18)',
    paddingTop: spacing.xs,
  },
  metaChecklist: {
    marginTop: spacing.md,
    gap: 6,
  },
  metaChecklistRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.64)',
    paddingHorizontal: spacing.xs,
  },
  metaCheck: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#FADFE8',
  },
  metaPush: {
    marginLeft: 'auto',
  },
  metaBand: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.72)',
    padding: spacing.sm,
  },
  metaBandDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.surface.divider,
  },
  metaProgress: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  metaProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaProgressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: radii.pill,
    backgroundColor: '#EEDFE5',
  },
  metaProgressFill: {
    width: '68%',
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
  },
  metaEditorial: {
    marginTop: spacing.lg,
    gap: spacing.lg,
  },
  metaGlassRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  metaGlassItem: {
    flex: 1,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.52)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  referenceCardFooter: {
    minHeight: 38,
    marginTop: 'auto',
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  cardAction: {
    minHeight: 36,
    minWidth: 118,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: 13,
  },
  cardActionPressable: {
    width: '100%',
    height: '100%',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  cardActionPressableSplit: {
    justifyContent: 'flex-start',
    paddingLeft: 10,
    paddingRight: 36,
  },
  cardActionArrow: {
    height: 38,
    backgroundColor: colors.brand.primary,
    shadowColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 2,
  },
  cardActionLink: {
    minHeight: 38,
    backgroundColor: colors.brand.burgundy,
  },
  cardActionSolid: {
    minHeight: 38,
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    backgroundColor: '#FFFFFF',
  },
  cardActionSoft: {
    minHeight: 38,
    backgroundColor: '#FFF0F7',
  },
  cardActionOutline: {
    minHeight: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(130,53,55,0.10)',
    backgroundColor: '#FFFFFF',
    ...shadows.card,
  },
  cardActionWide: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#282426',
  },
  cardActionDark: {
    minHeight: 40,
    minWidth: 140,
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,13,114,0.22)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 5,
    paddingRight: 5,
  },
  cardActionSplit: {
    minHeight: 34,
    borderBottomWidth: 1,
    borderBottomColor: colors.brand.primary,
    borderRadius: 0,
    paddingHorizontal: 0,
  },
  cardActionMinimal: {
    minHeight: 40,
    alignSelf: 'stretch',
    borderRadius: 12,
    backgroundColor: '#F5F1F3',
  },
  cardActionGlass: {
    minHeight: 40,
    minWidth: 118,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.94)',
    backgroundColor: 'rgba(255,255,255,0.62)',
    paddingHorizontal: 12,
    ...shadows.card,
  },
  cardActionSquareSolid: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.brand.primary,
  },
  cardActionStatusPill: {
    minHeight: 38,
    backgroundColor: '#FBE7F0',
  },
  cardActionEditorialLink: {
    minHeight: 36,
    borderRadius: 0,
    paddingHorizontal: 2,
  },
  cardActionFramedSplit: {
    minHeight: 42,
    minWidth: 140,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(216,13,114,0.28)',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 5,
    paddingRight: 5,
  },
  cardActionBurgundyWide: {
    minHeight: 42,
    minWidth: 132,
    borderRadius: 14,
    backgroundColor: colors.brand.burgundy,
    shadowColor: colors.brand.burgundy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 2,
  },
  cardActionStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  cardActionInverse: {
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardActionGlyph: {
    position: 'absolute',
    top: 3.5,
    right: 4,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFF0F6',
  },
  cardActionGlyphSolid: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  cardActionGlyphDark: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardActionGlyphSplit: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: '#FADFE8',
  },
  cardActionGlyphFramed: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: '#FFF0F7',
  },
  cardActionGlyphInverse: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardActionGlyphText: {
    fontSize: 12,
    lineHeight: 14,
  },
  planCard: {
    minHeight: 220,
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(115,110,108,0.10)',
    ...shadows.card,
  },
  planCardImageRight: {
    minHeight: 224,
  },
  planCardImageTop: {
    minHeight: 390,
  },
  planCardFullBleed: {
    minHeight: 330,
    justifyContent: 'flex-end',
    backgroundColor: '#342125',
  },
  planCardCompact: {
    minHeight: 158,
  },
  planCardClinical: {
    minHeight: 244,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    shadowOpacity: 0,
    elevation: 0,
  },
  planCardDark: {
    minHeight: 246,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  planCardEqualSplit: {
    minHeight: 260,
  },
  planCardEditorial: {
    minHeight: 292,
    borderRadius: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#D9CED1',
    backgroundColor: colors.surface.canvas,
    shadowOpacity: 0,
    elevation: 0,
  },
  planCardGlass: {
    minHeight: 330,
    justifyContent: 'flex-end',
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: '#F7EAEF',
  },
  planCardImageFrame: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 160,
    overflow: 'hidden',
  },
  imageFrameRight: {
    right: 0,
    left: undefined,
    width: 170,
  },
  imageFrameTop: {
    right: 0,
    bottom: undefined,
    width: '100%',
    height: 176,
  },
  imageFrameFull: {
    right: 0,
    width: '100%',
  },
  imageFrameCompact: {
    width: 118,
  },
  imageFrameClinical: {
    top: 16,
    bottom: undefined,
    left: 16,
    width: 78,
    height: 78,
    borderRadius: radii.sm,
  },
  imageFrameDark: {
    width: 172,
  },
  imageFrameEqual: {
    width: '50%',
  },
  imageFrameEditorial: {
    top: 18,
    right: 0,
    bottom: 18,
    left: undefined,
    width: 132,
  },
  planCardImage: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 154,
    height: 220,
  },
  imageWide: {
    width: '100%',
    height: 176,
  },
  imageFull: {
    width: '100%',
    height: '100%',
  },
  imageCompact: {
    width: 116,
    height: 158,
  },
  imageClinical: {
    width: 78,
    height: 78,
  },
  imageDark: {
    width: 170,
    height: 246,
  },
  imageEqual: {
    width: '100%',
    height: 260,
  },
  imageEditorial: {
    width: 132,
    height: 256,
  },
  imageTop: {
    top: -12,
  },
  imageBottom: {
    top: 12,
  },
  planCardImageFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 58,
  },
  imageFadeLeft: {
    right: undefined,
    left: 0,
    transform: [{ rotate: '180deg' }],
  },
  imageFadeFull: {
    top: undefined,
    right: 0,
    left: 0,
    width: '100%',
    height: 190,
    transform: [{ rotate: '90deg' }],
  },
  planCardBody: {
    minHeight: 220,
    marginLeft: 132,
    paddingTop: spacing.md,
    paddingRight: spacing.md,
    paddingBottom: spacing.md,
    paddingLeft: spacing.md,
  },
  cardBodyImageRight: {
    marginRight: 132,
    marginLeft: 0,
    paddingRight: spacing.md,
  },
  cardBodyImageTop: {
    minHeight: 390,
    marginTop: 176,
    marginLeft: 0,
  },
  cardBodyFullBleed: {
    minHeight: 220,
    marginTop: 110,
    marginLeft: 0,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  cardBodyCompact: {
    minHeight: 158,
    marginLeft: 102,
    paddingTop: spacing.sm,
    paddingRight: spacing.sm,
    paddingBottom: spacing.sm,
    paddingLeft: spacing.md,
  },
  cardBodyClinical: {
    minHeight: 244,
    marginLeft: 0,
    paddingTop: 18,
    paddingLeft: 110,
  },
  cardBodyDark: {
    minHeight: 246,
    marginLeft: 142,
  },
  cardBodyEqual: {
    minHeight: 260,
    marginLeft: '50%',
  },
  cardBodyEditorial: {
    minHeight: 292,
    marginRight: 130,
    marginLeft: 0,
    paddingLeft: 0,
  },
  cardBodyGlass: {
    minHeight: 204,
    margin: spacing.sm,
    marginTop: 114,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.82)',
    padding: spacing.md,
    ...shadows.card,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryPillClinical: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(211,20,113,0.26)',
    backgroundColor: 'transparent',
  },
  planCardTitle: {
    marginTop: 10,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.45,
  },
  planCardTitleCompact: {
    marginTop: 7,
    fontSize: 17,
    lineHeight: 19,
  },
  planCardTitleEditorial: {
    marginTop: spacing.md,
    fontSize: 27,
    lineHeight: 29,
    letterSpacing: -0.7,
  },
  planCardMeta: {
    marginTop: 12,
    gap: 7,
  },
  planCardMetaRow: {
    gap: 1,
  },
  metaValue: {
    fontSize: 13,
    lineHeight: 16,
  },
  planCardFooter: {
    minHeight: 34,
    marginTop: 'auto',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  statusLabel: {
    flex: 1,
  },
  viewButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(211,20,113,0.32)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 11,
  },
  viewButtonInverse: {
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  viewButtonCompact: {
    minHeight: 30,
    paddingHorizontal: 9,
  },
  pressed: {
    opacity: motion.pressedOpacity,
    transform: [{ scale: 0.985 }],
  },
});
