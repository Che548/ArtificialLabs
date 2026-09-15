import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReuseDocumentLabResult,
  importAnalysisDocument,
} from './analysis-document-import';
import type { LabResult } from './health-types';

const input = {
  uri: 'cache://synthetic.pdf',
  catalogKey: 'cbc',
  title: 'Общий анализ крови',
};
test('review replaces the empty attachment even when its import date differs', () => {
  assert.equal(
    canReuseDocumentLabResult({ collectedAt: 1, analytes: [] }, 2),
    true,
  );
});

test('review preserves results already confirmed for another collection date', () => {
  const previous = {
    collectedAt: 1,
    confirmedAt: 3,
    analytes: [{ name: 'Synthetic', value: '1,25' }],
  };
  assert.equal(canReuseDocumentLabResult(previous, 2), false);
  assert.equal(canReuseDocumentLabResult(previous, 1), true);
  assert.equal(
    canReuseDocumentLabResult(
      { collectedAt: 1, analytes: previous.analytes },
      2,
    ),
    false,
  );
});
function fixture(failure?: 'persist' | 'save' | 'ocr') {
  const events: string[] = [];
  let saved: LabResult | undefined;
  return {
    events,
    get saved() {
      return saved;
    },
    ports: {
      async persist() {
        events.push('persist');
        if (failure === 'persist') throw new Error('DOCUMENT_SIZE');
        return 'local://synthetic.pdf';
      },
      async save(value: Omit<LabResult, 'localId' | 'updatedAt'>) {
        events.push('save');
        if (failure === 'save') throw new Error('disk unavailable');
        saved = {
          ...value,
          localId: 'lab-1',
          updatedAt: 1,
          sourceDocumentLocalId: 'document-1',
        };
        return saved;
      },
      async discardUnreferenced() {
        events.push('cleanup');
      },
      async imported(id: string) {
        assert.equal(id, 'document-1');
        assert.ok(saved, 'OCR must follow the durable local write');
        events.push('ocr');
        if (failure === 'ocr') throw new Error('OCR_ACCOUNT_UNAVAILABLE');
      },
    },
  };
}

test('analysis attachment saves before OCR and supplies no unconfirmed analytes', async () => {
  const f = fixture();
  assert.deepEqual(await importAnalysisDocument(input, f.ports), {
    documentId: 'document-1',
    ocrFailed: false,
  });
  assert.deepEqual(f.events, ['persist', 'save', 'ocr']);
  assert.deepEqual(f.saved?.analytes, []);
  assert.equal(f.saved?.confirmedAt, undefined);
  assert.equal(f.saved?.status, 'unreviewed');
  assert.equal(f.saved?.catalogKey, 'cbc');
  assert.equal(f.saved?.localDocumentUri, 'local://synthetic.pdf');
});

test('OCR failure keeps the committed attachment and exposes its review ID', async () => {
  const f = fixture('ocr');
  assert.deepEqual(await importAnalysisDocument(input, f.ports), {
    documentId: 'document-1',
    ocrFailed: true,
  });
  assert.deepEqual(f.events, ['persist', 'save', 'ocr']);
  assert.ok(f.saved);
});

test('failed local save cleans only unreferenced files and never queues OCR', async () => {
  const f = fixture('save');
  await assert.rejects(
    importAnalysisDocument(input, f.ports),
    /disk unavailable/,
  );
  assert.deepEqual(f.events, ['persist', 'save', 'cleanup']);
});

test('invalid originals never create records or OCR requests', async () => {
  const f = fixture('persist');
  await assert.rejects(importAnalysisDocument(input, f.ports), /DOCUMENT_SIZE/);
  assert.deepEqual(f.events, ['persist']);
});

test('manager may decline automatic OCR without blocking the local import', async () => {
  const f = fixture();
  f.ports.imported = async () => {}; // Existing manager's sync/consent gate.
  assert.deepEqual(await importAnalysisDocument(input, f.ports), {
    documentId: 'document-1',
    ocrFailed: false,
  });
  assert.deepEqual(f.events, ['persist', 'save']);
});
