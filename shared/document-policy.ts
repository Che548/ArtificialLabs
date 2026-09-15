import { parseDocumentStructure, normalizeDocumentDate, type DocumentStructure } from './document-structure';
export { normalizeDocumentDate } from './document-structure';
export const DOCUMENT_LIMITS = Object.freeze({
  bytes: 20 * 1024 * 1024,
  pages: 20,
  extractedCharacters: 200_000,
  interpretationCharacters: 24_000,
});
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];
export type DocumentAnalyteDraft = {
  name: string;
  value: string;
  unit: string;
  reference: string;
  reviewed: boolean;
  selected?: boolean;
  section?: string;
  sourceStart?: number;
  sourcePage?: number;
  sourceText?: string;
  date?: string;
  issues?: string[];
};
export type DocumentExtraction = {
  version: 1 | 2;
  documentLocalId: string;
  engineVersion: string;
  state:
    'queued' | 'recognizing' | 'review' | 'confirmed' | 'cancelled' | 'error';
  pages: Array<{
    page: number;
    text: string;
    confidence: number | null;
    structure?: DocumentStructure;
    dates?: string[];
    issues?: string[];
  }>;
  editedText: string;
  analytes?: DocumentAnalyteDraft[];
  collectedAt?: number;
  rotationDegrees?: 0 | 90 | 180 | 270;
  confirmedAt?: number;
  updatedAt: number;
  provider?: 'yandex-ai-studio' | 'legacy-local';
  model?: string;
  job?: {
    id: string;
    ownerId: string;
    pageCount?: number;
    nextRequestId?: string;
    uncertainPage?: number;
    errorCode?: string;
  };
};

export function validateDocumentMetadata(
  mime: string,
  bytes: number,
  pages = 1,
): DocumentMimeType {
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(mime))
    throw new Error('DOCUMENT_UNSUPPORTED');
  if (
    !Number.isSafeInteger(bytes) ||
    bytes <= 0 ||
    bytes > DOCUMENT_LIMITS.bytes
  )
    throw new Error('DOCUMENT_SIZE');
  if (
    !Number.isSafeInteger(pages) ||
    pages < 1 ||
    pages > DOCUMENT_LIMITS.pages
  )
    throw new Error('DOCUMENT_PAGES');
  return mime as DocumentMimeType;
}

export function validateDocumentExtraction(value: DocumentExtraction) {
  if (
    ![1, 2].includes(value.version) ||
    !/^[\w-]{1,160}$/.test(value.documentLocalId) ||
    typeof value.engineVersion !== 'string' ||
    value.engineVersion.length > 120 ||
    ![
      'queued',
      'recognizing',
      'review',
      'confirmed',
      'cancelled',
      'error',
    ].includes(value.state) ||
    !Number.isFinite(value.updatedAt) ||
    !Array.isArray(value.pages) ||
    value.pages.length > DOCUMENT_LIMITS.pages ||
    typeof value.editedText !== 'string' ||
    value.editedText.length > DOCUMENT_LIMITS.extractedCharacters ||
    value.pages.some(
      (page, index) =>
        page.page !== index + 1 ||
        typeof page.text !== 'string' ||
        (page.confidence === null
          ? value.version !== 2
          : !Number.isFinite(page.confidence) ||
            page.confidence < 0 ||
            page.confidence > 1),
    ) ||
    value.pages.reduce((sum, page) => sum + page.text.length, 0) >
      DOCUMENT_LIMITS.extractedCharacters ||
    (value.analytes !== undefined &&
      (!Array.isArray(value.analytes) ||
        value.analytes.length > 2000 ||
        value.analytes.some(
          (item) =>
            !item ||
            [item.name, item.value, item.unit, item.reference].some(
              (field) => typeof field !== 'string' || field.length > 300,
            ) ||
            typeof item.reviewed !== 'boolean' ||
            (item.selected !== undefined &&
              typeof item.selected !== 'boolean') ||
            (item.sourcePage !== undefined &&
              (!Number.isInteger(item.sourcePage) ||
                item.sourcePage < 1 ||
                item.sourcePage > 20)) ||
            (item.sourceText !== undefined &&
              (typeof item.sourceText !== 'string' ||
                item.sourceText.length > 2000)),
        ))) ||
    (value.collectedAt !== undefined &&
      (!Number.isFinite(value.collectedAt) || value.collectedAt <= 0)) ||
    (value.rotationDegrees !== undefined &&
      ![0, 90, 180, 270].includes(value.rotationDegrees)) ||
    (value.state === 'confirmed' &&
      (!Number.isFinite(value.confirmedAt) ||
        !value.editedText.trim() ||
        (value.analytes?.some((item) => item.selected !== false) &&
          (!value.collectedAt ||
            value.analytes.some(
              (item) =>
                item.selected !== false &&
                (!item.reviewed || !item.name.trim() || !item.value.trim()),
            )))))
  ) {
    throw new Error('DOCUMENT_EXTRACTION_INVALID');
  }
  for (const page of value.pages) {
    if (page.structure) parseDocumentStructure(page.structure, page.text);
  }
  if (value.version === 2) {
    const bounded = (x: unknown, n: number) =>
      typeof x === 'string' && x.length <= n;
    const list = (x: unknown, n: number, size: number) =>
      x === undefined ||
      (Array.isArray(x) && x.length <= n && x.every((s) => bounded(s, size)));
    if (
      (value.provider !== undefined &&
        !['yandex-ai-studio', 'legacy-local'].includes(value.provider)) ||
      (value.model !== undefined && !bounded(value.model, 120)) ||
      value.pages.some(
        (p) => !list(p.dates, 20, 100) || !list(p.issues, 30, 300),
      ) ||
      value.analytes?.some(
        (a) =>
          (a.section !== undefined && !bounded(a.section, 300)) ||
          (a.sourceStart !== undefined && (!Number.isSafeInteger(a.sourceStart) || a.sourceStart < 0)) ||
          !list(a.issues, 20, 300) ||
          (a.date !== undefined && !bounded(a.date, 300)),
      ) ||
      (value.job &&
        (!/^[\w-]{8,160}$/.test(value.job.id) ||
          !/^[\w-]{1,160}$/.test(value.job.ownerId) ||
          (value.job.pageCount !== undefined &&
            (!Number.isInteger(value.job.pageCount) ||
              value.job.pageCount < 1 ||
              value.job.pageCount > 20)) ||
          (value.job.nextRequestId !== undefined &&
            !/^[\w-]{8,160}$/.test(value.job.nextRequestId)) ||
          (value.job.uncertainPage !== undefined &&
            (!Number.isInteger(value.job.uncertainPage) ||
              value.job.uncertainPage < 1 ||
              value.job.uncertainPage > 20)) ||
          (value.job.errorCode !== undefined &&
            !/^[A-Z_]{1,80}$/.test(value.job.errorCode))))
    )
      throw new Error('DOCUMENT_EXTRACTION_INVALID');
  }
  if (value.state === 'confirmed' && value.collectedAt) {
    const date = new Date(value.collectedAt);
    const chosen = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    for (const row of value.analytes ?? []) {
      const printed = normalizeDocumentDate(row.date ?? '');
      if (row.selected !== false && printed && printed !== chosen)
        throw new Error('DOCUMENT_DATE_MISMATCH');
    }
  }
}

/** Delimited candidates only: no guessed units, references, catalogue mappings or diagnoses. */
export function extractDocumentAnalyteCandidates(
  text: string,
): DocumentAnalyteDraft[] {
  return text
    .split(/\r?\n/)
    .slice(0, 2000)
    .flatMap((line) => {
      const columns = line.split(/\t|;|\s{2,}/).map((field) => field.trim());
      if (
        columns.length < 2 ||
        columns.length > 4 ||
        !columns[0] ||
        !/^[<>≤≥]?\s*-?\d+(?:[.,]\d+)?$/.test(columns[1])
      )
        return [];
      if (columns.some((field) => field.length > 300)) return [];
      return [
        {
          name: columns[0],
          value: columns[1],
          unit: columns[2] ?? '',
          reference: columns[3] ?? '',
          reviewed: false,
        },
      ];
    })
    .slice(0, 100);
}

/** A separate, explicitly confirmed selection, never a file or whole archive. */
export function prepareDocumentInterpretation(
  extraction: DocumentExtraction,
  selection: string,
) {
  validateDocumentExtraction(extraction);
  if (extraction.state !== 'confirmed')
    throw new Error('DOCUMENT_REVIEW_REQUIRED');
  const text = selection.trim();
  if (!text || text.length > DOCUMENT_LIMITS.interpretationCharacters)
    throw new Error('DOCUMENT_SELECTION_SIZE');
  if (!extraction.editedText.includes(text))
    throw new Error('DOCUMENT_SELECTION_NOT_CONFIRMED');
  if (/(?:file|content):\/\/|data:[^\s;,]+[;,]/i.test(text))
    throw new Error('DOCUMENT_LOCAL_REFERENCE');
  return { text };
}

/** Persist an explicit allowlist; runtime callers cannot smuggle paths or files into the draft. */
export function copyDocumentExtraction(
  value: DocumentExtraction,
): DocumentExtraction {
  validateDocumentExtraction(value);
  return {
    version: value.version,
    documentLocalId: value.documentLocalId,
    engineVersion: value.engineVersion,
    state: value.state,
    provider: value.provider,
    model: value.model,
    job: value.job
      ? {
          id: value.job.id,
          ownerId: value.job.ownerId,
          pageCount: value.job.pageCount,
          nextRequestId: value.job.nextRequestId,
          uncertainPage: value.job.uncertainPage,
          errorCode: value.job.errorCode,
        }
      : undefined,
    editedText: value.editedText,
    updatedAt: value.updatedAt,
    confirmedAt: value.state === 'confirmed' ? value.confirmedAt : undefined,
    collectedAt: value.collectedAt,
    rotationDegrees: value.rotationDegrees,
    analytes: value.analytes?.map(
      ({
        name,
        value,
        unit,
        reference,
        reviewed,
        selected,
        section,
        sourceStart,
        sourcePage,
        sourceText,
        date,
        issues,
      }) => ({
        name,
        value,
        unit,
        reference,
        reviewed,
        selected,
        section,
        sourceStart,
        sourcePage,
        sourceText,
        date,
        issues: issues ? [...issues] : undefined,
      }),
    ),
    pages: value.pages.map(({ page, text, confidence, dates, issues, structure }) => ({
      page,
      text,
      confidence,
      structure: structure ? parseDocumentStructure(structure, text) : undefined,
      dates: dates ? [...dates] : undefined,
      issues: issues ? [...issues] : undefined,
    })),
  };
}

/** Preserve legacy transcription/confirmation; old documents are never automatically enqueued. */
export function migrateDocumentExtraction(
  value: DocumentExtraction,
): DocumentExtraction {
  validateDocumentExtraction(value);
  if (value.version === 2) return copyDocumentExtraction(value);
  return copyDocumentExtraction({
    ...value,
    version: 2,
    provider: 'legacy-local',
  });
}
