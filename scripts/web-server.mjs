import { spawn } from 'node:child_process';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const distDir = resolve(process.env.DIST_DIR ?? join(root, 'dist'));
const buildDir = join(root, 'web-build', 'stripcv-native');
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '127.0.0.1';
const bodyLimit = 32 * 1024 * 1024;
const stdoutLimit = 8 * 1024 * 1024;
const stderrLimit = 64 * 1024;
const processTimeoutMs = 30_000;
const maxConcurrentProcesses = 2;
let activeProcesses = 0;

const cliCandidates = [
  join(buildDir, 'stripcv_cli'),
  join(buildDir, 'Release', 'stripcv_cli'),
  join(buildDir, 'stripcv_cli.exe'),
  join(buildDir, 'Release', 'stripcv_cli.exe'),
];
const cliPath = cliCandidates.find((candidate) => existsSync(candidate));

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
};

function writeJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > bodyLimit) {
        reject(new Error('request_too_large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function parseStripCvRequest(payload) {
  const value = JSON.parse(payload);
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Number.isInteger(value.width) ||
    value.width <= 0 ||
    value.width > 32768 ||
    !Number.isInteger(value.height) ||
    value.height <= 0 ||
    value.height > 32768 ||
    !Number.isInteger(value.row_stride) ||
    value.row_stride < value.width * 3 ||
    value.row_stride > 131072 ||
    typeof value.rgb_base64 !== 'string' ||
    !value.assay_profile ||
    typeof value.assay_profile !== 'object' ||
    Array.isArray(value.assay_profile) ||
    (value.card_profile !== null &&
      value.card_profile !== undefined &&
      (typeof value.card_profile !== 'object' ||
        Array.isArray(value.card_profile))) ||
    !value.options ||
    typeof value.options !== 'object' ||
    Array.isArray(value.options)
  ) {
    throw new Error('invalid_request');
  }
  return JSON.stringify(value);
}

function runStripCv(payload) {
  return new Promise((resolve, reject) => {
    if (!cliPath) {
      reject(new Error('helper_missing'));
      return;
    }
    if (activeProcesses >= maxConcurrentProcesses) {
      reject(new Error('busy'));
      return;
    }

    activeProcesses += 1;
    const child = spawn(cliPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeProcesses -= 1;
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('helper_timeout')));
    }, processTimeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > stdoutLimit) {
        child.kill('SIGKILL');
        finish(() => reject(new Error('helper_output_too_large')));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > stderrLimit) {
        child.kill('SIGKILL');
        finish(() => reject(new Error('helper_output_too_large')));
      }
    });
    child.on('error', () => finish(() => reject(new Error('helper_failed'))));
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(() => reject(new Error('invalid_analysis_request')));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        finish(() => resolve(result));
      } catch {
        finish(() => reject(new Error('helper_invalid_json')));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(payload);
  });
}

function serveStatic(request, response) {
  let requestPath;
  try {
    requestPath = decodeURIComponent((request.url ?? '/').split('?')[0]);
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Malformed URL.\n');
    return;
  }

  if (!existsSync(distDir)) {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Web export is missing. Run `npm run build:web` first.\n');
    return;
  }
  const relativePath =
    requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const candidate = normalize(join(distDir, relativePath));
  const realDist = realpathSync(distDir);
  let filePath = join(realDist, 'index.html');
  if (candidate === distDir || candidate.startsWith(`${distDir}${sep}`)) {
    try {
      const realCandidate = realpathSync(candidate);
      if (
        (realCandidate === realDist ||
          realCandidate.startsWith(`${realDist}${sep}`)) &&
        statSync(realCandidate).isFile()
      ) {
        filePath = realCandidate;
      }
    } catch {
      // SPA fallback remains index.html.
    }
  }

  response.writeHead(200, {
    'Content-Type':
      contentTypes[extname(filePath).toLowerCase()] ??
      'application/octet-stream',
    'Cache-Control': filePath.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { Allow: 'GET,HEAD,POST,OPTIONS' });
    response.end();
    return;
  }

  if (
    request.method === 'POST' &&
    request.url?.split('?')[0] === '/api/strip-cv'
  ) {
    if (!request.headers['content-type']?.startsWith('application/json')) {
      writeJson(response, 415, {
        error: 'Content-Type must be application/json.',
      });
      return;
    }
    try {
      const payload = parseStripCvRequest(await readRequestBody(request));
      writeJson(response, 200, await runStripCv(payload));
    } catch (error) {
      const code = error instanceof Error ? error.message : 'request_failed';
      const status =
        code === 'busy' ? 429 : code === 'helper_missing' ? 503 : 422;
      writeJson(response, status, { error: 'StripCV request was rejected.' });
    }
    return;
  }

  if (request.method === 'GET' || request.method === 'HEAD') {
    serveStatic(request, response);
    return;
  }

  writeJson(response, 405, { error: 'Method not allowed.' });
});

server.listen(port, host, () => {
  console.log(`Web app with native StripCV API: http://${host}:${port}`);
  if (!cliPath) {
    console.warn('StripCV helper missing; run `npm run build:strip-cv`.');
  }
});
