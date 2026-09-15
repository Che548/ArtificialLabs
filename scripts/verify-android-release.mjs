import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { checkAndroidBaseSize } from './android-base-size.mjs';
const aab = 'android/app/build/outputs/bundle/release/app-release.aab';
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', env: { ...process.env, LANG: 'C' } }).trim();
const base = checkAndroidBaseSize(run('unzip', ['-Z', '-l', aab]));
console.log(`Android base compressed archive: ${(base.bytes / 1_000_000).toFixed(1)} MB (all ABIs; safety budget 480 MB)`);
const manifest = xpath => run('java', ['-jar', process.env.BUNDLETOOL_JAR, 'dump', 'manifest', `--bundle=${aab}`, `--xpath=${xpath}`]);
if (manifest('/manifest/@package') !== 'engineering.brainwaves.sfera' ||
    manifest('/manifest/@android:versionCode') !== process.env.SFERA_ANDROID_VERSION_CODE ||
    manifest('/manifest/@android:versionName') !== process.env.SFERA_RELEASE_VERSION) throw new Error('AAB identity mismatch');
const signature = run('jarsigner', ['-J-Duser.language=en', '-verify', aab]);
if (!signature.includes('jar verified.')) throw new Error('AAB is not signed');
const cert = run('keytool', ['-J-Duser.language=en', '-printcert', '-jarfile', aab]);
const actual = cert.match(/SHA256:\s*([A-Fa-f0-9:]+)/)?.[1].replaceAll(':', '').toLowerCase();
const expected = process.env.ANDROID_UPLOAD_CERT_SHA256?.replaceAll(':', '').toLowerCase();
if (!expected || !/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new Error('Wrong Android upload certificate');
const runtime = run('unzip', ['-p', aab, 'base/assets/fingerprint']);
if (!/^[a-f0-9]{12,64}$/.test(runtime)) throw new Error('Missing native fingerprint');
mkdirSync('output', { recursive: true });
writeFileSync('output/android-internal-runtime.txt', runtime + '\n');
console.log(`Verified signed Android ${process.env.SFERA_RELEASE_VERSION} (${process.env.SFERA_ANDROID_VERSION_CODE}), runtime ${runtime}`);
