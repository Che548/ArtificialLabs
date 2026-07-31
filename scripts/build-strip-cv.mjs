import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(root, "modules", "strip-cv", "native");
const buildDir = join(root, "web-build", "stripcv-native");

mkdirSync(buildDir, { recursive: true });

const opencvCandidates = [
  process.env.OpenCV_DIR,
  process.env.OPENCV_DIR,
  "/opt/homebrew/lib/cmake/opencv5",
  "/opt/homebrew/opt/opencv/lib/cmake/opencv5",
  "/usr/local/lib/cmake/opencv4",
].filter((value) => value && existsSync(value));

const configureArgs = [
  "-S",
  sourceDir,
  "-B",
  buildDir,
  "-DCMAKE_BUILD_TYPE=Release",
];
if (opencvCandidates[0]) {
  configureArgs.push(`-DOpenCV_DIR=${opencvCandidates[0]}`);
}
if (process.env.CMAKE_PREFIX_PATH) {
  configureArgs.push(`-DCMAKE_PREFIX_PATH=${process.env.CMAKE_PREFIX_PATH}`);
}

execFileSync("cmake", configureArgs, { cwd: root, stdio: "inherit" });
execFileSync(
  "cmake",
  [
    "--build",
    buildDir,
    "--target",
    "stripcv_cli",
    "--config",
    "Release",
    "-j2",
  ],
  { cwd: root, stdio: "inherit" },
);

console.log(`StripCV web helper built in ${buildDir}`);
