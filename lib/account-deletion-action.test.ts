import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { classifyServiceIssue } from './service-errors';
async function harness({ remoteFails = false, cleanupFails = false, offline = false } = {}) {
  const source = await readFile(new URL('./health-store.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('store.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'requestAccountDeletion' && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(callback);
  const state = { pending: false, deadline: undefined as number | undefined, remoteCalls: 0, alerts: [] as string[], cloud: true };
  const context = {
    readOnly: false, remoteEnabled: true, offlineRef: { current: offline },
    setLocalDeletionPending: (value: boolean) => { state.pending = value; },
    setLocalDeletionDeadline: (value?: number) => { state.deadline = value; },
    requestRemoteDeletion: async () => { state.remoteCalls++; if (remoteFails) throw new Error('REVOKE_ADMIN_BEFORE_ACCOUNT_DELETION'); return { scheduledDeletionAt: 123456 }; },
    saveLocalSetting: async () => { if (cleanupFails) throw new Error('disk unavailable'); },
    clearPendingChatOutbox: async () => { if (cleanupFails) throw new Error('disk unavailable'); },
    DELETION_DEADLINE_SETTING: 'deadline', setCloudSyncEnabledState: (value: boolean) => { state.cloud = value; },
    setServiceIssue: () => {}, chatCloudPrepared: { current: true }, classifyServiceIssue,
    Alert: { alert: (_title: string, message: string) => state.alerts.push(message) },
  };
  const code = ts.transpileModule(`return ${callback}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const perform = new Function(...Object.keys(context), code)(...Object.values(context)) as () => Promise<boolean>;
  return { state, perform };
}
test('accepted remote deletion survives failing local cleanup', async () => {
  const { state, perform } = await harness({ cleanupFails: true });
  assert.equal(await perform(), true); assert.equal(state.pending, true);
  assert.equal(state.deadline, 123456); assert.equal(state.cloud, false); assert.equal(state.alerts.length, 0);
});
test('server refusal rolls back optimistic gate and remains visible after profile unmount', async () => {
  const { state, perform } = await harness({ remoteFails: true });
  assert.equal(await perform(), false); assert.equal(state.pending, false);
  assert.match(state.alerts[0], /права администратора/); assert.equal(state.cloud, true);
});
test('offline deletion never presents a successful pending account', async () => {
  const { state, perform } = await harness({ offline: true });
  assert.equal(await perform(), false); assert.equal(state.pending, false); assert.equal(state.remoteCalls, 0);
});
