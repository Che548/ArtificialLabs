// Exercises the actual Expo native module over the local Hermes inspector.
// No app account, provider call, remote file or medical fixture is used.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hermesQaExpression } from './hermes-qa-expression.mjs';

const root = process.env.E2E_OCR_MATRIX_URI;
const appId = process.env.E2E_OCR_MATRIX_APP_ID;
if (!root?.startsWith('file://') || !root.endsWith('/ocr-matrix/') ||
    !['engineering.brainwaves.sfera', 'com.anonymous.privateexpo'].includes(appId)) {
  throw new Error('An app-owned synthetic matrix directory and QA app ID are required.');
}
let target;
for (let attempt = 0; attempt < 120; attempt++) {
  const pages = await fetch('http://127.0.0.1:8083/json/list').then(response => response.json()).catch(() => []);
  const matching = pages.filter(page => page.appId === appId);
  if (matching.length === 1) { target = matching[0]; break; }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!target) throw new Error('The dedicated QA Hermes runtime did not become available.');
const url = new URL(target.webSocketDebuggerUrl);
if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.port !== '8083' || url.username || url.password) throw new Error('Only the local QA inspector is allowed.');
const socket = new WebSocket(url);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('QA inspector connection failed.')), { once: true }); });
let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const response = JSON.parse(event.data);
  if (response.id) pending.get(response.id)?.(response);
});
async function evaluate(expression) {
  const id = ++sequence;
  const reply = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('QA inspector operation timed out.')); }, 15000);
    pending.set(id, response => { clearTimeout(timeout); pending.delete(id); resolve(response); });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  if (reply.error || reply.result?.exceptionDetails) throw new Error('QA inspector evaluation failed; no raw runtime data logged.');
  return reply.result?.result?.value;
}

async function runMatrix(base) {
  const state = globalThis.__sferaOcrQa = { done: false, phase: 'starting', checks: [] };
  const native = globalThis.expo?.modules?.DocumentOcr;
  const check = (name, passed) => { state.checks.push({ name, passed: Boolean(passed) }); };
  const lease = async work => {
    if (!native.begin()) throw new Error('QA_ENGINE_BUSY');
    try { return await work(); } finally { await native.cleanupAsync(); }
  };
  const errorMatches = async (work, code) => {
    try { await work(); return false; } catch (error) { return String(error).includes(code); }
  };
  const tokens = text => ['1,25', '12.50', '2026-09-11'].every(token => text.includes(token));
  try {
    if (!native) throw new Error('QA_ENGINE_MISSING');
    for (const [file, pages, mime] of [['two-pages.pdf', 2, 'application/pdf'], ['twenty-pages.pdf', 20, 'application/pdf'], ['sample.jpg', 1, 'image/jpeg'], ['sample.png', 1, 'image/png']]) {
      state.phase = `inspect ${file}`;
      const info = await lease(() => native.inspectAsync(base + file));
      check(`inspect ${file}`, info.pages === pages && info.mime === mime && info.bytes > 0);
    }
    for (const [file, code] of [['password.pdf', 'DOCUMENT_PASSWORD'], ['corrupt.pdf', 'DOCUMENT_CORRUPT'], ['too-many-pages.pdf', 'DOCUMENT_PAGES'], ['too-large.pdf', 'DOCUMENT_SIZE'], ['unsupported.txt', 'DOCUMENT_UNSUPPORTED']]) {
      state.phase = `reject ${file}`;
      check(`reject ${file}`, await lease(() => errorMatches(() => native.inspectAsync(base + file), code)));
    }
    check('remote source rejected without download', await lease(() => errorMatches(() => native.inspectAsync('https://example.invalid/synthetic.pdf'), 'DOCUMENT_LOCAL_FILE_REQUIRED')));
    for (const file of ['sample.jpg', 'sample.png', 'two-pages.pdf']) {
      state.phase = `recognize ${file}`;
      await lease(async () => {
        const info = await native.inspectAsync(base + file);
        for (let page = 1; page <= info.pages; page++) {
          const result = await native.recognizePageAsync(base + file, page, 0);
          check(`tokens ${file} page ${page}`, tokens(result.text) && Number.isFinite(result.confidence));
          check(`Russian and English ${file} page ${page}`, /образец/i.test(result.text) && /sample/i.test(result.text));
          check(`units ${file} page ${page}`, result.text.includes('ед/л') && result.text.includes('units/L'));
        }
      });
    }
    state.phase = 'Qwen image export';
    await lease(async () => {
      for (const file of ['sample.jpg', 'sample.png', 'two-pages.pdf', 'rotated.png']) {
        for (const rotation of [0, 90, 180, 270]) {
          const image = await native.exportPageAsync(base + file, 1, rotation);
          check(`Qwen JPEG export ${file} ${rotation}`, typeof image === 'string' && image.startsWith('/9j/') && image.length <= 8388608 && image.length > 100);
        }
      }
      const page2 = await native.exportPageAsync(base + 'two-pages.pdf', 2, 0);
      check('Qwen PDF second page exports', page2.startsWith('/9j/'));
      check('Qwen out-of-range page rejects', await errorMatches(() => native.exportPageAsync(base + 'two-pages.pdf', 3, 0), 'DOCUMENT_PAGES'));
      check('Qwen invalid rotation rejects', await errorMatches(() => native.exportPageAsync(base + 'sample.png', 1, 45), 'DOCUMENT_ROTATION'));
    });
    state.phase = 'twenty sequential pages';
    await lease(async () => {
      for (let page = 1; page <= 20; page++) {
        const result = await native.recognizePageAsync(base + 'twenty-pages.pdf', page, 0);
        check(`twenty-page PDF ${page}`, tokens(result.text));
      }
    });
    state.phase = 'rotation and poor quality';
    await lease(async () => {
      const rotated = await native.recognizePageAsync(base + 'rotated.png', 1, 90);
      check('quarter-turn corrects rotated image', tokens(rotated.text));
      check('invalid rotation rejected', await errorMatches(() => native.previewPageAsync(base + 'sample.png', 1, 45), 'DOCUMENT_ROTATION'));
      const poor = await native.recognizePageAsync(base + 'poor-quality.jpg', 1, 0);
      check('poor-quality output remains bounded and reviewable', typeof poor.text === 'string' && poor.text.length <= 200000 && Number.isFinite(poor.confidence) && poor.confidence >= 0 && poor.confidence <= 1);
    });
    state.phase = 'cancellation and recovery';
    await lease(async () => {
      const result = native.recognizePageAsync(base + 'twenty-pages.pdf', 1, 0);
      native.cancel();
      check('native cancellation rejects the pending page', await errorMatches(() => result, 'DOCUMENT_CANCELLED'));
    });
    await lease(async () => {
      const result = await native.recognizePageAsync(base + 'sample.png', 1, 0);
      check('engine reusable after cancellation', tokens(result.text));
      const preview = await native.previewPageAsync(base + 'sample.png', 1, 0);
      check('private preview generated', typeof preview === 'string' && preview.startsWith('file://'));
    });
  } catch {
    check(`unexpected native failure during ${state.phase}`, false);
  } finally { state.done = true; }
}

async function runStorageContract(base) {
  const state = globalThis.__sferaOcrStorageQa = {done:false, checks:[]};
  const check = (name, passed) => state.checks.push({name,passed:Boolean(passed)});
  const find = name => Array.from(globalThis.__r.getModules().values()).map(m=>m.publicModule?.exports).find(e=>e && typeof e[name]==='function');
  try {
    const db=find('saveLocalDocumentExtraction');
    const jobs=find('runDocumentOcrJob');
    const renderer=find('renderDocumentPage');
    if(!db || !jobs || !renderer) throw new Error('QA_MODULE_MISSING');
    await db.initializeLocalDatabase();
    await db.claimLocalDatabaseOwner('ocr_synthetic_owner');
    const now=Date.now();
    await db.saveLocalRecord('documents',{localId:'ocr_synthetic_document',title:'Synthetic native OCR',category:'medical',documentDate:now,hasLocalFile:true,localFileUri:base+'two-pages.pdf',updatedAt:now},false);
    let request=0;
    const draft={version:2,documentLocalId:'ocr_synthetic_document',engineVersion:'qwen-ocr-v1',provider:'yandex-ai-studio',state:'queued',pages:[],editedText:'',updatedAt:now,job:{id:'job_synthetic_123',ownerId:'ocr_synthetic_owner'}};
    await jobs.runDocumentOcrJob(draft,{
      allowed:()=>true,requestId:()=>`request_synthetic_${++request}`,
      save:value=>db.saveLocalDocumentExtraction(value),
      render:page=>renderer.renderDocumentPage(base+'two-pages.pdf',page,0),
      send:async()=>{
        const date=request===1?'2026-09-11':'2026-09-12';
        const text=`Specimen panel\nCollected: ${date}\nSynthetic 1,25 units/L\nConclusion: synthetic sample processed.`;
        return {version:2,text,rows:[{kind:'observation',section:'Specimen panel',name:'Synthetic',value:'1,25',unit:'units/L',reference:'',date:'',sourceText:'Synthetic 1,25 units/L',issues:[]}],dates:[date],issues:[],
          structure:{version:1,title:'Specimen panel',pageRole:'content',dates:[{kind:'collection',text:date,sourceText:`Collected: ${date}`,section:''}],blocks:[{kind:'conclusion',section:'Specimen panel',text:'Conclusion: synthetic sample processed.'}]}};
      },
    },new AbortController().signal);
    const loaded=await db.loadLocalDocumentExtraction(draft.documentLocalId);
    check('v2 OCR pages survive SQLCipher reload',loaded.version===2 && loaded.pages.length===2 && loaded.pages[0].confidence===null && loaded.analytes[0].value==='1,25');
    check('structured blocks and sections survive SQLCipher reload',loaded.pages[0].structure.blocks[0].kind==='conclusion' && loaded.analytes[0].section==='Specimen panel');
    check('unreviewed OCR creates no lab result',(await db.loadLocalSnapshot()).labResults.length===0);
    check('OCR draft never enters outbox',(await db.pendingOutbox()).length===0);
    let denied=false;
    try {await db.saveConfirmedDocumentExtraction({...loaded,state:'confirmed',confirmedAt:now,collectedAt:new Date(2026,8,11,12).getTime(),analytes:loaded.analytes.map(a=>({...a,selected:true}))});}catch{denied=true;}
    check('native confirmation rejects unreviewed rows',denied);
    const confirmed={...loaded,state:'confirmed',confirmedAt:now,collectedAt:new Date(2026,8,11,12).getTime(),updatedAt:now+1,analytes:loaded.analytes.map((a,i)=>({...a,selected:i===0,reviewed:i===0}))};
    await db.saveConfirmedDocumentExtraction(confirmed);
    check('only reviewed selected row becomes a local result',(await db.loadLocalSnapshot()).labResults[0].analytes.length===1);
    check('confirmed lab rows retain section context',(await db.loadLocalSnapshot()).labResults[0].analytes[0].section==='Specimen panel');
    check('confirmation after sync is disabled stays local',(await db.pendingOutbox()).length===0);
    await db.saveLocalSetting('cloudSyncPreference.v1',{enabled:true});
    await db.saveConfirmedDocumentExtraction({...confirmed,collectedAt:new Date(2026,8,12,12).getTime(),updatedAt:now+2,analytes:loaded.analytes.map((a,i)=>({...a,selected:i===1,reviewed:i===1}))});
    check('different collection dates retain separate lab results',(await db.loadLocalSnapshot()).labResults.length===2);
    const outbox=await db.pendingOutbox();
    const transport=outbox.map(row=>find('sanitizeCloudRecord').sanitizeCloudRecord(row.entity,row.payload));
    check('only structured confirmed values enter sync',outbox.length===2 && !JSON.stringify(transport).includes(base) && !JSON.stringify(transport).includes('sourceText') && !JSON.stringify(transport).includes('nextRequestId'));
    check('sync keeps reviewed sections but excludes report conclusions',JSON.stringify(transport).includes('Specimen panel') && !JSON.stringify(transport).includes('synthetic sample processed'));
    await db.claimLocalDatabaseOwner('ocr_other_synthetic_owner');
    denied=false;try{await db.saveLocalDocumentExtraction(loaded);}catch{denied=true;}
    check('previous account cannot save late OCR',denied);
    await db.clearLocalHealthData();
  } catch { check('native storage contract completed',false); }
  finally {state.done=true;}
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (await evaluate('Boolean(globalThis.expo?.modules?.DocumentOcr)')) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error('Native OCR module did not initialize.');
  await evaluate(hermesQaExpression(runMatrix, root));
  let result, lastPhase;
  for (let attempt = 0; attempt < 600; attempt++) {
    result = await evaluate('globalThis.__sferaOcrQa');
    if (result?.phase !== lastPhase) { console.log(`Native OCR QA: ${result?.phase}`); lastPhase = result?.phase; }
    if (result?.done) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!result?.done) throw new Error('Native matrix timed out.');
  await evaluate(hermesQaExpression(runStorageContract, root));
  let storage;
  for(let attempt=0;attempt<90;attempt++){
    storage=await evaluate('globalThis.__sferaOcrStorageQa');
    if(storage?.done)break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!storage?.done)throw new Error('Native storage contract timed out.');
  result.checks.push(...storage.checks);
  for (const [file, output] of [['sample.jpg', 'native-synthetic.jpg'], ['lab-variants.jpg', 'native-variants.jpg'], ['blank.jpg', 'native-blank.jpg']]) {
    await evaluate(hermesQaExpression(async uri => {
      const n = globalThis.expo.modules.DocumentOcr;
      if (!n.begin()) throw new Error('QA_BUSY');
      try { globalThis.__ocrSyntheticJpeg = await n.exportPageAsync(uri, 1, 0); }
      finally { await n.cleanupAsync(); }
    }, root + file));
    let jpeg;
    for (let attempt = 0; attempt < 30; attempt++) {
      jpeg = await evaluate('globalThis.__ocrSyntheticJpeg');
      if (jpeg) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (typeof jpeg !== 'string' || !jpeg.startsWith('/9j/')) throw new Error('Synthetic JPEG export failed');
    writeFileSync(join(process.env.E2E_REPORT_DIR, output), Buffer.from(jpeg, 'base64'), { mode: 0o600 });
    await evaluate('delete globalThis.__ocrSyntheticJpeg; true');
  }
  const report = { syntheticOnly: true, clinicalAccuracyClaim: false, appId, checks: result.checks };
  writeFileSync(join(process.env.E2E_REPORT_DIR, 'native-matrix.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  const failed = result.checks.filter(item => !item.passed);
  console.log(`Native OCR checks: ${result.checks.length - failed.length}/${result.checks.length} passed.`);
  if (failed.length) { console.log(failed.map(item => item.name).join('\n')); process.exitCode = 1; }
} finally {
  await evaluate('delete globalThis.__sferaOcrQa; delete globalThis.__sferaOcrStorageQa; delete globalThis.__ocrSyntheticJpeg; true').catch(() => {});
  socket.close();
}
