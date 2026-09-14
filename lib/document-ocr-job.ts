import {
  copyDocumentExtraction,
  type DocumentExtraction,
} from '../shared/document-policy';
import { OCR_MODEL, parseOcrPage } from '../shared/document-ocr';

export type OcrJobPorts = {
  allowed(): boolean;
  save(draft: DocumentExtraction): Promise<void>;
  render(page: number): Promise<{ image: string; pages: number }>;
  send(
    args: {
      image: string;
      page: number;
      pages: number;
      jobId: string;
      requestId: string;
    },
    signal: AbortSignal,
  ): Promise<unknown>;
  requestId(): string;
};
/** Resumable local job. A durable request marker is written BEFORE an image is sent. */
export async function runDocumentOcrJob(
  initial: DocumentExtraction,
  ports: OcrJobPorts,
  signal: AbortSignal,
) {
  let draft = copyDocumentExtraction(initial);
  if (!draft.job || draft.provider !== 'yandex-ai-studio')
    throw new Error('OCR_INVALID_JOB');
  let saved = draft;
  const allowed = () => ports.allowed() && !signal.aborted;
  const persist = async () => {
    if (!allowed()) throw new Error('OCR_STOPPED');
    await ports.save(copyDocumentExtraction(draft));
    saved = copyDocumentExtraction(draft);
  };
  try {
    if (draft.job.nextRequestId) {
      draft = {
        ...draft,
        state: 'error',
        job: {
          ...draft.job,
          uncertainPage: draft.pages.length + 1,
          errorCode: 'OCR_UNCERTAIN',
        },
      };
      await persist();
      return;
    }
    while (!draft.job!.pageCount || draft.pages.length < draft.job!.pageCount) {
      if (!allowed()) return;
      const page = draft.pages.length + 1;
      const rendered = await ports.render(page);
      if (!allowed()) return;
      draft = {
        ...draft,
        state: 'recognizing',
        job: { ...draft.job!, pageCount: rendered.pages },
        updatedAt: Date.now(),
      };
      await persist();
      const requestId = ports.requestId();
      draft.job = {
        ...draft.job!,
        nextRequestId: requestId,
        uncertainPage: page,
      };
      await persist();
      if (!allowed()) return;
      const result = parseOcrPage(
        await ports.send(
          {
            image: rendered.image,
            page,
            pages: rendered.pages,
            jobId: draft.job.id,
            requestId,
          },
          signal,
        ),
      );
      if (!allowed()) return;
      draft = {
        ...draft,
        version: 2,
        model: OCR_MODEL,
        pages: [
          ...draft.pages,
          {
            page,
            text: result.text,
            confidence: null,
            dates: result.dates,
            issues: result.issues,
            structure: result.structure,
          },
        ],
        editedText: [draft.editedText, result.text]
          .filter(Boolean)
          .join('\n\n'),
        analytes: [
          ...(draft.analytes ?? []),
          ...result.rows.map((row) => ({
            ...row,
            sourcePage: page,
            selected: false,
            reviewed: false,
          })),
        ],
        job: {
          ...draft.job,
          nextRequestId: undefined,
          uncertainPage: undefined,
          errorCode: undefined,
        },
        updatedAt: Date.now(),
      };
      await persist();
    }
    draft = { ...draft, state: 'review', updatedAt: Date.now() };
    await persist();
  } catch (error) {
    if (!allowed()) return;
    const message = error instanceof Error ? error.message : '';
    const safe = [
      'OCR_INVALID_OUTPUT',
      'OCR_CONFIGURATION',
      'OCR_PROVIDER_UNAVAILABLE',
      'OCR_UNCERTAIN',
      'OCR_RATE_LIMITED',
      'OCR_ALREADY_SUBMITTED',
      'OCR_PAGE_ATTEMPTS_EXHAUSTED',
      'OCR_SERVICE_DISABLED',
      'OCR_CONSENT_REQUIRED',
      'OCR_CLOUD_SYNC_REQUIRED',
      'OCR_IMAGE_SIZE',
      'DOCUMENT_NATIVE_BUILD_REQUIRED',
      'DOCUMENT_SIZE',
      'DOCUMENT_PAGES',
      'DOCUMENT_CORRUPT',
      'DOCUMENT_UNSUPPORTED',
      'DOCUMENT_TEXT_SIZE',
      'DOCUMENT_EXTRACTION_INVALID',
      'DOCUMENT_PASSWORD',
      'DOCUMENT_BUSY',
    ];
    const code =
      safe.find((value) => message.includes(value)) ?? 'OCR_REQUEST_FAILED';
    draft = {
      ...saved,
      state:
        code === 'DOCUMENT_BUSY' && !saved.job?.nextRequestId
          ? 'queued'
          : 'error',
      job: { ...saved.job!, errorCode: code },
      updatedAt: Date.now(),
    };
    // Never replace successful pages with invalid output or save after ownership changed.
    if (allowed()) await ports.save(copyDocumentExtraction(draft));
  }
}

export function retryDocumentOcrJob(
  draft: DocumentExtraction,
): DocumentExtraction {
  if (!draft.job) throw new Error('OCR_INVALID_JOB');
  return {
    ...draft,
    state: 'queued',
    job: {
      ...draft.job,
      nextRequestId: undefined,
      uncertainPage: undefined,
      errorCode: undefined,
    },
    updatedAt: Date.now(),
  };
}
