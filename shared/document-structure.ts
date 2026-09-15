/** Versioned, local document structure. Text is source material, never instructions. */
export const DOCUMENT_DATE_KINDS = [
  'collection',
  'received',
  'reported',
  'printed',
  'birth',
  'unknown',
] as const;
export const DOCUMENT_BLOCK_KINDS = [
  'method',
  'conclusion',
  'reference',
  'note',
  'heading',
] as const;
export type DocumentDate = {
  kind: (typeof DOCUMENT_DATE_KINDS)[number];
  text: string;
  sourceText: string;
  section: string;
};
export type DocumentBlock = {
  kind: (typeof DOCUMENT_BLOCK_KINDS)[number];
  text: string;
  section: string;
  sourceStart?: number;
};
export type DocumentStructure = {
  version: 1;
  title: string;
  pageRole: 'content' | 'cover' | 'continuation' | 'blank' | 'unknown';
  dates: DocumentDate[];
  blocks: DocumentBlock[];
};
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max: number): x is string =>
  typeof x === 'string' && x.length <= max;
export function parseDocumentStructure(
  value: unknown,
  text: string,
): DocumentStructure {
  if (
    !object(value) ||
    value.version !== 1 ||
    !str(value.title, 300) ||
    (value.title && !text.includes(value.title)) ||
    !['content', 'cover', 'continuation', 'blank', 'unknown'].includes(
      String(value.pageRole),
    ) ||
    !Array.isArray(value.dates) ||
    value.dates.length > 30 ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > 100
  )
    throw new Error('OCR_INVALID_OUTPUT');
  const dates = value.dates.map((d) => {
    if (
      !object(d) ||
      !(DOCUMENT_DATE_KINDS as readonly unknown[]).includes(d.kind) ||
      !str(d.text, 100) ||
      !str(d.sourceText, 1000) ||
      !d.sourceText ||
      !text.includes(d.sourceText) ||
      !d.sourceText.includes(d.text) ||
      !str(d.section, 300) ||
      (d.section && !text.includes(d.section))
    )
      throw new Error('OCR_INVALID_OUTPUT');
    return {
      kind: evidencedDateKind(d.sourceText),
      text: d.text,
      sourceText: d.sourceText,
      section: d.section,
    } as DocumentDate;
  });
  let cursor = 0;
  const blocks = value.blocks.map((b) => {
    if (
      !object(b) ||
      !(DOCUMENT_BLOCK_KINDS as readonly unknown[]).includes(b.kind) ||
      !str(b.text, 4000) ||
      !b.text ||
      !text.includes(b.text) ||
      !str(b.section, 300) ||
      (b.section && !text.includes(b.section))
    )
      throw new Error('OCR_INVALID_OUTPUT');
    const next = text.indexOf(b.text, cursor);
    const sourceStart = next < 0 ? text.indexOf(b.text) : next;
    cursor = sourceStart + b.text.length;
    return {
      kind: b.kind,
      text: b.text,
      section: b.section,
      sourceStart,
    } as DocumentBlock;
  });
  return {
    version: 1,
    title: value.title,
    pageRole: value.pageRole as DocumentStructure['pageRole'],
    dates,
    blocks,
  };
}
/** Preserve printed timestamps; compare only their explicit calendar date, never UTC-shift it. */
export function normalizeDocumentDate(value: string) {
  const m =
    /^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})[./](\d{2})[./](\d{4}))(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(
      value.trim(),
    );
  if (!m) return undefined;
  const time = /[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (time && (+time[1] > 23 || +time[2] > 59 || +(time[3] ?? 0) > 59)) return undefined;
  const y = Number(m[1] ?? m[6]),
    month = Number(m[2] ?? m[5]),
    day = Number(m[3] ?? m[4]);
  const date = new Date(y, month - 1, day, 12);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return undefined;
  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
/** A page/section's single labelled collection date is evidence. Other dates never substitute. */
export function collectionDateForSection(
  structure: DocumentStructure,
  section: string,
) {
  const local = structure.dates.filter(
    (d) => d.kind === 'collection' && d.section === section,
  );
  const candidates = local.length
    ? local
    : structure.dates.filter((d) => d.kind === 'collection' && !d.section);
  const valid = candidates.map((d) => normalizeDocumentDate(d.text));
  return candidates.length && valid.every(Boolean) && new Set(valid).size === 1
    ? candidates[0].text
    : '';
}

/** Date roles need labelled evidence, not just a model-supplied enum or a bare date. */
export function evidencedDateKind(source: string): DocumentDate['kind'] {
  const patterns: Array<[DocumentDate['kind'],RegExp]> = [
    ['birth', /\b(?:dob|birth)\b|рождени/iu],
    ['printed', /\bprint(?:ed|ing)?\b|печат/iu],
    ['received', /\breceiv(?:ed|ing)\b|поступлен|получени/iu],
    ['reported', /\b(?:report(?:ed)?|issued|performed|examination|study)\b|выполнени|выдачи|начала исследования|дата исследования/iu],
    ['collection', /\b(?:collect(?:ed|ion)?|sampled|sampling)\b|взятия|забора|сбора/iu],
  ];
  const matches=patterns.filter(([,pattern])=>pattern.test(source));
  return matches.length===1 ? matches[0][0] : 'unknown';
}
