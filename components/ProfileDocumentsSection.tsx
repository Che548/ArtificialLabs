import { useDocumentOcr } from '../lib/document-ocr-manager';
import { OCR_CONSENT } from '../shared/document-ocr';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  AppText,
  ProfileActionRow,
  ProfileEmptyMessage,
  ProfileSettingsGroup,
  ProfileSettingsRow,
  profileTones,
  spacing,
} from '../design-system';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '../lib/theme';
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
  const ocr = useDocumentOcr();
  const { colors } = useAppTheme();
  const [consentOpen, setConsentOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = documents.find(
    (document) => document.localId === selectedId && !document.deletedAt,
  );
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
  const deletingDocument = documents.find(
    (document) => document.localId === deleting,
  );
  const statusText = (document: HealthDocument) => {
    const draft = ocr.drafts[document.localId];
    switch (draft?.state) {
      case 'queued':
        return 'Ожидает распознавания';
      case 'recognizing':
        return `Распознаётся · страниц готово: ${draft.pages.length} из ${draft.job?.pageCount ?? '…'}`;
      case 'error':
        return 'Нужно повторить распознавание';
      case 'cancelled':
        return 'Распознавание остановлено · можно продолжить';
      case 'review':
        return 'Распознано · требуется проверка';
      default:
        return undefined;
    }
  };
  return (
    <View
      style={{ position: 'relative', minHeight: 0, flex: 1, gap: spacing.lg }}
    >
      {/* Restore the Documents composition from da8c3ba/74b18c1. */}
      <ProfileActionRow
        icon="doc.badge.plus"
        label="Добавить документ"
        pill
        disabled={readOnly || busy}
        onPress={() => void perform(onAdd)}
      />
      {documents.length ? (
        <ProfileSettingsGroup
          title={
            sourceDocumentId
              ? 'Источник ответа чата'
              : `Сохранено: ${documents.length}`
          }
        >
          {documents.map((document, index) => (
            <ProfileSettingsRow
              key={document.localId}
              icon="doc.text.fill"
              fallback="Д"
              iconBackground={profileTones.health.tile}
              label={document.title}
              value={`${new Date(document.documentDate).toLocaleDateString('ru-RU')}${document.localId === sourceDocumentId ? ' · источник' : ''}`}
              subtitle={statusText(document)}
              isLast={index === documents.length - 1}
              disabled={readOnly || busy}
              onPress={() => setSelectedId(document.localId)}
              trailing={
                !readOnly && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Удалить документ"
                    disabled={busy}
                    onPress={(event) => {
                      event.stopPropagation();
                      setDeleting(document.localId);
                    }}
                    style={{
                      width: 44,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={colors.text.secondary}
                      strokeWidth={1.5}
                    >
                      <Path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
                    </Svg>
                  </Pressable>
                )
              }
            />
          ))}
        </ProfileSettingsGroup>
      ) : (
        <ProfileEmptyMessage
          icon="documents"
          title="Документы пока не добавлены"
        />
      )}
      {deletingDocument && (
        <ProfileSettingsGroup title={deletingDocument.title}>
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <AppText>
              Удалить локальный документ? Связанные результаты сохранятся без
              исходного файла.
            </AppText>
            <ProfileActionRow
              icon="trash"
              destructive
              label="Подтверждаю удаление документа"
              disabled={busy}
              onPress={() =>
                void perform(async () => {
                  await ocr.cancel(deletingDocument.localId);
                  await onDelete(deletingDocument);
                })
              }
            />
            <ProfileActionRow
              secondary
              label="Отмена"
              disabled={busy}
              onPress={() => setDeleting(undefined)}
            />
          </View>
        </ProfileSettingsGroup>
      )}
      <ProfileSettingsGroup
        title="Распознавание"
        footer="PDF, JPEG, PNG · до 20 МБ и 20 страниц. Исходники хранятся только на устройстве."
      >
        {!readOnly ? (
          <ProfileSettingsRow
            icon="doc.text.viewfinder"
            fallback="Т"
            iconBackground={profileTones.health.tile}
            label={
              ocr.accepted
                ? 'Настройки распознавания'
                : 'Разрешить распознавание'
            }
            subtitle={
              ocr.reason ||
              'Новые документы распознаются автоматически через Yandex.'
            }
            isLast
            onPress={() => setConsentOpen(!consentOpen)}
          />
        ) : (
          <View style={{ padding: spacing.lg }}>
            <AppText>{ocr.reason}</AppText>
          </View>
        )}
        {consentOpen && (
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <AppText>{OCR_CONSENT}</AppText>
            <ProfileActionRow
              label={
                ocr.accepted
                  ? 'Отозвать согласие и остановить распознавание'
                  : 'Согласен: автоматически распознавать новые документы'
              }
              disabled={busy || (!ocr.enabled && !ocr.accepted)}
              secondary={ocr.accepted}
              onPress={() =>
                void perform(async () => {
                  await ocr.consent(!ocr.accepted);
                  setConsentOpen(false);
                })
              }
            />
            {!ocr.enabled && !ocr.accepted && (
              <View accessibilityLiveRegion="polite">
                <AppText>{ocr.reason}</AppText>
                <AppText>
                  Согласие можно будет подтвердить, когда распознавание станет
                  доступно. Документы можно добавлять и хранить на устройстве
                  уже сейчас.
                </AppText>
              </View>
            )}
          </View>
        )}
      </ProfileSettingsGroup>
      {error ? (
        <View accessibilityRole="alert">
          <AppText>{error}</AppText>
        </View>
      ) : null}
      {selected && (
        <DocumentReview
          key={selected.localId}
          document={selected}
          onClose={() => setSelectedId(undefined)}
        />
      )}
    </View>
  );
}
