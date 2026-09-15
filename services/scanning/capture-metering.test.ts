import assert from 'node:assert/strict';
import test from 'node:test';
import { captureMeteredPhoto, captureLiveFrame } from './capture-metering';

test('capture waits for metering and starts only after readiness', async () => {
  let ready!: (value: boolean) => void;
  let captures = 0;
  const result = captureMeteredPhoto({
    waitForMetering: () => new Promise<boolean>(resolve => { ready = resolve; }),
    capture: async () => { captures++; return 'original.jpg'; },
    cancelled: () => false,
  });
  assert.equal(captures, 0);
  ready(true);
  assert.equal(await result, 'original.jpg');
  assert.equal(captures, 1);
});

test('timeout skips the photo; a later settled retry can succeed', async () => {
  let settled = false;
  let captures = 0;
  const options = {
    waitForMetering: async () => settled,
    capture: async () => ++captures,
    cancelled: () => false,
  };
  assert.equal(await captureMeteredPhoto(options), null);
  assert.equal(captures, 0);
  settled = true;
  assert.equal(await captureMeteredPhoto(options), 1);
});

test('shutter, background or setting change during metering cancels before capture', async () => {
  let cancelled = false;
  const result = await captureMeteredPhoto({
    waitForMetering: async () => { cancelled = true; return true; },
    capture: async () => assert.fail('must not expose a cancelled frame'),
    cancelled: () => cancelled,
  });
  assert.equal(result, null);
  assert.equal(await captureMeteredPhoto({
    waitForMetering: async () => assert.fail('already cancelled'),
    capture: async () => assert.fail('already cancelled'),
    cancelled: () => true,
  }), null);
});

test('unsupported native metering preserves capture; camera errors propagate', async () => {
  assert.equal(await captureMeteredPhoto({ capture: async () => 'fallback', cancelled: () => false }), 'fallback');
  await assert.rejects(captureMeteredPhoto({
    waitForMetering: async () => { throw new Error('Camera stopped'); },
    capture: async () => assert.fail('metering failed'), cancelled: () => false,
  }), /Camera stopped/);
});

test('live ring uses video frames; timeout never falls back to a heavy still', async () => {
  let previews = 0, photos = 0;
  const options = { takePreview: async () => { previews++; return 'video.jpg'; },
    takePhoto: async () => { photos++; return 'full.jpg'; }, flashProbe: false };
  for (let i = 0; i < 30; i++) assert.equal(await captureLiveFrame(options), 'video.jpg');
  assert.equal(previews, 30);
  assert.equal(photos, 0);
  assert.equal(await captureLiveFrame({ ...options, takePreview: async () => null }), null);
  assert.equal(photos, 0);
  assert.equal(await captureLiveFrame({ ...options, flashProbe: true }), 'full.jpg');
  assert.equal(photos, 1);
  assert.equal(await captureLiveFrame({ ...options, takePreview: undefined }), 'full.jpg');
});
