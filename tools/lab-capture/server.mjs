import { createReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const configuredDataDir = process.env.LAB_CAPTURE_DATA_DIR || process.env.DATA_DIR;
const DATA_DIR = configuredDataDir
  ? resolve(process.cwd(), configuredDataDir)
  : join(ROOT_DIR, 'data');
const PHOTOS_DIR = join(DATA_DIR, 'photos');
const STATE_FILE = join(DATA_DIR, 'state.json');

const HOST = process.env.HOST || '0.0.0.0';
const requestedPort = parsePort(process.env.PORT ?? '8787');
const TIMER_DURATION_MS = 3 * 60 * 1000;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_RECENT_UPLOADS = 100;
const MAX_JSON_BYTES = 64 * 1024;
const ALLOWED_PLATFORMS = new Set(['iPhone', 'Android']);
const ALLOWED_CONCENTRATIONS = new Set(['2500', '250', '25', '0', 'background']);
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
]);
const STATIC_CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

let state = createEmptyState();
let stateWriteQueue = Promise.resolve();
let timerSequence = 0;
let photoCount = 0;
let shuttingDown = false;
const sseClients = new Set();
const timerTimeouts = new Map();

await initializeState();

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    if (response.headersSent) {
      response.destroy();
      return;
    }

    const status = Number.isInteger(error?.status) ? error.status : 500;
    const code = error?.code || 'INTERNAL_ERROR';
    if (status >= 500) {
      console.error('[lab-capture] Request failed:', error);
    }
    sendJson(response, status, {
      ok: false,
      error: {
        code,
        message: status >= 500 ? 'Internal server error' : error.message,
      },
    });
  });
});

server.requestTimeout = 5 * 60 * 1000;
server.headersTimeout = 30 * 1000;
server.keepAliveTimeout = 5 * 1000;

server.listen(requestedPort, HOST, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : requestedPort;
  const urls = getReachableUrls(actualPort);

  console.log(`\nLab Capture is running on port ${actualPort}`);
  for (const url of urls) {
    console.log(`  ${url}`);
  }
  console.log(`\nPhotos: ${PHOTOS_DIR}`);
  console.log(`LAB_CAPTURE_READY:http://127.0.0.1:${actualPort}`);
});

server.on('error', (error) => {
  console.error('[lab-capture] Server error:', error);
  process.exitCode = 1;
});

const keepAliveInterval = setInterval(() => {
  for (const response of sseClients) {
    response.write(': keepalive\n\n');
  }
}, 15_000);
keepAliveInterval.unref();

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const pathname = requestUrl.pathname;

  if (request.method === 'GET' && pathname === '/api/state') {
    sendJson(response, 200, publicState());
    return;
  }

  if (request.method === 'GET' && pathname === '/api/events') {
    openEventStream(request, response);
    return;
  }

  if (request.method === 'POST' && pathname === '/api/uploads') {
    await uploadPhoto(request, response);
    return;
  }

  if (request.method === 'POST' && pathname === '/api/timers') {
    await createTimer(request, response);
    return;
  }

  if (request.method === 'DELETE' && pathname === '/api/timers/completed') {
    await deleteCompletedTimers(response);
    return;
  }

  if (request.method === 'DELETE' && pathname.startsWith('/api/timers/')) {
    const encodedId = pathname.slice('/api/timers/'.length);
    await deleteTimer(encodedId, response);
    return;
  }

  if (pathname.startsWith('/api/')) {
    throw httpError(404, 'NOT_FOUND', 'API route not found');
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    throw httpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  await serveStatic(pathname, request.method === 'HEAD', response);
}

async function uploadPhoto(request, response) {
  const platform = singleHeader(request, 'x-lab-platform');
  const concentration = singleHeader(request, 'x-lab-concentration');
  const rawDeviceName = decodeMetadataHeader(
    singleHeader(request, 'x-lab-device-name'),
    'device name',
  );
  const encodedFileName = optionalSingleHeader(request, 'x-lab-file-name');
  const originalFileName = encodedFileName
    ? decodeMetadataHeader(encodedFileName, 'file name')
    : '';
  const mimeType = normalizeMimeType(singleHeader(request, 'content-type'));

  if (!ALLOWED_PLATFORMS.has(platform)) {
    throw httpError(400, 'INVALID_PLATFORM', 'Platform must be iPhone or Android');
  }
  if (!ALLOWED_CONCENTRATIONS.has(concentration)) {
    throw httpError(
      400,
      'INVALID_CONCENTRATION',
      'Concentration must be 2500, 250, 25, 0, or background',
    );
  }
  if (!IMAGE_EXTENSIONS.has(mimeType)) {
    throw httpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported image type');
  }
  rejectPathLikeValue(rawDeviceName, 'device name');
  if (originalFileName) {
    rejectPathLikeValue(originalFileName, 'file name');
  }

  const deviceName = sanitizeDeviceName(rawDeviceName);
  if (!deviceName) {
    throw httpError(400, 'INVALID_DEVICE_NAME', 'Device name cannot be empty');
  }

  const contentLength = parseContentLength(request.headers['content-length']);
  if (contentLength !== null && contentLength > MAX_UPLOAD_BYTES) {
    throw httpError(413, 'UPLOAD_TOO_LARGE', 'Image exceeds the 30 MB limit');
  }
  if (contentLength === 0) {
    throw httpError(400, 'EMPTY_UPLOAD', 'Image body cannot be empty');
  }

  const now = new Date();
  const id = randomUUID();
  const extension = IMAGE_EXTENSIONS.get(mimeType);
  const dateDirectory = localDate(now);
  const destinationDirectory = join(PHOTOS_DIR, platform, dateDirectory, concentration);
  const fileName = `${localTime(now)}__${deviceName}__${id}${extension}`;
  const finalPath = join(destinationDirectory, fileName);
  const temporaryPath = join(destinationDirectory, `.upload-${id}.part`);

  await mkdir(destinationDirectory, { recursive: true, mode: 0o700 });

  let handle;
  let size = 0;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        throw httpError(413, 'UPLOAD_TOO_LARGE', 'Image exceeds the 30 MB limit');
      }
      await handle.write(chunk);
    }

    if (size === 0) {
      throw httpError(400, 'EMPTY_UPLOAD', 'Image body cannot be empty');
    }

    await handle.sync();
    await handle.close();
    handle = undefined;
  await rename(temporaryPath, finalPath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }

  const upload = {
    id,
    fileName,
    createdAt: now.getTime(),
    platform,
    concentration,
    deviceName,
    size,
    mimeType,
    status: 'saved',
  };
  photoCount += 1;
  state.uploads.unshift(upload);
  state.uploads = state.uploads.slice(0, MAX_RECENT_UPLOADS);
  await persistState();
  broadcastState();

  sendJson(response, 201, { ok: true, upload, photoCount });
}

async function createTimer(request, response) {
  await consumeOptionalJson(request);

  const startedAt = Date.now();
  const timer = {
    id: randomUUID(),
    number: ++timerSequence,
    createdAt: startedAt,
    startedAt,
    endsAt: startedAt + TIMER_DURATION_MS,
    completedAt: null,
    status: 'running',
  };
  state.timers.push(timer);
  scheduleTimer(timer);
  await persistState();
  broadcastState();
  sendJson(response, 201, { ok: true, timer: { ...timer } });
}

async function deleteTimer(encodedId, response) {
  let id;
  try {
    id = decodeURIComponent(encodedId);
  } catch {
    throw httpError(400, 'INVALID_TIMER_ID', 'Invalid timer id');
  }
  if (!id || id.includes('/') || id.includes('\\')) {
    throw httpError(400, 'INVALID_TIMER_ID', 'Invalid timer id');
  }

  const index = state.timers.findIndex((timer) => timer.id === id);
  if (index === -1) {
    throw httpError(404, 'TIMER_NOT_FOUND', 'Timer not found');
  }

  clearScheduledTimer(id);
  state.timers.splice(index, 1);
  await persistState();
  broadcastState();
  sendJson(response, 200, { ok: true, deletedId: id });
}

async function deleteCompletedTimers(response) {
  const before = state.timers.length;
  state.timers = state.timers.filter((timer) => timer.status !== 'completed');
  const deletedCount = before - state.timers.length;
  if (deletedCount > 0) {
    await persistState();
    broadcastState();
  }
  sendJson(response, 200, { ok: true, deletedCount });
}

function scheduleTimer(timer) {
  clearScheduledTimer(timer.id);
  const remaining = timer.endsAt - Date.now();
  if (remaining <= 0) {
    runInBackground(completeTimer(timer.id));
    return;
  }

  const timeout = setTimeout(() => runInBackground(completeTimer(timer.id)), remaining);
  timeout.unref();
  timerTimeouts.set(timer.id, timeout);
}

async function completeTimer(id) {
  timerTimeouts.delete(id);
  const timer = state.timers.find((candidate) => candidate.id === id);
  if (!timer || timer.status === 'completed') {
    return;
  }

  timer.status = 'completed';
  timer.completedAt = Date.now();
  await persistState();
  broadcastState();
}

function clearScheduledTimer(id) {
  const timeout = timerTimeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    timerTimeouts.delete(id);
  }
}

function openEventStream(request, response) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders?.();
  sseClients.add(response);
  sendSseState(response);

  const close = () => sseClients.delete(response);
  request.once('close', close);
  response.once('close', close);
}

function broadcastState() {
  for (const response of sseClients) {
    sendSseState(response);
  }
}

function sendSseState(response) {
  response.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
}

function publicState() {
  return {
    ok: true,
    serverTime: Date.now(),
    durationMs: TIMER_DURATION_MS,
    photoCount,
    timers: state.timers.map((timer) => ({ ...timer })),
    uploads: state.uploads.map((upload) => ({ ...upload })),
  };
}

async function initializeState() {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await mkdir(PHOTOS_DIR, { recursive: true, mode: 0o700 });
  photoCount = await countPhotoFiles(PHOTOS_DIR);

  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    state = normalizePersistedState(parsed);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      const backup = `${STATE_FILE}.corrupt-${Date.now()}`;
      await copyFile(STATE_FILE, backup).catch(() => {});
      console.error(`[lab-capture] Invalid state file; starting with empty state. Backup: ${backup}`);
    }
    state = createEmptyState();
  }

  timerSequence = state.timers.reduce(
    (maximum, timer) => Math.max(maximum, Number.isInteger(timer.number) ? timer.number : 0),
    0,
  );

  let changed = false;
  for (const timer of state.timers) {
    if (timer.status === 'running' && timer.endsAt <= Date.now()) {
      timer.status = 'completed';
      timer.completedAt = timer.endsAt;
      changed = true;
    } else if (timer.status === 'running') {
      scheduleTimer(timer);
    }
  }

  if (changed) {
    await persistState();
  }
}

async function countPhotoFiles(directory) {
  let count = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await countPhotoFiles(entryPath);
    } else if (
      entry.isFile() &&
      [...IMAGE_EXTENSIONS.values()].includes(extname(entry.name).toLowerCase())
    ) {
      count += 1;
    }
  }
  return count;
}

function normalizePersistedState(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('State must be an object');
  }

  const timers = Array.isArray(value.timers)
    ? value.timers.filter(isValidPersistedTimer).map((timer) => ({ ...timer }))
    : [];
  const uploads = Array.isArray(value.uploads)
    ? value.uploads.filter(isValidPersistedUpload).slice(0, MAX_RECENT_UPLOADS).map((upload) => ({ ...upload }))
    : [];
  return { version: 1, timers, uploads };
}

function isValidPersistedTimer(timer) {
  return Boolean(
    timer &&
      typeof timer.id === 'string' &&
      Number.isInteger(timer.number) &&
      Number.isFinite(timer.createdAt) &&
      Number.isFinite(timer.startedAt) &&
      Number.isFinite(timer.endsAt) &&
      (timer.status === 'running' || timer.status === 'completed') &&
      (timer.completedAt === null || Number.isFinite(timer.completedAt)),
  );
}

function isValidPersistedUpload(upload) {
  return Boolean(
    upload &&
      typeof upload.id === 'string' &&
      typeof upload.fileName === 'string' &&
      Number.isFinite(upload.createdAt) &&
      ALLOWED_PLATFORMS.has(upload.platform) &&
      ALLOWED_CONCENTRATIONS.has(upload.concentration) &&
      typeof upload.deviceName === 'string' &&
      Number.isFinite(upload.size) &&
      IMAGE_EXTENSIONS.has(upload.mimeType),
  );
}

function createEmptyState() {
  return { version: 1, timers: [], uploads: [] };
}

function persistState() {
  const snapshot = JSON.stringify(state, null, 2) + '\n';
  const temporaryFile = `${STATE_FILE}.tmp`;
  const write = async () => {
    await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
    await writeFile(temporaryFile, snapshot, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryFile, STATE_FILE);
  };
  stateWriteQueue = stateWriteQueue.then(write, write);
  return stateWriteQueue;
}

async function serveStatic(pathname, headOnly, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw httpError(400, 'INVALID_PATH', 'Invalid URL path');
  }

  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const filePath = resolve(PUBLIC_DIR, `.${requestedPath}`);
  const pathWithinPublic = relative(PUBLIC_DIR, filePath);
  if (pathWithinPublic.startsWith(`..${sep}`) || pathWithinPublic === '..' || isAbsolute(pathWithinPublic)) {
    throw httpError(403, 'FORBIDDEN', 'Forbidden path');
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      throw httpError(404, 'NOT_FOUND', 'File not found');
    }
    throw error;
  }
  if (!fileStats.isFile()) {
    throw httpError(404, 'NOT_FOUND', 'File not found');
  }

  response.writeHead(200, {
    'Content-Type': STATIC_CONTENT_TYPES.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': fileStats.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (headOnly) {
    response.end();
    return;
  }

  await pipeline(createReadStream(filePath), response);
}

async function consumeOptionalJson(request) {
  const contentLength = parseContentLength(request.headers['content-length']);
  if (contentLength === 0) {
    return;
  }
  if (contentLength !== null && contentLength > MAX_JSON_BYTES) {
    throw httpError(413, 'BODY_TOO_LARGE', 'Request body is too large');
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      throw httpError(413, 'BODY_TOO_LARGE', 'Request body is too large');
    }
    chunks.push(chunk);
  }
  if (size === 0) {
    return;
  }

  try {
    JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
}

function singleHeader(request, name) {
  const value = optionalSingleHeader(request, name);
  if (!value) {
    throw httpError(400, 'MISSING_HEADER', `Missing ${name} header`);
  }
  return value;
}

function optionalSingleHeader(request, name) {
  const value = request.headers[name];
  if (Array.isArray(value)) {
    throw httpError(400, 'INVALID_HEADER', `Multiple ${name} headers are not allowed`);
  }
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeMimeType(value) {
  return value.split(';', 1)[0].trim().toLowerCase();
}

function decodeMetadataHeader(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw httpError(400, 'INVALID_HEADER_ENCODING', `Invalid ${label} encoding`);
  }
}

function rejectPathLikeValue(value, label) {
  if (value.includes('/') || value.includes('\\') || value.includes('\0') || value.includes('..')) {
    throw httpError(400, 'INVALID_PATH_VALUE', `Invalid ${label}`);
  }
}

function sanitizeDeviceName(value) {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 64);
}

function parseContentLength(value) {
  if (value === undefined) {
    return null;
  }
  if (Array.isArray(value) || !/^\d+$/.test(value)) {
    throw httpError(400, 'INVALID_CONTENT_LENGTH', 'Invalid Content-Length header');
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw httpError(400, 'INVALID_CONTENT_LENGTH', 'Invalid Content-Length header');
  }
  return length;
}

function localDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTime(date) {
  return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}-${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function pad(number) {
  return String(number).padStart(2, '0');
}

function parsePort(value) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function getReachableUrls(port) {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  const uniqueAddresses = [...new Set(addresses)].sort();
  if (uniqueAddresses.length === 0) {
    return [`http://127.0.0.1:${port}`];
  }
  return uniqueAddresses.map((address) => `http://${address}:${port}`);
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function runInBackground(promise) {
  promise.catch((error) => {
    console.error('[lab-capture] Background operation failed:', error);
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`\n[lab-capture] Received ${signal}; shutting down...`);
  clearInterval(keepAliveInterval);
  for (const timeout of timerTimeouts.values()) {
    clearTimeout(timeout);
  }
  timerTimeouts.clear();
  for (const response of sseClients) {
    response.end();
  }
  sseClients.clear();

  await new Promise((resolveClose) => {
    server.close(() => resolveClose());
    server.closeIdleConnections?.();
  });
  await stateWriteQueue.catch(() => {});
}
