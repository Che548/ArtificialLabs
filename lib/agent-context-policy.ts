export const AGENT_RECENT_JOURNAL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function journalAgeMetadata(at: number, now = Date.now()) {
  const ageDays = Math.max(0, Math.floor((now - at) / DAY_MS));
  const stale = ageDays > AGENT_RECENT_JOURNAL_DAYS;
  return {
    ageDays,
    stale,
    warning: stale
      ? 'Старая запись: учитывай её возраст и не считай текущим состоянием.'
      : undefined,
  };
}

export function assistantQuestionNeedsBodyMetrics(value: string) {
  return /(?:\b(?:bmi|weight|height|body\s*mass|dose|dosage|calorie|nutrition)\b|вес|рост|имт|индекс\s+массы|масса\s+тела|дозиров|доз[ауы]|калори|питан|ожир|недовес)/iu.test(
    value.normalize('NFKC'),
  );
}
