import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const serial = process.argv[2];
const reportDir = process.env.E2E_REPORT_DIR ?? 'output/e2e';

if (!serial) throw new Error('Android device serial is required');

function adb(args: string[], timeout = 8_000) {
  return spawnSync('adb', ['-s', serial, ...args], {
    encoding: 'utf8',
    timeout,
  });
}

async function finish(
  status: 'ready' | 'environment-blocked' | 'error',
  reason: string,
  exitCode: number,
) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    `${reportDir}/android-preflight.json`,
    JSON.stringify({ platform: 'android', status, reason }, null, 2),
  );
  console.error(`Android preflight: ${status}: ${reason}`);
  process.exitCode = exitCode;
}

async function main() {
  const boot = adb(['shell', 'getprop', 'sys.boot_completed']);
  if (boot.error && 'code' in boot.error && boot.error.code === 'ETIMEDOUT') {
    await finish('environment-blocked', 'adb shell timed out', 75);
  } else if (boot.status !== 0) {
    await finish('error', 'adb could not query the device', 1);
  } else if (boot.stdout.trim() !== '1') {
    await finish('environment-blocked', 'AVD has not completed booting', 75);
  } else {
    const hierarchy = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty']);
    const output = `${hierarchy.stdout}\n${hierarchy.stderr}`;
    if (hierarchy.error && 'code' in hierarchy.error && hierarchy.error.code === 'ETIMEDOUT') {
      await finish('environment-blocked', 'Android UI automation timed out', 75);
    } else if (/System UI (isn't|is not) responding/i.test(output)) {
      await finish('environment-blocked', "System UI isn't responding", 75);
    } else {
      await finish('ready', 'boot and System UI checks passed', 0);
    }
  }
}

void main();
