import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runDocumentOcrJob,
  retryDocumentOcrJob,
  type OcrJobPorts,
} from './document-ocr-job';
import {
  copyDocumentExtraction,
  migrateDocumentExtraction,
  validateDocumentExtraction,
  type DocumentExtraction,
} from '../shared/document-policy';
import {
  parseOcrPage,
  validateOcrRequest,
  OCR_POLICY_VERSION,
} from '../shared/document-ocr';
const page = {
  version: 1,
  text: 'Глюкоза 5,25 ммоль/л 3,9–6,1\nProtein negative',
  rows: [
    {
      name: 'Глюкоза',
      value: '5,25',
      unit: 'ммоль/л',
      reference: '3,9–6,1',
      sourceText: 'Глюкоза 5,25 ммоль/л 3,9–6,1',
      date: '12.09.2026',
      issues: [],
    },
    {
      name: 'Protein',
      value: 'negative',
      unit: '',
      reference: '',
      sourceText: 'Protein negative',
      date: '',
      issues: [],
    },
  ],
  dates: ['12.09.2026'],
  issues: [],
};
const initial = (): DocumentExtraction => ({
  version: 2,
  documentLocalId: 'document_test',
  engineVersion: 'qwen-ocr-v1',
  provider: 'yandex-ai-studio',
  state: 'queued',
  pages: [],
  editedText: '',
  job: { id: 'job_test_123', ownerId: 'owner_test' },
  updatedAt: 1,
});
function setup() {
  let saved = initial(),
    calls = 0,
    allowed = true;
  const ports: OcrJobPorts = {
    allowed: () => allowed,
    save: async (d) => {
      saved = copyDocumentExtraction(d);
    },
    render: async () => ({ image: 'synthetic', pages: 2 }),
    send: async () => {
      assert.ok(saved.job?.nextRequestId);
      calls++;
      return page;
    },
    requestId: () => `request_${calls}_123`,
  };
  return {
    ports,
    get saved() {
      return saved;
    },
    get calls() {
      return calls;
    },
    stop() {
      allowed = false;
    },
  };
}
test('two pages persist provenance, exact strings and unselected/unconfirmed rows', async () => {
  const h = setup();
  await runDocumentOcrJob(initial(), h.ports, new AbortController().signal);
  assert.equal(h.calls, 2);
  assert.equal(h.saved.state, 'review');
  assert.equal(h.saved.pages[1].confidence, null);
  assert.equal(h.saved.analytes?.[0].value, '5,25');
  assert.equal(h.saved.analytes?.[1].value, 'negative');
  assert.equal(h.saved.analytes?.[2].sourcePage, 2);
  assert.equal(h.saved.analytes?.[0].selected, false);
  assert.equal(h.saved.confirmedAt, undefined);
});
test('late completion after consent/account/document change never saves OCR content', async () => {
  const h = setup();
  h.ports.send = async () => {
    h.stop();
    return page;
  };
  await runDocumentOcrJob(initial(), h.ports, new AbortController().signal);
  assert.equal(h.saved.pages.length, 0);
  assert.ok(h.saved.job?.nextRequestId);
});
test('uncertain requests are not replayed on restart; explicit retry resumes only missing pages', async () => {
  const h = setup();
  let sent = 0;
  h.ports.send = async () => {
    if (++sent === 2) throw new Error('OCR_PROVIDER_UNAVAILABLE');
    return page;
  };
  await runDocumentOcrJob(initial(), h.ports, new AbortController().signal);
  assert.equal(h.saved.pages.length, 1);
  assert.equal(h.saved.state, 'error');
  assert.ok(h.saved.job?.nextRequestId);
  const persisted = h.saved;
  h.ports.send = async () => {
    throw new Error('must not resend');
  };
  await runDocumentOcrJob(persisted, h.ports, new AbortController().signal);
  assert.equal(h.saved.job?.errorCode, 'OCR_UNCERTAIN');
  h.ports.send = async (args) => {
    assert.equal(args.page, 2);
    return page;
  };
  await runDocumentOcrJob(
    retryDocumentOcrJob(h.saved),
    h.ports,
    new AbortController().signal,
  );
  assert.equal(h.saved.state, 'review');
  assert.equal(h.saved.pages.length, 2);
});
test('malformed output preserves previous pages and the uncertain marker', async () => {
  const h = setup();
  let n = 0;
  h.ports.send = async () =>
    ++n === 1 ? page : { ...page, rows: [{ ...page.rows[0], value: 5.25 }] };
  await runDocumentOcrJob(initial(), h.ports, new AbortController().signal);
  assert.equal(h.saved.pages.length, 1);
  assert.equal(h.saved.job?.errorCode, 'OCR_INVALID_OUTPUT');
});
test('offline before send, cancellation during render and unavailable renderer do not upload', async () => {
  const h = setup();
  const abort = new AbortController();
  h.ports.render = async () => {
    abort.abort();
    return { image: 'synthetic', pages: 1 };
  };
  await runDocumentOcrJob(initial(), h.ports, abort.signal);
  assert.equal(h.calls, 0);
  h.stop();
  await runDocumentOcrJob(initial(), h.ports, new AbortController().signal);
  assert.equal(h.calls, 0);
});
test('v1 migration retains edited text, confidence, row review and confirmation', () => {
  const old: DocumentExtraction = {
    ...initial(),
    version: 1,
    provider: undefined,
    job: undefined,
    state: 'confirmed',
    pages: [{ page: 1, text: 'edited', confidence: 0.8 }],
    editedText: 'edited',
    confirmedAt: 1,
  };
  const next = migrateDocumentExtraction(old);
  assert.equal(next.version, 2);
  assert.equal(next.provider, 'legacy-local');
  assert.equal(next.confirmedAt, 1);
  assert.equal(next.pages[0].confidence, 0.8);
  assert.equal(next.job, undefined);
});
test('selected rows require review and one explicitly confirmed collection date', () => {
  const d: DocumentExtraction = {
    ...initial(),
    state: 'confirmed',
    editedText: page.text,
    confirmedAt: 1,
    collectedAt: new Date(2026, 8, 12, 12).getTime(),
    analytes: page.rows.map((r) => ({ ...r, selected: true, reviewed: false })),
  };
  assert.throws(() => validateDocumentExtraction(d));
  d.analytes = d.analytes!.map((r) => ({ ...r, reviewed: true }));
  validateDocumentExtraction(d);
  d.analytes[1].date = '2026-09-11';
  assert.throws(() => validateDocumentExtraction(d), /DOCUMENT_DATE_MISMATCH/);
  d.analytes[1].selected = false;
  validateDocumentExtraction(d);
});
test('blank/unreadable pages valid; invented sources, huge fields and non-image requests rejected', () => {
  assert.equal(
    parseOcrPage({
      version: 1,
      text: '',
      rows: [],
      dates: [],
      issues: ['unreadable'],
    }).rows.length,
    0,
  );
  assert.throws(() =>
    parseOcrPage({
      ...page,
      rows: [{ ...page.rows[0], sourceText: 'invented' }],
    }),
  );
  assert.throws(() => parseOcrPage({ ...page, text: 'x'.repeat(30001) }));
  assert.throws(() =>
    validateOcrRequest({
      jobId: 'job_test_123',
      requestId: 'request_test',
      page: 21,
      pages: 20,
      policyVersion: OCR_POLICY_VERSION,
      image: '/9j/AAAA',
    }),
  );
  assert.throws(() =>
    validateOcrRequest({
      jobId: 'job_test_123',
      requestId: 'request_test',
      page: 1,
      pages: 1,
      policyVersion: OCR_POLICY_VERSION,
      image: 'file:///secret',
    }),
  );
});
