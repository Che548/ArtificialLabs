import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_ASSAY_PROFILE,
  DEFAULT_CARD_PROFILE,
} from '../services/scanning/profiles.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 4176;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['scripts/web-server.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    DIST_DIR: path.join(root, '.missing-dist-for-server-smoke'),
    HOST: '127.0.0.1',
    PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitUntilReady() {
  const timeoutAt = Date.now() + 10_000;
  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(origin, { method: 'HEAD' });
      if (response.status === 200 || response.status === 503) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('StripCV web server did not become ready.');
}

function requestMalformedUrl() {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { hostname: '127.0.0.1', port, path: '/%ZZ', method: 'GET' },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

try {
  await waitUntilReady();
  const payload = {
    width: 1,
    height: 1,
    row_stride: 3,
    rgb_base64: 'AAAA',
    assay_profile: DEFAULT_ASSAY_PROFILE,
    card_profile: DEFAULT_CARD_PROFILE,
    options: {},
  };
  const valid = await fetch(`${origin}/api/strip-cv`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('access-control-allow-origin'), null);
  assert.equal((await valid.json()).status, 'invalid');

  const wrongContentType = await fetch(`${origin}/api/strip-cv`, {
    method: 'POST',
    body: '{}',
  });
  assert.equal(wrongContentType.status, 415);
  assert.equal(await requestMalformedUrl(), 400);
  assert.equal(server.exitCode, null);
  console.log('StripCV web server smoke test passed.');
} finally {
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}
