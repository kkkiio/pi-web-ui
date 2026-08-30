/**
 * pi-web-ui hub server (ADR 0012).
 *
 * Standalone service started by the user. Serves the built frontend over
 * HTTP, accepts extension connections on /ws/extension, accepts browser
 * connections on /ws, and routes between them via HubRegistry.
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { WebSocketServer } from "ws";
import type { ExtensionMessage, WsRequest } from "../protocol/index.js";
import { listRecentSessions } from "./history.js";
import { HubRegistry } from "./registry.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const HEARTBEAT_INTERVAL_MS = 20000;

type AliveWebSocket = import("ws").WebSocket & { isAlive?: boolean };

export type HubServerOptions = {
  host: string;
  port: number;
  staticDir: string;
};

export function startHubServer(options: HubServerOptions): Promise<{ url: string; extensionUrl: string }> {
  const staticDir = path.resolve(options.staticDir);
  const registry = new HubRegistry({ listHistory: listRecentSessions });

  const server = http.createServer((req, res) => serveStaticFile(staticDir, req, res));
  const agentWss = new WebSocketServer({ noServer: true });
  const browserWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const pathname = (request.url || "").split("?")[0];
    const wss = pathname === "/ws/extension" ? agentWss : pathname === "/ws" ? browserWss : null;
    if (!wss) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  agentWss.on("connection", (ws) => {
    markAlive(ws);
    ws.on("message", (data) => {
      try {
        registry.handleAgentMessage(ws, JSON.parse(data.toString()) as ExtensionMessage);
      } catch {
        // Malformed agent message; ignore. Agents are local and trusted-ish.
      }
    });
    ws.on("close", () => registry.removeAgent(ws));
    ws.on("error", () => registry.removeAgent(ws));
  });

  browserWss.on("connection", (ws) => {
    markAlive(ws);
    const browser = registry.addBrowser(ws);
    ws.on("message", (data) => {
      try {
        const request = JSON.parse(data.toString()) as Partial<WsRequest>;
        if (request.type !== "req" || typeof request.id !== "string" || typeof request.method !== "string") {
          sendRaw(ws, { type: "error", code: "bad_request", message: "Invalid client request" });
          return;
        }
        registry.handleBrowserRequest(browser, request as WsRequest);
      } catch {
        sendRaw(ws, { type: "error", code: "invalid_json", message: "Invalid client message" });
      }
    });
    ws.on("close", () => registry.removeBrowser(ws));
    ws.on("error", () => registry.removeBrowser(ws));
  });

  const heartbeat = setInterval(() => {
    for (const wss of [agentWss, browserWss]) {
      for (const client of wss.clients) {
        const alive = client as AliveWebSocket;
        if (alive.isAlive === false) {
          client.terminate();
          continue;
        }
        alive.isAlive = false;
        try {
          client.ping();
        } catch {}
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      resolve({
        url: `http://${options.host}:${port}`,
        extensionUrl: `ws://${options.host}:${port}/ws/extension`,
      });
    });
  });
}

function markAlive(ws: AliveWebSocket) {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
}

function sendRaw(ws: import("ws").WebSocket, data: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function serveStaticFile(staticDir: string, req: http.IncomingMessage, res: http.ServerResponse) {
  let urlPath = (req.url || "/").split("?")[0];
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(staticDir, urlPath);
  if (!filePath.startsWith(staticDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback: unknown non-asset paths serve index.html.
      if (!path.extname(urlPath)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        fs.createReadStream(path.join(staticDir, "index.html")).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}
