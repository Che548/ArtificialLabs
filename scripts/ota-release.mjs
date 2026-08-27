import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const command = process.argv[2];
const args = Object.fromEntries(
  process.argv.slice(3).map((value) => {
    const [key, ...rest] = value.replace(/^--/, '').split('=');
    return [key, rest.join('=') || true];
  }),
);
const server = (process.env.OTA_SERVER_URL ?? 'https://artificiallabs-updates.bebra42.ru').replace(/\/$/, '');
const secret = process.env.OTA_PUBLISH_SECRET;
if (!secret) throw new Error('OTA_PUBLISH_SECRET is required');

function signedHeaders(body) {
  const timestamp = Date.now().toString();
  const requestId = crypto.randomUUID();
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${requestId}.${digest}`)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-ota-timestamp': timestamp,
    'x-ota-request-id': requestId,
    'x-ota-signature': signature,
  };
}

async function post(endpoint, value) {
  const body = Buffer.from(JSON.stringify(value));
  const response = await fetch(`${server}${endpoint}`, {
    method: 'POST',
    headers: signedHeaders(body),
    body,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`OTA request failed: ${result.error ?? response.status}`);
  return result;
}

const contentTypes = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', svg: 'image/svg+xml', otf: 'font/otf', ttf: 'font/ttf',
  json: 'application/json', mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav',
};

function run(commandName, commandArgs, env = process.env) {
  return execFileSync(commandName, commandArgs, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function assertMain() {
  const branch = process.env.GITHUB_REF_NAME ?? run('git', ['branch', '--show-current']).trim();
  if (branch !== 'main') throw new Error(`Preview OTA must be exported from main; current ref is ${branch || 'detached'}`);
  const dirty = run('git', ['status', '--porcelain']).trim();
  if (dirty) throw new Error('Preview OTA requires a clean main checkout');
}

function runtimeFor(platform, env) {
  const output = run('npx', ['expo-updates', 'runtimeversion:resolve', '--platform', platform], env);
  return JSON.parse(output).runtimeVersion;
}

async function publishPlatform(platform, channel) {
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), `artificiallabs-ota-${platform}-`));
  const commit = process.env.GITHUB_SHA ?? run('git', ['rev-parse', 'HEAD']).trim();
  const env = { ...process.env, EXPO_PUBLIC_GIT_COMMIT: commit };
  try {
    run('npx', ['expo', 'export', '--platform', platform, '--output-dir', exportDir, '--clear'], env);
    const runtimeVersion = runtimeFor(platform, env);
    const metadata = JSON.parse(fs.readFileSync(path.join(exportDir, 'metadata.json'), 'utf8'));
    const expoConfig = JSON.parse(run('npx', ['expo', 'config', '--type', 'public', '--json'], env));
    const platformMetadata = metadata.fileMetadata[platform];
    const listed = [
      { path: platformMetadata.bundle, ext: null, isLaunch: true },
      ...platformMetadata.assets.map((asset) => ({ ...asset, isLaunch: false })),
    ];
    const unique = new Map();
    for (const asset of listed) {
      const bytes = fs.readFileSync(path.join(exportDir, asset.path));
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const extension = asset.ext ? `.${asset.ext}` : undefined;
      unique.set(`${sha256}:${asset.isLaunch}`, {
        sha256,
        dataBase64: bytes.toString('base64'),
        contentType: asset.isLaunch ? 'application/javascript' : (contentTypes[asset.ext] ?? 'application/octet-stream'),
        extension,
        key: asset.path.split('/').at(-1),
        isLaunch: asset.isLaunch,
      });
    }
    const result = await post('/internal/releases', {
      platform,
      runtimeVersion,
      channel,
      sourceCommit: commit,
      assets: [...unique.values()],
      extra: { expoClient: expoConfig },
    });
    console.log(JSON.stringify(result));
    return result;
  } finally {
    fs.rmSync(exportDir, { recursive: true, force: true });
  }
}

if (command === 'publish') {
  const channel = args.channel;
  if (channel !== 'preview') throw new Error('New bundles may only be published to preview');
  assertMain();
  for (const platform of ['ios', 'android']) await publishPlatform(platform, channel);
} else if (command === 'promote') {
  if (!args.ios || !args.android) throw new Error('--ios=<update-id> and --android=<update-id> are required');
  console.log(JSON.stringify(await post('/internal/promote', { updateId: args.ios, channel: 'production' })));
  console.log(JSON.stringify(await post('/internal/promote', { updateId: args.android, channel: 'production' })));
} else if (command === 'rollback') {
  if (!args.runtime || !args.channel) throw new Error('--runtime and --channel are required');
  for (const platform of ['ios', 'android']) {
    console.log(JSON.stringify(await post('/internal/rollback', {
      channel: args.channel,
      platform,
      runtimeVersion: args.runtime,
    })));
  }
} else {
  throw new Error('Usage: ota-release.mjs publish|promote|rollback');
}
