// Approximate educational lengths from NHS Best Start in Life, checked 2026-09-15.
// Index = obstetric week. No invented lengths before week 4 or after week 40.
export const PREGNANCY_LENGTH_MM: readonly (number | null)[] = [null, null, null, null, 2, 2, 6, 10, 16, 22, 30, 41, 54, 74, 85, 101, 116, 120, 142, 153, 256, 267, 278, 289, 300, 346, 356, 366, 376, 386, 399, 411, 424, 437, 450, 462, 474, 486, 498, 507, 512];

export function pregnancySizeSource(week: number) {
  if (week < 4) return 'https://111.wales.nhs.uk/LiveWell/Pregnancy/4to8weeks';
  const safeWeek = Math.min(41, week);
  const trimester = safeWeek <= 12 ? '1st' : safeWeek <= 27 ? '2nd' : '3rd';
  return `https://www.nhs.uk/best-start-in-life/pregnancy/week-by-week-guide-to-pregnancy/${trimester}-trimester/week-${safeWeek}/`;
}

export function pregnancySizeForWeek(week: number) {
  if (!Number.isInteger(week) || week < 1 || week > 42) return null;
  if (week <= 2) return { label: 'Эмбриона ещё нет', method: 'Акушерский срок', source: pregnancySizeSource(week) };
  if (week === 3) return { label: 'Размер ещё не определяют', method: 'Самое начало развития', source: pregnancySizeSource(week) };
  const mm = PREGNANCY_LENGTH_MM[week];
  if (mm == null) return { label: 'Размер индивидуален', method: 'Уточняется по обследованиям', source: pregnancySizeSource(week) };
  const amount = mm < 10 ? `${mm} мм` : `${String(mm / 10).replace('.', ',')} см`;
  return { label: `≈ ${amount}`, method: week < 20 ? 'от головы до копчика' : 'от головы до пяток', source: pregnancySizeSource(week) };
}
