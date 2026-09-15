import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextProps,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontStyle } from '../lib/font-style';
import { useAppTheme, useThemeStyles, ThemeStatusBar, type ThemeColors } from '../lib/theme';
import {
  getLegalDocument,
  legalDocuments,
  type LegalDocumentId,
  type LegalDocumentSelection,
} from '../lib/legal-documents';
import { AppSheet } from './AppSheet';

function LegalText({
  weight = 'regular',
  color,
  style,
  ...props
}: TextProps & {
  weight?: 'regular' | 'semibold';
  color?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Text
      {...props}
      style={[
        {
          color: color ?? colors.text.primary,
          ...fontStyle(
            weight === 'semibold'
              ? 'SFProDisplay-Semibold'
              : 'SFProDisplay-Regular',
          ),
          fontSize: 16,
          lineHeight: 24,
        },
        style,
      ]}
    />
  );
}

/** A reader only: opening, scrolling and closing never accept a document. */
export function LegalDocumentsModal({
  selection,
  onClose,
}: {
  selection: LegalDocumentSelection;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Exclude<LegalDocumentSelection, null>>(
    selection ?? 'index',
  );
  const previousSelection = useRef(selection);
  // Reset the document before painting when another link or a new session opens.
  if (selection !== previousSelection.current) {
    previousSelection.current = selection;
    if (selection !== null) setPage(selection);
  }
  useEffect(() => {
    if (selection) Keyboard.dismiss();
  }, [selection]);
  const document = page === 'index' ? null : getLegalDocument(page);

  return (
    <AppSheet
      visible={selection !== null}
      title="Правовая информация"
      onClose={onClose}
      scroll={false}
      fullWidth
      containsLiquidGlass
      backdropColor={colors.surface.canvas}
    >
      <View
        accessibilityViewIsModal
        style={[
          styles.root,
          { paddingTop: 0 },
        ]}
      >
        <ThemeStatusBar hidden={false} />
        <ScrollView
          key={page}
          testID="legal-document-scroll"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 20) + 24 },
          ]}
        >
          {document ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPage('index')}
                style={styles.back}
              >
                <LegalText color={colors.brand.primary}>
                  Все документы
                </LegalText>
              </Pressable>
              <LegalText
                accessibilityRole="header"
                weight="semibold"
                style={styles.title}
              >
                {document.title}
              </LegalText>
              <LegalText color={colors.text.secondary}>
                {document.edition}
              </LegalText>
              {document.notice ? (
                <View style={styles.notice}>
                  <LegalText style={styles.body}>{document.notice}</LegalText>
                </View>
              ) : null}
              {document.blocks.map((block, index) => (
                <LegalText
                  key={`${page}-${index}`}
                  selectable
                  accessibilityRole={
                    block.kind === 'heading' ? 'header' : undefined
                  }
                  weight={block.kind === 'heading' ? 'semibold' : 'regular'}
                  style={
                    block.kind === 'heading' ? styles.heading : styles.body
                  }
                >
                  {block.text}
                </LegalText>
              ))}
            </>
          ) : (
            <>
              <LegalText
                accessibilityRole="header"
                weight="semibold"
                style={styles.title}
              >
                Документы Sfera
              </LegalText>
              <LegalText color={colors.text.secondary} style={styles.body}>
                Условия использования, обработка данных и ваши разрешения.
                Документы доступны без интернета.
              </LegalText>
              {legalDocuments.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="link"
                  testID={`legal-link-${item.id}`}
                  onPress={() => setPage(item.id as LegalDocumentId)}
                  style={styles.row}
                >
                  <LegalText style={styles.rowLabel}>{item.label}</LegalText>
                  <LegalText
                    color={colors.text.secondary}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    ›
                  </LegalText>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </AppSheet>
  );
}

/** Self-contained entry point for profile and permission screens. */
export function LegalDocumentsButton({
  documentId = 'index',
  label = 'Правовая информация',
  variant = 'link',
}: {
  documentId?: Exclude<LegalDocumentSelection, null>;
  label?: string;
  variant?: 'link' | 'row';
}) {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const [selection, setSelection] = useState<LegalDocumentSelection>(null);
  return (
    <View>
      <Pressable
        accessibilityRole="link"
        testID={`legal-open-${documentId}`}
        onPress={() => setSelection(documentId)}
        style={[styles.entry, variant === 'row' && styles.entryRow]}
      >
        <LegalText
          color={variant === 'row' ? colors.text.primary : colors.brand.primary}
          style={[styles.entryLabel, variant === 'row' && styles.entryRowLabel]}
        >
          {label}
        </LegalText>
        {variant === 'row' ? (
          <LegalText color={colors.text.secondary}>›</LegalText>
        ) : null}
      </Pressable>
      <LegalDocumentsModal
        selection={selection}
        onClose={() => setSelection(null)}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flexShrink: 1, backgroundColor: colors.surface.canvas },
    content: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: 24,
      paddingTop: 8,
      gap: 16,
    },
    title: { fontSize: 26, lineHeight: 33 },
    heading: { fontSize: 20, lineHeight: 28, marginTop: 12 },
    body: { fontSize: 16, lineHeight: 25 },
    back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    notice: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.surface.raised,
    },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surface.divider,
    },
    rowLabel: { flex: 1, fontSize: 17, lineHeight: 24 },
    entry: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      minHeight: 52,
      borderRadius: 18,
      backgroundColor: colors.surface.raised,
    },
    entryRowLabel: { flex: 1, textDecorationLine: 'none' },
    entryLabel: {
      fontSize: 15,
      lineHeight: 22,
      textDecorationLine: 'underline',
    },
  });
