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
};
export type DocumentExtraction = {
  version: 1;
  documentLocalId: string;
  engineVersion: string;
  state: 'recognizing' | 'review' | 'confirmed' | 'cancelled' | 'error';
  pages: Array<{ page: number; text: string; confidence: number }>;
  editedText: string;
  analytes?: DocumentAnalyteDraft[];
  collectedAt?: number;
  rotationDegrees?: 0 | 90 | 180 | 270;
  confirmedAt?: number;
  updatedAt: number;
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
    value.version !== 1 ||
    !/^[\w-]{1,160}$/.test(value.documentLocalId) ||
    typeof value.engineVersion !== 'string' ||
    value.engineVersion.length > 120 ||
    !['recognizing', 'review', 'confirmed', 'cancelled', 'error'].includes(
      value.state,
    ) ||
    !Number.isFinite(value.updatedAt) ||
    !Array.isArray(value.pages) ||
    value.pages.length > DOCUMENT_LIMITS.pages ||
    typeof value.editedText !== 'string' ||
    value.editedText.length > DOCUMENT_LIMITS.extractedCharacters ||
    value.pages.some(
      (page, index) =>
        page.page !== index + 1 ||
        typeof page.text !== 'string' ||
        !Number.isFinite(page.confidence) ||
        page.confidence < 0 ||
        page.confidence > 1,
    ) ||
    value.pages.reduce((sum, page) => sum + page.text.length, 0) >
      DOCUMENT_LIMITS.extractedCharacters ||
    (value.analytes !== undefined &&
      (!Array.isArray(value.analytes) ||
        value.analytes.length > 100 ||
        value.analytes.some(
          (item) =>
            !item ||
            [item.name, item.value, item.unit, item.reference].some(
              (field) => typeof field !== 'string' || field.length > 300,
            ) ||
            typeof item.reviewed !== 'boolean',
        ))) ||
    (value.collectedAt !== undefined &&
      (!Number.isFinite(value.collectedAt) || value.collectedAt <= 0)) ||
    (value.rotationDegrees !== undefined &&
      ![0, 90, 180, 270].includes(value.rotationDegrees)) ||
    (value.state === 'confirmed' &&
      (!Number.isFinite(value.confirmedAt) ||
        !value.editedText.trim() ||
        (value.analytes?.length &&
          (!value.collectedAt ||
            value.analytes.some(
              (item) =>
                !item.reviewed || !item.name.trim() || !item.value.trim(),
            )))))
  ) {
    throw new Error('DOCUMENT_EXTRACTION_INVALID');
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
    version: 1,
    documentLocalId: value.documentLocalId,
    engineVersion: value.engineVersion,
    state: value.state,
    editedText: value.editedText,
    updatedAt: value.updatedAt,
    confirmedAt: value.state === 'confirmed' ? value.confirmedAt : undefined,
    collectedAt: value.collectedAt,
    rotationDegrees: value.rotationDegrees,
    analytes: value.analytes?.map(
      ({ name, value, unit, reference, reviewed }) => ({
        name,
        value,
        unit,
        reference,
        reviewed,
      }),
    ),
    pages: value.pages.map(({ page, text, confidence }) => ({
      page,
      text,
      confidence,
    })),
  };
}
