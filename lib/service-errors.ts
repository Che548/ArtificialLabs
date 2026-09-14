import { readUpdateRequired, type ClientUpdateRequired } from '../shared/client-compatibility';

export type ServiceIssueKind = 'offline' | 'server' | 'auth' | 'unknown' | 'update-required';

export type ServiceIssue = {
  kind: ServiceIssueKind;
  message: string;
  retryable: boolean;
  conflict?: boolean;
  update?: ClientUpdateRequired;
};

function errorText(error: unknown, depth = 0): string {
  if (depth > 4) return '';
  if (error instanceof Error) {
    const cause = 'cause' in error ? error.cause : undefined;
    return `${error.name} ${error.message} ${cause ? errorText(cause, depth + 1) : ''}`;
  }
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function classifyServiceIssue(
  error: unknown,
  offline = false,
): ServiceIssue {
  const update = readUpdateRequired(error);
  if (update || /\bCLIENT_UPDATE_REQUIRED\b/.test(errorText(error))) return {
    kind: 'update-required', retryable: false, update,
    message: 'Для этой функции нужно обновить приложение.',
  };
  if (offline) {
    return {
      kind: 'offline',
      message:
        'Нет подключения к интернету. Изменения сохранены на устройстве.',
      retryable: true,
    };
  }

  const text = errorText(error).toLowerCase();
  if (/cloud_sync_consent_revoked|cloud_sync_consent_required/.test(text)) {
    return { kind: 'auth', retryable: false, message: 'Согласие на облачную синхронизацию отсутствует или отозвано для этой сессии. Проверьте настройку синхронизации. Локальные данные сохранены.' };
  }
  if (/profile_sync_conflict|record_sync_conflict|record_deleted_remotely/.test(text)) {
    return { kind: 'unknown', retryable: false, conflict: true, message: 'Эту запись изменили или удалили на другом устройстве. Ваши изменения сохранены локально; автоматическая перезапись остановлена.' };
  }
  if (/sync_clock_invalid/.test(text)) {
    return { kind: 'unknown', retryable: false, message: 'Время изменения записи находится в будущем. Проверьте дату и время устройства. Запись сохранена локально.' };
  }
  if (
    /unauthenticated|not authenticated|authentication required|invalid token|token.*expired/.test(
      text,
    )
  ) {
    return {
      kind: 'auth',
      message: 'Сессия истекла. Войдите в аккаунт снова.',
      retryable: false,
    };
  }
  if (
    /network request failed|failed to fetch|fetch failed|websocket|socket|econn|enotfound|timed?\s*out|timeout|(?:client|connection) (?:closed|disconnected|refused|reset)|not connected|http\s*5\d\d|status\s*5\d\d|bad gateway|service unavailable|gateway timeout|server unavailable/.test(
      text,
    )
  ) {
    return {
      kind: 'server',
      message:
        'Сервер временно недоступен. Изменения сохранены и будут отправлены автоматически.',
      retryable: true,
    };
  }
  return {
    kind: 'unknown',
    message: 'Не удалось выполнить запрос. Локальные данные не потеряны.',
    retryable: false,
  };
}

export function retryDelayMs(attempt: number) {
  const delays = [5_000, 15_000, 30_000, 60_000, 120_000];
  return delays[Math.min(Math.max(attempt, 0), delays.length - 1)];
}
