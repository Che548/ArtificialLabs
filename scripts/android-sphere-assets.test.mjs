import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { getAssetFiles } = require(path.join(path.dirname(require.resolve('metro')), 'Assets.js'));
const root = fileURLToPath(new URL('../', import.meta.url));
test('Android uses smaller sphere PNGs; iOS and web keep original artwork', async () => {
  const source = await readFile(path.join(root, 'components/PregnancySphere.tsx'), 'utf8');
  const names = [...new Set([...source.matchAll(/transparent-enlarged-4x\/(\d+)\.png/g)].map(match => match[1]))];
  assert.equal(names.length, 30);
  let originalBytes = 0;
  let androidBytes = 0;
  for (const name of names) {
    const original = path.join(root, `transparent-enlarged-4x/${name}.png`);
    const android = original.replace(/\.png$/, '.android.png');
    assert.deepEqual(await getAssetFiles(original, 'android'), [android]);
    for (const platform of ['ios', 'web', null]) {
      assert.deepEqual(await getAssetFiles(original, platform), [original]);
    }
    const a = await readFile(original);
    const b = await readFile(android);
    assert.equal(b.subarray(1, 4).toString(), 'PNG');
    assert.equal(b.readUInt32BE(16), Math.round(a.readUInt32BE(16) / 3), `${name}: width`);
    assert.equal(b.readUInt32BE(20), Math.round(a.readUInt32BE(20) / 3), `${name}: height`);
    assert.equal(b[25], 6, `${name}: full RGBA, not a lossy palette`);
    originalBytes += (await stat(original)).size;
    androidBytes += (await stat(android)).size;
  }
  assert.ok(androidBytes < originalBytes * 0.4, 'Android artwork size budget');
});
