import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '../design-system';
import type { HealthDocument } from '../lib/health-types';
import { DocumentReview } from './DocumentReview';

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
  const [selected, setSelected] = useState<HealthDocument>();
  const [deleting, setDeleting] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      setDeleting(undefined);
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
  const buttonStyle = {
    minHeight: 48,
    justifyContent: 'center' as const,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F9E5ED',
  };
  return (
    <View style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        disabled={readOnly || busy}
        style={buttonStyle}
        onPress={() => void perform(onAdd)}
      >
        <AppText>Добавить документ</AppText>
      </Pressable>
      <AppText>
        PDF, JPEG, PNG · до 20 МБ и 20 страниц. Исходники хранятся только на
        устройстве.
      </AppText>
      {error ? (
        <View accessibilityRole="alert">
          <AppText>{error}</AppText>
        </View>
      ) : null}
      {!documents.length && <AppText>Документы пока не добавлены</AppText>}
      {sourceDocumentId && (
        <AppText>Документ-источник ответа показан первым.</AppText>
      )}
      {documents.map((document) => (
        <View
          key={document.localId}
          style={{
            gap: 8,
            padding: 12,
            borderRadius: 14,
            backgroundColor: '#FFFFFF',
          }}
        >
          <Pressable
            accessibilityRole="button"
            disabled={readOnly || busy}
            style={{ minHeight: 48, justifyContent: 'center' }}
            onPress={() => setSelected(document)}
          >
            <AppText>
              {document.title}
              {document.localId === sourceDocumentId ? ' · источник' : ''}
            </AppText>
            <AppText>
              {new Date(document.documentDate).toLocaleDateString('ru-RU')} ·
              открыть и проверить
            </AppText>
          </Pressable>
          {deleting === document.localId ? (
            <View style={{ gap: 8 }}>
              <AppText>
                Удалить локальный документ? Связанные результаты сохранятся без
                исходного файла.
              </AppText>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={buttonStyle}
                onPress={() => void perform(() => onDelete(document))}
              >
                <AppText>Подтверждаю удаление документа</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={buttonStyle}
                onPress={() => setDeleting(undefined)}
              >
                <AppText>Отмена</AppText>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={readOnly || busy}
              style={buttonStyle}
              onPress={() => setDeleting(document.localId)}
            >
              <AppText>Удалить документ</AppText>
            </Pressable>
          )}
        </View>
      ))}
      {selected && (
        <DocumentReview
          key={selected.localId}
          document={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </View>
  );
}
