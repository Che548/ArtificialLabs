import { makeFunctionReference } from 'convex/server';

// Public contract read from the running self-hosted backend on 2026-09-11.
// This client checkout predates that backend release; keep deployment independent.
export type EmailChangeChallenge = {
  challengeId: string;
  expiresAt: number;
  retryAt: number;
};
export const emailChangeApi = {
  request: makeFunctionReference<'action', { newEmail: string; currentPassword: string }, EmailChangeChallenge>('emailChange:request'),
  resend: makeFunctionReference<'action', { challengeId: string }, EmailChangeChallenge>('emailChange:resend'),
  confirm: makeFunctionReference<'action', { challengeId: string; code: string }, { changed: boolean }>('emailChange:confirm'),
};

export function emailChangeMessage(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  if (value.includes('EMAIL_CHANGE_INVALID_PASSWORD')) return 'Проверьте текущий пароль.';
  if (value.includes('EMAIL_CHANGE_EMAIL_UNAVAILABLE')) return 'Этот адрес уже используется. Укажите другой.';
  if (value.includes('EMAIL_CHANGE_SAME_EMAIL')) return 'Укажите новый адрес электронной почты.';
  if (value.includes('EMAIL_CHANGE_INVALID_EMAIL')) return 'Проверьте адрес электронной почты.';
  if (value.includes('EMAIL_CHANGE_INVALID_CODE')) return 'Код неверный или истёк. Проверьте письмо или запросите новый.';
  if (value.includes('EMAIL_CHANGE_REAUTHENTICATE')) return 'Подтвердите текущий пароль и запросите новый код.';
  if (value.includes('EMAIL_CHANGE_UNAUTHENTICATED') || value.includes('UNAUTHENTICATED')) return 'Войдите в аккаунт заново, чтобы изменить почту.';
  if (value.includes('RATE_LIMITED')) return 'Повторная попытка пока недоступна. Попробуйте позже.';
  if (value.includes('EMAIL_CHANGE_UNAVAILABLE') || value.includes('Could not find public function')) return 'Смена почты временно недоступна.';
  return 'Не удалось связаться с сервером. Проверьте подключение и повторите.';
}
