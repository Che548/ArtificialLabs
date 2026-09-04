import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LiquidGlassSurface, TokenLabel } from './components';
import { colors, fonts, radii, shadows, spacing } from './tokens';

type NavbarTabKey = 'chat' | 'analyses' | 'today' | 'scan' | 'profile' | 'kit';

type NavbarIconPair = {
  default: SFSymbol;
  selected: SFSymbol;
};

export type NavbarIconVariant = {
  id: number;
  label: string;
  icons: Record<NavbarTabKey, NavbarIconPair>;
};

const navbarTabs: Array<{
  key: NavbarTabKey;
  label: string;
  fallback: string;
}> = [
  { key: 'chat', label: 'Чат', fallback: '◌' },
  { key: 'analyses', label: 'Анализы', fallback: '+' },
  { key: 'today', label: 'Сегодня', fallback: '♥' },
  { key: 'scan', label: 'Скан', fallback: '⌗' },
  { key: 'profile', label: 'Профиль', fallback: '○' },
  { key: 'kit', label: 'UI-kit', fallback: '▦' },
];

export const navbarIconVariants: NavbarIconVariant[] = [
  {
    id: 1,
    label: 'Текущий набор',
    icons: {
      chat: {
        default: 'bubble.left.and.bubble.right',
        selected: 'bubble.left.and.bubble.right.fill',
      },
      analyses: { default: 'cross.case', selected: 'cross.case.fill' },
      today: {
        default: 'heart.text.clipboard',
        selected: 'heart.text.clipboard.fill',
      },
      scan: { default: 'viewfinder', selected: 'viewfinder' },
      profile: {
        default: 'person.crop.circle',
        selected: 'person.crop.circle.fill',
      },
      kit: {
        default: 'square.grid.2x2',
        selected: 'square.grid.2x2.fill',
      },
    },
  },
  {
    id: 2,
    label: 'Прямые символы',
    icons: {
      chat: { default: 'message', selected: 'message.fill' },
      analyses: { default: 'testtube.2', selected: 'testtube.2' },
      today: { default: 'calendar', selected: 'calendar' },
      scan: { default: 'camera.viewfinder', selected: 'camera.viewfinder' },
      profile: { default: 'person', selected: 'person.fill' },
      kit: { default: 'square.grid.3x3', selected: 'square.grid.3x3.fill' },
    },
  },
  {
    id: 3,
    label: 'Круглая система',
    icons: {
      chat: {
        default: 'ellipsis.bubble',
        selected: 'ellipsis.bubble.fill',
      },
      analyses: { default: 'cross.vial', selected: 'cross.vial.fill' },
      today: { default: 'heart.circle', selected: 'heart.circle.fill' },
      scan: {
        default: 'viewfinder.circle',
        selected: 'viewfinder.circle.fill',
      },
      profile: { default: 'person.circle', selected: 'person.circle.fill' },
      kit: { default: 'circle.grid.2x2', selected: 'circle.grid.2x2.fill' },
    },
  },
  {
    id: 4,
    label: 'Клинический набор',
    icons: {
      chat: { default: 'text.bubble', selected: 'text.bubble.fill' },
      analyses: { default: 'stethoscope', selected: 'stethoscope' },
      today: { default: 'waveform.path.ecg', selected: 'waveform.path.ecg' },
      scan: { default: 'scope', selected: 'scope' },
      profile: {
        default: 'person.crop.circle.badge.checkmark',
        selected: 'person.crop.circle.badge.checkmark',
      },
      kit: {
        default: 'square.grid.2x2',
        selected: 'square.grid.2x2.fill',
      },
    },
  },
  {
    id: 5,
    label: 'Документы и записи',
    icons: {
      chat: { default: 'quote.bubble', selected: 'quote.bubble.fill' },
      analyses: {
        default: 'doc.text.magnifyingglass',
        selected: 'doc.text.magnifyingglass',
      },
      today: { default: 'list.clipboard', selected: 'list.clipboard.fill' },
      scan: { default: 'text.viewfinder', selected: 'text.viewfinder' },
      profile: {
        default: 'person.text.rectangle',
        selected: 'person.text.rectangle.fill',
      },
      kit: {
        default: 'rectangle.grid.2x2',
        selected: 'rectangle.grid.2x2.fill',
      },
    },
  },
  {
    id: 6,
    label: 'Мягкие контуры',
    icons: {
      chat: { default: 'bubble.left', selected: 'bubble.left.fill' },
      analyses: {
        default: 'heart.text.square',
        selected: 'heart.text.square.fill',
      },
      today: { default: 'sun.max', selected: 'sun.max.fill' },
      scan: { default: 'qrcode.viewfinder', selected: 'qrcode.viewfinder' },
      profile: {
        default: 'person.crop.square',
        selected: 'person.crop.square.fill',
      },
      kit: {
        default: 'square.grid.3x1.below.line.grid.1x2',
        selected: 'square.grid.3x1.below.line.grid.1x2.fill',
      },
    },
  },
  {
    id: 7,
    label: 'Действия и контроль',
    icons: {
      chat: { default: 'plus.bubble', selected: 'plus.bubble.fill' },
      analyses: {
        default: 'checkmark.circle',
        selected: 'checkmark.circle.fill',
      },
      today: { default: 'checklist', selected: 'checklist.checked' },
      scan: { default: 'barcode.viewfinder', selected: 'barcode.viewfinder' },
      profile: {
        default: 'person.badge.shield.checkmark',
        selected: 'person.badge.shield.checkmark.fill',
      },
      kit: {
        default: 'slider.horizontal.3',
        selected: 'slider.horizontal.3',
      },
    },
  },
  {
    id: 8,
    label: 'Редакционный набор',
    icons: {
      chat: {
        default: 'questionmark.bubble',
        selected: 'questionmark.bubble.fill',
      },
      analyses: {
        default: 'chart.xyaxis.line',
        selected: 'chart.xyaxis.line',
      },
      today: { default: 'book.pages', selected: 'book.pages.fill' },
      scan: {
        default: 'document.viewfinder',
        selected: 'document.viewfinder',
      },
      profile: {
        default: 'person.crop.artframe',
        selected: 'person.crop.artframe',
      },
      kit: { default: 'paintpalette', selected: 'paintpalette.fill' },
    },
  },
  {
    id: 9,
    label: 'Компактные формы',
    icons: {
      chat: {
        default: 'bubble.middle.bottom',
        selected: 'bubble.middle.bottom.fill',
      },
      analyses: { default: 'cross', selected: 'cross' },
      today: { default: 'heart', selected: 'heart.fill' },
      scan: {
        default: 'viewfinder.rectangular',
        selected: 'viewfinder.rectangular',
      },
      profile: { default: 'face.smiling', selected: 'face.smiling.fill' },
      kit: {
        default: 'square.grid.4x3.fill',
        selected: 'square.grid.4x3.fill',
      },
    },
  },
  {
    id: 10,
    label: 'Системный набор',
    icons: {
      chat: {
        default: 'waveform.and.person.filled',
        selected: 'waveform.and.person.filled',
      },
      analyses: {
        default: 'medical.thermometer',
        selected: 'medical.thermometer.fill',
      },
      today: {
        default: 'calendar.day.timeline.left',
        selected: 'calendar.day.timeline.left',
      },
      scan: { default: 'livephoto', selected: 'livephoto' },
      profile: {
        default: 'person.badge.key',
        selected: 'person.badge.key.fill',
      },
      kit: {
        default: 'rectangle.3.group',
        selected: 'rectangle.3.group.fill',
      },
    },
  },
];

function NavbarSymbol({
  name,
  color,
  fallback,
}: {
  name: SFSymbol;
  color: string;
  fallback: string;
}) {
  return (
    <SymbolView
      name={name}
      size={23}
      weight="regular"
      tintColor={color}
      fallback={
        <Text style={[styles.fallbackIcon, { color }]}>{fallback}</Text>
      }
    />
  );
}

export function NavbarIconVariantPreview({
  variant,
}: {
  variant: NavbarIconVariant;
}) {
  const [activeTab, setActiveTab] = useState<NavbarTabKey>('today');

  return (
    <View style={styles.variantBlock}>
      <View style={styles.variantHeading}>
        <TokenLabel>ВАРИАНТ {String(variant.id).padStart(2, '0')}</TokenLabel>
        <Text style={styles.variantName}>{variant.label}</Text>
      </View>

      <View style={styles.previewStage}>
        <View style={styles.navbar}>
          <LiquidGlassSurface
            style={StyleSheet.absoluteFillObject}
            radius={radii.lg}
            tintColor={colors.surface.headerGlassWash}
            washColor={colors.surface.glassWash}
          />
          <View style={styles.tabRow}>
            {navbarTabs.map((tab) => {
              const active = activeTab === tab.key;
              const pair = variant.icons[tab.key];
              const color = active
                ? colors.brand.primary
                : colors.text.secondary;

              return (
                <Pressable
                  cssInterop={false}
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => setActiveTab(tab.key)}
                  style={({ pressed }) => [
                    styles.tab,
                    pressed && styles.tabPressed,
                  ]}
                >
                  <NavbarSymbol
                    name={active ? pair.selected : pair.default}
                    color={color}
                    fallback={tab.fallback}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.tabLabel,
                      { color },
                      active && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

export function NavbarIconVariantsCatalog() {
  return (
    <View style={styles.catalog}>
      {navbarIconVariants.map((variant) => (
        <NavbarIconVariantPreview key={variant.id} variant={variant} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  catalog: {
    gap: spacing.xl,
  },
  variantBlock: {
    gap: spacing.sm,
  },
  variantHeading: {
    gap: spacing.xxs,
  },
  variantName: {
    color: colors.text.primary,
    fontFamily: fonts.sfMedium,
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: -0.3,
  },
  previewStage: {
    minHeight: 112,
    padding: spacing.sm,
    justifyContent: 'flex-end',
    borderRadius: radii.lg,
    backgroundColor: colors.surface.canvas,
    overflow: 'hidden',
  },
  navbar: {
    height: 72,
    borderRadius: radii.lg,
    ...shadows.control,
  },
  tabRow: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: spacing.xxs,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    minWidth: 0,
    flex: 1,
    paddingTop: 10,
    paddingBottom: 7,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabPressed: {
    opacity: 0.62,
  },
  tabLabel: {
    maxWidth: '100%',
    fontFamily: fonts.sfRegular,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: -0.12,
    textAlign: 'center',
  },
  tabLabelActive: {
    fontFamily: fonts.sfSemibold,
  },
  fallbackIcon: {
    width: 24,
    height: 24,
    fontFamily: fonts.sfMedium,
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
});
