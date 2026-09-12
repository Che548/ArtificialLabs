import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_LIMITS,
  copyDocumentExtraction,
  extractDocumentAnalyteCandidates,
  prepareDocumentInterpretation,
  validateDocumentMetadata,
  validateDocumentExtraction,
  type DocumentExtraction,
} from './document-policy';

const draft: DocumentExtraction = {
  version: 1,
  documentLocalId: 'document_synthetic',
  engineVersion: 'tesseract-5.5.0-rus-eng',
  state: 'confirmed',
  pages: [{ page: 1, text: 'Показатель 1,25 ед/л', confidence: 0.8 }],
  editedText: 'Показатель 1,25 ед/л',
  confirmedAt: 1,
  updatedAt: 1,
};
test('document type, size and page bounds are exact', () => {
  assert.equal(
    validateDocumentMetadata('application/pdf', DOCUMENT_LIMITS.bytes, 20),
    'application/pdf',
  );
  for (const args of [
    ['text/html', 1, 1],
    ['image/jpeg', 0, 1],
    ['image/png', DOCUMENT_LIMITS.bytes + 1, 1],
    ['application/pdf', 1, 21],
  ] as const)
    assert.throws(() => validateDocumentMetadata(...args));
});
test('unconfirmed OCR never becomes an interpretation payload', () => {
  assert.throws(() =>
    prepareDocumentInterpretation(
      { ...draft, state: 'review', confirmedAt: undefined },
      draft.editedText,
    ),
  );
  assert.deepEqual(prepareDocumentInterpretation(draft, draft.editedText), {
    text: 'Показатель 1,25 ед/л',
  });
  assert.throws(() => prepareDocumentInterpretation(draft, 'invented value'));
  assert.throws(() =>
    prepareDocumentInterpretation(
      { ...draft, editedText: 'file:///private/test.pdf' },
      'file:///private/test.pdf',
    ),
  );
});
test('extraction rejects unbounded pages and invalid confidence', () => {
  assert.throws(() =>
    validateDocumentExtraction({
      ...draft,
      pages: Array(21).fill(draft.pages[0]),
    }),
  );
  assert.throws(() =>
    validateDocumentExtraction({
      ...draft,
      pages: [{ ...draft.pages[0], confidence: NaN }],
    }),
  );
  assert.throws(() =>
    prepareDocumentInterpretation(
      { ...draft, editedText: 'a'.repeat(24001) },
      'a'.repeat(24001),
    ),
  );
});
test('candidate extraction preserves decimal separators and never invents missing columns', () => {
  const result = extractDocumentAnalyteCandidates(
    'Образец А;1,25;ед/л;0,5-2,0\nSample B\t12.50\nНепонятная строка',
  );
  assert.deepEqual(result, [
    {
      name: 'Образец А',
      value: '1,25',
      unit: 'ед/л',
      reference: '0,5-2,0',
      reviewed: false,
    },
    {
      name: 'Sample B',
      value: '12.50',
      unit: '',
      reference: '',
      reviewed: false,
    },
  ]);
  assert.throws(() =>
    validateDocumentExtraction({ ...draft, analytes: result, collectedAt: 1 }),
  );
  assert.throws(() =>
    validateDocumentExtraction({
      ...draft,
      analytes: result.map((row) => ({ ...row, reviewed: true })),
    }),
  );
  validateDocumentExtraction({
    ...draft,
    analytes: result.map((row) => ({ ...row, reviewed: true })),
    collectedAt: 1,
  });
});
test('SQLCipher draft allowlist drops unknown payload fields and accepts only quarter-turn rotations', () => {
  const value = copyDocumentExtraction({
    ...draft,
    localFileUri: 'file:///private/a.pdf',
    token: 'secret-placeholder',
  } as DocumentExtraction);
  assert.equal('localFileUri' in value, false);
  assert.equal('token' in value, false);
  assert.throws(() =>
    validateDocumentExtraction({
      ...draft,
      rotationDegrees: 45,
    } as unknown as DocumentExtraction),
  );
});
