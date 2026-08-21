export const AGENT_PLAN_NOTIFICATION_TITLE = 'Сферка';
export const AGENT_PLAN_NOTIFICATION_BODY = 'План здоровья обновлён';
export const AGENT_PLAN_NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function maySendAgentPlanNotification(
  lastSentAt: number,
  now = Date.now(),
) {
  return now - lastSentAt >= AGENT_PLAN_NOTIFICATION_COOLDOWN_MS;
}
