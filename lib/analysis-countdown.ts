function calendarDay(timestamp: number) {
  const date = new Date(timestamp);
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  );
}

export function analysisTimeRemaining(startAt: number | undefined, dueAt: number | undefined, now = Date.now()) {
  if (dueAt === undefined || !Number.isFinite(dueAt)) return undefined;
  const remaining = calendarDay(dueAt) - calendarDay(now);
  if (remaining <= 0) return 0;
  if (startAt === undefined || !Number.isFinite(startAt)) return undefined;
  const duration = calendarDay(dueAt) - calendarDay(startAt);
  if (duration <= 0) return undefined;
  return Math.min(1, Math.max(0, remaining / duration));
}

export function analysisCountdown(dueAt?: number, now = Date.now()) {
  if (dueAt === undefined || !Number.isFinite(dueAt)) {
    return { label: 'Осталось', value: 'Срок не задан' };
  }
  const days = calendarDay(dueAt) - calendarDay(now);
  if (days === 0) return { label: 'Осталось', value: 'Сегодня' };
  const count = Math.abs(days);
  const lastTwo = count % 100;
  const last = count % 10;
  const unit =
    lastTwo >= 11 && lastTwo <= 14
      ? 'дней'
      : last === 1
        ? 'день'
        : last >= 2 && last <= 4
          ? 'дня'
          : 'дней';
  return {
    label: days < 0 ? 'Просрочено на' : 'Осталось',
    value: `${count} ${unit}`,
  };
}
