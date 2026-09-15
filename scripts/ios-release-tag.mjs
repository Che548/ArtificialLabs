import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function versionParts(tag) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$(?![\s\S])/.test(tag)) {
    throw new Error('Expected a stable release tag vMAJOR.MINOR.PATCH');
  }
  return tag.slice(1).split('.').map(BigInt);
}

export function compareTags(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

export function validateRelease({ tag, tags, sha, resolvedSha, onMain, recordedSha }) {
  versionParts(tag);
  if (compareTags(tag, 'v1.0.0') <= 0) throw new Error('Version must exceed baseline 1.0.0');
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== resolvedSha) throw new Error('Tag SHA changed');
  if (recordedSha && recordedSha !== sha) throw new Error('Release receipt SHA changed');
  if (!onMain) throw new Error('Release commit is not in main history');
  for (const other of tags) {
    try { versionParts(other); } catch { continue; }
    if (other !== tag && compareTags(other, tag) >= 0) throw new Error('A newer release tag exists');
  }
  return tag.slice(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  versionParts(tag ?? ''); // Validate before interpolating a ref.
  // Use a separate namespace: do not overwrite local tags to hide retagging.
  git('fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main',
    '+refs/tags/*:refs/release-check/*');
  const resolvedSha = git('rev-parse', `refs/release-check/${tag}^{commit}`);
  let onMain = true;
  try { git('merge-base', '--is-ancestor', resolvedSha, 'refs/remotes/origin/main'); }
  catch { onMain = false; }
  const version = validateRelease({ tag, sha: process.env.RELEASE_SHA ?? process.env.GITHUB_SHA,
    resolvedSha, onMain,
    tags: git('for-each-ref', '--format=%(refname:strip=2)', 'refs/release-check').split('\n') });
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nsha=${resolvedSha}\n`);
  console.log(`Validated ${tag} at ${resolvedSha}`);
}
