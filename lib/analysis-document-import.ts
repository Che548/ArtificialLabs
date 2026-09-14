import type { LabResult } from './health-types';

export function canReuseDocumentLabResult(
  previous: Pick<LabResult, 'collectedAt' | 'confirmedAt' | 'analytes'>,
  collectedAt: number,
) {
  // An empty attachment has an import timestamp, not a reviewed collection date.
  return (
    previous.collectedAt === collectedAt ||
    (!previous.confirmedAt && previous.analytes.length === 0)
  );
}

/** The committed attachment survives every subsequent OCR failure. */
export async function importAnalysisDocument(
  input: { uri: string; catalogKey: string; title: string },
  ports: {
    persist(uri: string): Promise<string>;
    discardUnreferenced(uri: string): Promise<void>;
    save(input: Omit<LabResult, 'localId' | 'updatedAt'>): Promise<LabResult>;
    imported(documentId: string): Promise<void>;
  },
) {
  const uri = await ports.persist(input.uri);
  let result: LabResult;
  try {
    result = await ports.save({
      catalogKey: input.catalogKey,
      title: input.title,
      collectedAt: Date.now(), // Attachment date; collection date requires review.
      status: 'unreviewed',
      analytes: [],
      hasLocalSourceDocument: true,
      localDocumentUri: uri,
    });
  } catch (error) {
    await ports.discardUnreferenced(uri);
    throw error;
  }
  const documentId = result.sourceDocumentLocalId;
  let ocrFailed = false;
  if (documentId) {
    try {
      // The manager applies the current account, sync and versioned consent gates.
      await ports.imported(documentId);
    } catch {
      ocrFailed = true;
    }
  }
  return { documentId, ocrFailed };
}
