import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../modules/strip-cv/models/reader-20260914');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const names = ['auxiliary', 'coverage', 'detector', 'local_bands', 'points', 'presence'];
if (JSON.stringify(Object.keys(manifest.models).sort()) !== JSON.stringify(names)) throw new Error('Incomplete reader model set');
for (const name of names) {
  const model = manifest.models[name];
  if (model.path !== `${name}.onnx`) throw new Error('Unexpected model path');
  const bytes = readFileSync(resolve(root, model.path));
  if (createHash('sha256').update(bytes).digest('hex') !== model.sha256) throw new Error(`Model checksum failed: ${name}`);
}
console.log('All six app model checksums verified. Device validation is a separate check.');
