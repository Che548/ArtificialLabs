import { useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useConvex } from 'convex/react';
import { api } from '../convex/_generated/api';
import { AppText } from '../design-system';
import { AppSheet, useSheetStyles } from './AppSheet';
import { useAppTheme } from '../lib/theme';
import { useHealthStore } from '../lib/health-store';
import { loadLocalSnapshot, pendingOutbox, resolveLocalSyncConflict } from '../lib/local-database';
import { conflictValue, hasRecordConflict, sameConflictValue, type SyncConflictSelection } from '../lib/sync-conflict';
import { mergeProfileFields } from '../shared/profile-merge';
import { loadLocalSetting } from '../lib/local-database';

const names: Record<string, string> = {
  displayName: 'Имя', goal: 'Цель', birthDate: 'Дата рождения', heightCm: 'Рост', weightKg: 'Вес',
  phone: 'Телефон', cycleLengthDays: 'Длина цикла', pregnancyStartAt: 'Начало беременности',
  label: 'Название', title: 'Название', textValue: 'Текст', numericValue: 'Значение', unit: 'Единица',
  deletedAt: 'Удалено', status: 'Статус', analytes: 'Показатели', body: 'Текст', text: 'Текст',
  onboardingCompleted: 'Анкета заполнена', postpartum: 'После родов', postContraception: 'После отмены контрацепции',
  lastPeriodStartAt: 'Начало последнего цикла', timezoneOffsetMinutes: 'Часовой пояс (минуты)',
  occurredAt: 'Дата записи', capturedAt: 'Дата сканирования', collectedAt: 'Дата анализа',
  dueAt: 'Запланировано', readAt: 'Прочитано', sentAt: 'Отправлено', category: 'Категория',
  documentDate: 'Дата документа', source: 'Источник', kind: 'Тип', notes: 'Примечания',
  startedAt: 'Начало', endedAt: 'Окончание', diagnosedAt: 'Дата указания', severity: 'Выраженность',
  dose: 'Доза', frequency: 'Частота', confirmedValue: 'Подтверждённое значение', attachments: 'Вложения',
  medicalRecommendations: 'Рекомендации', notificationsEnabled: 'Уведомления', language: 'Язык', region: 'Регион',
};
const hidden = new Set(['localId', 'syncRevision', 'updatedAt']);
const show = (value: unknown, key: string) => {
  if (key === 'goal' && typeof value === 'string') return ({ planning: 'Планирование', pregnancy: 'Беременность', cycle: 'Мониторинг цикла' } as Record<string, string>)[value] ?? value;
  if (value === undefined) return key === 'deletedAt' ? 'Не удалено' : 'Не указано';
  if (typeof value === 'number' && Number.isFinite(value) && (key.endsWith('At') || key === 'birthDate' || key === 'documentDate')) return new Date(value).toLocaleDateString('ru-RU');
  return typeof value === 'boolean' ? (value ? 'Да' : 'Нет') : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
};

export function SyncConflictResolver() {
  const sheetStyles = useSheetStyles();
  const store = useHealthStore();
  const convex = useConvex();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<SyncConflictSelection>();
  const [choice, setChoice] = useState<'local' | 'remote'>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  if (Platform.OS === 'web' || store.readOnly || !store.cloudSyncEnabled) return null;
  if (!open && !store.serviceIssue?.conflict) return null;

  async function review() {
    if (flight.current) return;
    flight.current = true; setBusy(true); setOpen(true); setSelection(undefined); setChoice(undefined); setMessage('');
    try {
      const viewer = await convex.query(api.profile.viewer, {});
      const snapshot = await loadLocalSnapshot();
      if (snapshot.profile && viewer.profile) {
        const local = conflictValue('profile', snapshot.profile);
        const remote = conflictValue('profile', viewer.profile);
        const base = await loadLocalSetting<Record<string, unknown>>('profileSyncBase.v1');
        try { mergeProfileFields(remote, local, base); }
        catch { setSelection({ entity: 'profile', local, remote, ownerId: viewer.userId }); return; }
      }
      const pending = await pendingOutbox();
      for (let start = 0; start < pending.length; start += 30) {
        const batch = pending.slice(start, start + 30);
        const remote = await convex.query(api.health.conflictRecords, { records: batch.map(row => ({ entity: row.entity, localId: row.payload.localId })) });
        for (let i = 0; i < batch.length; i++) {
          if (!remote[i].record) continue;
          const entity = batch[i].entity;
          if (entity === 'agentTriggers' || entity === 'recommendationEvents') continue;
          const local = conflictValue(entity, batch[i].payload as unknown as Record<string, unknown>);
          const other = conflictValue(entity, remote[i].record!);
          if (hasRecordConflict(local, other)) { setSelection({ entity, local, remote: other, ownerId: viewer.userId }); return; }
        }
      }
      setMessage('Конфликт не найден. Закройте окно и повторите синхронизацию.');
    } catch { setMessage('Не удалось загрузить версии. Проверьте подключение и повторите. Данные не изменены.'); }
    finally { flight.current = false; setBusy(false); }
  }

  async function apply() {
    if (flight.current || !selection || !choice) return;
    flight.current = true; setBusy(true); setMessage('');
    try {
      const viewer = await convex.query(api.profile.viewer, {});
      if (viewer.userId !== selection.ownerId) throw new Error('SYNC_REVIEW_CHANGED');
      const latest = selection.entity === 'profile' ? viewer.profile : (await convex.query(api.health.conflictRecords, {
        records: [{ entity: selection.entity, localId: selection.local.localId as string }],
      }))[0].record;
      if (!latest || !sameConflictValue(conflictValue(selection.entity, latest), selection.remote)) throw new Error('SYNC_REVIEW_CHANGED');
      await resolveLocalSyncConflict(selection, choice);
      setSelection(undefined); setChoice(undefined);
      await store.refreshLocalState();
      const synced = await store.syncNow();
      setMessage(synced ? 'Выбор сохранён, синхронизация завершена.' : 'Выбор сохранён на устройстве. Синхронизация пока не завершена; проверьте статус и остальные конфликты.');
    } catch { setChoice(undefined); setMessage('Версии изменились или действие недоступно. Обновите сравнение. Неподтверждённые правки не удалены.'); }
    finally { flight.current = false; setBusy(false); }
  }

  return <>
    <Pressable accessibilityRole="button" onPress={() => void review()} disabled={busy} style={[sheetStyles.secondary, { marginHorizontal: 16, marginBottom: 16, opacity: busy ? 0.5 : 1 }]}>
      <AppText>Сравнить версии</AppText>
    </Pressable>
    <SyncConflictReview open={open} busy={busy} selection={selection} choice={choice} message={message}
      onClose={() => { if (!flight.current) setOpen(false); }} onChoice={setChoice} onApply={() => void apply()} onReview={() => void review()} />
  </>;
}

// Presentation is independently testable with synthetic fixtures and no account.
export function SyncConflictReview({ open, busy, selection, choice, message, onClose, onChoice, onApply, onReview }: {
  open: boolean; busy: boolean; selection?: SyncConflictSelection; choice?: 'local' | 'remote'; message: string;
  onClose: () => void; onChoice: (choice: 'local' | 'remote') => void; onApply: () => void; onReview: () => void;
}) {
  const sheetStyles = useSheetStyles();
  const { colors } = useAppTheme();
  return <AppSheet visible={open} title="Конфликт синхронизации" onClose={onClose} dismissDisabled={busy}>
      <View style={{ gap: 16 }}>
        <AppText>Сравните версии и выберите нужную. Предыдущая версия сохранится на устройстве.</AppText>
        {busy ? <AppText>Проверяем версии…</AppText> : null}
        {selection ? <>
          {Object.keys({ ...selection.local, ...selection.remote }).filter(key => !hidden.has(key) && !sameConflictValue(selection.local[key], selection.remote[key])).map(key => <View key={key} style={sheetStyles.group}>
            <AppText weight="semibold">{names[key] ?? key}</AppText>
            <AppText>На устройстве: {show(selection.local[key], key)}</AppText>
            <AppText>В облаке: {show(selection.remote[key], key)}</AppText>
          </View>)}
          {selection.remote.deletedAt ? <AppText>Запись удалена в облаке. Локальная копия останется в резерве.</AppText> : <Pressable accessibilityRole="button" disabled={busy} style={sheetStyles.secondary} onPress={() => onChoice('local')}><AppText>Оставить на устройстве</AppText></Pressable>}
          <Pressable accessibilityRole="button" disabled={busy} style={sheetStyles.secondary} onPress={() => onChoice('remote')}><AppText>Использовать облачную</AppText></Pressable>
          {choice ? <><AppText>Подтвердить выбор: {choice === 'local' ? 'версия устройства будет отправлена в облако' : 'версия облака заменит эту локальную запись'}?</AppText>
            <Pressable accessibilityRole="button" disabled={busy} style={sheetStyles.primary} onPress={onApply}><AppText color={colors.text.inverse}>Подтвердить выбор</AppText></Pressable></> : null}
        </> : null}
        {message ? <View accessibilityRole="alert"><AppText>{message}</AppText></View> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={onReview} style={sheetStyles.secondary}><AppText>Обновить сравнение</AppText></Pressable>
      </View>
    </AppSheet>;
}
