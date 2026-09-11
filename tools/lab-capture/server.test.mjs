import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(TOOL_DIR, 'server.mjs');
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

test('lab capture server stores uploads, syncs timers, and restores state', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'lab-capture-test-'));
  let running = await startServer(dataDir);

  t.after(async () => {
    await running?.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  const initial = await getJson(`${running.url}/api/state`);
  assert.equal(initial.ok, true);
  assert.deepEqual(initial.timers, []);
  assert.deepEqual(initial.uploads, []);
  assert.equal(initial.photoCount, 0);

  const uploadCases = [
    ['iPhone', '2500', 'image/jpeg', 'capture.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ['iPhone', '250', 'image/heic', 'capture.heic', heifBytes('heic')],
    ['Android', '25', 'image/webp', 'capture.webp', webpBytes()],
    ['Android', '0', 'image/png', 'capture.png', pngBytes()],
    ['Android', '2500', 'image/jpeg', 'capture.jpg', Buffer.from([0xff, 0xd8, 4, 0xff, 0xd9])],
    ['iPhone', 'background', 'image/heif', 'background.heif', heifBytes('heif')],
  ];

  const uploads = await Promise.all(
    uploadCases.map(([platform, concentration, mimeType, fileName, body], index) =>
      upload(running.url, {
        platform,
        concentration,
        mimeType,
        fileName,
        deviceName: `Телефон ${index + 1}`,
        body,
      }),
    ),
  );
  assert.equal(new Set(uploads.map((item) => item.fileName)).size, uploads.length);

  const duplicatePair = await Promise.all([
    upload(running.url, {
      platform: 'iPhone',
      concentration: '2500',
      mimeType: 'image/jpeg',
      fileName: 'same.jpg',
      deviceName: 'Один телефон',
      body: Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9]),
    }),
    upload(running.url, {
      platform: 'iPhone',
      concentration: '2500',
      mimeType: 'image/jpeg',
      fileName: 'same.jpg',
      deviceName: 'Один телефон',
      body: Buffer.from([0xff, 0xd8, 2, 0xff, 0xd9]),
    }),
  ]);
  assert.notEqual(duplicatePair[0].fileName, duplicatePair[1].fileName);
  assert.equal((await getJson(`${running.url}/api/state`)).photoCount, 8);

  for (const [platform, concentration] of uploadCases) {
    const directory = join(dataDir, 'photos', platform);
    const paths = await listFiles(directory);
    assert.ok(
      paths.some((path) => path.split('/').includes(concentration)),
      `missing ${platform}/${concentration} upload`,
    );
  }

  await assertApiError(
    uploadResponse(running.url, {
      platform: 'Windows',
      concentration: '2500',
      mimeType: 'image/jpeg',
      fileName: 'bad.jpg',
      deviceName: 'Bad',
      body: Buffer.from([1]),
    }),
    400,
    'INVALID_PLATFORM',
  );
  await assertApiError(
    uploadResponse(running.url, {
      platform: 'iPhone',
      concentration: '5',
      mimeType: 'image/jpeg',
      fileName: 'bad.jpg',
      deviceName: 'Bad',
      body: Buffer.from([1]),
    }),
    400,
    'INVALID_CONCENTRATION',
  );
  await assertApiError(
    uploadResponse(running.url, {
      platform: 'iPhone',
      concentration: '250',
      mimeType: 'text/plain',
      fileName: 'bad.txt',
      deviceName: 'Bad',
      body: Buffer.from('not an image'),
    }),
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  );
  await assertApiError(
    uploadResponse(running.url, {
      platform: 'iPhone',
      concentration: '250',
      mimeType: 'image/jpeg',
      fileName: 'bad.jpg',
      deviceName: '../outside',
      body: Buffer.from([1]),
    }),
    400,
    'INVALID_PATH_VALUE',
  );

  const oversized = await oversizedUpload(running.url);
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'UPLOAD_TOO_LARGE');

  const eventController = new AbortController();
  const eventResponse = await fetch(`${running.url}/api/events`, {
    signal: eventController.signal,
  });
  assert.equal(eventResponse.status, 200);
  const eventReader = eventResponse.body.getReader();
  const firstEvent = await readSseState(eventReader);
  assert.equal(firstEvent.ok, true);

  const timerOne = await postJson(`${running.url}/api/timers`);
  const timerTwo = await postJson(`${running.url}/api/timers`);
  assert.equal(timerOne.timer.number + 1, timerTwo.timer.number);
  assert.equal(timerOne.timer.endsAt - timerOne.timer.startedAt, 180_000);

  const syncedState = await readSseState(eventReader, (value) => value.timers.length === 2);
  assert.equal(syncedState.timers.length, 2);
  eventController.abort();

  const deleted = await fetch(`${running.url}/api/timers/${timerTwo.timer.id}`, {
    method: 'DELETE',
  }).then(readJsonResponse);
  assert.equal(deleted.body.deletedId, timerTwo.timer.id);

  await running.stop();
  running = null;

  const statePath = join(dataDir, 'state.json');
  const persisted = JSON.parse(await readFile(statePath, 'utf8'));
  persisted.timers[0].endsAt = Date.now() - 1_000;
  persisted.timers[0].status = 'running';
  persisted.timers[0].completedAt = null;
  await writeFile(statePath, `${JSON.stringify(persisted, null, 2)}\n`);

  running = await startServer(dataDir);
  const restored = await getJson(`${running.url}/api/state`);
  assert.equal(restored.uploads.length, 8);
  assert.equal(restored.photoCount, 8);
  assert.equal(restored.timers.length, 1);
  assert.equal(restored.timers[0].status, 'completed');

  const cleared = await fetch(`${running.url}/api/timers/completed`, {
    method: 'DELETE',
  }).then(readJsonResponse);
  assert.equal(cleared.body.deletedCount, 1);
  assert.deepEqual((await getJson(`${running.url}/api/state`)).timers, []);
});

async function startServer(dataDir) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: TOOL_DIR,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '0',
      LAB_CAPTURE_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const url = await new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => {
      rejectReady(new Error(`server readiness timeout\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    const inspect = (chunk) => {
      const match = String(chunk).match(/LAB_CAPTURE_READY:(http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        child.stdout.off('data', inspect);
        resolveReady(match[1]);
      }
    };
    child.stdout.on('data', inspect);
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      rejectReady(
        new Error(`server exited before ready (${code ?? signal})\nstdout:\n${stdout}\nstderr:\n${stderr}`),
      );
    });
  });

  return {
    child,
    url,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5_000);
      await exited;
      clearTimeout(force);
    },
  };
}

async function upload(baseUrl, options) {
  const result = await uploadResponse(baseUrl, options).then(readJsonResponse);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.ok, true);
  return result.body.upload;
}

function uploadResponse(baseUrl, options) {
  return fetch(`${baseUrl}/api/uploads`, {
    method: 'POST',
    headers: {
      'Content-Type': options.mimeType,
      'X-Lab-Platform': options.platform,
      'X-Lab-Concentration': options.concentration,
      'X-Lab-Device-Name': encodeURIComponent(options.deviceName),
      'X-Lab-File-Name': encodeURIComponent(options.fileName),
    },
    body: options.body,
  });
}

async function oversizedUpload(baseUrl) {
  const url = new URL('/api/uploads', baseUrl);
  return new Promise((resolveRequest, rejectRequest) => {
    const request = httpRequest(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(MAX_UPLOAD_BYTES + 1),
          'X-Lab-Platform': 'iPhone',
          'X-Lab-Concentration': '2500',
          'X-Lab-Device-Name': 'Oversized',
        },
      },
      async (response) => {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolveRequest({
          status: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
      },
    );
    request.on('error', rejectRequest);
    request.end();
  });
}

async function assertApiError(responsePromise, status, code) {
  const result = await responsePromise.then(readJsonResponse);
  assert.equal(result.status, status);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, code);
}

async function getJson(url) {
  const result = await fetch(url).then(readJsonResponse);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function postJson(url) {
  const result = await fetch(url, { method: 'POST' }).then(readJsonResponse);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}

async function readJsonResponse(response) {
  return { status: response.status, body: await response.json() };
}

async function readSseState(reader, predicate = () => true) {
  const decoder = new TextDecoder();
  let pending = '';
  const timeoutAt = Date.now() + 5_000;
  while (Date.now() < timeoutAt) {
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SSE event timeout')), Math.max(1, timeoutAt - Date.now())),
      ),
    ]);
    if (done) throw new Error('SSE stream closed');
    pending += decoder.decode(value, { stream: true });
    const messages = pending.split('\n\n');
    pending = messages.pop() ?? '';
    for (const message of messages) {
      if (!message.includes('event: state')) continue;
      const data = message
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      const parsed = JSON.parse(data);
      if (predicate(parsed)) return parsed;
    }
  }
  throw new Error('SSE state predicate was not met');
}

async function listFiles(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(path)));
    else result.push(path);
  }
  return result;
}

function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function webpBytes() {
  return Buffer.from('RIFF0000WEBP', 'ascii');
}

function heifBytes(brand) {
  return Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftyp'), Buffer.from(brand)]);
}
