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
  const report = { syntheticOnly: true, clinicalAccuracyClaim: false, appId, checks: result.checks };
  writeFileSync(join(process.env.E2E_REPORT_DIR, 'native-matrix.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  const failed = result.checks.filter(item => !item.passed);
  console.log(`Native OCR checks: ${result.checks.length - failed.length}/${result.checks.length} passed.`);
  if (failed.length) { console.log(failed.map(item => item.name).join('\n')); process.exitCode = 1; }
} finally {
  await evaluate('delete globalThis.__sferaOcrQa; true').catch(() => {});
  socket.close();
}
