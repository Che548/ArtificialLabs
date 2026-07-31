import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const distDir = join(root, "dist");
const buildDir = join(root, "web-build", "stripcv-native");
const port = Number(process.env.PORT ?? 8080);
const bodyLimit = 32 * 1024 * 1024;

const cliCandidates = [
  join(buildDir, "stripcv_cli"),
  join(buildDir, "Release", "stripcv_cli"),
  join(buildDir, "stripcv_cli.exe"),
  join(buildDir, "Release", "stripcv_cli.exe"),
];
const cliPath = cliCandidates.find((candidate) => existsSync(candidate));

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".otf": "font/otf",
};

function writeJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > bodyLimit) {
        reject(new Error("StripCV request is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function runStripCv(payload) {
  return new Promise((resolve, reject) => {
    if (!cliPath) {
      reject(
        new Error(
          "StripCV web helper is not built. Run `npm run build:strip-cv` before starting the web server.",
        ),
      );
      return;
    }

    const child = spawn(cliPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || `StripCV helper exited with ${code}.`),
        );
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("StripCV helper returned invalid JSON."));
      }
    });
    child.stdin.end(payload);
  });
}

function serveStatic(request, response) {
  if (!existsSync(distDir)) {
    response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Web export is missing. Run `npm run build:web` first.\n");
    return;
  }

  const requestPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
  const relativePath =
    requestPath === "/" ? "index.html" : requestPath.slice(1);
  const candidate = normalize(join(distDir, relativePath));
  const insideDist =
    candidate === distDir || candidate.startsWith(`${distDir}${sep}`);
  const filePath =
    insideDist && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(distDir, "index.html");

  response.writeHead(200, {
    "Content-Type":
      contentTypes[extname(filePath).toLowerCase()] ??
      "application/octet-stream",
    "Cache-Control": filePath.endsWith("index.html")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    response.end();
    return;
  }

  if (
    request.method === "POST" &&
    request.url?.split("?")[0] === "/api/strip-cv"
  ) {
    try {
      const payload = await readRequestBody(request);
      const result = await runStripCv(payload);
      writeJson(response, 200, result);
    } catch (error) {
      writeJson(response, 422, {
        error:
          error instanceof Error ? error.message : "StripCV request failed.",
      });
    }
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    serveStatic(request, response);
    return;
  }

  writeJson(response, 405, { error: "Method not allowed." });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Web app with native StripCV API: http://localhost:${port}`);
  console.log(`LAN: http://${process.env.HOST_IP ?? "<host-ip>"}:${port}`);
  if (!cliPath) {
    console.warn("StripCV helper missing; run `npm run build:strip-cv`.");
  }
});
