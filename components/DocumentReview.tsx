import { useBeforeUpdateRestart } from '../lib/update-manager';
import {
  documentCollectionDates,
  documentReportBlocks,
  documentIssueLabel,
} from '../shared/document-review-model';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppSheet, useSheetStyles } from './AppSheet';
import { SymbolView } from 'expo-symbols';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { fontStyle } from '../lib/font-style';
import { useRouter } from 'expo-router';
import {
  useAction,
  useConvexAuth,
  useMutation,
  useQueries,
} from 'convex/react';
import type { RequestForQueries } from 'convex/react';
import { AppText, SegmentedSwitcher } from '../design-system';
import { useAppTheme, useThemeStyles, type ThemeColors } from '../lib/theme';
import { api } from '../convex/_generated/api';
import { useHealthStore } from '../lib/health-store';
import type { HealthDocument } from '../lib/health-types';
import { newLocalId } from '../lib/health-types';
import {
  loadLocalDocumentExtraction,
  saveLocalDocumentExtraction,
} from '../lib/local-database';
import { useDocumentOcr } from '../lib/document-ocr-manager';
import { renderDocumentPage } from '../modules/document-ocr';
import {
  prepareDocumentInterpretation,
  normalizeDocumentDate,
  type DocumentExtraction,
} from '../shared/document-policy';
import {
  DOCUMENT_INTERPRETATION_CONSENT,
  DOCUMENT_INTERPRETATION_POLICY_VERSION,
} from '../shared/document-interpretation';

function documentError(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  const errors: Record<string, string> = {
    DOCUMENT_DATE_MISMATCH:
      'Выберите строки только для указанной даты анализа. Исправьте дату строки, если она распознана неверно.',
    OCR_UNCERTAIN:
      'Ответ на отправленную страницу не получен. Проверьте подключение и явно повторите страницу.',
    OCR_CONFIGURATION:
      'Модель распознавания недоступна. Документ сохранён; попробуйте позже.',
    OCR_INVALID_OUTPUT:
      'Не удалось получить полный достоверный формат ответа. Страница не добавлена; повторите распознавание.',
    OCR_PROVIDER_UNAVAILABLE:
      'Yandex не ответил. Выполненные страницы сохранены. Повторите текущую страницу.',
    OCR_SERVICE_DISABLED: 'Распознавание выключено на сервере.',
    OCR_CLOUD_SYNC_REQUIRED:
      'Для распознавания включите облачную синхронизацию.',
    OCR_CONSENT_REQUIRED:
      'Разрешите распознавание в настройках раздела «Документы».',
    OCR_RATE_LIMITED: 'Лимит распознавания исчерпан. Повторите позже.',
    OCR_ALREADY_SUBMITTED:
      'Этот запрос уже отправлен. Нужна явная повторная попытка.',
    OCR_PAGE_ATTEMPTS_EXHAUSTED:
      'Достигнут лимит попыток страницы. Начните новое распознавание позже.',
    OCR_IMAGE_SIZE:
      'Страница слишком велика. Разделите или уменьшите исходный файл.',

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
      'Интерпретация пока выключена на сервере. Проверенный текст сохранён на устройстве.',
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
  accessibilityLabel,
  onPress,
  disabled = false,
  variant = 'secondary',
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet';
}) {
  const styles = useThemeStyles(createStyles);
  const sheet = useSheetStyles();
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        variant === 'primary' ? sheet.primary : sheet.secondary,
        styles.button,
        variant === 'quiet' && styles.quietButton,
        disabled && { opacity: 0.45 },
        pressed && styles.pressed,
      ]}
    >
      <AppText
        weight="medium"
        color={
          variant === 'primary' ? colors.text.inverse : colors.text.primary
        }
        style={styles.buttonLabel}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

type ReviewTab = 'results' | 'original' | 'text';

export function DocumentReview({
  document,
  onClose,
}: {
  document: HealthDocument;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const styles = useThemeStyles(createStyles);
  const { colors } = useAppTheme();
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const afterClose = useRef<(() => void) | undefined>(undefined);
  const { isAuthenticated } = useConvexAuth();
  const { readOnly, cloudSyncEnabled, confirmDocumentExtraction } =
    useHealthStore();
  const ocr = useDocumentOcr();
  const [draft, setDraft] = useState<DocumentExtraction>();
  const [tab, setTab] = useState<ReviewTab>('results');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number>();
  const [interpretationOpen, setInterpretationOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<
    'saved' | 'saving' | 'error'
  >('saved');
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const scroll = useRef<ScrollView>(null);
  const tabOffsets = useRef<Record<ReviewTab, number>>({
    results: 0,
    original: 0,
    text: 0,
  });
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({ y: tabOffsets.current[tab], animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  const [date, setDate] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
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
  const receivedLiveDraft = useRef(false);
  useBeforeUpdateRestart(async () => {
    if (busy || lock.current) throw new Error('EDITOR_BUSY');
    if (draft) await saveLocalDocumentExtraction({ ...draft, collectedAt: parseDate(date) });
  });
  const requestId = useRef<string | undefined>(undefined);

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
        // The manager owns job recovery. A delayed disk read must never
        // overwrite a live page result or edits made after that result.
        if (!active || !value || receivedLiveDraft.current) return;
        const restored = value;
        setDraft(restored);
        setDate(dateText(restored.collectedAt));
        setRotation(restored.rotationDegrees ?? 0);
      })
      .catch((cause) => {
        if (active) setError(documentError(cause));
      });
    return () => {
      active = false;
    };
  }, [document.localId, readOnly]);

  const remoteDraft = ocr.drafts[document.localId];
  const recognizing =
    remoteDraft?.state === 'queued' || remoteDraft?.state === 'recognizing';
  useEffect(() => {
    if (!remoteDraft) return;
    receivedLiveDraft.current = true;
    setDraft(remoteDraft);
    setDate(dateText(remoteDraft.collectedAt));
    setRotation(remoteDraft.rotationDegrees ?? 0);
    setPageCount(
      remoteDraft.job?.pageCount ?? Math.max(1, remoteDraft.pages.length),
    );
    setProgress(
      `Страницы: ${remoteDraft.pages.length} из ${remoteDraft.job?.pageCount ?? '…'}`,
    );
  }, [remoteDraft]);
  const edit = (change: Partial<DocumentExtraction>) => {
    if (!draft || busy || recognizing) return;
    setDirty(true);
    setAutosaveState('saving');
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
  useEffect(() => {
    if (!dirty || !draft || recognizing || busy) return;
    const value = {
      ...draft,
      collectedAt: parseDate(date),
      updatedAt: Date.now(),
    };
    let active = true;
    const timer = setTimeout(() => {
      if (lock.current) return;
      const write = pendingSave.current
        .catch(() => {})
        .then(() => saveLocalDocumentExtraction(value));
      pendingSave.current = write;
      void write
        .then(() => {
          if (active) setAutosaveState('saved');
        })
        .catch(() => {
          if (active) setAutosaveState('error');
        });
    }, 500);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft, date, dirty, recognizing, busy]);

  const showPage = async (next: number, orientation = rotation) => {
    if (!document.localFileUri || lock.current || recognizing) return;
    lock.current = true;
    setError('');
    try {
      // Use the same oriented, metadata-free renderer as OCR. It releases the
      // native lease before returning, so an open preview cannot block the queue.
      const rendered = await renderDocumentPage(
        document.localFileUri,
        next,
        orientation,
      );
      setPageCount(rendered.pages);
      setOriginal(`data:image/jpeg;base64,${rendered.image}`);
      setPage(next);
    } catch (cause) {
      setError(documentError(cause));
    } finally {
      lock.current = false;
    }
  };
  const recognize = async () => {
    if (!document.localFileUri || lock.current || recognizing) return;
    const restart = draft?.job?.errorCode === 'OCR_PAGE_ATTEMPTS_EXHAUSTED';
    const replace =
      restart ||
      (draft && !['error', 'cancelled', 'queued'].includes(draft.state));
    if (replace && !repeat) {
      setRepeat(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setRepeat(false);
    try {
      await ocr.enqueue(document.localId, rotation, restart);
      setNotice(
        'Документ ожидает распознавания через Yandex. Этот экран можно закрыть.',
      );
    } catch (cause) {
      setError(documentError(cause));
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
      await pendingSave.current.catch(() => {});
      const collectedAt = parseDate(date);
      const value: DocumentExtraction = {
        ...draft,
        analytes: confirmed
          ? draft.analytes?.map((row) => ({
              ...row,
              selected: row.selected !== false && row.reviewed,
            }))
          : draft.analytes,
        collectedAt,
        state: confirmed ? 'confirmed' : 'review',
        confirmedAt: confirmed ? Date.now() : undefined,
        updatedAt: Date.now(),
      };
      if (confirmed) await confirmDocumentExtraction(value);
      else await saveLocalDocumentExtraction(value);
      setDirty(false);
      setAutosaveState('saved');
      setDraft(value);
      if (confirmed) {
        setTab('results');
        scroll.current?.scrollTo({ y: 0, animated: false });
      }
      ocr.edited(value);
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
      await pendingSave.current.catch(() => {});
      if (draft && !recognizing)
        await saveLocalDocumentExtraction({
          ...draft,
          collectedAt: parseDate(date),
          updatedAt: Date.now(),
        });
      if (draft && !recognizing)
        ocr.edited({ ...draft, collectedAt: parseDate(date) });
      afterClose.current = after;
      setVisible(false);
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

  const rows = draft?.analytes ?? [];
  const selectedRows = rows.filter(
    (row) => row.selected !== false && row.reviewed,
  );
  const collectionDate = parseDate(date);
  const dateCandidates = documentCollectionDates(draft);
  const structured = draft?.pages.some((p) => Boolean(p.structure));
  const reportBlocks = documentReportBlocks(draft);
  const conclusions = reportBlocks.filter((b) => b.kind === 'conclusion');
  const otherBlocks = reportBlocks.filter((b) => b.kind !== 'conclusion');
  const wrongDate = (printed?: string) =>
    Boolean(
      printed &&
      collectionDate &&
      normalizeDocumentDate(printed) &&
      normalizeDocumentDate(printed) !== date,
    );
  const canConfirm =
    !busy &&
    !recognizing &&
    !!draft?.editedText.trim() &&
    !!collectionDate &&
    selectedRows.length > 0 &&
    selectedRows.every(
      (row) => row.name.trim() && row.value.trim() && !wrongDate(row.date),
    );
  const chooseDate = (value: string) => {
    setDate(value);
    edit({
      collectedAt: undefined,
      analytes: rows.map((row) => {
        const printed = normalizeDocumentDate(row.date ?? '');
        return printed && printed !== value ? { ...row, selected: false } : row;
      }),
    });
  };
  const pickDate = () => {
    const initial = new Date(collectionDate ?? Date.now());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        maximumDate: new Date(),
        onChange: (event, selected) => {
          if (event.type === 'set' && selected)
            chooseDate(dateText(selected.getTime()));
        },
      });
    } else {
      setPickerDate(initial);
      setDatePickerOpen(true);
    }
  };
  const saved = draft?.state === 'confirmed';
  const dateLabel = collectionDate
    ? new Date(collectionDate).toLocaleDateString('ru-RU')
    : '';
  const changeTab = (next: ReviewTab) => {
    setTab(next);
    if (next === 'original' && !original) void showPage(page);
  };
  const sourcePage = (next: number) => {
    setTab('original');
    void showPage(next);
  };
  const retryButton = (
    <Button
      variant={draft?.pages.length ? 'secondary' : 'primary'}
      label={
        repeat
          ? 'Заменить черновик и распознать заново'
          : draft?.state === 'error' || draft?.state === 'cancelled'
            ? 'Продолжить распознавание'
            : 'Распознать документ'
      }
      disabled={
        busy ||
        recognizing ||
        !ocr.enabled ||
        !ocr.accepted ||
        !document.localFileUri
      }
      onPress={() => void recognize()}
    />
  );
  return (
    <AppSheet
      visible={visible}
      title="Анализ"
      scroll={false}
      onClose={() => void close()}
      dismissDisabled={busy}
      onClosed={() => {
        onClose();
        afterClose.current?.();
      }}
      footer={
        !readOnly ? (
          <View style={styles.footer}>
            {saved ? (
              <Button
                label="Готово"
                variant="primary"
                onPress={() => void close()}
              />
            ) : recognizing ? (
              <>
                <AppText role="caption" color={colors.text.secondary}>
                  Можно закрыть экран. Распознавание продолжится, пока
                  приложение активно.
                </AppText>
                <Button label="Закрыть" onPress={() => void close()} />
              </>
            ) : tab === 'text' &&
              draft?.editedText.trim() &&
              selectedRows.length === 0 ? (
              <Button
                label="Подтвердить только текст"
                variant="primary"
                disabled={busy}
                onPress={() => void save(true)}
              />
            ) : draft && rows.length > 0 ? (
              <>
                <AppText role="caption" color={colors.text.secondary}>
                  {!collectionDate
                    ? 'Укажите дату сдачи анализа'
                    : selectedRows.length === 0
                      ? 'Отметьте проверенные показатели'
                      : `Будет сохранено: ${selectedRows.length} · дата анализа: ${dateLabel}`}
                </AppText>
                <Button
                  label={
                    selectedRows.length
                      ? `Сохранить показатели (${selectedRows.length})`
                      : 'Выберите показатели'
                  }
                  variant="primary"
                  disabled={!canConfirm}
                  onPress={() => void save(true)}
                />
                <AppText
                  role="caption"
                  color={
                    autosaveState === 'error'
                      ? colors.state.error
                      : colors.text.secondary
                  }
                >
                  {autosaveState === 'error'
                    ? 'Не удалось сохранить черновик. Повторите попытку.'
                    : autosaveState === 'saving'
                      ? 'Сохраняем черновик…'
                      : 'Черновик сохраняется на устройстве'}
                </AppText>
                {autosaveState === 'error' && (
                  <Button
                    label="Повторить сохранение черновика"
                    onPress={() => void save(false)}
                  />
                )}
              </>
            ) : draft?.editedText.trim() ? (
              <Button
                label="Подтвердить проверенный текст"
                variant="primary"
                disabled={busy}
                onPress={() => void save(true)}
              />
            ) : undefined}
          </View>
        ) : undefined
      }
    >
      <View style={styles.page}>
        <View style={styles.tabs}>
          <SegmentedSwitcher
            accessibilityLabel="Просмотр результата"
            value={tab}
            onChange={changeTab}
            options={[
              {
                value: 'results',
                label: structured ? 'Документ' : 'Показатели',
              },
              { value: 'original', label: 'Оригинал' },
              { value: 'text', label: 'Текст' },
            ]}
          />
        </View>
        <ScrollView
          ref={scroll}
          onScroll={(event) => {
            tabOffsets.current[tab] = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={100}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <AppText
            role="caption"
            color={colors.text.secondary}
            numberOfLines={2}
          >
            {document.title}
          </AppText>
          {readOnly || Platform.OS === 'web' ? (
            <AppText>
              Документы доступны только в приложении на устройстве.
            </AppText>
          ) : (
            <>
              {autosaveState === 'error' && (
                <View accessibilityRole="alert" style={styles.card}>
                  <AppText style={styles.error}>
                    Правки пока не сохранены. Оставьте документ открытым и
                    повторите попытку.
                  </AppText>
                  <Button
                    label="Повторить сохранение"
                    onPress={() => void save(false)}
                  />
                </View>
              )}
              {error ? (
                <View accessibilityRole="alert" style={styles.card}>
                  <AppText style={styles.error}>{error}</AppText>
                </View>
              ) : null}
              {recognizing && (
                <View style={styles.card}>
                  <View style={styles.analyteHeading}>
                    <ActivityIndicator color={colors.brand.primary} />
                    <AppText weight="semibold">Распознаём документ</AppText>
                  </View>
                  <AppText role="caption" color={colors.text.secondary}>
                    {progress || 'Готовим страницы…'}
                  </AppText>
                  <Button
                    label="Отменить распознавание"
                    variant="quiet"
                    onPress={() =>
                      void ocr
                        .cancel(document.localId)
                        .catch((cause) => setError(documentError(cause)))
                    }
                  />
                </View>
              )}
              {!recognizing &&
                (draft?.state === 'error' || draft?.state === 'cancelled') && (
                  <View style={styles.card}>
                    <AppText weight="semibold">
                      Распознавание остановлено
                    </AppText>
                    <AppText>
                      {draft.job?.errorCode
                        ? documentError(new Error(draft.job.errorCode))
                        : 'Готовые страницы сохранены. Можно продолжить распознавание.'}
                    </AppText>
                    {retryButton}
                    {repeat && (
                      <AppText role="caption">
                        Заменится только черновик. Уже сохранённые показатели
                        останутся.
                      </AppText>
                    )}
                  </View>
                )}
              {tab === 'results' && (
                <>
                  {structured && (
                    <>
                      {conclusions.map((block, index) => (
                        <View key={`conclusion-${index}`} style={styles.card}>
                          <AppText role="label" weight="semibold">
                            Заключение в документе
                          </AppText>
                          {block.section ? (
                            <AppText
                              role="caption"
                              color={colors.text.secondary}
                            >
                              {block.section}
                            </AppText>
                          ) : null}
                          <AppText selectable>{block.text}</AppText>
                          <Button
                            label={`Оригинал · страница ${block.page}`}
                            variant="quiet"
                            onPress={() => sourcePage(block.page)}
                            disabled={busy || recognizing}
                          />
                        </View>
                      ))}
                      {otherBlocks.length > 0 && (
                        <View style={styles.card}>
                          <Button
                            label={
                              detailsOpen
                                ? 'Свернуть сведения документа'
                                : 'Методы, примечания и приложения'
                            }
                            variant="quiet"
                            onPress={() => setDetailsOpen(!detailsOpen)}
                          />
                          {detailsOpen &&
                            otherBlocks.map((block, index) => (
                              <View key={`block-${index}`} style={styles.field}>
                                <AppText
                                  role="caption"
                                  color={colors.text.secondary}
                                >
                                  {block.section ||
                                    {
                                      conclusion: 'Заключение',
                                      method: 'Метод',
                                      reference: 'Приложение',
                                      note: 'Примечание',
                                      heading: 'Раздел',
                                    }[block.kind]}{' '}
                                  · стр. {block.page}
                                </AppText>
                                <AppText selectable>{block.text}</AppText>
                                <Button
                                  label={`Открыть источник ${index + 1}`}
                                  variant="quiet"
                                  onPress={() => sourcePage(block.page)}
                                  disabled={busy || recognizing}
                                />
                              </View>
                            ))}
                        </View>
                      )}
                      {draft?.pages.some(
                        (p) => p.structure?.pageRole === 'cover',
                      ) && (
                        <AppText role="caption" color={colors.text.secondary}>
                          В документе есть сопроводительная страница. Ссылки на
                          приложения сохранены в примечаниях.
                        </AppText>
                      )}
                    </>
                  )}
                  {saved ? (
                    <View style={styles.card}>
                      <AppText role="title" weight="semibold">
                        {selectedRows.length
                          ? 'Показатели сохранены'
                          : 'Текст подтверждён'}
                      </AppText>
                      <AppText>
                        {selectedRows.length
                          ? `${selectedRows.length} показателей · ${dateLabel}`
                          : 'Проверенный текст остался в документе.'}
                      </AppText>
                      {rows.some((row) => row.selected === false) && (
                        <>
                          <AppText role="caption" color={colors.text.secondary}>
                            Неотмеченные показатели остались в черновике.
                          </AppText>
                          <Button
                            label="Проверить остальные"
                            onPress={() => {
                              setDate('');
                              edit({
                                collectedAt: undefined,
                                analytes: rows.map((row) => ({
                                  ...row,
                                  selected: false,
                                })),
                              });
                            }}
                          />
                        </>
                      )}
                      <Button
                        label="Объяснить результаты"
                        variant="quiet"
                        onPress={() =>
                          setInterpretationOpen(!interpretationOpen)
                        }
                      />
                    </View>
                  ) : rows.length > 0 ? (
                    <>
                      <View style={styles.card}>
                        <View style={styles.analyteHeading}>
                          <AppText
                            role="label"
                            weight="semibold"
                            style={{ flex: 1 }}
                          >
                            Дата сдачи
                          </AppText>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              dateLabel ? 'Изменить дату' : 'Выбрать дату'
                            }
                            onPress={pickDate}
                            disabled={busy || recognizing}
                            style={styles.dateButton}
                          >
                            <AppText
                              color={colors.brand.primary}
                              weight="medium"
                            >
                              {dateLabel || 'Выбрать'}
                            </AppText>
                            <SymbolView
                              name="calendar"
                              size={18}
                              tintColor={colors.brand.primary}
                              fallback={
                                <AppText color={colors.brand.primary}>
                                  ▦
                                </AppText>
                              }
                            />
                          </Pressable>
                        </View>
                        {(dateCandidates.length > 1 || !collectionDate) &&
                          dateCandidates.length > 0 && (
                            <View style={styles.dateChoices}>
                              {dateCandidates.map((value) => (
                                <Pressable
                                  key={value}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Дата анализа ${value}`}
                                  accessibilityState={{
                                    selected: date === value,
                                  }}
                                  disabled={busy || recognizing}
                                  onPress={() => chooseDate(value)}
                                  style={[
                                    styles.dateChoice,
                                    date === value && styles.dateSelected,
                                  ]}
                                >
                                  <AppText
                                    color={
                                      date === value
                                        ? colors.brand.primary
                                        : colors.text.primary
                                    }
                                  >
                                    {new Date(
                                      parseDate(value)!,
                                    ).toLocaleDateString('ru-RU')}
                                  </AppText>
                                </Pressable>
                              ))}
                            </View>
                          )}
                        {datePickerOpen && (
                          <View style={styles.field}>
                            <DateTimePicker
                              value={pickerDate}
                              mode="date"
                              display="spinner"
                              maximumDate={new Date()}
                              locale="ru-RU"
                              onChange={(_, value) => {
                                if (value) setPickerDate(value);
                              }}
                            />
                            <Button
                              label="Использовать выбранную дату"
                              onPress={() => {
                                chooseDate(dateText(pickerDate.getTime()));
                                setDatePickerOpen(false);
                              }}
                            />
                            <Button
                              label="Отмена"
                              variant="quiet"
                              onPress={() => setDatePickerOpen(false)}
                            />
                          </View>
                        )}
                        {dateCandidates.length > 1 && (
                          <AppText role="caption" color={colors.text.secondary}>
                            У показателей разные даты взятия материала.
                            Сохраняйте показатели одной даты за раз.
                          </AppText>
                        )}
                      </View>
                      <View style={styles.analyteHeading}>
                        <AppText
                          role="label"
                          weight="semibold"
                          style={{ flex: 1 }}
                        >
                          Показатели · {rows.length}
                        </AppText>
                        <AppText role="caption" color={colors.text.secondary}>
                          Проверено: {selectedRows.length}
                        </AppText>
                      </View>
                      <AppText role="caption" color={colors.text.secondary}>
                        Отметьте сверенные значения. Нажмите на строку, чтобы
                        исправить.
                      </AppText>
                      <View style={styles.resultsCard}>
                        {rows.map((item, index) => {
                          const checked =
                            item.selected !== false && item.reviewed;
                          const missing =
                            !item.name.trim() || !item.value.trim();
                          const mismatch = wrongDate(item.date);
                          const expanded = expandedRow === index;
                          return (
                            <View
                              key={index}
                              style={[
                                styles.resultRow,
                                index !== rows.length - 1 &&
                                  styles.resultDivider,
                              ]}
                            >
                              {item.section &&
                              (index === 0 ||
                                rows[index - 1].section !== item.section ||
                                rows[index - 1].sourcePage !==
                                  item.sourcePage) ? (
                                <AppText
                                  role="label"
                                  weight="semibold"
                                  style={{ marginBottom: 12 }}
                                >
                                  {item.section} · стр. {item.sourcePage}
                                </AppText>
                              ) : null}
                              <View style={styles.analyteHeading}>
                                <Pressable
                                  accessibilityRole="checkbox"
                                  aria-checked={checked}
                                  accessibilityLabel={`Проверено: ${item.name || `показатель ${index + 1}`}`}
                                  accessibilityState={{
                                    checked,
                                    disabled:
                                      busy ||
                                      recognizing ||
                                      missing ||
                                      mismatch,
                                  }}
                                  disabled={
                                    busy || recognizing || missing || mismatch
                                  }
                                  onPress={() =>
                                    edit({
                                      analytes: rows.map((row, at) =>
                                        at === index
                                          ? {
                                              ...row,
                                              reviewed: !checked,
                                              selected: !checked,
                                            }
                                          : row,
                                      ),
                                    })
                                  }
                                  style={styles.checkTarget}
                                >
                                  <View
                                    style={[
                                      styles.checkbox,
                                      checked && styles.checked,
                                      (missing || mismatch) && { opacity: 0.4 },
                                    ]}
                                  >
                                    {checked && (
                                      <SymbolView
                                        name="checkmark"
                                        size={13}
                                        weight="semibold"
                                        tintColor={colors.text.inverse}
                                        fallback={
                                          <AppText
                                            role="caption"
                                            color={colors.text.inverse}
                                          >
                                            ✓
                                          </AppText>
                                        }
                                      />
                                    )}
                                  </View>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Изменить показатель ${index + 1}`}
                                  accessibilityState={{ expanded }}
                                  onPress={() =>
                                    setExpandedRow(expanded ? undefined : index)
                                  }
                                  style={styles.resultCopy}
                                >
                                  <View style={styles.analyteHeading}>
                                    <AppText
                                      weight="semibold"
                                      style={{ flex: 1 }}
                                    >
                                      {item.name || 'Название не распознано'}
                                    </AppText>
                                    <SymbolView
                                      name={
                                        expanded
                                          ? 'chevron.down'
                                          : 'chevron.right'
                                      }
                                      size={12}
                                      weight="semibold"
                                      tintColor={colors.text.secondary}
                                      fallback={
                                        <AppText color={colors.text.secondary}>
                                          {expanded ? '⌄' : '›'}
                                        </AppText>
                                      }
                                    />
                                  </View>
                                  <AppText style={styles.resultValue}>
                                    {item.value || 'Значение не распознано'}
                                    {item.unit ? ` ${item.unit}` : ''}
                                  </AppText>
                                  {item.reference ? (
                                    <AppText
                                      role="caption"
                                      color={colors.text.secondary}
                                    >
                                      Референсы: {item.reference}
                                    </AppText>
                                  ) : null}
                                  {(missing ||
                                    mismatch ||
                                    Boolean(item.issues?.length)) && (
                                    <AppText
                                      role="caption"
                                      color={
                                        missing || mismatch
                                          ? colors.state.error
                                          : colors.text.secondary
                                      }
                                    >
                                      {missing
                                        ? 'Исправьте пропущенные поля'
                                        : mismatch
                                          ? `Другая дата: ${item.date}`
                                          : 'Есть неоднозначности — проверьте'}
                                    </AppText>
                                  )}
                                </Pressable>
                              </View>
                              {expanded && (
                                <View style={styles.editor}>
                                  {item.sourceText ? (
                                    <AppText
                                      role="caption"
                                      style={styles.sourceText}
                                    >
                                      {item.sourceText}
                                    </AppText>
                                  ) : null}
                                  {item.sourcePage && (
                                    <Button
                                      label={`Сверить со страницей ${item.sourcePage}`}
                                      variant="quiet"
                                      onPress={() =>
                                        sourcePage(item.sourcePage!)
                                      }
                                      disabled={busy || recognizing}
                                    />
                                  )}
                                  {item.issues?.length ? (
                                    <AppText
                                      role="caption"
                                      color={colors.text.secondary}
                                    >
                                      {item.issues
                                        .map(documentIssueLabel)
                                        .join('; ')}
                                    </AppText>
                                  ) : null}
                                  {(
                                    [
                                      'name',
                                      'value',
                                      'unit',
                                      'reference',
                                      'date',
                                      'section',
                                    ] as const
                                  ).map((field, fieldIndex) => (
                                    <View key={field} style={styles.field}>
                                      <AppText
                                        role="caption"
                                        color={colors.text.secondary}
                                      >
                                        {
                                          [
                                            'Показатель',
                                            'Значение',
                                            'Единицы',
                                            'Референсы',
                                            'Дата строки',
                                            'Раздел',
                                          ][fieldIndex]
                                        }
                                      </AppText>
                                      <TextInput
                                        accessibilityLabel={`${['Показатель', 'Значение', 'Единицы', 'Референсы', 'Дата строки', 'Раздел'][fieldIndex]} ${index + 1}`}
                                        value={item[field]}
                                        maxLength={300}
                                        editable={!busy && !recognizing}
                                        style={styles.input}
                                        onChangeText={(value) =>
                                          edit({
                                            analytes: rows.map((row, at) =>
                                              at === index
                                                ? {
                                                    ...row,
                                                    [field]: value,
                                                    selected: false,
                                                    reviewed: false,
                                                  }
                                                : row,
                                            ),
                                          })
                                        }
                                      />
                                    </View>
                                  ))}
                                  <Button
                                    label="Готово к проверке"
                                    onPress={() => setExpandedRow(undefined)}
                                  />
                                  <Button
                                    label="Удалить строку из черновика"
                                    variant="quiet"
                                    disabled={busy || recognizing}
                                    onPress={() => {
                                      setExpandedRow(undefined);
                                      edit({
                                        analytes: rows.filter(
                                          (_, at) => at !== index,
                                        ),
                                      });
                                    }}
                                  />
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    !recognizing && (
                      <View style={styles.card}>
                        <AppText role="title" weight="semibold">
                          {draft?.pages.length
                            ? 'Показатели не найдены'
                            : 'Распознать результаты'}
                        </AppText>
                        <AppText>
                          {draft?.pages.length
                            ? structured ? 'Сверьте заключение и полный текст перед подтверждением. При необходимости можно добавить показатель вручную.' : 'Можно прочитать и проверить текст документа или добавить показатель вручную.'
                            : 'Получим значения из файла. Вы проверите их перед сохранением в анализы.'}
                        </AppText>
                        {!draft?.pages.length && retryButton}
                        {ocr.reason && !draft?.pages.length ? (
                          <AppText role="caption" color={colors.text.secondary}>
                            {ocr.reason}
                          </AppText>
                        ) : null}
                        {!ocr.accepted && !draft?.pages.length && (
                          <Button
                            label="Настроить распознавание"
                            onPress={() =>
                              void close(() =>
                                router.push({
                                  pathname: '/profile',
                                  params: { panel: 'documents' },
                                }),
                              )
                            }
                          />
                        )}
                        {draft?.pages.length ? (
                          <Button
                            label="Прочитать текст"
                            onPress={() => changeTab('text')}
                          />
                        ) : null}
                      </View>
                    )
                  )}
                  {draft && !saved && !recognizing && (
                    <Button
                      label="Добавить показатель"
                      variant="quiet"
                      disabled={rows.length >= 100}
                      onPress={() => {
                        setExpandedRow(rows.length);
                        edit({
                          analytes: [
                            ...rows,
                            {
                              name: '',
                              value: '',
                              unit: '',
                              reference: '',
                              reviewed: false,
                              selected: false,
                            },
                          ],
                        });
                      }}
                    />
                  )}
                </>
              )}
              {tab === 'original' && (
                <>
                  {!document.localFileUri ? (
                    <AppText>
                      Оригинала нет на этом устройстве. Он не хранится в облаке.
                    </AppText>
                  ) : recognizing ? (
                    <AppText role="caption">
                      Оригинал можно открыть после обработки текущего документа.
                    </AppText>
                  ) : (
                    <>
                      <View style={styles.analyteHeading}>
                        <Button
                          label="Назад"
                          accessibilityLabel="Предыдущая страница"
                          disabled={busy || page <= 1}
                          onPress={() => void showPage(page - 1)}
                        />
                        <AppText style={{ flex: 1, textAlign: 'center' }}>
                          {page} / {pageCount}
                        </AppText>
                        <Button
                          label="Далее"
                          accessibilityLabel="Следующая страница"
                          disabled={busy || page >= pageCount}
                          onPress={() => void showPage(page + 1)}
                        />
                      </View>
                      {original ? (
                        <ScrollView
                          style={styles.originalViewer}
                          minimumZoomScale={1}
                          maximumZoomScale={4}
                          centerContent
                        >
                          <Image
                            source={{ uri: original }}
                            resizeMode="contain"
                            style={{
                              width: Math.max(240, width - 80),
                              height: 460,
                            }}
                            accessible
                            accessibilityRole="image"
                            accessibilityLabel={`Оригинал, страница ${page}`}
                          />
                        </ScrollView>
                      ) : (
                        <Button
                          label="Открыть оригинал"
                          onPress={() => void showPage(page)}
                        />
                      )}
                      <AppText role="caption" color={colors.text.secondary}>
                        Увеличьте страницу двумя пальцами, чтобы сверить мелкий
                        текст.
                      </AppText>
                      <Button
                        label={`Повернуть на 90° · сейчас ${rotation}°`}
                        accessibilityLabel={`Повернуть перед распознаванием на 90° (сейчас ${rotation}°)`}
                        variant="quiet"
                        disabled={busy}
                        onPress={() => {
                          const next = ((rotation + 90) % 360) as
                            0 | 90 | 180 | 270;
                          setRotation(next);
                          void showPage(page, next);
                        }}
                      />
                      <Button
                        label="Вернуться к показателям"
                        onPress={() => changeTab('results')}
                      />
                    </>
                  )}
                </>
              )}
              {tab === 'text' && (
                <>
                  <AppText role="label" weight="semibold">
                    Полный текст документа
                  </AppText>
                  <AppText role="caption" color={colors.text.secondary}>
                    Исправляйте только ошибки распознавания. После изменения
                    текста показатели нужно проверить снова.
                  </AppText>
                  {draft ? (
                    <TextInput
                      accessibilityLabel="Проверяемый текст документа"
                      value={draft.editedText}
                      onChangeText={(editedText) => edit({ editedText })}
                      multiline
                      scrollEnabled={false}
                      editable={!busy && !recognizing}
                      maxLength={200000}
                      style={[
                        styles.input,
                        { minHeight: 280, textAlignVertical: 'top' },
                      ]}
                    />
                  ) : (
                    <AppText>Текст появится после распознавания.</AppText>
                  )}
                  {draft?.pages
                    .flatMap((p) => p.issues ?? [])
                    .map((issue, index) => (
                      <AppText role="caption" key={index}>
                        {issue}
                      </AppText>
                    ))}
                  <AppText role="caption" color={colors.text.secondary}>
                    Оригинал и черновик остаются на устройстве. Для
                    распознавания страницы временно передаются в Yandex по
                    вашему согласию.
                  </AppText>
                  {!recognizing && draft?.pages.length ? (
                    <>
                      <Button
                        label="Распознать заново"
                        variant="quiet"
                        onPress={() => setRepeat(!repeat)}
                      />
                      {repeat && (
                        <View style={styles.card}>
                          <AppText>
                            Текущие правки в черновике будут заменены.
                            Сохранённые результаты останутся.
                          </AppText>
                          {retryButton}
                          <Button
                            label="Оставить текущий черновик"
                            onPress={() => setRepeat(false)}
                          />
                        </View>
                      )}
                    </>
                  ) : null}
                </>
              )}
              {notice && interpretationOpen && <AppText>{notice}</AppText>}
              {saved && interpretationOpen && (
                <View style={styles.card}>
                  <AppText style={styles.title}>
                    Отдельная интерпретация
                  </AppText>
                  <AppText>
                    Вставьте только нужный фрагмент проверенного текста. По
                    умолчанию ничего не выбрано.
                  </AppText>
                  {conclusions
                    .filter((b) => draft?.editedText.includes(b.text))
                    .map((block, index) => (
                      <Button
                        key={index}
                        label={`Выбрать заключение · стр. ${block.page}`}
                        variant="quiet"
                        onPress={() => {
                          setSelection(block.text);
                          setSendPreview(false);
                          requestId.current = undefined;
                        }}
                      />
                    ))}
                  <TextInput
                    accessibilityLabel="Выбранный текст для интерпретации"
                    value={selection}
                    onChangeText={(value) => {
                      setSelection(value);
                      setSendPreview(false);
                      requestId.current = undefined;
                    }}
                    editable={!busy && !recognizing}
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
                            params: { panel: 'permissions' },
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
                      <Text
                        selectable
                        style={{
                          fontSize: 16,
                          lineHeight: 24,
                          color: colors.text.primary,
                        }}
                      >
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
                      <Text
                        selectable
                        style={{
                          fontSize: 16,
                          lineHeight: 24,
                          color: colors.text.primary,
                        }}
                      >
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
      </View>
    </AppSheet>
  );
}
const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    page: { flexShrink: 1, minHeight: 0 },
    scroll: { flexShrink: 1 },
    content: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 20,
      gap: 14,
    },
    tabs: { marginHorizontal: 20, marginBottom: 2 },
    dateButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 10,
    },
    dateChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    dateChoice: {
      minHeight: 44,
      paddingHorizontal: 12,
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: colors.surface.canvas,
    },
    dateSelected: { backgroundColor: colors.surface.rose },
    resultsCard: {
      borderRadius: 18,
      backgroundColor: colors.surface.raised,
      overflow: 'hidden',
    },
    resultRow: { paddingVertical: 12, paddingRight: 16 },
    resultDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surface.divider,
    },
    resultCopy: { flex: 1, minWidth: 0, gap: 5, paddingVertical: 4 },
    resultValue: { fontSize: 18, lineHeight: 24 },
    checkTarget: {
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: colors.text.secondary,
      backgroundColor: colors.surface.raised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checked: {
      borderColor: colors.brand.primary,
      backgroundColor: colors.brand.primary,
    },
    editor: { paddingLeft: 16, paddingTop: 12, gap: 10 },
    originalViewer: {
      height: 460,
      borderRadius: 14,
      backgroundColor: colors.surface.raised,
    },
    title: { fontSize: 20, lineHeight: 25, letterSpacing: -0.55 },
    section: { minWidth: 0, gap: 10 },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.surface.divider,
      borderRadius: 14,
      padding: 12,
      minHeight: 48,
      ...fontStyle('SFProDisplay-Regular'),
      fontSize: 15,
      lineHeight: 23,
      color: colors.text.primary,
      backgroundColor: colors.surface.canvas,
    },
    button: { paddingVertical: 12 },
    buttonLabel: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
    quietButton: { backgroundColor: 'transparent', minHeight: 44 },
    card: {
      padding: 16,
      borderRadius: 18,
      backgroundColor: colors.surface.raised,
      gap: 12,
    },
    field: { gap: 6 },
    analyteHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sourceText: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface.canvas,
      lineHeight: 20,
    },
    row: { gap: 8 },
    footer: { gap: 8 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
    error: { color: colors.state.error },
  });
