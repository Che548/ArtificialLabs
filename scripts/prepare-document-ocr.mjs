import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rename,
  rm,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const moduleRoot = join(root, 'modules/document-ocr');
const lock = JSON.parse(
  await readFile(join(moduleRoot, 'dependencies.lock.json'), 'utf8'),
);
const cache = join(root, 'output/builds/document-ocr');
const vendor = join(moduleRoot, 'vendor');
const androidAssets = join(moduleRoot, 'prebuilt/assets/tessdata');
await mkdir(cache, { recursive: true });
await mkdir(vendor, { recursive: true });
await mkdir(join(vendor, 'tessdata'), { recursive: true });
await mkdir(androidAssets, { recursive: true });
for (const artifact of lock.artifacts) {
  const path = join(cache, artifact.name);
  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!bytes) {
    const response = await fetch(artifact.url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(`OCR dependency download failed: ${artifact.name}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
    throw new Error(`OCR dependency checksum mismatch: ${artifact.name}`);
  }
  await writeFile(`${path}.verified`, bytes, { mode: 0o600 });
  await rename(`${path}.verified`, path);
  if (artifact.directory) {
    if (!/^(tesseract|leptonica)-[0-9.]+$/.test(artifact.directory))
      throw new Error('Invalid OCR vendor directory');
    // Replace only the generated dependency tree, including any untracked extra source files.
    const staging = await mkdtemp(join(vendor, '.extract-'));
    execFileSync('tar', ['-xzf', path, '-C', staging], { stdio: 'inherit' });
    const destination = join(vendor, artifact.directory);
    await rm(destination, { recursive: true, force: true });
    await rename(join(staging, artifact.directory), destination);
    await rm(staging, { recursive: true });
  } else {
    await copyFile(path, join(vendor, 'tessdata', artifact.name));
    await copyFile(path, join(androidAssets, artifact.name));
  }
}
await copyFile(
  join(vendor, 'tesseract-5.5.0/LICENSE'),
  join(moduleRoot, 'prebuilt/assets/Tesseract-LICENSE.txt'),
);
await copyFile(
  join(vendor, 'leptonica-1.85.0/leptonica-license.txt'),
  join(moduleRoot, 'prebuilt/assets/Leptonica-LICENSE.txt'),
);
console.log(`Prepared verified OCR dependencies: ${lock.engineVersion}`);
