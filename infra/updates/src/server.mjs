import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  authenticateInternalRequest,
  createRelease,
  currentRelease,
  openStore,
  pruneStore,
  promoteRelease,
  rollbackChannel,
  signManifest,
} from './core.mjs';

process.umask(0o077);
const port = Number(process.env.PORT ?? 8094);
const dataDir = process.env.OTA_DATA_DIR ?? '/data';
const publicBaseUrl = (process.env.OTA_PUBLIC_URL ?? '').replace(/\/$/, '');
const publishSecret = process.env.OTA_PUBLISH_SECRET ?? '';
const privateKeyPath = process.env.OTA_SIGNING_PRIVATE_KEY_PATH ?? '';
if (!publicBaseUrl || !publishSecret || !privateKeyPath) throw new Error('OTA_CONFIGURATION_MISSING');
const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const db = openStore(dataDir);

const safeHeaders = (req) => Object.fromEntries(
  Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
);

async function readBody(req, maxBytes = 160 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('BODY_TOO_LARGE'), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(res, statusCode, value) {
  const body = JSON.stringify(value);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, publicBaseUrl);
    if (req.method === 'GET' && url.pathname === '/health') {
      const releases = db.prepare('SELECT COUNT(*) count FROM releases').get().count;
      return json(res, 200, { status: 'ok', protocolVersion: 1, releases });
    }
    if (req.method === 'GET' && url.pathname === '/api/manifest') {
      if (req.headers['expo-protocol-version'] !== '1') return json(res, 406, { error: 'PROTOCOL_V1_REQUIRED' });
      const platform = req.headers['expo-platform'];
      const runtimeVersion = req.headers['expo-runtime-version'];
      const channel = req.headers['expo-channel-name'] ?? 'production';
      const release = currentRelease(db, { platform, runtimeVersion, channel });
      if (!release || req.headers['expo-current-update-id'] === release.id) {
        res.writeHead(204, { 'expo-protocol-version': '1', 'expo-sfv-version': '0', 'cache-control': 'no-store' });
        return res.end();
      }
      const signature = signManifest(release.manifest_json, privateKey);
      res.writeHead(200, {
        'content-type': 'application/expo+json',
        'content-length': Buffer.byteLength(release.manifest_json),
        'expo-protocol-version': '1',
        'expo-sfv-version': '0',
        'expo-signature': `sig="${signature}", keyid="main", alg="rsa-v1_5-sha256"`,
        'cache-control': 'private, max-age=0',
      });
      return res.end(release.manifest_json);
    }
    if (req.method === 'GET' && /^\/assets\/[a-f0-9]{64}$/.test(url.pathname)) {
      const sha256 = url.pathname.slice('/assets/'.length);
      const asset = db.prepare('SELECT * FROM assets WHERE sha256 = ?').get(sha256);
      if (!asset) return json(res, 404, { error: 'ASSET_NOT_FOUND' });
      const assetPath = path.join(dataDir, 'assets', sha256);
      res.writeHead(200, {
        'content-type': asset.content_type,
        'content-length': asset.byte_size,
        'cache-control': 'public, max-age=31536000, immutable',
        etag: `"${sha256}"`,
      });
      return fs.createReadStream(assetPath).pipe(res);
    }
    if (req.method === 'POST' && url.pathname.startsWith('/internal/')) {
      const body = await readBody(req);
      authenticateInternalRequest({ db, headers: safeHeaders(req), body, secret: publishSecret });
      let input;
      try { input = JSON.parse(body.toString('utf8')); } catch { throw Object.assign(new Error('INVALID_JSON'), { statusCode: 400 }); }
      if (url.pathname === '/internal/releases') {
        return json(res, 201, createRelease({ db, dataDir, publicBaseUrl, input }));
      }
      if (url.pathname === '/internal/promote') {
        const result = promoteRelease({ db, input });
        pruneStore({ db, dataDir });
        return json(res, 200, result);
      }
      if (url.pathname === '/internal/rollback') {
        const result = rollbackChannel({ db, input });
        pruneStore({ db, dataDir });
        return json(res, 200, result);
      }
    }
    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    if (statusCode >= 500) console.error('OTA_REQUEST_FAILED', error instanceof Error ? error.message : 'unknown');
    return json(res, statusCode, { error: statusCode >= 500 ? 'OTA_INTERNAL' : error.message });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`OTA_READY:${port}`));
