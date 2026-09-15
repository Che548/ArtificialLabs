import assert from 'node:assert/strict';
import test from 'node:test';
import { TemporaryCaptureExportStore } from './temporary-capture-export';

function fixture() {
  const files = new Map<string, string>();
  const copied: string[] = [];
  const removed: string[] = [];
  const root = 'file:///cache/temporary-export/';
  const storage = {
    remove: async (uri: string) => {
      removed.push(uri);
      for (const key of files.keys()) if (key.startsWith(uri)) files.delete(key);
    },
    mkdir: async (_uri: string) => {},
    copy: async (from: string, to: string) => {
      if (!files.has(from)) throw new Error('missing');
      copied.push(from); files.set(to, files.get(from)!);
    },
  };
  const frames = Array.from({ length: 35 }, (_, i) => ({ uri: `file:///camera/${i}.jpg` }));
  for (const [i, frame] of frames.entries()) files.set(frame.uri, `original bytes ${i}`);
  return { files, copied, removed, root, storage, frames, store: new TemporaryCaptureExportStore(root, storage) };
}

test('temporary export retains only the newest 30 byte-identical copies and replaces the previous set', async () => {
  const f = fixture();
  const first = await f.store.replace(f.frames, () => false);
  assert.equal(first?.names.length, 30);
  assert.equal(f.files.get(first!.directoryUri + first!.names[0]), 'original bytes 5');
  assert.equal(f.files.get(first!.directoryUri + first!.names[29]), 'original bytes 34');
  const second = await f.store.replace(f.frames.slice(0, 1), () => false);
  assert.ok(second);
  assert.equal(f.files.has(first!.directoryUri + first!.names[0]), false);
  await f.store.clear();
  assert.equal(f.files.size, 35);
  assert.ok(f.removed.every(uri => uri === f.root));
});

test('leaving during a copy cancels the export, removes partial copies, and preserves every camera original', async () => {
  const f = fixture();
  const originalCopy = f.storage.copy;
  let cancelled = false;
  f.storage.copy = async (from, to) => { await originalCopy(from, to); cancelled = true; };
  assert.equal(await f.store.replace(f.frames, () => cancelled), null);
  assert.equal(f.copied.length, 1);
  assert.equal(f.files.size, 35);
});

test('copy failure is contained so the caller can still run CV', async () => {
  const f = fixture();
  f.storage.copy = async () => { throw new Error('full disk'); };
  assert.equal(await f.store.replace(f.frames, () => false), null);
  assert.equal(f.files.size, 35);
});

test('a later shutter invalidates pending export work without deleting the new set', async () => {
  const f = fixture();
  const older = f.store.replace(f.frames, () => false);
  const newer = f.store.replace(f.frames.slice(-1), () => false);
  assert.equal(await older, null);
  const latest = await newer;
  assert.ok(latest);
  assert.equal(f.files.get(latest.directoryUri + latest.names[0]), 'original bytes 34');
  assert.equal(f.copied.length, 1);
});
