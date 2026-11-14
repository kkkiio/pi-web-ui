#!/usr/bin/env node
/**
 * Serve the local storyboard gallery with byte-range support, so video seeking
 * works in the browser.
 *
 *   npm run e2e:preview            # serves e2e/report-out on 127.0.0.1:8899
 *   node e2e/report/serve.mjs e2e/report-out 9000
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const root = path.resolve(repoRoot, process.argv[2] ?? "e2e/report-out");
const port = Number(process.argv[3] ?? 8899);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webm": "video/webm",
  ".zip": "application/zip",
};

createServer((request, response) => {
  const url = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = path.join(root, url === "/" ? "index.html" : url);
  if (!file.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }

  let stat;
  try {
    stat = statSync(file);
  } catch {
    response.writeHead(404).end("not found");
    return;
  }
  if (stat.isDirectory()) {
    response.writeHead(302, { location: `${url.replace(/\/$/, "")}/index.html` }).end();
    return;
  }

  const type = types[path.extname(file)] ?? "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
  if (range) {
    const start = range[1] === "" ? Math.max(0, stat.size - Number(range[2])) : Number(range[1]);
    const end = range[1] !== "" && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || end < start) {
      response.writeHead(416, { "content-range": `bytes */${stat.size}` }).end();
      return;
    }
    response.writeHead(206, {
      "content-type": type,
      "content-range": `bytes ${start}-${end}/${stat.size}`,
      "accept-ranges": "bytes",
      "content-length": end - start + 1,
    });
    createReadStream(file, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": stat.size });
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`[storyboard] serving ${path.relative(repoRoot, root) || "."} on http://127.0.0.1:${port}/`);
});
