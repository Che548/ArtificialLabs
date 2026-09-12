import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  useAction,
  useConvexAuth,
  useMutation,
  useQueries,
} from 'convex/react';
import type { RequestForQueries } from 'convex/react';
import { AppText } from '../design-system';
import { api } from '../convex/_generated/api';
import { useHealthStore } from '../lib/health-store';
import type { HealthDocument } from '../lib/health-types';
import { newLocalId } from '../lib/health-types';
import {
  loadLocalDocumentExtraction,
  saveLocalDocumentExtraction,
} from '../lib/local-database';
import { recognizeLocalDocument } from '../lib/document-recognition';
import { createLocalDocumentEngine } from '../modules/document-ocr';
import {
  extractDocumentAnalyteCandidates,
  prepareDocumentInterpretation,
  type DocumentExtraction,
} from '../shared/document-policy';
import {
  DOCUMENT_INTERPRETATION_CONSENT,
  DOCUMENT_INTERPRETATION_POLICY_VERSION,
} from '../shared/document-interpretation';

function documentError(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  const errors: Record<string, string> = {
    DOCUMENT_NATIVE_BUILD_REQUIRED:
      'Для распознавания нужна новая нативная сборка приложения.',
    DOCUMENT_ENGINE_UNAVAILABLE:
      'Локальный движок или языковые модели недоступны. Проверьте установку полной нативной сборки.',
    DOCUMENT_RECOGNITION_FAILED:
      'Не удалось распознать страницу. Проверьте качество оригинала и попробуйте ещё раз.',
    DOCUMENT_BUSY: 'Другой документ ещё обрабатывается. Дождитесь завершения.',
    DOCUMENT_PASSWORD:
      'PDF защищён паролем. Сохраните незашифрованную копию и прикрепите её.',
    DOCUMENT_UNSUPPORTED: 'Поддерживаются только PDF, JPEG и PNG.',
    DOCUMENT_SIZE: 'Размер документа должен быть от 1 байта до 20 МБ.',
    DOCUMENT_PAGES: 'В документе должно быть не больше 20 страниц.',
    DOCUMENT_CORRUPT:
      'Не удалось прочитать документ. Попробуйте другую копию файла.',
    DOCUMENT_TEXT_SIZE:
      'В документе слишком много текста. Разделите его на части.',
    DOCUMENT_SELECTION_SIZE:
      'Выберите от 1 до 24 000 символов подтверждённого текста.',
    DOCUMENT_SELECTION_NOT_CONFIRMED:
      'Выбранный текст должен точно совпадать с проверенным фрагментом.',
    DOCUMENT_REVIEW_REQUIRED:
      'Сначала проверьте и подтвердите распознанные данные.',
    DOCUMENT_EXTRACTION_INVALID:
      'Проверьте текст, дату и каждую строку показателей.',
    DOCUMENT_ALREADY_SUBMITTED:
      'Этот запрос уже отправлен. Повторно он не отправлялся; текст сохранён.',
    DOCUMENT_RATE_LIMITED:
      'Лимит запросов временно исчерпан. Попробуйте позже.',
    DOCUMENT_SERVICE_DISABLED:
      'Интерпретация пока выключена на сервере. Локальное распознавание доступно.',
    DOCUMENT_CONSENT_REQUIRED:
      'Нужно отдельное согласие на интерпретацию документа.',
  };
  const key = Object.keys(errors).find((key) => text.includes(key));
  return key
    ? errors[key]
    : 'Не удалось выполнить действие. Черновик сохранён на экране; попробуйте ещё раз.';
}
function dateText(value?: number) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day, 12).getTime();
  return dateText(result) === value && result <= Date.now() + 86_400_000
    ? result
    : undefined;
}
function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.45 }]}
    >
      <AppText>{label}</AppText>
    </Pressable>
  );
}

export function DocumentReview({
  document,
  onClose,
}: {
  document: HealthDocument;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const { readOnly, cloudSyncEnabled, confirmDocumentExtraction } =
    useHealthStore();
  const [draft, setDraft] = useState<DocumentExtraction>();
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [original, setOriginal] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [repeat, setRepeat] = useState(false);
  const [selection, setSelection] = useState('');
  const [sendPreview, setSendPreview] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [reply, setReply] = useState('');
  const lock = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const previewEngine = useRef<
    ReturnType<typeof createLocalDocumentEngine> | undefined
  >(undefined);
  const queries = useMemo((): RequestForQueries => {
    if (readOnly || !isAuthenticated || !cloudSyncEnabled) return {};
    return { status: { query: api.documentInterpretation.status, args: {} } };
  }, [readOnly, isAuthenticated, cloudSyncEnabled]);
  const statusValue = useQueries(queries).status;
  const status = statusValue instanceof Error ? undefined : statusValue;
  const acceptConsent = useMutation(api.documentInterpretation.setConsent);
  const interpret = useAction(api.documentInterpretation.generate);

  useEffect(() => {
    if (readOnly || Platform.OS === 'web') return;
    let active = true;
    void loadLocalDocumentExtraction(document.localId)
      .then((value) => {
        if (!active || !value) return;
        const restored =
          value.state === 'recognizing'
            ? { ...value, state: 'cancelled' as const }
            : value;
        setDraft(restored);
        setDate(dateText(restored.collectedAt));
        setRotation(restored.rotationDegrees ?? 0);
      })
      .catch((cause) => {
        if (active) setError(documentError(cause));
      });
    return () => {
      active = false;
      abort.current?.abort();
      void previewEngine.current?.cleanup();
    };
  }, [document.localId, readOnly]);

  const edit = (change: Partial<DocumentExtraction>) => {
    if (!draft || busy) return;
    setDraft({
      ...draft,
      ...change,
      analytes:
        change.editedText !== undefined
          ? draft.analytes?.map((row) => ({ ...row, reviewed: false }))
          : (change.analytes ?? draft.analytes),
      state: 'review',
      confirmedAt: undefined,
      updatedAt: Date.now(),
    });
    setSendPreview(false);
    setReply('');
    requestId.current = undefined;
  };
  const showPage = async (next: number, orientation = rotation) => {
    if (!document.localFileUri || lock.current) return;
    lock.current = true;
    setError('');
    try {
      await previewEngine.current?.cleanup();
      previewEngine.current = undefined;
      const engine = createLocalDocumentEngine(orientation);
      previewEngine.current = engine;
      const metadata = await engine.inspect(document.localFileUri);
      setPageCount(metadata.pages);
      setOriginal(await engine.preview(document.localFileUri, next));
      setPage(next);
    } catch (cause) {
      setError(documentError(cause));
    } finally {
      lock.current = false;
    }
  };
  const recognize = async () => {
    if (!document.localFileUri || lock.current) return;
    if (draft && !repeat) {
      setRepeat(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setOriginal(undefined);
    setRepeat(false);
    abort.current = new AbortController();
    try {
      await previewEngine.current?.cleanup();
      previewEngine.current = undefined;
      const result = await recognizeLocalDocument({
        documentLocalId: document.localId,
        uri: document.localFileUri,
        engine: createLocalDocumentEngine(rotation),
        signal: abort.current.signal,
        save: async (value) => {
          const oriented = { ...value, rotationDegrees: rotation };
          await saveLocalDocumentExtraction(oriented);
          setDraft(oriented);
        },
        onProgress: (completed, total) =>
          setProgress(`Страницы: ${completed} из ${total}`),
      });
      const enriched = {
        ...result,
        rotationDegrees: rotation,
        analytes: extractDocumentAnalyteCandidates(result.editedText),
      };
      await saveLocalDocumentExtraction(enriched);
      setDraft(enriched);
      setDate('');
      setPageCount(result.pages.length);
      setNotice(result.editedText.trim()
        ? 'Распознавание завершено. Сверьте текст и каждую строку с оригиналом. Точность не гарантируется.'
        : 'Текст не распознан. Проверьте качество и поворот оригинала или внесите данные вручную.');
    } catch (cause) {
      setError(
        abort.current.signal.aborted
          ? 'Распознавание отменено. Частичный черновик сохранён.'
          : documentError(cause),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const save = async (confirmed: boolean) => {
    if (!draft || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const collectedAt = parseDate(date);
      const value: DocumentExtraction = {
        ...draft,
        collectedAt,
        state: confirmed ? 'confirmed' : 'review',
        confirmedAt: confirmed ? Date.now() : undefined,
        updatedAt: Date.now(),
      };
      if (confirmed) await confirmDocumentExtraction(value);
      else await saveLocalDocumentExtraction(value);
      setDraft(value);
      setNotice(
        confirmed
          ? 'Перенос данных подтверждён. Показатели сохранены без изменения плана и медицинской оценки.'
          : 'Черновик сохранён только на этом устройстве.',
      );
    } catch (cause) {
      setError(documentError(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const close = async (after?: () => void) => {
    if (lock.current) return;
    lock.current = true;
    try {
      if (draft)
        await saveLocalDocumentExtraction({
          ...draft,
          collectedAt: parseDate(date),
          updatedAt: Date.now(),
        });
      await previewEngine.current?.cleanup();
      previewEngine.current = undefined;
      onClose();
      after?.();
    } catch (cause) {
      setError(documentError(cause));
    } finally {
      lock.current = false;
    }
  };
  const send = async () => {
    if (!draft || lock.current || !consentChecked || !status?.enabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const payload = prepareDocumentInterpretation(draft, selection);
      requestId.current ??= newLocalId('document-request');
      await acceptConsent({
        policyVersion: DOCUMENT_INTERPRETATION_POLICY_VERSION,
        accepted: true,
      });
      const result = await interpret({
        ...payload,
        requestId: requestId.current,
        policyVersion: DOCUMENT_INTERPRETATION_POLICY_VERSION,
      });
      if (!result.ok) throw new Error(result.code ?? 'DOCUMENT_SERVER_ERROR');
      setReply(result.reply ?? '');
      setSendPreview(false);
    } catch (cause) {
      setError(documentError(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const interpretationReason = !isAuthenticated
    ? 'Для интерпретации войдите в аккаунт.'
    : !cloudSyncEnabled
      ? 'Для интерпретации включите облачную синхронизацию в Профиле → Разрешения. Она не включится автоматически.'
      : statusValue instanceof Error
        ? 'Не удалось получить состояние сервиса. Локальные данные доступны.'
        : !status
          ? 'Проверяем доступность интерпретации…'
          : !status.enabled
            ? 'Интерпретация пока выключена на сервере.'
            : '';

  return (
    <Modal visible animationType="slide" onRequestClose={() => void close()}>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <Button
            label="Закрыть документ"
            disabled={busy}
            onPress={() => void close()}
          />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            padding: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 30,
            gap: 12,
          }}
        >
          <AppText style={styles.title}>{document.title}</AppText>
          {readOnly || Platform.OS === 'web' ? (
            <AppText>
              Документы доступны только в приложении на устройстве.
            </AppText>
          ) : (
            <>
              <AppText>
                PDF, JPEG или PNG · до 20 МБ и 20 страниц. Файл и OCR-черновик
                остаются на устройстве.
              </AppText>
              {!document.localFileUri ? (
                <AppText>
                  Исходного файла нет на этом устройстве. Он не загружается из
                  облака.
                </AppText>
              ) : (
                <>
                  <Button
                    label={
                      repeat
                        ? 'Подтверждаю: заново распознать и заменить черновик'
                        : 'Распознать на устройстве'
                    }
                    disabled={busy}
                    onPress={() => void recognize()}
                  />
                  {repeat && (
                    <AppText>
                      Сохранённые результаты не будут удалены. Заменится только
                      черновик распознавания.
                    </AppText>
                  )}
                  <Button
                    label="Показать оригинал"
                    disabled={busy}
                    onPress={() => void showPage(page)}
                  />
                  <Button
                    label={`Повернуть перед распознаванием на 90° (сейчас ${rotation}°)`}
                    disabled={busy}
                    onPress={() => {
                      if (lock.current) return;
                      const next = ((rotation + 90) % 360) as
                        0 | 90 | 180 | 270;
                      setRotation(next);
                      void showPage(page, next);
                    }}
                  />
                </>
              )}
              {busy && (
                <View>
                  <ActivityIndicator />
                  <AppText>{progress || 'Обрабатываем…'}</AppText>
                  {draft?.state === 'recognizing' && (
                    <Button
                      label="Отменить распознавание"
                      onPress={() => abort.current?.abort()}
                    />
                  )}
                </View>
              )}
              {error ? (
                <View accessibilityRole="alert">
                  <AppText style={styles.error}>{error}</AppText>
                </View>
              ) : null}
              {notice ? (
                <View accessibilityLiveRegion="polite">
                  <AppText>{notice}</AppText>
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: width >= 700 ? 'row' : 'column',
                  gap: 16,
                }}
              >
                {original && (
                  <View style={{ flex: 1 }}>
                    <Image
                      source={{ uri: original }}
                      resizeMode="contain"
                      style={{ width: '100%', height: 350 }}
                      accessibilityLabel={`Оригинал, страница ${page}`}
                    />
                    <View style={styles.row}>
                      <Button
                        label="Предыдущая страница"
                        disabled={busy || page <= 1}
                        onPress={() => void showPage(page - 1)}
                      />
                      <Button
                        label="Следующая страница"
                    disabled={busy || page >= pageCount}
                        onPress={() => void showPage(page + 1)}
                      />
                    </View>
                  </View>
                )}
                {draft && (
                  <View style={{ flex: 1, gap: 10 }}>
                    <AppText>Извлечённый текст — проверьте и исправьте</AppText>
                    <TextInput
                      accessibilityLabel="Проверяемый текст документа"
                      value={draft.editedText}
                      onChangeText={(editedText) => edit({ editedText })}
                      multiline
                      scrollEnabled={false}
                      editable={!busy}
                      maxLength={200000}
                      style={[
                        styles.input,
                        { minHeight: 220, textAlignVertical: 'top' },
                      ]}
                    />
                    <AppText>
                      Дата анализа (ГГГГ-ММ-ДД). Неизвестную дату не
                      подставляем.
                    </AppText>
                    <TextInput
                      accessibilityLabel="Дата анализа"
                      value={date}
                      onChangeText={(value) => {
                        setDate(value);
                        edit({ collectedAt: undefined });
                      }}
                      editable={!busy}
                      placeholder="ГГГГ-ММ-ДД"
                      style={styles.input}
                    />
                    {(draft.analytes ?? []).map((item, index) => (
                      <View key={index} style={styles.card}>
                        {(['name', 'value', 'unit', 'reference'] as const).map(
                          (field, fieldIndex) => (
                            <TextInput
                              key={field}
                              accessibilityLabel={`${['Показатель', 'Значение', 'Единицы', 'Референсы'][fieldIndex]} ${index + 1}`}
                              placeholder={
                                [
                                  'Показатель',
                                  'Значение',
                                  'Единицы',
                                  'Референсы',
                                ][fieldIndex]
                              }
                              value={item[field]}
                              editable={!busy}
                              style={styles.input}
                              onChangeText={(value) =>
                                edit({
                                  analytes: draft.analytes!.map((row, at) =>
                                    at === index
                                      ? {
                                          ...row,
                                          [field]: value,
                                          reviewed: false,
                                        }
                                      : row,
                                  ),
                                })
                              }
                              maxLength={300}
                            />
                          ),
                        )}
                        <Button
                          label={
                            item.reviewed
                              ? '✓ Строка сверена с оригиналом'
                              : 'Подтвердить эту строку'
                          }
                          disabled={busy}
                          onPress={() =>
                            edit({
                              analytes: draft.analytes!.map((row, at) =>
                                at === index
                                  ? { ...row, reviewed: !row.reviewed }
                                  : row,
                              ),
                            })
                          }
                        />
                        <Button
                          label="Убрать строку из черновика"
                          disabled={busy}
                          onPress={() =>
                            edit({
                              analytes: draft.analytes!.filter(
                                (_, at) => at !== index,
                              ),
                            })
                          }
                        />
                      </View>
                    ))}
                    <Button
                      label="Добавить показатель вручную"
                      disabled={busy || (draft.analytes?.length ?? 0) >= 100}
                      onPress={() =>
                        edit({
                          analytes: [
                            ...(draft.analytes ?? []),
                            {
                              name: '',
                              value: '',
                              unit: '',
                              reference: '',
                              reviewed: false,
                            },
                          ],
                        })
                      }
                    />
                    <Button
                      label="Сохранить черновик"
                      disabled={busy}
                      onPress={() => void save(false)}
                    />
                    <Button
                      label="Подтвердить проверенные данные"
                      disabled={busy || !draft.editedText.trim()}
                      onPress={() => void save(true)}
                    />
                  </View>
                )}
              </View>
              {draft?.state === 'confirmed' && (
                <View style={styles.card}>
                  <AppText style={styles.title}>
                    Отдельная интерпретация
                  </AppText>
                  <AppText>
                    Вставьте только нужный фрагмент проверенного текста. По
                    умолчанию ничего не выбрано.
                  </AppText>
                  <TextInput
                    accessibilityLabel="Выбранный текст для интерпретации"
                    value={selection}
                    onChangeText={(value) => {
                      setSelection(value);
                      setSendPreview(false);
                      requestId.current = undefined;
                    }}
                    editable={!busy}
                    multiline
                    maxLength={24000}
                    style={[styles.input, { minHeight: 100 }]}
                  />
                  {interpretationReason ? (
                    <AppText>{interpretationReason}</AppText>
                  ) : null}
                  {!cloudSyncEnabled && (
                    <Button
                      label="Открыть настройку синхронизации"
                      disabled={busy}
                      onPress={() =>
                        void close(() =>
                          router.push({
                            pathname: '/profile',
                            params: { section: 'permissions' },
                          }),
                        )
                      }
                    />
                  )}
                  {status?.accepted && (
                    <Button
                      label="Отозвать согласие на интерпретацию"
                      disabled={busy}
                      onPress={() => {
                        if (lock.current) return;
                        lock.current = true;
                        setBusy(true);
                        void acceptConsent({
                          policyVersion: DOCUMENT_INTERPRETATION_POLICY_VERSION,
                          accepted: false,
                        })
                          .then(() => {
                            setConsentChecked(false);
                            setSendPreview(false);
                            setNotice(
                              'Согласие отозвано. Новые запросы не отправляются.',
                            );
                          })
                          .catch((cause) => setError(documentError(cause)))
                          .finally(() => {
                            lock.current = false;
                            setBusy(false);
                          });
                      }}
                    />
                  )}
                  <Button
                    label="Предпросмотр отправки"
                    disabled={busy || Boolean(interpretationReason)}
                    onPress={() => {
                      try {
                        prepareDocumentInterpretation(draft, selection);
                        setSendPreview(true);
                        setConsentChecked(false);
                      } catch (cause) {
                        setError(documentError(cause));
                      }
                    }}
                  />
                  {sendPreview && (
                    <View style={styles.card}>
                      <AppText>
                        Будет передан только этот текст (
                        {selection.trim().length} символов):
                      </AppText>
                      <Text selectable style={{ fontSize: 16, lineHeight: 24 }}>
                        {selection.trim()}
                      </Text>
                      <AppText>{DOCUMENT_INTERPRETATION_CONSENT}</AppText>
                      <Button
                        label={
                          consentChecked
                            ? '✓ Согласие подтверждено'
                            : 'Согласен на передачу выбранного текста'
                        }
                        disabled={busy}
                        onPress={() => setConsentChecked(!consentChecked)}
                      />
                      <Button
                        label="Отправить выбранный текст"
                        disabled={busy || !consentChecked}
                        onPress={() => void send()}
                      />
                      <Button
                        label="Отказаться — не отправлять"
                        disabled={busy}
                        onPress={() => {
                          setSendPreview(false);
                          setConsentChecked(false);
                        }}
                      />
                    </View>
                  )}
                  {reply ? (
                    <View style={styles.card}>
                      <AppText style={styles.title}>
                        Объяснение выбранного фрагмента
                      </AppText>
                      <Text selectable style={{ fontSize: 16, lineHeight: 24 }}>
                        {reply}
                      </Text>
                      <AppText>
                        Это не диагноз и не назначение. Данные и план не
                        изменены.
                      </AppText>
                    </View>
                  ) : null}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F4' },
  title: { fontSize: 20, lineHeight: 26 },
  input: {
    borderWidth: 1,
    borderColor: '#CEC5C0',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#2C2927',
    backgroundColor: '#FFFFFF',
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F9E2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E3DAD5',
    gap: 10,
  },
  row: { gap: 8 },
  error: { color: '#9A2438' },
});
