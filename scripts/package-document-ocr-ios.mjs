import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const prebuilt = join(root, 'modules/document-ocr/prebuilt');
mkdirSync(prebuilt, { recursive: true });
for (const target of ['ios', 'ios-simulator']) {
  execFileSync(
    process.execPath,
    [join(root, 'scripts/build-document-ocr.mjs'), target],
    { stdio: 'inherit' },
  );
  const lib = join(prebuilt, target, 'lib');
  execFileSync(
    'xcrun',
    [
      'libtool',
      '-static',
      '-o',
      join(lib, 'libDocumentOcrDependencies.a'),
      join(lib, 'libtesseract.a'),
      join(lib, 'libleptonica.a'),
    ],
    { stdio: 'inherit' },
  );
}
const staging = mkdtempSync(join(prebuilt, 'packaging-'));
const output = join(staging, 'DocumentOcrDependencies.xcframework');
execFileSync(
  'xcodebuild',
  [
    '-create-xcframework',
    ...['ios', 'ios-simulator'].flatMap((target) => [
      '-library',
      join(prebuilt, target, 'lib/libDocumentOcrDependencies.a'),
      '-headers',
      join(prebuilt, target, 'include'),
    ]),
    '-output',
    output,
  ],
  { stdio: 'inherit' },
);
// Exact generated build product only. Dependency sources and user files are untouched.
const destination = join(prebuilt, 'DocumentOcrDependencies.xcframework');
rmSync(destination, { recursive: true, force: true });
renameSync(output, destination);
rmSync(staging, { recursive: true });
