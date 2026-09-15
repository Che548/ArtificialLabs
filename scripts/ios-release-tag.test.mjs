import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTags, validateRelease, versionParts } from './ios-release-tag.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const sha = 'a'.repeat(40);
const valid = { tag: 'v1.1.0', tags: [], sha, resolvedSha: sha, onMain: true };
test('strict stable semver and numeric ordering', () => {
  for (const tag of ['1.2.3', 'v01.2.3', 'v1.2', 'v1.2.3-beta', 'v1.2.3+sha', 'v1.2.3\n']) {
    assert.throws(() => versionParts(tag));
  }
  assert.equal(compareTags('v1.10.0', 'v1.9.0'), 1);
  assert.equal(compareTags('v2.0.0', 'v1.999.999'), 1);
});
test('baseline, rerun and unrelated tags', () => {
  assert.equal(validateRelease(valid), '1.1.0');
  assert.equal(validateRelease({ ...valid, tags: ['v1.1.0', 'cv-demo'], recordedSha: sha }), '1.1.0');
  assert.throws(() => validateRelease({ ...valid, tag: 'v1.0.0' }));
});
test('reject changed refs, receipt mismatch, non-main and superseded release', () => {
  for (const changes of [ { resolvedSha: 'b'.repeat(40) }, { recordedSha: 'b'.repeat(40) },
    { onMain: false }, { tags: ['v1.10.0'] } ]) {
    assert.throws(() => validateRelease({ ...valid, ...changes }));
  }
});

test('real Git refs: annotated tag, refresh, non-main and moved tag', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sfera-release-git-test-'));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const script = resolve('scripts/ios-release-tag.mjs');
  try {
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Synthetic Release Test');
    git('config', 'user.email', 'release-test@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    git('remote', 'add', 'origin', directory);
    git('commit', '--allow-empty', '-m', 'synthetic baseline');
    const initialSha = git('rev-parse', 'HEAD');
    git('tag', '-a', 'v1.1.0', '-m', 'synthetic release');
    const check = () => execFileSync(process.execPath, [script], { cwd: directory,
      env: { ...process.env, RELEASE_TAG: 'v1.1.0', RELEASE_SHA: initialSha,
        GITHUB_OUTPUT: '', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      stdio: ['ignore', 'pipe', 'pipe'] });
    assert.doesNotThrow(check);
    assert.doesNotThrow(check); // Retry of identical SHA.
    git('tag', 'v1.10.0');
    assert.throws(check); // Fetch sees a newer remote tag before upload.
    git('tag', '-d', 'v1.10.0');
    git('update-ref', '-d', 'refs/release-check/v1.10.0');
    git('switch', '-c', 'not-main');
    git('commit', '--allow-empty', '-m', 'synthetic unrelated branch');
    git('tag', '-f', 'v1.1.0');
    assert.throws(check); // A moved tag cannot reuse the event SHA.
    const branchSha = git('rev-parse', 'HEAD');
    assert.throws(() => execFileSync(process.execPath, [script], { cwd: directory,
      env: { ...process.env, RELEASE_TAG: 'v1.1.0', RELEASE_SHA: branchSha, GITHUB_OUTPUT: '' },
      stdio: ['ignore', 'pipe', 'pipe'] })); // Even with a new event it is outside main.
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
