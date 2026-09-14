import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOcrPage } from './document-ocr';
import { normalizeDocumentDate } from './document-structure';
import {
  copyDocumentExtraction,
  migrateDocumentExtraction,
  validateDocumentExtraction,
  type DocumentExtraction,
} from './document-policy';
import {
  documentCollectionDates,
  documentReportBlocks,
} from './document-review-model';
import { runDocumentOcrJob } from '../lib/document-ocr-job';
const text =
  'Bilingual panel\nBorn: 1988-06-14\nCollected: 2024-02-29 08:15\nReported: 2024-03-01\nSerum\nTechnique optical\nMarker <1,25 mg/L ≤4,00\nUrine\nMarker negative\nConclusion: repeat sampling if requested.';
const input = () => ({
  version: 2,
  text,
  dates: ['2024-02-29'],
  issues: [],
  structure: {
    version: 1,
    title: 'Bilingual panel',
    pageRole: 'content',
    dates: [
      {
        kind: 'birth',
        text: '1988-06-14',
        sourceText: 'Born: 1988-06-14',
        section: '',
      },
      {
        kind: 'collection',
        text: '2024-02-29 08:15',
        sourceText: 'Collected: 2024-02-29 08:15',
        section: '',
      },
      {
        kind: 'reported',
        text: '2024-03-01',
        sourceText: 'Reported: 2024-03-01',
        section: '',
      },
    ],
    blocks: [
      {
        kind: 'conclusion',
        text: 'Conclusion: repeat sampling if requested.',
        section: '',
      },
    ],
  },
  rows: [
    {
      kind: 'method',
      section: 'Serum',
      name: 'Technique',
      value: 'optical',
      unit: '',
      reference: '',
      date: '',
      sourceText: 'Technique optical',
      issues: [],
    },
    {
      kind: 'observation',
      section: 'Serum',
      name: 'Marker',
      value: '<1,25',
      unit: 'mg/L',
      reference: '≤4,00',
      date: '',
      sourceText: 'Marker <1,25 mg/L ≤4,00',
      issues: [],
    },
    {
      kind: 'observation',
      section: 'Urine',
      name: 'Marker',
      value: 'negative',
      unit: '',
      reference: '',
      date: '',
      sourceText: 'Marker negative',
      issues: [],
    },
  ],
});
const draft = (page = parseOcrPage(input())): DocumentExtraction => ({
  version: 2,
  documentLocalId: 'synthetic',
  engineVersion: 'qwen-ocr-v1',
  provider: 'yandex-ai-studio',
  state: 'review',
  editedText: page.text,
  pages: [
    {
      page: 1,
      text: page.text,
      confidence: null,
      dates: page.dates,
      structure: page.structure,
    },
  ],
  analytes: page.rows.map((r) => ({
    ...r,
    reviewed: false,
    selected: false,
    sourcePage: 1,
  })),
  updatedAt: 1,
});
test('preserves typed dates, narrative, source sections and exact qualitative/numeric values across repeated parsing and storage', () => {
  const parsed = parseOcrPage(input());
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].value, '<1,25');
  assert.equal(parsed.rows[0].reference, '≤4,00');
  assert.equal(parsed.rows[1].value, 'negative');
  assert.deepEqual(parseOcrPage(parsed), parsed);
  const saved = copyDocumentExtraction(draft(parsed));
  assert.equal(saved.analytes?.[0].section, 'Serum');
  assert.equal(saved.analytes?.[1].section, 'Urine');
  assert.deepEqual(documentCollectionDates(saved), ['2024-02-29']);
  assert.equal(documentReportBlocks(saved).length, 2);
  assert.equal(saved.analytes?.[0].date, '2024-02-29 08:15');
});
test('birth/report dates never substitute for collection; missing evidence generates review flags', () => {
  const p = input();
  p.structure.dates = p.structure.dates.filter((d) => d.kind !== 'collection');
  p.rows[1].date = '1988-06-14';
  const row = parseOcrPage(p).rows[0];
  assert.equal(row.date, '');
  assert.ok(row.issues.includes('collection_date_not_supported'));
  assert.ok(row.issues.includes('collection_date_requires_review'));
  assert.deepEqual(documentCollectionDates(draft(parseOcrPage(p))), []);
});
test('mixed collection dates are scoped to sections, never assigned across unrelated pages', () => {
  const p = input();
  p.text += '\nUrine collected: 2024-03-02';
  p.structure.dates[1].section = 'Serum';
  p.structure.dates.push({
    kind: 'collection',
    text: '2024-03-02',
    sourceText: 'Urine collected: 2024-03-02',
    section: 'Urine',
  });
  const parsed = parseOcrPage(p);
  assert.equal(parsed.rows[0].date, '2024-02-29 08:15');
  assert.equal(parsed.rows[1].date, '2024-03-02');
  const d = draft(parsed);
  d.state = 'confirmed';
  d.confirmedAt = 1;
  d.collectedAt = new Date(2024, 1, 29, 12).getTime();
  d.analytes = d.analytes!.map((r) => ({
    ...r,
    reviewed: true,
    selected: true,
  }));
  assert.throws(() => validateDocumentExtraction(d), /DOCUMENT_DATE_MISMATCH/);
  d.analytes[1].selected = false;
  validateDocumentExtraction(d);
});
test('identical row text under different headings retains distinct source locations', () => {
  const p = input();
  p.text = p.text.replace('Marker negative', 'Marker <1,25 mg/L ≤4,00');
  p.rows[2] = { ...p.rows[1], section: 'Urine' };
  const r = parseOcrPage(p).rows;
  assert.notEqual(r[0].sourceStart, r[1].sourceStart);
  assert.equal(
    p.text.slice(r[1].sourceStart!, r[1].sourceStart! + r[1].sourceText.length),
    r[1].sourceText,
  );
});
test('fabricated dates, sources and headings are rejected rather than repaired', () => {
  for (const alter of [
    (p: ReturnType<typeof input>) => {
      p.structure.blocks[0].text = 'invented';
    },
    (p) => {
      p.structure.dates[0].text = '2000-01-01';
    },
    (p) => {
      p.rows[1].section = 'invented section';
    },
  ]) {
    const p = input();
    alter(p);
    assert.throws(() => parseOcrPage(p), /OCR_INVALID_OUTPUT/);
  }
});
test('narrative and attachment-only pages remain useful without inventing lab observations', () => {
  const p = input();
  p.rows = [];
  const d = draft(parseOcrPage(p));
  assert.equal(d.analytes?.length, 0);
  assert.equal(documentReportBlocks(d)[0].kind, 'conclusion');
  p.rows = [
    {
      ...input().rows[0],
      kind: 'reference',
      name: 'Attachment',
      value: 'see next report',
      sourceText: 'Technique optical',
    },
  ];
  assert.equal(parseOcrPage(p).rows.length, 0);
  assert.ok(
    parseOcrPage(p).structure?.blocks.some((b) => b.kind === 'reference'),
  );
});
test('strict calendar normalization supports printed timestamps and rejects impossible dates', () => {
  assert.equal(normalizeDocumentDate('29.02.2024 08:15'), '2024-02-29');
  assert.equal(normalizeDocumentDate('2024-02-29T08:15:30'), '2024-02-29');
  for (const value of ['29.02.2025', '31/04/2024', '1999', '03/04/05'])
    assert.equal(normalizeDocumentDate(value), undefined);
});
test('legacy edited and confirmed rows are preserved; untyped legacy dates do not become collection choices', () => {
  const d = draft();
  delete d.pages[0].structure;
  d.pages[0].dates = ['1988-06-14'];
  d.analytes = [];
  d.version = 1;
  d.pages[0].confidence = 0.8;
  d.state = 'confirmed';
  d.editedText = 'user edit';
  d.confirmedAt = 123;
  const migrated = migrateDocumentExtraction(d);
  assert.equal(migrated.confirmedAt, 123);
  assert.equal(migrated.editedText, 'user edit');
  assert.deepEqual(documentCollectionDates(migrated), []);
});
test('interrupted structured jobs retain completed pages and append later pages without losing edits', async () => {
  let saved = draft();
  saved.job = { id: 'job_synthetic', ownerId: 'owner', pageCount: 2 };
  saved.analytes![0].value = 'user edited';
  saved.analytes![0].reviewed = true;
  await runDocumentOcrJob(
    saved,
    {
      allowed: () => true,
      requestId: () => 'request_second',
      save: async (d) => {
        saved = copyDocumentExtraction(d);
      },
      render: async (page) => {
        assert.equal(page, 2);
        return { image: 'synthetic', pages: 2 };
      },
      send: async () => input(),
    },
    new AbortController().signal,
  );
  assert.equal(saved.pages.length, 2);
  assert.ok(saved.pages[1].structure);
  assert.equal(saved.analytes![0].value, 'user edited');
  assert.equal(saved.analytes![0].reviewed, true);
});
