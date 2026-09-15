import { expect, test, vi } from 'vitest';
import { createEmptySnapshot, type LabResult } from './health-types';
import { buildAgentContextEnvelope } from './agent-context-builder';
import { isReviewedLabResult } from './reviewed-lab-result';

const index = vi.hoisted(() => ({ hits: [] as Array<{ entity: string; localId: string }> }));
vi.mock('./local-database', () => ({ searchLocalAgentIndex: async () => index.hits }));
import { buildAgentContextEnvelope as legacyEnvelope, executeLocalAgentTool } from './agent-context';

const now = Date.UTC(2026, 8, 13);
const result: LabResult = {
  localId: 'reviewed-ocr', catalogKey: 'document', title: 'Synthetic lab report',
  status: 'unreviewed', confirmedAt: now - 1000, collectedAt: now - 86_400_000,
  analytes: [{ name: 'CRP', value: '<0,10', unit: 'mg/L', reference: '<5' }],
  hasLocalSourceDocument: true, sourceDocumentLocalId: 'document-1', updatedAt: now,
};

test.each([buildAgentContextEnvelope, legacyEnvelope])('chat context includes explicitly reviewed OCR values but excludes attachments and drafts', build => {
  const snapshot = createEmptySnapshot();
  snapshot.labResults = [result, { ...result, localId: 'unconfirmed', confirmedAt: undefined }, { ...result, localId: 'attachment', confirmedAt: undefined, analytes: [] }];
  const context = build(snapshot, now);
  expect(context.confirmedTests).toHaveLength(1);
  expect(context.confirmedTests[0].sourceRef.localId).toBe('reviewed-ocr');
  expect(JSON.stringify(context.confirmedTests)).toContain('<0,10');
  expect(result.status).toBe('unreviewed');
});

test('search returns checked lab values without calling them normal', async () => {
  const snapshot = createEmptySnapshot();
  snapshot.labResults = [result, { ...result, localId: 'unconfirmed', confirmedAt: undefined }];
  index.hits = snapshot.labResults.map(row => ({ entity: 'labResults', localId: row.localId }));
  const response = await executeLocalAgentTool(snapshot, { callId: 'call-1', name: 'search_tests', arguments: { query: 'CRP' } }, now);
  const data = JSON.parse(response.output);
  expect(data.items).toHaveLength(1);
  expect(data.items[0]).toMatchObject({ status: 'user_confirmed_not_medically_classified', values: result.analytes });
});

test('document search still exposes metadata only, never originals or OCR text', async () => {
  const snapshot = createEmptySnapshot();
  snapshot.documents = [{ localId: 'document-1', title: 'Synthetic document', category: 'lab', documentDate: now - 1000, hasLocalFile: true, localFileUri: 'file:///private/original.pdf', updatedAt: now }];
  index.hits = [{ entity: 'documents', localId: 'document-1' }];
  const response = await executeLocalAgentTool(snapshot, { callId: 'call-2', name: 'search_documents', arguments: { query: 'Synthetic' } }, now);
  expect(JSON.parse(response.output).items[0].contentAvailable).toBe(false);
  expect(response.output).not.toContain('file:');
  expect(response.output).not.toContain('original.pdf');
});

test('deleted, empty, invalid and future confirmation receipts are excluded', () => {
  for (const patch of [{ deletedAt: now }, { confirmedAt: 0 }, { confirmedAt: NaN }, { confirmedAt: now + 1 }, { analytes: [] }, { analytes: [{ name: 'CRP', value: '' }] }]) {
    expect(isReviewedLabResult({ ...result, ...patch }, now)).toBe(false);
  }
  expect(isReviewedLabResult({ ...result, confirmedAt: undefined, status: 'normal' }, now)).toBe(true);
});

test('reviewed section context survives chat projection, with explicit bounded omission counts', async () => {
  const snapshot=createEmptySnapshot();snapshot.labResults=[{...result,analytes:Array.from({length:27},(_,i)=>({name:'Sample',value:String(i),section:i%2?'Specimen B':'Specimen A'}))}];
  for(const build of [buildAgentContextEnvelope,legacyEnvelope]){
    const context=build(snapshot,now);expect(context.confirmedTests[0].values[0]).toContain('Specimen A');expect(context.confirmedTests[0].omittedValueCount).toBe(7);
  }
  index.hits=[{entity:'labResults',localId:result.localId}];
  const tool=await executeLocalAgentTool(snapshot,{callId:'call-2',name:'search_tests',arguments:{query:'Sample'}},now);
  const data=JSON.parse(tool.output);expect(data.items[0].values[0].section).toBe('Specimen A');expect(data.items[0].omittedValueCount).toBe(7);
});
