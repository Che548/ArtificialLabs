import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectedChecks, changedPaths } from './ci-affected.mjs';

test('docs and unrelated app UI do not rebuild native CV', () => {
  assert.deepEqual(affectedChecks(['docs/example.md', 'app/profile.tsx']), { native: false, cv: false });
  assert.deepEqual(affectedChecks([]), { native: false, cv: false });
});
test('all native, shared and tooling inputs invalidate checks', () => {
  for (const path of ['modules/strip-cv/native/a.cpp', 'modules/strip-cv/models/model.onnx', 'services/scanning/a.ts', 'scripts/smoke-strip-cv.mjs', 'package-lock.json', 'package.json', '.nvmrc', '.npmrc', '.dockerignore', '.github/workflows/ci.yml']) {
    assert.deepEqual(affectedChecks([path]), { native: true, cv: true }, path);
  }
  assert.deepEqual(affectedChecks(['CV_Demo_WebAPP/Dockerfile']), { native: false, cv: true });
});
test('missing history and new branches run all checks', () => {
  assert.equal(changedPaths({}), null);
  assert.equal(changedPaths({ before: '0'.repeat(40), after: 'a'.repeat(40) }), null);
  assert.equal(changedPaths({ before: 'b'.repeat(40), after: 'a'.repeat(40) }, () => { throw Error('missing'); }), null);
  assert.deepEqual(affectedChecks(null), { native: true, cv: true });
});
test('push covers all commits, PR uses merge base, deleted paths are retained', () => {
  const calls = [];
  const git = (args) => { calls.push(args); return args[0] === 'merge-base' ? 'c'.repeat(40) : 'modules/strip-cv/deleted.cpp\0docs/new.md\0'; };
  const before = 'a'.repeat(40), after = 'b'.repeat(40);
  assert.equal(changedPaths({ before, after }, git).length, 2);
  assert.deepEqual(calls[0], ['diff', '--name-only', '--no-renames', '-z', before, after, '--']);
  calls.length = 0;
  assert.equal(affectedChecks(changedPaths({ pull_request: { base: { sha: before }, head: { sha: after } } }, git)).native, true);
  assert.equal(calls[1][4], 'c'.repeat(40));
});
