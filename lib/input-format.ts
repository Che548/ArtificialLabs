/** Filters input and pasted text without changing free-form fields. */
export type InputFormat = 'text' | 'integer' | 'decimal' | 'phone' | 'name';

export function filterInput(value: string, format: InputFormat): string {
  if (format === 'text') return value;
  const normalized = value.normalize('NFKC');
  if (format === 'name') return normalized.replace(/[^\p{L}\p{M} '\u2019-]/gu, '');
  if (format === 'phone') {
    return (normalized.trimStart().startsWith('+') ? '+' : '') + normalized.replace(/\D/g, '');
  }
  if (format === 'integer') return normalized.replace(/\D/g, '');
  const cleaned = normalized.replace(/[^\d.,]/g, '');
  const separator = cleaned.search(/[.,]/);
  return separator < 0 ? cleaned : cleaned.slice(0, separator + 1) + cleaned.slice(separator + 1).replace(/[.,]/g, '');
}
