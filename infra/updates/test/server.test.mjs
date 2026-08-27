import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  authenticateInternalRequest,
  canonicalAuthPayload,
  createRelease,
  currentRelease,
  openStore,
  promoteRelease,
  rollbackChannel,
  sha256Hex,
  signManifest,
} from '../src/core.mjs';

function fixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artificiallabs-ota-'));
  return { dataDir, db: openStore(dataDir) };
}

function releaseInput(channel = 'preview', marker = 'a') {
  const bytes = Buffer.from(`bundle-${marker}`);
  return {
    platform: 'ios', runtimeVersion: 'fingerprint-1', channel, sourceCommit: marker.repeat(40),
    assets: [{ sha256: sha256Hex(bytes), dataBase64: bytes.toString('base64'), contentType: 'application/javascript', key: 'bundle', isLaunch: true }],
  };
}

test('publish, promote and rollback preserve immutable releases', () => {
  const { db, dataDir } = fixture();
  const a = createRelease({ db, dataDir, publicBaseUrl: 'https://updates.test', input: releaseInput('preview', 'a'), now: 1 });
  const b = createRelease({ db, dataDir, publicBaseUrl: 'https://updates.test', input: releaseInput('preview', 'b'), now: 2 });
  assert.equal(currentRelease(db, { channel: 'preview', platform: 'ios', runtimeVersion: 'fingerprint-1' }).id, b.id);
  promoteRelease({ db, input: { updateId: b.id, channel: 'production' }, now: 3 });
  assert.equal(currentRelease(db, { channel: 'production', platform: 'ios', runtimeVersion: 'fingerprint-1' }).id, b.id);
  rollbackChannel({ db, input: { channel: 'preview', platform: 'ios', runtimeVersion: 'fingerprint-1' }, now: 4 });
  assert.equal(currentRelease(db, { channel: 'preview', platform: 'ios', runtimeVersion: 'fingerprint-1' }).id, a.id);
});

test('rejects corrupted assets', () => {
  const { db, dataDir } = fixture();
  const input = releaseInput();
  input.assets[0].sha256 = '0'.repeat(64);
  assert.throws(() => createRelease({ db, dataDir, publicBaseUrl: 'https://updates.test', input }), /ASSET_HASH_MISMATCH/);
});

test('HMAC rejects replay', () => {
  const { db } = fixture();
  const body = Buffer.from('{}');
  const timestamp = Date.now();
  const requestId = crypto.randomUUID();
  const secret = 'test-secret';
  const signature = crypto.createHmac('sha256', secret).update(canonicalAuthPayload(timestamp, requestId, body)).digest('hex');
  const args = { db, body, secret, headers: { 'x-ota-timestamp': String(timestamp), 'x-ota-request-id': requestId, 'x-ota-signature': signature } };
  authenticateInternalRequest(args);
  assert.throws(() => authenticateInternalRequest(args), /OTA_REPLAY/);
});

test('manifest signatures verify with the matching public certificate key', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const manifest = JSON.stringify({ id: crypto.randomUUID(), runtimeVersion: 'fingerprint-1' });
  const signature = signManifest(manifest, privateKey);
  assert.equal(
    crypto.verify(
      'RSA-SHA256',
      Buffer.from(manifest),
      publicKey,
      Buffer.from(signature, 'base64'),
    ),
    true,
  );
  assert.equal(
    crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${manifest} `),
      publicKey,
      Buffer.from(signature, 'base64'),
    ),
    false,
  );
});
