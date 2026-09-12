import {
  DOCUMENT_LIMITS,
  validateDocumentExtraction,
  validateDocumentMetadata,
  type DocumentExtraction,
} from '../shared/document-policy';

/** Native implementation must render and recognize off the UI thread. No transport API. */
export interface LocalDocumentEngine {
  version: string;
  inspect(uri: string): Promise<{ mime: string; bytes: number; pages: number }>;
  recognizePage(
    uri: string,
    page: number,
    signal: AbortSignal,
  ): Promise<{ text: string; confidence: number }>;
  cleanup(): Promise<void>;
}

/** React Native's AbortSignal does not implement the browser throwIfAborted method. */
export function assertDocumentNotCancelled(signal: Pick<AbortSignal, 'aborted'>) {
  if (signal.aborted) throw new Error('DOCUMENT_CANCELLED');
}

/** One document, one page in flight. Persistence is the dedicated SQLCipher table, not outbox. */
export async function recognizeLocalDocument({
  documentLocalId,
  uri,
  engine,
  signal,
  save,
  onProgress = () => {},
  now = Date.now,
}: {
  documentLocalId: string;
  uri: string;
  engine: LocalDocumentEngine;
  signal: AbortSignal;
  save: (draft: DocumentExtraction) => Promise<void>;
  onProgress?: (completed: number, total: number) => void;
  now?: () => number;
}): Promise<DocumentExtraction> {
  // Remote and content-provider references must first be imported into app-owned storage.
  if (!uri.startsWith('file://')) {
    // The adapter acquires its native single-flight lease at construction.
    // Rejecting a source must release it even before a draft is created.
    await engine.cleanup();
    throw new Error('DOCUMENT_LOCAL_FILE_REQUIRED');
  }
  let draft: DocumentExtraction = {
    version: 1,
    documentLocalId,
    engineVersion: engine.version,
    state: 'recognizing',
    pages: [],
    editedText: '',
    updatedAt: now(),
  };
  const persist = async () => {
    validateDocumentExtraction(draft);
    await save({ ...draft, pages: draft.pages.map((page) => ({ ...page })) });
  };
  try {
    assertDocumentNotCancelled(signal);
    const info = await engine.inspect(uri);
    validateDocumentMetadata(info.mime, info.bytes, info.pages);
    assertDocumentNotCancelled(signal);
    await persist();
    onProgress(0, info.pages);
    for (let page = 1; page <= info.pages; page++) {
      assertDocumentNotCancelled(signal);
      const result = await engine.recognizePage(uri, page, signal);
      assertDocumentNotCancelled(signal);
      const editedText = [
        ...draft.pages.map((item) => item.text),
        result.text,
      ].join('\n\n');
      if (editedText.length > DOCUMENT_LIMITS.extractedCharacters)
        throw new Error('DOCUMENT_TEXT_SIZE');
      draft = {
        ...draft,
        pages: [
          ...draft.pages,
          { page, text: result.text, confidence: result.confidence },
        ],
        editedText,
        updatedAt: now(),
      };
      await persist();
      onProgress(page, info.pages);
    }
    assertDocumentNotCancelled(signal);
    draft = { ...draft, state: 'review', updatedAt: now() };
    await persist();
    return draft;
  } catch (error) {
    draft = {
      ...draft,
      state: signal.aborted ? 'cancelled' : 'error',
      updatedAt: now(),
    };
    // Preserve partial pages, but never promote cancelled/failed output to confirmed data.
    await persist();
    throw error;
  } finally {
    await engine.cleanup();
  }
}
