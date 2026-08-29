export type ServiceIssueKind = 'offline' | 'server' | 'auth' | 'unknown';

export type ServiceIssue = {
  kind: ServiceIssueKind;
  message: string;
  retryable: boolean;
};

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = 'cause' in error ? error.cause : undefined;
    return `${error.name} ${error.message} ${cause ? errorText(cause) : ''}`;
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
  if (offline) {
    return {
      kind: 'offline',
      message:
        'Нет подключения к интернету. Изменения сохранены на устройстве.',
      retryable: true,
    };
  }

  const text = errorText(error).toLowerCase();
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
