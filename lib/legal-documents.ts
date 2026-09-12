import documents from '../content/legal/documents.json';

export type LegalDocumentId =
  | 'agreement'
  | 'privacy'
  | 'personal-data'
  | 'health'
  | 'ai'
  | 'analytics'
  | 'marketing'
  | 'storage';

export type LegalDocumentSelection = LegalDocumentId | 'index' | null;

/** Bundled, offline copies of the user-facing DOCX documents. No consent writes. */
export const legalDocuments = documents;

export function getLegalDocument(id: LegalDocumentId) {
  const document = legalDocuments.find((item) => item.id === id);
  if (!document) throw new Error(`Unknown legal document: ${id}`);
  return document;
}
