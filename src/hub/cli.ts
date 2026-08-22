#!/usr/bin/env node
/**
 * pi-web-ui hub CLI entry.
 *
 *   pi-web-ui [--port 3001] [--host 127.0.0.1]
 *
 * Environment: PI_WEB_UI_PORT, PI_WEB_UI_HOST, PI_WEB_UI_STATIC_DIR.
 */

import * as path from "node:path";
import { startHubServer } from "./server.js";

function parseArgs(argv: string[]): { port: number; host: string } {
  const args = { port: 3001, host: "127.0.0.1" };
  for (const arg of argv) {
    if (arg.startsWith("--port=")) args.port = parseInt(arg.slice("--port=".length), 10);
    else if (arg.startsWith("--host=")) args.host = arg.slice("--host=".length);
  }
  if (process.env.PI_WEB_UI_PORT) args.port = parseInt(process.env.PI_WEB_UI_PORT, 10);
  if (process.env.PI_WEB_UI_HOST) args.host = process.env.PI_WEB_UI_HOST;
  return args;
}

function findStaticDir(): string {
  if (process.env.PI_WEB_UI_STATIC_DIR) return process.env.PI_WEB_UI_STATIC_DIR;
  // Compiled: <pkg>/dist-hub/hub/cli.js → <pkg>/dist
  // Dev:      <repo>/src/hub/cli.ts    → <repo>/dist
  return path.resolve(__dirname, "../../dist");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { url, extensionUrl } = await startHubServer({
    host: args.host,
    port: args.port,
    staticDir: findStaticDir(),
  });
  console.log(`pi-web-ui hub: ${url}`);
  console.log(`extension endpoint: ${extensionUrl} (use /webui:connect or PI_WEB_UI_HUB=${extensionUrl})`);
}

main().catch((error) => {
  console.error(`pi-web-ui hub failed to start: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
