import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { AppText, TokenLabel } from './components';
import { colors, spacing } from './tokens';

type AttachmentGlyphKind =
  'upload' | 'document' | 'photo' | 'camera' | 'folder' | 'plus' | 'chevron';

function AttachmentGlyph({
  color = colors.brand.primary,
  kind,
  size = 24,
}: {
  color?: string;
  kind: AttachmentGlyphKind;
  size?: number;
}) {
  if (kind === 'upload') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 13v3.5A3.5 3.5 0 0 0 8.5 20h7a3.5 3.5 0 0 0 3.5-3.5V13"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (kind === 'document') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M6.5 3.5h7l4 4v13h-11v-17Z"
          fill="none"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d="M13.5 3.5v4h4M9 12h6M9 15.5h5"
          fill="none"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (kind === 'photo') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect
          x={3.5}
          y={4.5}
          width={17}
          height={15}
          rx={2.5}
          fill="none"
          stroke={color}
          strokeWidth={1.9}
        />
        <Circle
          cx={9}
          cy={9.5}
          r={1.6}
          fill="none"
          stroke={color}
          strokeWidth={1.7}
        />
        <Path
          d="m5.5 17 4.2-4.2 2.9 2.8 2.3-2.2 3.6 3.6"
          fill="none"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (kind === 'camera') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M4 8.5h3l1.4-2h7.2l1.4 2h3v10H4v-10Z"
          fill="none"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle
          cx={12}
          cy={13.5}
          r={3}
          fill="none"
          stroke={color}
          strokeWidth={1.9}
        />
      </Svg>
    );
  }

  if (kind === 'folder') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M3.5 7h6l2 2h9v9.5h-17V7Z"
          fill="none"
          stroke={color}
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }

  if (kind === 'plus') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="m9 5 7 7-7 7"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PreviewAction({
  compact = false,
  icon,
  label,
  primary = false,
  style,
}: {
  compact?: boolean;
  icon?: AttachmentGlyphKind;
  label: string;
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => undefined}
      style={({ pressed }) => [
        styles.action,
        compact && styles.actionCompact,
        primary && styles.actionPrimary,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? (
        <AttachmentGlyph
          color={primary ? colors.text.inverse : colors.text.primary}
          kind={icon}
          size={compact ? 18 : 20}
        />
      ) : null}
      <AppText
        role="label"
        weight={primary ? 'semibold' : 'medium'}
        color={primary ? colors.text.inverse : colors.text.primary}
        numberOfLines={1}
        style={styles.actionLabel}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function CopyBlock({
  align = 'left',
  description = 'PDF или изображение',
  title = 'Добавьте заключение или результаты лаборатории',
}: {
  align?: 'left' | 'center';
  description?: string;
  title?: string;
}) {
  return (
    <View style={[styles.copy, align === 'center' && styles.copyCentered]}>
      <AppText
        role="label"
        weight="semibold"
        style={[styles.copyTitle, align === 'center' && styles.textCentered]}
      >
        {title}
      </AppText>
      <AppText
        role="caption"
        color={colors.text.secondary}
        style={[
          styles.copyDescription,
          align === 'center' && styles.textCentered,
        ]}
      >
        {description}
      </AppText>
    </View>
  );
}

function SourceTile({
  description,
  icon,
  title,
}: {
  description: string;
  icon: AttachmentGlyphKind;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => undefined}
      style={({ pressed }) => [styles.sourceTile, pressed && styles.pressed]}
    >
      <View style={styles.sourceTileIcon}>
        <AttachmentGlyph kind={icon} size={28} />
      </View>
      <AppText role="label" weight="semibold">
        {title}
      </AppText>
      <AppText
        role="caption"
        color={colors.text.secondary}
        style={styles.sourceTileDescription}
      >
        {description}
      </AppText>
    </Pressable>
  );
}

function RowAction({
  detail,
  icon,
  title,
}: {
  detail: string;
  icon: AttachmentGlyphKind;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => undefined}
      style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}
    >
      <View style={styles.rowActionIcon}>
        <AttachmentGlyph kind={icon} size={21} />
      </View>
      <View style={styles.rowActionCopy}>
        <AppText role="label" weight="medium">
          {title}
        </AppText>
        <AppText role="caption" color={colors.text.secondary}>
          {detail}
        </AppText>
      </View>
      <AttachmentGlyph kind="chevron" color={colors.text.secondary} size={18} />
    </Pressable>
  );
}

function AttachmentPreview({
  mode,
  onModeChange,
  variant,
}: {
  mode: 'file' | 'photo';
  onModeChange: (mode: 'file' | 'photo') => void;
  variant: number;
}) {
  if (variant === 1) {
    return (
      <View style={styles.compactRow}>
        <View style={styles.compactRowIcon}>
          <AttachmentGlyph kind="document" size={25} />
        </View>
        <View style={styles.compactRowCopy}>
          <AppText role="label" weight="semibold">
            Файл или фото результата
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            PDF, JPG или PNG
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить результат"
          onPress={() => undefined}
          style={({ pressed }) => [
            styles.compactAdd,
            pressed && styles.pressed,
          ]}
        >
          <AttachmentGlyph kind="plus" color={colors.text.inverse} size={21} />
        </Pressable>
      </View>
    );
  }

  if (variant === 2) {
    return (
      <View style={styles.twoSourcesBlock}>
        <View style={styles.twoSourcesGrid}>
          <SourceTile icon="folder" title="Файл" description="PDF или снимок" />
          <SourceTile icon="camera" title="Фото" description="Из галереи" />
        </View>
        <AppText
          role="caption"
          color={colors.text.secondary}
          style={styles.textCentered}
        >
          Прикрепите заключение или результаты лаборатории
        </AppText>
      </View>
    );
  }

  if (variant === 3) {
    return (
      <View style={styles.ticket}>
        <View style={styles.ticketFormat}>
          <AppText numeric weight="semibold" color={colors.brand.primary}>
            PDF
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            JPG · PNG
          </AppText>
        </View>
        <View style={styles.ticketCopy}>
          <AppText role="label" weight="semibold">
            Добавить медицинский документ
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            Заключение или лабораторный бланк
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить документ"
          onPress={() => undefined}
          style={({ pressed }) => [
            styles.ticketAction,
            pressed && styles.pressed,
          ]}
        >
          <AppText
            role="caption"
            weight="semibold"
            color={colors.brand.primary}
          >
            Добавить →
          </AppText>
        </Pressable>
        <View pointerEvents="none" style={styles.ticketPerforation} />
      </View>
    );
  }

  if (variant === 4) {
    return (
      <View style={styles.primaryFirst}>
        <CopyBlock title="Загрузите результат анализа" />
        <PreviewAction primary label="Выбрать файл" icon="folder" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить фото"
          onPress={() => undefined}
          style={({ pressed }) => [
            styles.textAction,
            pressed && styles.pressed,
          ]}
        >
          <AppText role="label" weight="medium">
            Или добавить фото →
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (variant === 5) {
    return (
      <View style={styles.footerPanel}>
        <View style={styles.footerPanelContent}>
          <View style={styles.footerPanelIcon}>
            <AttachmentGlyph kind="upload" size={35} />
          </View>
          <CopyBlock align="center" title="Прикрепите результат" />
        </View>
        <View style={styles.footerPanelActions}>
          <PreviewAction
            compact
            label="Файл"
            icon="document"
            style={styles.footerPanelAction}
          />
          <View style={styles.footerPanelDivider} />
          <PreviewAction
            compact
            label="Камера"
            icon="camera"
            style={styles.footerPanelAction}
          />
        </View>
      </View>
    );
  }

  if (variant === 6) {
    const fileMode = mode === 'file';
    return (
      <View style={styles.segmentedBlock}>
        <View style={styles.segmentedControl}>
          {(['file', 'photo'] as const).map((item) => {
            const selected = item === mode;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onModeChange(item)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <AppText
                  role="caption"
                  weight={selected ? 'semibold' : 'medium'}
                  color={selected ? colors.text.primary : colors.text.secondary}
                >
                  {item === 'file' ? 'Файл' : 'Фото'}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.segmentedBody}>
          <View style={styles.segmentedIcon}>
            <AttachmentGlyph kind={fileMode ? 'document' : 'photo'} size={32} />
          </View>
          <CopyBlock
            align="center"
            title={fileMode ? 'Выберите документ' : 'Выберите снимок'}
            description={
              fileMode ? 'PDF, JPG или PNG' : 'Фото из галереи устройства'
            }
          />
          <PreviewAction
            primary
            label={fileMode ? 'Открыть файлы' : 'Открыть галерею'}
            icon={fileMode ? 'folder' : 'photo'}
            style={styles.segmentedAction}
          />
        </View>
      </View>
    );
  }

  if (variant === 7) {
    return (
      <View style={styles.stepsBlock}>
        <View style={styles.stepHeading}>
          <AppText
            numeric
            weight="semibold"
            color={colors.brand.primary}
            style={styles.stepNumber}
          >
            01
          </AppText>
          <View style={styles.stepHeadingCopy}>
            <AppText role="label" weight="semibold">
              Прикрепите результат
            </AppText>
            <AppText role="caption" color={colors.text.secondary}>
              Выберите удобный источник
            </AppText>
          </View>
        </View>
        <View style={styles.stepsActions}>
          <RowAction
            title="Выбрать из файлов"
            detail="PDF или изображение"
            icon="folder"
          />
          <RowAction
            title="Добавить фотографию"
            detail="Из галереи устройства"
            icon="photo"
          />
        </View>
        <View style={styles.nextStep}>
          <AppText
            numeric
            color={colors.text.secondary}
            style={styles.nextStepNumber}
          >
            02
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            Проверить и сохранить
          </AppText>
        </View>
      </View>
    );
  }

  if (variant === 8) {
    return (
      <View style={styles.previewSplit}>
        <View style={styles.documentPreview}>
          <View style={styles.documentPreviewHeader} />
          <View
            style={[styles.documentPreviewLine, styles.documentPreviewLineWide]}
          />
          <View style={styles.documentPreviewLine} />
          <View
            style={[
              styles.documentPreviewLine,
              styles.documentPreviewLineShort,
            ]}
          />
          <View style={styles.documentPreviewStamp}>
            <AttachmentGlyph kind="plus" size={20} />
          </View>
        </View>
        <View style={styles.previewSplitCopy}>
          <CopyBlock
            title="Добавьте результат"
            description="После выбора здесь появится превью документа"
          />
          <View style={styles.previewSplitActions}>
            <PreviewAction compact primary label="Из файлов" icon="folder" />
            <PreviewAction compact label="С камеры" icon="camera" />
          </View>
        </View>
      </View>
    );
  }

  if (variant === 9) {
    return (
      <View style={styles.actionDock}>
        <CopyBlock
          title="Добавить результат"
          description="Выберите источник документа"
        />
        <View style={styles.actionDockTools}>
          {[
            { icon: 'document' as const, label: 'Файл' },
            { icon: 'camera' as const, label: 'Фото' },
          ].map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => undefined}
              style={({ pressed }) => [
                styles.actionDockTool,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.actionDockCircle}>
                <AttachmentGlyph kind={item.icon} size={27} />
              </View>
              <AppText role="caption" weight="medium">
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.smartEntry}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить результат"
        onPress={() => undefined}
        style={({ pressed }) => [
          styles.smartEntryRow,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.smartEntryIcon}>
          <AttachmentGlyph kind="upload" size={24} />
        </View>
        <View style={styles.smartEntryCopy}>
          <AppText role="label" weight="semibold">
            Добавить результат
          </AppText>
          <AppText role="caption" color={colors.text.secondary}>
            Файл или фотография
          </AppText>
        </View>
        <AttachmentGlyph
          kind="chevron"
          color={colors.brand.primary}
          size={20}
        />
      </Pressable>
      <View style={styles.smartSheet}>
        <View style={styles.smartSheetHandle} />
        <RowAction
          title="Выбрать файл"
          detail="PDF, JPG или PNG"
          icon="folder"
        />
        <RowAction
          title="Добавить фото"
          detail="Из галереи устройства"
          icon="photo"
        />
      </View>
    </View>
  );
}

const attachmentVariants: Array<{ label: string; variant: number }> = [
  { label: '01 / Компактная строка', variant: 1 },
  { label: '02 / Два источника', variant: 2 },
  { label: '03 / Документ-билет', variant: 3 },
  { label: '04 / Приоритетный CTA', variant: 4 },
  { label: '05 / Нижняя панель', variant: 5 },
  { label: '06 / Сегментированный выбор', variant: 6 },
  { label: '07 / Пошаговый сценарий', variant: 7 },
  { label: '08 / Превью документа', variant: 8 },
  { label: '09 / Action dock', variant: 9 },
  { label: '10 / Единый вход + sheet', variant: 10 },
];

export function AnalysisAttachmentVariantsCatalog() {
  const [mode, setMode] = useState<'file' | 'photo'>('file');

  return (
    <View testID="analysis-attachment-variants" style={styles.catalog}>
      {attachmentVariants.map((item) => (
        <View key={item.variant} style={styles.catalogItem}>
          <TokenLabel>{item.label}</TokenLabel>
          <AttachmentPreview
            mode={mode}
            onModeChange={setMode}
            variant={item.variant}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  catalog: {
    gap: spacing.xl,
  },
  catalogItem: {
    width: '100%',
    gap: spacing.sm,
  },
  action: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.12)',
    backgroundColor: colors.surface.raised,
    paddingHorizontal: 18,
  },
  actionCompact: {
    minHeight: 42,
    borderRadius: 13,
    paddingHorizontal: 12,
  },
  actionPrimary: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primary,
  },
  actionLabel: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
  copy: {
    minWidth: 0,
    gap: 4,
  },
  copyCentered: {
    alignItems: 'center',
  },
  copyTitle: {
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.22,
  },
  copyDescription: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  textCentered: {
    textAlign: 'center',
  },
  compactRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
    backgroundColor: colors.surface.raised,
  },
  compactRowIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FFF0F6',
  },
  compactRowCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  compactAdd: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.brand.primary,
  },
  twoSourcesBlock: {
    gap: 12,
  },
  twoSourcesGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  sourceTile: {
    minWidth: 0,
    flex: 1,
    minHeight: 154,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.16)',
    backgroundColor: '#FFF8FB',
  },
  sourceTileIcon: {
    width: 52,
    height: 52,
    marginBottom: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surface.raised,
  },
  sourceTileDescription: {
    textAlign: 'center',
  },
  ticket: {
    position: 'relative',
    minHeight: 116,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
    backgroundColor: colors.surface.raised,
  },
  ticketFormat: {
    width: 64,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: 12,
    backgroundColor: '#FFF0F6',
  },
  ticketCopy: {
    minWidth: 0,
    flex: 1,
    gap: 4,
  },
  ticketAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  ticketPerforation: {
    position: 'absolute',
    right: 0,
    bottom: 7,
    left: 0,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: '#D8D2D4',
  },
  primaryFirst: {
    gap: 14,
    paddingVertical: 4,
  },
  textAction: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  footerPanel: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.14)',
    backgroundColor: '#FFF8FB',
  },
  footerPanelContent: {
    minHeight: 168,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 15,
    padding: 20,
  },
  footerPanelIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface.raised,
  },
  footerPanelActions: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,32,0.10)',
    backgroundColor: colors.surface.raised,
    paddingHorizontal: 8,
  },
  footerPanelAction: {
    flex: 1,
    borderWidth: 0,
  },
  footerPanelDivider: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    backgroundColor: colors.surface.divider,
  },
  segmentedBlock: {
    gap: 10,
    padding: 8,
    borderRadius: 22,
    backgroundColor: '#EFEAEC',
  },
  segmentedControl: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 13,
    backgroundColor: 'rgba(33,31,32,0.06)',
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  segmentSelected: {
    backgroundColor: colors.surface.raised,
  },
  segmentedBody: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
    padding: 18,
    borderRadius: 17,
    backgroundColor: colors.surface.raised,
  },
  segmentedIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#FFF0F6',
  },
  segmentedAction: {
    minWidth: 190,
    marginTop: 2,
  },
  stepsBlock: {
    gap: 15,
    paddingTop: 4,
  },
  stepHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 48,
    fontSize: 26,
    lineHeight: 30,
  },
  stepHeadingCopy: {
    gap: 3,
  },
  stepsActions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
  },
  rowAction: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surface.divider,
  },
  rowActionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#FFF0F6',
  },
  rowActionCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  nextStep: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    opacity: 0.62,
  },
  nextStepNumber: {
    width: 48,
    fontSize: 18,
    lineHeight: 22,
  },
  previewSplit: {
    minHeight: 196,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
  },
  documentPreview: {
    position: 'relative',
    width: 104,
    height: 142,
    padding: 13,
    borderRadius: 8,
    backgroundColor: '#FFF8FB',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.18)',
  },
  documentPreviewHeader: {
    width: 35,
    height: 7,
    marginBottom: 14,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  documentPreviewLine: {
    width: 55,
    height: 4,
    marginBottom: 8,
    borderRadius: 2,
    backgroundColor: '#DCD6D8',
  },
  documentPreviewLineWide: {
    width: 74,
  },
  documentPreviewLineShort: {
    width: 39,
  },
  documentPreviewStamp: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.24)',
  },
  previewSplitCopy: {
    minWidth: 0,
    flex: 1,
    gap: 13,
  },
  previewSplitActions: {
    gap: 8,
  },
  actionDock: {
    minHeight: 156,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    paddingVertical: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.divider,
  },
  actionDockTools: {
    flexDirection: 'row',
    gap: 12,
  },
  actionDockTool: {
    minWidth: 62,
    alignItems: 'center',
    gap: 7,
  },
  actionDockCircle: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 27,
    backgroundColor: '#FFF0F6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(234,64,135,0.16)',
  },
  smartEntry: {
    gap: 12,
  },
  smartEntryRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
  },
  smartEntryIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#FFF0F6',
  },
  smartEntryCopy: {
    minWidth: 0,
    flex: 1,
    gap: 3,
  },
  smartSheet: {
    gap: 0,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
    borderRadius: 22,
    backgroundColor: colors.surface.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(33,31,32,0.10)',
  },
  smartSheetHandle: {
    width: 34,
    height: 4,
    marginBottom: 5,
    borderRadius: 2,
    backgroundColor: '#D8D3D5',
    alignSelf: 'center',
  },
});
