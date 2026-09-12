// Manual-only, network-independent checks of real native SQLCipher operations.
import { execFileSync } from 'node:child_process';
import { hermesQaExpression } from './hermes-qa-expression.mjs';

const device = process.env.E2E_NATIVE_QA_DEVICE;
const appId = process.env.E2E_NATIVE_QA_APP_ID;
if (!device || !['com.anonymous.privateexpo', 'engineering.brainwaves.sfera'].includes(appId)) throw Error('Dedicated simulator and QA app required');
if (device.startsWith('emulator-')) {
  const avd = execFileSync('adb', ['-s', device, 'shell', 'getprop', 'ro.boot.qemu.avd_name'], { encoding: 'utf8' }).trim();
  if (!avd.startsWith('Sfera_MultiDevice_QA')) throw Error('Only the dedicated disposable AVD is allowed');
} else {
  const inventory = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }));
  const match = Object.values(inventory.devices).flat().find(item => item.udid === device);
  if (!match?.name.startsWith('Sfera-MultiDevice-QA-') || match.state !== 'Booted') throw Error('Only the dedicated disposable simulator is allowed');
}
const pages = await fetch('http://127.0.0.1:8083/json/list').then(r => r.json());
const matches = pages.filter(page => page.appId === appId);
if (matches.length !== 1) throw Error('Exactly one matching QA Hermes runtime is required');
if (device.startsWith('emulator-')) {
  const model = execFileSync('adb', ['-s', device, 'shell', 'getprop', 'ro.product.model'], { encoding: 'utf8' }).trim();
  if (!matches[0].deviceName?.startsWith(model + ' -')) throw Error('Inspector device mismatch');
} else if (!matches[0].deviceName?.includes('Sfera-MultiDevice-QA-')) throw Error('Inspector is not the dedicated iOS simulator');
const url = new URL(matches[0].webSocketDebuggerUrl);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.protocol !== 'ws:' || url.port !== '8083') throw Error('Local inspector only');
const socket = new WebSocket(url);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
const pending = new Map(); let id = 0;
socket.addEventListener('message', event => { const message = JSON.parse(event.data); pending.get(message.id)?.(message); });
async function evaluate(expression) {
  const call = ++id;
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(call); reject(Error('Inspector timeout')); }, 15000);
    pending.set(call, value => { clearTimeout(timer); pending.delete(call); resolve(value); });
    socket.send(JSON.stringify({ id: call, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  if (reply.error || reply.result?.exceptionDetails) throw Error('QA evaluation failed (raw runtime data withheld)');
  return reply.result?.result?.value;
}

async function exercise() {
  const state = globalThis.__sferaMultiDeviceQa = { done: false, phase: 'module', checks: [] };
  const check = (name, value) => { state.checks.push({ name, passed: Boolean(value) }); if (!value) throw Error('QA_ASSERTION'); };
  let db, claimed = false;
  try {
    for (const [id, module] of globalThis.__r.getModules()) {
      if (module.verboseName?.includes('local-database.native')) { db = globalThis.__r(id); break; }
      const exported = module.publicModule?.exports;
      if (exported?.mergeRemoteProfile && exported?.acknowledgeOutbox) { db = exported; break; }
    }
    if (!db) throw Error('QA_MODULE_NOT_LOADED');
    state.phase = 'empty fixture guard';
    await db.initializeLocalDatabase();
    const initial = await db.loadLocalSnapshot();
    check('fresh empty simulator database', !initial.profile && Object.values(initial).every(value => !Array.isArray(value) || value.length === 0) && (await db.pendingOutbox()).length === 0);
    await db.claimLocalDatabaseOwner('synthetic-multi-device-qa'); claimed = true;
    state.phase = 'update draft';
    await db.saveUpdateChatDraft('synthetic-multi-device-qa', { text: 'Synthetic update draft', conversationId: 'synthetic-chat' });
    check('update draft restores for its owner', (await db.loadUpdateChatDraft('synthetic-multi-device-qa'))?.text === 'Synthetic update draft');
    check('another owner cannot read update draft', !(await db.loadUpdateChatDraft('another-synthetic-owner')));
    let wrongDraftOwner = false;
    try { await db.saveUpdateChatDraft('another-synthetic-owner', { text: 'Must not persist' }); } catch { wrongDraftOwner = true; }
    check('another owner cannot replace update draft', wrongDraftOwner && (await db.loadUpdateChatDraft('synthetic-multi-device-qa'))?.text === 'Synthetic update draft');
    check('update draft stays outside snapshot and outbox', (await db.pendingOutbox()).length === 0 && !JSON.stringify(await db.loadLocalSnapshot()).includes('Synthetic update draft'));
    const now = Date.now();
    const profile = { displayName: 'Synthetic QA', goal: 'cycle', onboardingCompleted: true, heightCm: 160, weightKg: 60, updatedAt: now };
    await db.saveLocalProfile(profile);
    await db.saveLocalSetting('profileSyncBase.v1', profile);
    await db.saveLocalProfile({ ...profile, heightCm: 170, updatedAt: now + 1 });
    state.phase = 'profile conflict';
    const changed = await db.mergeRemoteProfile({ ...profile, weightKg: 65, updatedAt: now + 2 }, 'synthetic-multi-device-qa');
    check('remote profile preserves dirty local edit', !changed && (await db.loadLocalSnapshot()).profile.heightCm === 170);
    check('wrong owner cannot merge profile', !(await db.mergeRemoteProfile(profile, 'another-synthetic-owner')));
    const note = { localId: 'synthetic-note', kind: 'note', source: 'manual', label: 'Original', occurredAt: now, updatedAt: now };
    await db.saveLocalRecord('journalEntries', note);
    let rows = await db.pendingOutbox();
    state.phase = 'first ACK';
    await db.acknowledgeOutbox(rows.map(row => row.id), rows, [{ entity: 'journalEntries', localId: note.localId, revision: 1 }]);
    check('ACK empties only sent queue', (await db.pendingOutbox()).length === 0);
    check('ACK persists server revision', (await db.loadLocalSnapshot()).journalEntries[0].syncRevision === 1);
    await db.saveLocalRecord('journalEntries', { ...note, label: 'Sent edit', updatedAt: now + 1 });
    const sent = await db.pendingOutbox();
    await db.saveLocalRecord('journalEntries', { ...note, label: 'Newer edit', updatedAt: now + 2 });
    state.phase = 'in-flight edit';
    await db.acknowledgeOutbox(sent.map(row => row.id), sent, [{ entity: 'journalEntries', localId: note.localId, revision: 2 }]);
    rows = await db.pendingOutbox();
    check('in-flight edit survives exact ACK', rows.length === 1 && rows[0].payload.label === 'Newer edit');
    check('in-flight edit adopts acknowledged revision', rows[0].payload.syncRevision === 2);
    state.phase = 'remote conflict';
    await db.mergeRemoteSnapshot({ journalEntries: [{ ...note, label: 'Other device', updatedAt: now + 3, syncRevision: 3 }] });
    check('remote record cannot replace dirty local edit', (await db.loadLocalSnapshot()).journalEntries[0].label === 'Newer edit');
    check('remote merge retains pending row', (await db.pendingOutbox()).length === 1);
    state.phase = 'explicit record resolution';
    const localNote = (await db.loadLocalSnapshot()).journalEntries[0];
    const remoteNote = { ...note, label: 'Other device', updatedAt: now + 3, syncRevision: 3 };
    const selection = { entity: 'journalEntries', local: localNote, remote: remoteNote, ownerId: 'synthetic-multi-device-qa' };
    let refused = false;
    try { await db.resolveLocalSyncConflict({ ...selection, ownerId: 'wrong-owner' }, 'local'); } catch { refused = true; }
    check('resolution rejects wrong owner', refused);
    await db.resolveLocalSyncConflict(selection, 'local');
    check('selected local record rebases revision and stays queued', (await db.pendingOutbox())[0].payload.syncRevision === 3);
    check('pre-choice record is backed up encrypted', (await db.loadLocalSetting('syncConflictBackup.v1:journalEntries:synthetic-note')).label === 'Newer edit');
    refused = false;
    try { await db.resolveLocalSyncConflict(selection, 'remote'); } catch { refused = true; }
    check('stale reviewed local record cannot be replaced', refused);
    const reviewed = (await db.loadLocalSnapshot()).journalEntries[0];
    await db.resolveLocalSyncConflict({ ...selection, local: reviewed }, 'remote');
    check('selected remote record replaces only reviewed local record', (await db.loadLocalSnapshot()).journalEntries[0].label === 'Other device' && (await db.pendingOutbox()).length === 0);
    state.phase = 'explicit profile resolution';
    const localProfile = (await db.loadLocalSnapshot()).profile;
    const remoteProfile = { ...profile, weightKg: 65, updatedAt: now + 2 };
    await db.resolveLocalSyncConflict({ entity: 'profile', local: localProfile, remote: remoteProfile, ownerId: 'synthetic-multi-device-qa' }, 'local');
    check('profile resolution retains chosen fields and updates base', (await db.loadLocalSnapshot()).profile.heightCm === 170 && (await db.loadLocalSetting('profileSyncBase.v1')).weightKg === 65);
  } catch { checkFailure(); }
  finally {
    if (claimed) {
      state.phase = 'exact fixture cleanup';
      try {
        await db.clearLocalHealthData();
        check('update draft cleared with local health data', !(await db.loadUpdateChatDraft('synthetic-multi-device-qa')));
        state.checks.push({ name: 'synthetic rows, backups and profile base cleaned', passed: (await db.pendingOutbox()).length === 0 && !(await db.loadLocalSnapshot()).profile && !(await db.loadLocalSetting('profileSyncBase.v1')) && !(await db.loadLocalSetting('syncConflictBackup.v1:profile')) && !(await db.loadLocalSetting('syncConflictBackup.v1:journalEntries:synthetic-note')) });
      } catch { checkFailure(); }
    }
    state.done = true;
  }
  function checkFailure() { state.checks.push({ name: `native failure during ${state.phase}`, passed: false }); }
}

try {
  await evaluate(hermesQaExpression(exercise));
  let result;
  for (let attempt = 0; attempt < 90; attempt++) {
    result = await evaluate('globalThis.__sferaMultiDeviceQa');
    if (result?.done) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!result?.done) throw Error('Native QA timed out');
  console.log(JSON.stringify(result));
  if (result.checks.some(check => !check.passed)) process.exitCode = 1;
} finally { socket.close(); }
