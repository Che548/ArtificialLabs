import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Fail open toward testing: missing history/event metadata always runs both suites.
export function affectedChecks(paths) {
  if (paths === null) return { native: true, cv: true };
  const common = paths.some((p) => /^(modules\/strip-cv\/|services\/scanning\/|scripts\/|\.github\/workflows\/|package(?:-lock)?\.json$|\.nvmrc$|\.npmrc$|\.dockerignore$)/.test(p));
  return { native: common, cv: common || paths.some((p) => p.startsWith('CV_Demo_WebAPP/')) };
}

export function changedPaths(event, git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })) {
  try {
    let base = event.before;
    let head = event.after;
    if (event.pull_request) {
      base = event.pull_request.base.sha;
      head = event.pull_request.head.sha;
      if (![base, head].every((s) => /^[a-f0-9]{40}$/.test(s ?? ''))) return null;
      base = git(['merge-base', base, head]).trim();
    }
    if (![base, head].every((s) => /^[a-f0-9]{40}$/.test(s ?? '') && !/^0+$/.test(s))) return null;
    // --no-renames includes deleted/old paths, so moving code out cannot bypass checks.
    return git(['diff', '--name-only', '--no-renames', '-z', base, head, '--']).split('\0').filter(Boolean);
  } catch { return null; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let paths = null;
  try { paths = changedPaths(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))); } catch { /* Run all. */ }
  const checks = affectedChecks(paths);
  const result = Object.entries(checks).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, result);
  console.log(result.trim());
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Heavy checks\nStripCV: ${checks.native ? 'run' : 'not affected'}; CV demo: ${checks.cv ? 'run' : 'not affected'}.\nUnit tests and verify remain mandatory. Release tags always run the full suite.\n`);
}
