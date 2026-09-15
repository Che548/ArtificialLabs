// Offline asset generation only. Install the locked admin dependencies first.
// Metro selects *.android.png for Android; iOS/web retain the original PNGs.
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const sharp = createRequire(new URL('../admin/package.json', import.meta.url))('sharp');

const root = new URL('../', import.meta.url);
const component = await readFile(new URL('components/PregnancySphere.tsx', root), 'utf8');
const names = [...new Set([...component.matchAll(/transparent-enlarged-4x\/(\d+)\.png/g)].map(match => match[1]))];
if (names.length !== 30) throw new Error('Review the pregnancy artwork inventory before regenerating');
let before = 0;
let after = 0;
for (const name of names) {
  const source = fileURLToPath(new URL(`transparent-enlarged-4x/${name}.png`, root));
  const target = source.replace(/\.png$/, '.android.png');
  const { width, height, hasAlpha } = await sharp(source).metadata();
  if (!width || !height || width % 2 || height % 2 || !hasAlpha) throw new Error(`Unexpected source geometry: ${name}`);
  // The SVG's logical canvas/bounds stay unchanged (rounding < 1 pixel).
  // Even at maximum UI size the visible sphere retains >3x pixel density.
  await sharp(source).resize(Math.round(width / 3), Math.round(height / 3), { kernel: 'lanczos3', fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toFile(target);
  before += (await stat(source)).size;
  after += (await stat(target)).size;
}
console.log(`Android sphere assets: ${names.length}; ${(before / 1048576).toFixed(1)} → ${(after / 1048576).toFixed(1)} MiB. Originals unchanged.`);
