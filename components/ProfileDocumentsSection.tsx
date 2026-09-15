import { Image } from 'react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '../design-system';
import { useAppTheme } from '../lib/theme';
import type { HealthDocument } from '../lib/health-types';
import { DocumentReview } from './DocumentReview';

function DocumentIcon({
  color,
  add = false,
}: {
  color: string;
  add?: boolean;
}) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z M14 3v5h5 M8 12h8 M8 16h6"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {add ? (
        <Path
          d="M3 16v6 M0 19h6"
          stroke={color}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      ) : null}
    </Svg>
  );
}

export function ProfileDocumentsSection({
  documents,
  sourceDocumentId,
  readOnly,
  onAdd,
  onDelete,
}: {
  documents: HealthDocument[];
  sourceDocumentId?: string;
  readOnly: boolean;
  onAdd: () => Promise<void>;
  onDelete: (document: HealthDocument) => Promise<void>;
}) {
  const { colors } = useAppTheme();
  const [selected, setSelected] = useState<HealthDocument>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(
        message.includes('DOCUMENT_NATIVE_BUILD_REQUIRED')
          ? 'Нужна новая нативная сборка приложения для проверки документа.'
          : message.includes('DOCUMENT_PASSWORD')
            ? 'PDF защищён паролем. Прикрепите незашифрованную копию.'
            : message.includes('DOCUMENT_PAGES')
              ? 'Допускается не больше 20 страниц.'
              : message.includes('DOCUMENT_SIZE')
                ? 'Допустимый размер файла — до 20 МБ.'
                : message.includes('DOCUMENT_UNSUPPORTED')
                  ? 'Поддерживаются только PDF, JPEG и PNG.'
                  : 'Не удалось обработать документ. Проверьте файл и попробуйте ещё раз.',
      );
    } finally {
      setBusy(false);
    }
  };
  const confirmDelete = (document: HealthDocument) => {
    if (readOnly || busy) return;
    Alert.alert(
      'Удалить документ?',
      'Связанные результаты сохранятся без исходного файла.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => void perform(() => onDelete(document)),
        },
      ],
    );
  };
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить документ"
        accessibilityHint="PDF, JPEG или PNG, до 20 МБ и 20 страниц"
        disabled={readOnly || busy}
        style={[
          styles.add,
          {
            backgroundColor: colors.brand.primary,
            opacity: readOnly || busy ? 0.5 : 1,
          },
        ]}
        onPress={() => void perform(onAdd)}
      >
        <DocumentIcon color="#FFFFFF" add />
        <AppText style={styles.addLabel}>
          {busy ? 'Подождите…' : 'Добавить документ'}
        </AppText>
      </Pressable>
      {error ? (
        <View accessibilityRole="alert">
          <AppText color={colors.state.error}>{error}</AppText>
        </View>
      ) : null}
      <View style={styles.list}>
        <AppText style={[styles.count, { color: colors.text.secondary }]}>
          СОХРАНЕНО: {documents.length}
        </AppText>
        {documents.map((document) => (
          <Pressable
            key={document.localId}
            accessibilityRole="button"
            accessibilityLabel={`${document.title}, ${new Date(document.documentDate).toLocaleDateString('ru-RU')}`}
            accessibilityHint="Открыть документ. Удерживайте для удаления."
            accessibilityActions={
              readOnly ? [] : [{ name: 'delete', label: 'Удалить документ' }]
            }
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'delete')
                confirmDelete(document);
            }}
            disabled={busy}
            onPress={() => setSelected(document)}
            onLongPress={() => confirmDelete(document)}
            style={[styles.row, { backgroundColor: colors.surface.raised }]}
          >
            <View style={styles.icon}>
              <Image
                source={require('../assets/profile/document-artwork.png')}
                resizeMode="contain"
                accessible={false}
                style={{ width: 40, height: 40 }}
              />
            </View>
            <AppText
              numberOfLines={1}
              style={[styles.title, { color: colors.text.primary }]}
            >
              {document.title}
              {document.localId === sourceDocumentId ? ' · источник' : ''}
            </AppText>
            <AppText
              numberOfLines={1}
              style={[styles.date, { color: colors.text.secondary }]}
            >
              {new Intl.DateTimeFormat('ru-RU', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }).format(new Date(document.documentDate))}
            </AppText>
            <Svg width={10} height={18} viewBox="0 0 10 18">
              <Path
                d="m2 3 6 6-6 6"
                fill="none"
                stroke={colors.text.secondary}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        ))}
        {!documents.length ? (
          <View style={styles.empty}>
            <DocumentIcon color={colors.text.secondary} />
            <AppText color={colors.text.secondary}>
              Документы пока не добавлены
            </AppText>
          </View>
        ) : null}
      </View>
      {selected ? (
        <DocumentReview
          key={selected.localId}
          document={selected}
          onClose={() => setSelected(undefined)}
        />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: 24 },
  add: {
    minHeight: 56,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  addLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  list: { gap: 10 },
  count: { fontSize: 12, lineHeight: 18, letterSpacing: 0.4, marginLeft: 14 },
  row: {
    minHeight: 60,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 16, lineHeight: 22 },
  date: { maxWidth: 116, fontSize: 13, lineHeight: 20, flexShrink: 0 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 14 },
});
