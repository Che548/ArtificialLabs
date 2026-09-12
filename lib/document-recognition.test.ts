import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recognizeLocalDocument,
  type LocalDocumentEngine,
} from './document-recognition';
import type { DocumentExtraction } from '../shared/document-policy';

function setup() {
  const writes: DocumentExtraction[] = [];
  const seen: number[] = [];
  const controller = new AbortController();
  let cleaned = 0;
  let active = 0;
  const engine: LocalDocumentEngine = {
    version: 'test-only-synthetic',
    inspect: async () => ({ mime: 'application/pdf', bytes: 100, pages: 2 }),
    recognizePage: async (_uri, page) => {
      assert.equal(active++, 0);
      await Promise.resolve();
      active--;
      seen.push(page);
      return {
        text: page === 1 ? 'Показатель 1,25 ед/л' : 'Value 1.25 U/L',
        confidence: 0.75,
      };
    },
    cleanup: async () => {
      cleaned++;
    },
  };
  return {
    engine,
    writes,
    seen,
    controller,
    cleaned: () => cleaned,
    options: {
      documentLocalId: 'synthetic-document',
      uri: 'file:///synthetic.pdf',
      engine,
      signal: controller.signal,
      save: async (draft: DocumentExtraction) => {
        writes.push(draft);
      },
      now: () => 10,
    },
  };
}
test('sequential pages preserve exact text and end in review, never confirmation', async () => {
  const run = setup();
  const result = await recognizeLocalDocument(run.options);
  assert.equal(result.state, 'review');
  assert.equal(result.confirmedAt, undefined);
  assert.equal(result.editedText, 'Показатель 1,25 ед/л\n\nValue 1.25 U/L');
  assert.deepEqual(run.seen, [1, 2]);
  assert.equal(run.cleaned(), 1);
  assert.ok(
    run.writes.every((draft) => !JSON.stringify(draft).includes('file://')),
  );
});
test('React Native signals without throwIfAborted support recognition and cancellation', async () => {
  for (const cancelled of [false, true]) {
    const run = setup();
    Object.defineProperty(run.controller.signal, 'throwIfAborted', { value: undefined });
    if (cancelled) run.controller.abort();
    if (cancelled) {
      await assert.rejects(recognizeLocalDocument(run.options), /DOCUMENT_CANCELLED/);
      assert.deepEqual(run.seen, []);
      assert.equal(run.writes.at(-1)?.state, 'cancelled');
    } else {
      assert.equal((await recognizeLocalDocument(run.options)).pages.length, 2);
    }
    assert.equal(run.cleaned(), 1);
  }
});
test('cancellation retains partial draft, stops next page and cleans temporary data', async () => {
  const run = setup();
  await assert.rejects(
    recognizeLocalDocument({
      ...run.options,
      onProgress: (completed) => {
        if (completed === 1) run.controller.abort();
      },
    }),
  );
  assert.deepEqual(run.seen, [1]);
  assert.equal(run.writes.at(-1)?.state, 'cancelled');
  assert.equal(run.writes.at(-1)?.pages.length, 1);
  assert.equal(run.cleaned(), 1);
});
test('invalid page count and broken documents never invoke OCR', async () => {
  for (const broken of [false, true]) {
    const run = setup();
    run.engine.inspect = async () => {
      if (broken) throw new Error('DOCUMENT_CORRUPT');
      return { mime: 'application/pdf', bytes: 100, pages: 21 };
    };
    await assert.rejects(recognizeLocalDocument(run.options));
    assert.deepEqual(run.seen, []);
    assert.equal(run.writes.at(-1)?.state, 'error');
    assert.equal(run.cleaned(), 1);
  }
});
test('remote sources are never downloaded by recognition', async () => {
  const run = setup();
  await assert.rejects(
    recognizeLocalDocument({
      ...run.options,
      uri: 'https://example.com/file.pdf',
    }),
    /DOCUMENT_LOCAL_FILE_REQUIRED/,
  );
  assert.deepEqual(run.writes, []);
  assert.equal(run.cleaned(), 1);
});
