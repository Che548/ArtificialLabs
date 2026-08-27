import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const CHANNELS = new Set(['preview', 'production']);
const PLATFORMS = new Set(['ios', 'android']);
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export const sha256Hex = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

const sha256Base64Url = (value) =>
  crypto.createHash('sha256').update(value).digest('base64url');

export function canonicalAuthPayload(timestamp, requestId, body) {
  return `${timestamp}.${requestId}.${sha256Hex(body)}`;
}

export function authenticateInternalRequest({ db, headers, body, secret, now = Date.now() }) {
  const timestamp = Number(headers['x-ota-timestamp']);
  const requestId = headers['x-ota-request-id'];
  const signature = headers['x-ota-signature'];
  if (!Number.isFinite(timestamp) || typeof requestId !== 'string' || typeof signature !== 'string') {
    throw Object.assign(new Error('OTA_AUTH_REQUIRED'), { statusCode: 401 });
  }
  if (Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) {
    throw Object.assign(new Error('OTA_AUTH_EXPIRED'), { statusCode: 401 });
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(canonicalAuthPayload(timestamp, requestId, body))
    .digest('hex');
  const supplied = Buffer.from(signature, 'hex');
  const wanted = Buffer.from(expected, 'hex');
  if (supplied.length !== wanted.length || !crypto.timingSafeEqual(supplied, wanted)) {
    throw Object.assign(new Error('OTA_AUTH_INVALID'), { statusCode: 401 });
  }
  try {
    db.prepare('INSERT INTO request_replays(request_id, seen_at) VALUES (?, ?)').run(requestId, now);
  } catch {
    throw Object.assign(new Error('OTA_REPLAY'), { statusCode: 409 });
  }
}

export function openStore(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'assets'), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'updates.sqlite'));
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS releases (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      runtime_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      launch_asset_hash TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      source_commit TEXT,
      created_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      sha256 TEXT PRIMARY KEY,
      byte_size INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      extension TEXT,
      created_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS release_assets (
      release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
      sha256 TEXT NOT NULL REFERENCES assets(sha256),
      is_launch INTEGER NOT NULL,
      asset_key TEXT NOT NULL,
      PRIMARY KEY (release_id, sha256, asset_key)
    );
    CREATE TABLE IF NOT EXISTS channel_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      platform TEXT NOT NULL,
      runtime_version TEXT NOT NULL,
      release_id TEXT NOT NULL REFERENCES releases(id),
      activated_ms INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS channel_history_lookup
      ON channel_history(channel, platform, runtime_version, id DESC);
    CREATE TABLE IF NOT EXISTS request_replays (
      request_id TEXT PRIMARY KEY,
      seen_at INTEGER NOT NULL
    );
  `);
  return db;
}

function assertTarget(platform, runtimeVersion, channel) {
  if (!PLATFORMS.has(platform)) throw Object.assign(new Error('INVALID_PLATFORM'), { statusCode: 400 });
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('INVALID_CHANNEL'), { statusCode: 400 });
  if (typeof runtimeVersion !== 'string' || !runtimeVersion || runtimeVersion.length > 200) {
    throw Object.assign(new Error('INVALID_RUNTIME'), { statusCode: 400 });
  }
}

function validateAsset(asset) {
  if (!asset || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
    throw Object.assign(new Error('INVALID_ASSET_HASH'), { statusCode: 400 });
  }
  const bytes = Buffer.from(asset.dataBase64 ?? '', 'base64');
  if (sha256Hex(bytes) !== asset.sha256) {
    throw Object.assign(new Error('ASSET_HASH_MISMATCH'), { statusCode: 400 });
  }
  if (typeof asset.contentType !== 'string' || !asset.contentType.includes('/')) {
    throw Object.assign(new Error('INVALID_ASSET_TYPE'), { statusCode: 400 });
  }
  return bytes;
}

function uuidFromHash(hash) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function createRelease({ db, dataDir, publicBaseUrl, input, now = Date.now() }) {
  const { platform, runtimeVersion, channel, sourceCommit = null } = input;
  assertTarget(platform, runtimeVersion, channel);
  if (!Array.isArray(input.assets) || input.assets.length === 0) {
    throw Object.assign(new Error('ASSETS_REQUIRED'), { statusCode: 400 });
  }
  const verified = input.assets.map((asset) => ({ asset, bytes: validateAsset(asset) }));
  const launch = verified.find(({ asset }) => asset.isLaunch);
  if (!launch || verified.filter(({ asset }) => asset.isLaunch).length !== 1) {
    throw Object.assign(new Error('ONE_LAUNCH_ASSET_REQUIRED'), { statusCode: 400 });
  }
  const identity = JSON.stringify({
    platform,
    runtimeVersion,
    hashes: verified.map(({ asset }) => asset.sha256),
  });
  const releaseHash = sha256Hex(identity);
  const id = uuidFromHash(releaseHash);
  const createdAt = new Date(now).toISOString();
  const toManifestAsset = ({ asset, bytes }) => ({
    hash: sha256Base64Url(bytes),
    key: asset.key || asset.sha256,
    ...(asset.isLaunch ? {} : { fileExtension: asset.extension || undefined }),
    contentType: asset.contentType,
    url: `${publicBaseUrl}/assets/${asset.sha256}`,
  });
  const manifest = {
    id,
    createdAt,
    runtimeVersion,
    launchAsset: toManifestAsset(launch),
    assets: verified.filter(({ asset }) => !asset.isLaunch).map(toManifestAsset),
    metadata: { channel, sourceCommit: sourceCommit?.slice(0, 40) ?? '' },
    extra: input.extra && typeof input.extra === 'object' ? input.extra : {},
  };

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const { asset, bytes } of verified) {
      const target = path.join(dataDir, 'assets', asset.sha256);
      if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { mode: 0o600, flag: 'wx' });
      db.prepare(`INSERT OR IGNORE INTO assets(sha256, byte_size, content_type, extension, created_ms)
                  VALUES (?, ?, ?, ?, ?)`).run(
        asset.sha256, bytes.length, asset.contentType, asset.extension ?? null, now,
      );
    }
    db.prepare(`INSERT OR IGNORE INTO releases
      (id, platform, runtime_version, created_at, launch_asset_hash, manifest_json, source_commit, created_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, platform, runtimeVersion, createdAt, launch.asset.sha256,
      JSON.stringify(manifest), sourceCommit, now,
    );
    for (const { asset } of verified) {
      db.prepare(`INSERT OR IGNORE INTO release_assets(release_id, sha256, is_launch, asset_key)
                  VALUES (?, ?, ?, ?)`).run(id, asset.sha256, asset.isLaunch ? 1 : 0, asset.key || asset.sha256);
    }
    db.prepare(`INSERT INTO channel_history(channel, platform, runtime_version, release_id, activated_ms)
                VALUES (?, ?, ?, ?, ?)`).run(channel, platform, runtimeVersion, id, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  pruneStore({ db, dataDir });
  return { id, platform, runtimeVersion, channel, createdAt };
}

export function promoteRelease({ db, input, now = Date.now() }) {
  const { updateId, channel = 'production' } = input;
  if (!CHANNELS.has(channel)) throw Object.assign(new Error('INVALID_CHANNEL'), { statusCode: 400 });
  const release = db.prepare('SELECT platform, runtime_version FROM releases WHERE id = ?').get(updateId);
  if (!release) throw Object.assign(new Error('RELEASE_NOT_FOUND'), { statusCode: 404 });
  db.prepare(`INSERT INTO channel_history(channel, platform, runtime_version, release_id, activated_ms)
              VALUES (?, ?, ?, ?, ?)`).run(channel, release.platform, release.runtime_version, updateId, now);
  return { updateId, channel, platform: release.platform, runtimeVersion: release.runtime_version };
}

export function rollbackChannel({ db, input, now = Date.now() }) {
  const { channel, platform, runtimeVersion } = input;
  assertTarget(platform, runtimeVersion, channel);
  const rows = db.prepare(`SELECT release_id FROM channel_history
    WHERE channel = ? AND platform = ? AND runtime_version = ? ORDER BY id DESC LIMIT 2`)
    .all(channel, platform, runtimeVersion);
  if (rows.length < 2) throw Object.assign(new Error('NO_ROLLBACK_TARGET'), { statusCode: 409 });
  db.prepare(`INSERT INTO channel_history(channel, platform, runtime_version, release_id, activated_ms)
              VALUES (?, ?, ?, ?, ?)`).run(channel, platform, runtimeVersion, rows[1].release_id, now);
  return { updateId: rows[1].release_id, channel, platform, runtimeVersion };
}

export function currentRelease(db, { channel, platform, runtimeVersion }) {
  assertTarget(platform, runtimeVersion, channel);
  return db.prepare(`SELECT r.* FROM channel_history h
    JOIN releases r ON r.id = h.release_id
    WHERE h.channel = ? AND h.platform = ? AND h.runtime_version = ?
    ORDER BY h.id DESC LIMIT 1`).get(channel, platform, runtimeVersion);
}

export function signManifest(manifestJson, privateKey) {
  return crypto.sign('RSA-SHA256', Buffer.from(manifestJson), privateKey).toString('base64');
}

export function pruneStore({ db, dataDir }) {
  db.prepare('DELETE FROM request_replays WHERE seen_at < ?').run(Date.now() - 24 * 60 * 60_000);
  const targets = db.prepare('SELECT DISTINCT channel, platform, runtime_version FROM channel_history').all();
  for (const target of targets) {
    const stale = db.prepare(`SELECT id FROM channel_history WHERE channel = ? AND platform = ? AND runtime_version = ?
      ORDER BY id DESC LIMIT -1 OFFSET 10`).all(target.channel, target.platform, target.runtime_version);
    for (const row of stale) db.prepare('DELETE FROM channel_history WHERE id = ?').run(row.id);
  }
  db.exec(`DELETE FROM releases WHERE id NOT IN (SELECT DISTINCT release_id FROM channel_history)`);
  const unreferenced = db.prepare(`SELECT sha256 FROM assets WHERE sha256 NOT IN (SELECT DISTINCT sha256 FROM release_assets)`).all();
  for (const { sha256 } of unreferenced) {
    fs.rmSync(path.join(dataDir, 'assets', sha256), { force: true });
    db.prepare('DELETE FROM assets WHERE sha256 = ?').run(sha256);
  }
}
