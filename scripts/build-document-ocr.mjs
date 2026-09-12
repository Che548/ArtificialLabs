import { execFileSync } from 'node:child_process';
import { cpSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = process.argv[2];
const androidAbi = target?.startsWith('android-')
  ? target.slice('android-'.length)
  : undefined;
if (
  !['host', 'ios', 'ios-simulator'].includes(target) &&
  !['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'].includes(androidAbi)
) {
  throw new Error('Select host, ios, ios-simulator, or android-<ABI>.');
}
const vendor = join(root, 'modules/document-ocr/vendor');
const build = join(root, 'output/builds/document-ocr', target);
const prefix = join(root, 'modules/document-ocr/prebuilt', target);
mkdirSync(build, { recursive: true });
const ndk =
  process.env.ANDROID_NDK_HOME ??
  join(
    process.env.ANDROID_HOME ?? join(process.env.HOME, 'Library/Android/sdk'),
    'ndk/27.1.12297006',
  );
const platform = androidAbi
  ? [
      `-DCMAKE_TOOLCHAIN_FILE=${ndk}/build/cmake/android.toolchain.cmake`,
      `-DANDROID_ABI=${androidAbi}`,
      '-DANDROID_PLATFORM=24',
      '-DANDROID_STL=c++_shared',
      `-DCMAKE_MODULE_PATH=${join(root, 'modules/document-ocr/cmake')}`,
    ]
  : target === 'host'
    ? []
    : [
        '-DCMAKE_SYSTEM_NAME=iOS',
        '-DCMAKE_SYSTEM_PROCESSOR=arm64',
        `-DCMAKE_OSX_SYSROOT=${target === 'ios' ? 'iphoneos' : 'iphonesimulator'}`,
        '-DCMAKE_OSX_ARCHITECTURES=arm64',
        '-DCMAKE_OSX_DEPLOYMENT_TARGET=15.1',
        '-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY',
      ];
const common = [
  '-DCMAKE_BUILD_TYPE=Release',
  '-DCMAKE_POLICY_VERSION_MINIMUM=3.5',
  '-DBUILD_SHARED_LIBS=OFF',
  '-DCMAKE_POSITION_INDEPENDENT_CODE=ON',
  `-DCMAKE_INSTALL_PREFIX=${prefix}`,
  ...platform,
];
function run(args) {
  execFileSync('cmake', args, { cwd: root, stdio: 'inherit' });
}
const fresh = process.env.OCR_FRESH_BUILD === '1' ? ['--fresh'] : [];
const lept = join(build, 'leptonica');
run([
  ...fresh,
  '-S',
  join(vendor, 'leptonica-1.85.0'),
  '-B',
  lept,
  ...common,
  ...['ZLIB', 'PNG', 'GIF', 'JPEG', 'TIFF', 'WEBP', 'OPENJPEG'].map(
    (codec) => `-DENABLE_${codec}=OFF`,
  ),
  '-DBUILD_PROG=OFF',
]);
run(['--build', lept, '--parallel', '2']);
run(['--install', lept]);
const tess = join(build, 'tesseract');
run([
  ...fresh,
  '-S',
  join(vendor, 'tesseract-5.5.0'),
  '-B',
  tess,
  ...common,
  `-DCMAKE_PREFIX_PATH=${prefix}`,
  `-DLeptonica_DIR=${join(prefix, 'lib/cmake/leptonica')}`,
  '-DBUILD_TRAINING_TOOLS=OFF',
  '-DBUILD_TESTS=OFF',
  '-DGRAPHICS_DISABLED=ON',
  '-DDISABLED_LEGACY_ENGINE=ON',
  '-DOPENMP_BUILD=OFF',
  // Our Leptonica build explicitly disables TIFF; a cross-compiled probe cannot run on the host.
  '-DLEPT_TIFF_RESULT=1',
  '-DDISABLE_CURL=ON',
  '-DDISABLE_ARCHIVE=ON',
  '-DDISABLE_TIFF=ON',
  '-DINSTALL_CONFIGS=OFF',
]);
run(['--build', tess, '--target', 'libtesseract', '--parallel', '2']);
// Copy this explicit target only; upstream install also expects CLI executables.
copyFileSync(join(tess, 'libtesseract.a'), join(prefix, 'lib/libtesseract.a'));
cpSync(
  join(vendor, 'tesseract-5.5.0/include/tesseract'),
  join(prefix, 'include/tesseract'),
  { recursive: true },
);
copyFileSync(
  join(tess, 'include/tesseract/version.h'),
  join(prefix, 'include/tesseract/version.h'),
);
console.log(
  `OCR ${target} static libraries built in ${build}. This is not a native app E2E pass.`,
);
