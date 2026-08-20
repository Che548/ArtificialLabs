export type ChatGenerationState = 'idle' | 'thinking' | 'complete' | 'error';
export type ChatGenerationEvent = 'start' | 'succeed' | 'fail' | 'reset';

export function transitionChatGeneration(
  _current: ChatGenerationState,
  event: ChatGenerationEvent,
): ChatGenerationState {
  if (event === 'start') return 'thinking';
  if (event === 'succeed') return 'complete';
  if (event === 'fail') return 'error';
  return 'idle';
}

export function chatGenerationErrorText(code?: string, retryAfterMs?: number) {
  if (code === 'RATE_LIMITED') {
    const seconds = Math.max(1, Math.ceil((retryAfterMs ?? 0) / 1000));
    return `Слишком много запросов. Попробуйте снова примерно через ${seconds} сек.`;
  }
  if (code === 'CONTENT_FILTERED') {
    return 'Сферка не может ответить на этот запрос. Попробуйте сформулировать его иначе.';
  }
  if (code === 'FEATURE_DISABLED') {
    return 'ИИ-чат временно выключен. Ваше сообщение осталось в истории.';
  }
  if (code === 'INVALID_REQUEST') {
    return 'Сообщение не удалось отправить. Сократите его и попробуйте снова.';
  }
  if (code === 'CONSENT_REQUIRED') {
    return 'Нужно снова подтвердить передачу текста в Yandex AI Studio.';
  }
  return 'Сферка сейчас не смогла ответить. Проверьте подключение и попробуйте снова.';
}
