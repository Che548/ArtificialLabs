import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEntityCsv,
  createJsonArchive,
  parseImportPayload,
} from './data-transfer';
import { createEmptySnapshot } from './health-types';

test('JSON archive strips all device-only URIs', () => {
  const snapshot = createEmptySnapshot();
  snapshot.documents.push({
    localId: 'document_1',
    title: 'Заключение',
    category: 'medical',
    documentDate: 1,
    hasLocalFile: true,
    localFileUri: 'file:///private/document.pdf',
    updatedAt: 2,
  });
  const archive = createJsonArchive(snapshot);
  assert.equal(archive.includes('file:///private'), false);
  const preview = parseImportPayload(archive);
  assert.equal(preview.total, 1);
  assert.equal(preview.records.documents?.[0]?.title, 'Заключение');
});

test('CSV round trip preserves quoted content and stable ids', () => {
  const csv = createEntityCsv('journalEntries', [
    {
      localId: 'journal_1',
      occurredAt: 1,
      kind: 'note',
      label: 'Самочувствие, утро',
      textValue: 'Строка "один"\nСтрока два',
      source: 'manual',
      updatedAt: 2,
    },
  ]);
  const preview = parseImportPayload(csv);
  assert.equal(preview.records.journalEntries?.[0]?.localId, 'journal_1');
  assert.equal(
    preview.records.journalEntries?.[0]?.textValue,
    'Строка "один"\nСтрока два',
  );
});

test('unsupported JSON is rejected', () => {
  assert.throws(
    () => parseImportPayload('{"version":99}'),
    /UNSUPPORTED_ARCHIVE/,
  );
});

test('legacy journal import is normalized before it reaches the outbox', () => {
  const preview = parseImportPayload(
    JSON.stringify({
      schema: 'artificiallabs-health-archive',
      version: 1,
      entities: {
        journalEntries: [
          {
            localId: 'legacy_journal_1',
            entryDate: 10,
            symptoms: ['Головная боль'],
            notes: 'После сна',
            updatedAt: 11,
          },
        ],
      },
    }),
  );
  assert.deepEqual(preview.records.journalEntries?.[0], {
    localId: 'legacy_journal_1',
    occurredAt: 10,
    kind: 'symptom',
    label: 'Головная боль',
    source: 'manual',
    textValue: 'После сна',
    updatedAt: 11,
  });
});

test('journal import rejects records without a usable date', () => {
  assert.throws(
    () =>
      parseImportPayload(
        JSON.stringify({
          schema: 'artificiallabs-health-archive',
          version: 1,
          entities: {
            journalEntries: [{ localId: 'broken_journal', updatedAt: 11 }],
          },
        }),
      ),
    /INVALID_JOURNAL_OCCURRED_AT/,
  );
});
