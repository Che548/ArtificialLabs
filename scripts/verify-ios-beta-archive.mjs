import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArchiveIdentity, validateArchiveRuntime } from './ios-archive-policy.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));

const directory = mkdtempSync(join(tmpdir(), 'sfera-ipa-check-'));
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
try {
  run('unzip', ['-q', 'output/ios-beta/sfera.ipa', '-d', directory]);
  const apps = readdirSync(join(directory, 'Payload')).filter(name => name.endsWith('.app'));
  if (apps.length !== 1) throw new Error('Expected exactly one application in IPA');
  const app = join(directory, 'Payload', apps[0]);
  const plist = name => JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', join(app, name)]));
  const info = plist('Info.plist');
  validateArchiveIdentity(info, process.env.SFERA_RELEASE_VERSION, process.env.SFERA_IOS_BUILD_NUMBER);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  const entitlementXml = run('codesign', ['-d', '--entitlements', ':-', app]);
  const entitlements = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', '-'],
    { input: entitlementXml, encoding: 'utf8' }));
  const updates = plist('Expo.plist');
  const runtime = validateArchiveRuntime(entitlements, updates);
  writeFileSync('output/ios-beta/runtime.txt', `${runtime}\n`);
  console.log(`Verified signed IPA ${info.CFBundleShortVersionString} (${info.CFBundleVersion}), runtime ${runtime}`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
