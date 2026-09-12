import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAndroidUiTree, matchingAndroidNode } from './android-ui-tree.mjs';

// Independent native driver: preserves all document assertions without relying
// on Maestro's persistent gRPC connection. Never used against a physical phone.
if (process.env.E2E_DISPOSABLE_EMULATOR !== '1' || process.env.EXPO_PUBLIC_E2E_MODE !== '1' ||
    !/^artificiallabs-e2e\+[a-f0-9]+-native@example\.test$/.test(process.env.E2E_EMAIL ?? '')) {
  throw new Error('Disposable native QA fixture required');
}
process.umask(0o077);
const adb = join(process.env.ANDROID_HOME, 'platform-tools/adb');
const app = 'engineering.brainwaves.sfera';
const report = process.env.E2E_REPORT_DIR;
const dumpPath = '/data/local/tmp/sfera-document-ui.xml';
function run(args) {
  const result = spawnSync(adb, ['-s', 'emulator-5564', ...args], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    writeFileSync(join(report, 'adb-operation-private.log'), Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]), { mode: 0o600 });
    throw new Error(`Native UI ADB operation failed (exit=${result.status}, signal=${result.signal ?? 'none'}, error=${result.error?.code ?? 'none'})`);
  }
  return result.stdout;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function tree() {
  run(['shell', 'rm', '-f', dumpPath]);
  // The simple reporter avoids the obsolete WatcherResultPrinter dependency
  // on android.test.RepetitiveTest, absent on API 36. Assertions are unchanged.
  const status = run(['shell', 'uiautomator', 'runtest', '/data/local/tmp/sfera-ui-driver.jar', '-c', 'sfera.qa.NativeUiDump', '-s']).toString('utf8');
  if (!/OK \(1 test\)/.test(status) || /run aborted|NoClassDefFoundError|FAILURES!!!/.test(status)) {
    writeFileSync(join(report, 'adb-dump-command-private.log'), status, { mode: 0o600 });
    throw new Error('Native UI instrumentation did not produce a snapshot');
  }
  // Return the snapshot with the same instrumentation response. A separate
  // exec-out read is not a reliable success check (ADB can return status 0
  // while its stdout contains a remote shell error).
  const encoded = /sferaUiXml=([A-Za-z0-9+/=]+)/.exec(status)?.[1];
  if (!encoded) {
    writeFileSync(join(report, 'adb-dump-command-private.log'), status, { mode: 0o600 });
    throw new Error('Native UI snapshot missing from instrumentation response');
  }
  const xml = Buffer.from(encoded, 'base64');
  if (!xml.includes(Buffer.from('<hierarchy'))) {
    // Private, disposable-fixture evidence only; never print UI text to CI logs.
    writeFileSync(join(report, 'adb-ui-invalid-private.xml'), xml, { mode: 0o600 });
    throw new Error(`Native UIAutomator returned an invalid dump (${xml.length} bytes)`);
  }
  return parseAndroidUiTree(xml.toString('utf8'));
}
async function find(pattern, { scroll = false, timeout = 30000, direction = 'down' } = {}) {
  const until = Date.now() + timeout;
  do {
    const nodes = tree();
    const found = matchingAndroidNode(nodes, pattern);
    if (found) return found;
    if (scroll) {
      const pane = nodes.filter(node => node.scrollable === 'true').sort((a, b) => (b.right-b.left)*(b.bottom-b.top)-(a.right-a.left)*(a.bottom-a.top))[0];
      if (!pane) throw new Error('Expected a native scroll container');
      const x = Math.round((pane.left + pane.right) / 2);
      const y1 = Math.round(pane.top + (pane.bottom - pane.top) * .75);
      const y2 = Math.round(pane.top + (pane.bottom - pane.top) * .25);
      run(['shell', 'input', 'swipe', String(x), String(direction === 'down' ? y1 : y2), String(x), String(direction === 'down' ? y2 : y1), '400']);
    }
    await sleep(400);
  } while (Date.now() < until);
  throw new Error(`Native UI assertion timed out: ${pattern.source}`);
}
async function tap(pattern, options) {
  const node = await find(pattern, options);
  run(['shell', 'input', 'tap', String(Math.round((node.left + node.right) / 2)), String(Math.round((node.top + node.bottom) / 2))]);
  await sleep(350);
}
function screenshot(name) {
  const bytes = run(['exec-out', 'screencap', '-p']);
  const start = bytes.indexOf(Buffer.from([137,80,78,71,13,10,26,10]));
  if (start < 0) throw new Error('Native screenshot unavailable');
  writeFileSync(join(report, `${name}.png`), bytes.subarray(start), { mode: 0o600 });
}
async function transport(state) {
  const response = await fetch(`http://127.0.0.1:3350/__e2e_transport/${state}`, {
    method: 'POST', headers: { 'x-e2e-control': 'local-qa' }, body: '{}', signal: AbortSignal.timeout(5000),
  });
  if (response.status !== 204) throw new Error('Local QA transport control failed');
}
async function openDocuments() {
  await tap(/^e2e-tab-profile$/);
  const back = matchingAndroidNode(tree(), /^Вернуться в профиль$/);
  if (back) await tap(/^Вернуться в профиль$/);
  await tap(/^Документы$/, { scroll: true });
}
async function verifyText(name) {
  await find(/Проверяемый текст документа/, { scroll: true });
  await find(/1,25[\s\S]*12.50/);
  screenshot(name);
}
try {
  await openDocuments();
  await tap(/^Добавить документ$/);
  await tap(/e2e-medical-document\.jpg/);
  await tap(/^Распознать на устройстве$/);
  await find(/^Распознавание завершено/, { timeout: 120000 });
  await verifyText('adb-document-ocr-synthetic');
  await find(/^Сохранить черновик$/, { scroll: true });
  await transport('down');
  await tap(/^Сохранить черновик$/);
  await find(/^Черновик сохранён только на этом устройстве\.$/, { scroll: true, direction: 'up' });
  await transport('up');
  await tap(/^Закрыть документ$/, { scroll: true, direction: 'up' });
  await tap(/e2e-medical-document\.jpg/);
  await verifyText('adb-document-ocr-restored');
  await tap(/^Закрыть документ$/, { scroll: true, direction: 'up' });
  run(['shell', 'am', 'force-stop', app]);
  run(['shell', 'am', 'start', '-W', '-n', `${app}/.MainActivity`, '-a', 'android.intent.action.MAIN', '-c', 'android.intent.category.LAUNCHER']);
  const until = Date.now() + 90000;
  let ready = false;
  do {
    const nodes = tree();
    if (matchingAndroidNode(nodes, /This is the developer menu/)) {
      await tap(/^Continue$/);
      if (matchingAndroidNode(tree(), /^Close$/)) await tap(/^Close$/);
    }
    ready = Boolean(matchingAndroidNode(nodes, /^Вероятность не рассчитана$/));
    if (ready) break;
    await sleep(700);
  } while (Date.now() < until);
  if (!ready) throw new Error('Cold native launch did not restore Home');
  await openDocuments();
  await tap(/e2e-medical-document\.jpg/);
  await verifyText('adb-document-ocr-cold-restart');
  await tap(/^Закрыть документ$/, { scroll: true, direction: 'up' });
  console.log('Independent Android native document UI passed: OCR, offline draft, reopen, cold restart.');
} finally {
  await transport('up');
  run(['shell', 'rm', '-f', dumpPath]);
}
