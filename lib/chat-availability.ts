export type ChatAvailabilityInput = {
  web: boolean;
  authLoading: boolean;
  authenticated: boolean;
  readOnly: boolean;
  cloudSyncEnabled: boolean;
  cloudProfileReady: boolean;
  localReady: boolean;
  offline: boolean;
  backendUnavailable: boolean;
  statusError: boolean;
  status?: { enabled: boolean; consentAccepted: boolean };
};

export function resolveChatAvailability(input: ChatAvailabilityInput) {
  const blocked = (
    reason: string,
    message: string,
    action?: 'profile' | 'retry',
  ) => ({ reason, message, action, canSend: false });
  if (input.web)
    return blocked(
      'web',
      'ИИ-чат доступен в приложении для iOS и Android после входа.',
    );
  if (input.authLoading) return blocked('loading', 'Проверяем вход в аккаунт…');
  if (!input.authenticated || input.readOnly)
    return blocked(
      'auth',
      'Войдите в аккаунт, чтобы получать ответы Сферки.',
      'profile',
    );
  if (!input.cloudSyncEnabled)
    return blocked(
      'sync',
      'Для ИИ-чата нужна облачная синхронизация. Включить её можно в настройках профиля.',
      'profile',
    );
  if (input.offline)
    return blocked(
      'offline',
      'Нет подключения. Черновик можно продолжать писать; отправьте его после восстановления сети.',
    );
  if (input.statusError || input.backendUnavailable)
    return blocked(
      'server',
      'Не удалось связаться с сервисом ИИ. Черновик сохранён на этом экране.',
      'retry',
    );
  if (!input.cloudProfileReady || !input.localReady || !input.status)
    return blocked(
      'loading',
      'Подготавливаем данные и проверяем доступность ИИ…',
    );
  if (!input.status.enabled)
    return blocked('disabled', 'Этот режим ИИ пока выключен администратором.');
  if (!input.status.consentAccepted)
    return {
      reason: 'consent',
      message:
        'Перед первым ответом нужно согласие на передачу данных ИИ. Ознакомьтесь с условиями.',
      action: 'consent' as const,
      canSend: true,
    };
  return {
    reason: 'ready',
    message: undefined,
    action: undefined,
    canSend: true,
  };
}
