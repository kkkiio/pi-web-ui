/**
 * pi-web-ui Mirror Server Extension
 *
 * Starts a WebSocket + HTTP server inside the running Pi process,
 * allowing a browser to connect and mirror the TUI session in real-time.
 *
 * - Forwards all Pi events to connected browser clients
 * - Accepts commands from the browser and executes them via the extension API
 * - Serves static files for the pi-web-ui frontend
 * - Sends full state snapshot on client connect (messages, model, etc.)
 */

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WebSocket, WebSocketServer } from "ws";

type SettingsData = {
  port?: string | number;
  host?: string;
  disabled?: boolean;
};

type BrowserImage = {
  data?: string;
  mimeType?: string;
};

type WsRequest = {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type WsResponse = {
  type: "res";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type TextContentBlock = {
  type: "text";
  text: string;
};

type ImageContentBlock = {
  type: "image";
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
};

type SessionEntry = {
  type?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  cwd?: string;
  name?: string;
  message?: {
    role?: string;
    content?: unknown;
  };
};

type SessionTreeNode = {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
  labelTimestamp?: string;
};

type FileListItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
  mtime: number;
};

type ModelCandidate = {
  provider?: string;
  id?: string;
};

type ExtensionAPIWithEvents = ExtensionAPI & {
  events?: {
    on?: (eventType: string, listener: (payload: unknown) => void) => void;
    emit?: (eventType: string, payload: unknown) => void;
  };
};

type AliveWebSocket = WebSocket & {
  isAlive?: boolean;
};

type WritableSocket = Pick<WebSocket, "readyState" | "send">;

type NodeError = Error & {
  code?: string;
};

const AGENT_DIR = path.resolve(
  (process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME || "~", ".pi/agent")).replace(
    /^~(?=$|\/)/,
    process.env.HOME || "~",
  ),
);

// Load pi-web-ui settings from the Pi agent directory (falls back to env vars)
function loadSettings(): {
  port: number;
  host: string;
  autoStart: boolean;
} {
  let settings: SettingsData = {};
  try {
    const settingsPath = path.join(AGENT_DIR, "settings.json");
    settings =
      (
        JSON.parse(fs.readFileSync(settingsPath, "utf8")) as {
          "pi-web-ui"?: SettingsData;
        }
      )["pi-web-ui"] || {};
  } catch {}
  return {
    port: parseInt(String(process.env.PI_WEB_UI_PORT || settings.port || "3001"), 10),
    host: process.env.PI_WEB_UI_HOST || settings.host || "127.0.0.1",
    autoStart: !(
      process.env.PI_WEB_UI_DISABLED === "1" ||
      process.env.PI_WEB_UI_DISABLED === "true" ||
      settings.disabled === true
    ),
  };
}

const SETTINGS = loadSettings();
const PORT = SETTINGS.port;
const HOST = SETTINGS.host;
const AUTO_START = SETTINGS.autoStart;
// @ts-expect-error — __dirname is provided by jiti at runtime
const STATIC_DIR = process.env.PI_WEB_UI_STATIC_DIR || findStaticDir();

function findStaticDir(): string {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const addCandidate = (dir: string) => {
    const normalized = path.resolve(dir);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  // 1) Bundled React build output, then legacy public fallback.
  addCandidate(path.resolve(__dirname, "dist"));
  addCandidate(path.resolve(__dirname, "../dist"));
  addCandidate(path.resolve(__dirname, "public"));
  addCandidate(path.resolve(__dirname, "../public"));

  // 2) Installed package path (for npm-installed extension execution)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkgPath = require.resolve("@kkkiio/pi-web-ui/package.json");
    const pkgDir = path.dirname(pkgPath);
    addCandidate(path.join(pkgDir, "dist"));
    addCandidate(path.join(pkgDir, "public"));
  } catch {}

  // 3) Development fallback from current working directory
  addCandidate(path.resolve(process.cwd(), "dist"));
  addCandidate(path.resolve(process.cwd(), "public"));
  addCandidate(path.resolve(process.cwd(), "node_modules/@kkkiio/pi-web-ui/dist"));
  addCandidate(path.resolve(process.cwd(), "node_modules/@kkkiio/pi-web-ui/public"));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
  }

  return path.resolve(process.cwd(), "dist");
}

// MIME types for static file serving
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

export default function (pi: ExtensionAPI) {
  let server: http.Server | null = null;
  let wss: WebSocketServer | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  const clients = new Set<WebSocket>();

  // Store latest context reference for use in command handlers
  let latestCtx: ExtensionContext | null = null;
  let archExtensionPresent = false;
  let advancedFeaturesEnabled = false;
  let latestExecuteCtx: ExtensionCommandContext | null = null;

  // ═══════════════════════════════════════
  // Helper: send to one client
  // ═══════════════════════════════════════
  function sendTo(ws: WritableSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // ═══════════════════════════════════════
  // Helper: broadcast to all clients
  // ═══════════════════════════════════════
  function broadcast(data: unknown) {
    const json = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  let mirrorUrl = "";
  let mirrorStatusBase = "";

  function updateMirrorStatus() {
    if (!mirrorStatusBase) {
      latestCtx?.ui.setStatus("webui", "");
      return;
    }
    const clientCount = clients.size;
    const clientText = clientCount > 0 ? ` • ${clientCount} web ${clientCount === 1 ? "client" : "clients"}` : "";
    latestCtx?.ui.setStatus("webui", `${mirrorStatusBase}${clientText}`);
  }

  // ═══════════════════════════════════════
  // Helper: stop the server
  // ═══════════════════════════════════════
  function stopServer() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (wss) {
      for (const client of clients) {
        client.close();
      }
      clients.clear();
      try {
        wss.close();
      } catch {}
      wss = null;
    }
    if (server) {
      try {
        server.close();
      } catch {}
      server = null;
    }
    mirrorUrl = "";
    mirrorStatusBase = "";
  }

  // ═══════════════════════════════════════
  // /webui-stop and /webui-start commands
  // ═══════════════════════════════════════
  pi.registerCommand("webui-stop", {
    description: "Stop the pi-web-ui server",
    handler: async (_args, ctx) => {
      if (!server) {
        ctx.ui.notify("pi-web-ui is not running", "warning");
        return;
      }
      stopServer();
      ctx.ui.setStatus("webui", "");
      ctx.ui.notify("pi-web-ui server stopped", "info");
    },
  });

  pi.registerCommand("webui-start", {
    description: "Start the pi-web-ui server",
    handler: async (_args, ctx) => {
      if (server) {
        ctx.ui.notify(`pi-web-ui is already running at ${mirrorUrl}`, "warning");
        return;
      }
      latestCtx = ctx;
      startServer();
      ctx.ui.notify("pi-web-ui server starting...", "info");
    },
  });

  // ═══════════════════════════════════════
  // /webui command — open Pi Web UI in browser
  // ═══════════════════════════════════════
  pi.registerCommand("webui", {
    description: "Open Pi Web UI in browser",
    handler: async (_args, ctx) => {
      if (!mirrorUrl) {
        ctx.ui.notify("pi-web-ui server not running yet", "warning");
        return;
      }
      const { exec } = require("node:child_process");
      exec(`open "${mirrorUrl}"`);
      ctx.ui.notify(`Opened ${mirrorUrl}`, "info");
      advancedFeaturesEnabled = true;
      // Capture full ExtensionCommandContext for session-control methods (navigateTree, fork, etc.).
      // Cleared on session_start/session_shutdown; user must re-run /webui after session replacement.
      latestExecuteCtx = ctx;
      broadcast({ type: "event", event: "webui_state", payload: { advancedFeatures: true } });
    },
  });

  // ═══════════════════════════════════════
  // Event forwarding — subscribe to all Pi events
  // ═══════════════════════════════════════
  const eventTypes = [
    "agent_start",
    "agent_end",
    "turn_start",
    "turn_end",
    "message_start",
    "message_update",
    "message_end",
    "tool_execution_start",
    "tool_execution_update",
    "tool_execution_end",
    "auto_compaction_start",
    "auto_compaction_end",
    "auto_retry_start",
    "auto_retry_end",
    "model_select",
  ] as const;

  for (const eventType of eventTypes) {
    pi.on(eventType as Parameters<ExtensionAPI["on"]>[0], async (event: unknown, ctx: ExtensionContext) => {
      latestCtx = ctx;
      const eventPayload = typeof event === "object" && event !== null ? (event as Record<string, unknown>) : {};

      // Forward event to all connected browser clients
      broadcast({
        type: "event",
        event: eventType,
        payload: eventPayload,
      });
    });
  }

  const subagentEventTypes = [
    "subagents:ready",
    "subagents:created",
    "subagents:started",
    "subagents:completed",
    "subagents:failed",
    "subagents:steered",
    "subagents:compacted",
    "subagents:scheduled",
    "subagents:scheduler_ready",
    "subagents:settings_loaded",
    "subagents:settings_changed",
  ] as const;

  for (const eventType of subagentEventTypes) {
    (pi as ExtensionAPIWithEvents).events?.on?.(eventType, (payload: unknown) => {
      broadcast({ type: "event", event: eventType, payload: { payload } });
    });
  }

  pi.on("session_tree", async (event: unknown, ctx: ExtensionContext) => {
    latestCtx = ctx;
    const payload = typeof event === "object" && event !== null ? (event as Record<string, unknown>) : {};
    broadcast({ type: "event", event: "session_tree", payload });
  });

  // Forward arch-mode state changes from other extensions to browser clients
  (pi as ExtensionAPIWithEvents).events?.on?.("arch:state-changed", (payload: unknown) => {
    broadcast({
      type: "event",
      event: "arch:state-changed",
      payload: typeof payload === "object" && payload !== null ? payload : {},
    });
  });

  // Listen for arch-mode extension presence announcement
  (pi as ExtensionAPIWithEvents).events?.on?.("arch:ready", () => {
    archExtensionPresent = true;
    broadcast({ type: "event", event: "webui_state", payload: { archAvailable: true } });
  });

  // Also capture context from session events
  // Auto-title: collect user messages and generate a title after a few turns
  let turnCount = 0;
  let titleSet = false;
  let userMessages: string[] = [];

  pi.on("session_start", async (_event, ctx) => {
    latestCtx = ctx;
    advancedFeaturesEnabled = false;
    latestExecuteCtx = null;
    broadcast({ type: "event", event: "webui_state", payload: { advancedFeatures: false } });
    turnCount = 0;
    titleSet = false;
    userMessages = [];
  });

  pi.on("turn_start", async (_event, _ctx) => {
    turnCount++;
  });

  // Capture user messages for title generation via message_start
  pi.on("message_start", async (event, _ctx) => {
    if (titleSet) return;
    const msg = event.message;
    if (!msg || msg.role !== "user") return;
    const content = msg.content;
    let text = "";
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      const tb = content.find(
        (b): b is TextContentBlock =>
          typeof b === "object" &&
          b !== null &&
          (b as { type?: unknown }).type === "text" &&
          typeof (b as { text?: unknown }).text === "string",
      );
      if (tb) text = tb.text;
    }
    if (text) userMessages.push(text.substring(0, 300));
  });

  pi.on("turn_end", async (_event, _ctx) => {
    if (titleSet || turnCount < 2) return;

    const sessionName = pi.getSessionName();
    if (sessionName && sessionName !== "New Session" && sessionName !== "Untitled") {
      titleSet = true;
      return;
    }

    // Generate title from collected messages
    const title = generateSessionTitle(userMessages);
    if (title) {
      pi.setSessionName(title);
      titleSet = true;
      // Broadcast to connected clients
      broadcast({
        type: "event",
        event: "session_name",
        payload: { name: title },
      });
    }
  });

  function generateSessionTitle(messages: string[]): string | null {
    if (messages.length === 0) return null;

    // Find first substantive message (skip greetings and memory instructions)
    const greetings = /^(hey|hello|hi|morning|good morning|howdy|yo|sup)[\s!.:,]*$/i;
    const memoryInstructions = /read (your |the )?(memory|seed|persona|working) files/i;

    let bestMessage = "";
    for (const msg of messages) {
      const cleaned = msg.trim();
      if (greetings.test(cleaned)) continue;
      if (memoryInstructions.test(cleaned)) continue;
      if (cleaned.length < 10) continue;
      bestMessage = cleaned;
      break;
    }

    if (!bestMessage) {
      // Fall back to first message with any content
      bestMessage = messages.find((m) => m.trim().length > 0) || "";
    }

    if (!bestMessage) return null;

    // Extract a clean title: first sentence or clause, max ~60 chars
    let title = bestMessage
      .replace(/^(ok |okay |so |actually |hey |please |can you |could you |i want(ed)? to |i wanna |let'?s )/i, "")
      .replace(/\n.*/s, "") // first line only
      .trim();

    // Take first sentence
    const sentenceEnd = title.search(/[.!?]\s/);
    if (sentenceEnd > 10 && sentenceEnd < 80) {
      title = title.substring(0, sentenceEnd);
    }

    // Truncate cleanly
    if (title.length > 60) {
      const spaceIdx = title.lastIndexOf(" ", 57);
      title = `${title.substring(0, spaceIdx > 20 ? spaceIdx : 57)}…`;
    }

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return title;
  }

  // ═══════════════════════════════════════
  // Build state snapshot for new connections
  // ═══════════════════════════════════════
  async function buildStateSnapshot(ctx: ExtensionContext) {
    // Get session entries for message history
    const entries = ctx.sessionManager.getBranch();
    const tree = ctx.sessionManager.getTree() as SessionTreeNode[];
    const leafId = ctx.sessionManager.getLeafId();

    // Get model info
    const model = ctx.model;
    const thinkingLevel = pi.getThinkingLevel();
    const sessionName = pi.getSessionName();
    const sessionFile = ctx.sessionManager.getSessionFile();

    // Context usage
    const contextUsage = ctx.getContextUsage();

    return {
      type: "event",
      event: "state_sync",
      payload: {
        entries,
        tree,
        leafId,
        model,
        thinkingLevel,
        sessionName,
        sessionFile,
        isStreaming: !ctx.isIdle(),
        contextUsage,
      },
    };
  }

  // ═══════════════════════════════════════
  // Handle commands from browser clients
  // ═══════════════════════════════════════
  async function handleRequest(ws: WritableSocket, request: WsRequest) {
    const ctx = latestCtx;
    const params = request.params ?? {};

    const success = (result?: unknown): WsResponse => {
      const response: WsResponse = { type: "res", id: request.id, ok: true };
      if (result !== undefined) response.result = result;
      return response;
    };

    const error = (message: string): WsResponse => ({
      type: "res",
      id: request.id,
      ok: false,
      error: message,
    });

    try {
      switch (request.method) {
        case "prompt": {
          const message = typeof params.message === "string" ? params.message : "";
          if (ctx && !ctx.isIdle()) {
            const behavior = typeof params.streamingBehavior === "string" ? params.streamingBehavior : "steer";
            pi.sendUserMessage(message, { deliverAs: behavior === "followUp" ? "followUp" : "steer" });
          } else {
            const images = Array.isArray(params.images) ? (params.images as BrowserImage[]) : [];
            if (images.length) {
              const validMimes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
              const content: Array<TextContentBlock | ImageContentBlock> = [
                { type: "text", text: message || "(see attached image)" },
              ];
              for (const img of images) {
                if (!img.data || typeof img.data !== "string") continue;
                const data = img.data.includes(",") ? img.data.split(",")[1] : img.data;
                const mimeType = (validMimes.includes(img.mimeType) ? img.mimeType : "image/png") as
                  | "image/png"
                  | "image/jpeg"
                  | "image/gif"
                  | "image/webp";
                content.push({ type: "image", data, mimeType });
              }
              pi.sendUserMessage(content.some((block) => block.type === "image") ? content : message);
            } else {
              pi.sendUserMessage(message);
            }
          }
          sendTo(ws, success());
          break;
        }

        case "steer": {
          pi.sendUserMessage(typeof params.message === "string" ? params.message : "", { deliverAs: "steer" });
          sendTo(ws, success());
          break;
        }

        case "follow_up": {
          pi.sendUserMessage(typeof params.message === "string" ? params.message : "", { deliverAs: "followUp" });
          sendTo(ws, success());
          break;
        }

        case "abort": {
          ctx?.abort();
          sendTo(ws, success());
          break;
        }

        case "enter_arch_mode": {
          (pi as ExtensionAPIWithEvents).events?.emit?.("cmd:arch:enter", {});
          sendTo(ws, success());
          break;
        }

        case "exit_arch_mode": {
          (pi as ExtensionAPIWithEvents).events?.emit?.("cmd:arch:exit", {});
          sendTo(ws, success());
          break;
        }

        case "get_state": {
          if (!ctx) {
            sendTo(ws, error("No context available"));
            break;
          }
          sendTo(
            ws,
            success({
              model: ctx.model,
              thinkingLevel: pi.getThinkingLevel(),
              isStreaming: !ctx.isIdle(),
              sessionFile: ctx.sessionManager.getSessionFile(),
              sessionName: pi.getSessionName(),
              autoCompactionEnabled: true,
            }),
          );
          break;
        }

        case "get_messages": {
          if (!ctx) {
            sendTo(ws, error("No context available"));
            break;
          }
          sendTo(ws, success({ entries: ctx.sessionManager.getEntries() }));
          break;
        }

        case "get_available_models": {
          if (!ctx) {
            sendTo(ws, error("No context available"));
            break;
          }
          sendTo(ws, success({ models: await ctx.modelRegistry.getAvailable() }));
          break;
        }

        case "set_model": {
          if (!ctx) {
            sendTo(ws, error("No context available"));
            break;
          }
          const models = await ctx.modelRegistry.getAvailable();
          const model = (models as ModelCandidate[]).find(
            (candidate) => candidate.provider === params.provider && candidate.id === params.modelId,
          );
          if (!model) {
            sendTo(ws, error(`Model not found: ${params.provider}/${params.modelId}`));
            break;
          }
          if (!(await pi.setModel(model))) {
            sendTo(ws, error("No API key for this model"));
            break;
          }
          sendTo(ws, success(model));
          break;
        }

        case "cycle_model": {
          if (!ctx) {
            sendTo(ws, success(null));
            break;
          }
          const availModels = await ctx.modelRegistry.getAvailable();
          const currentModel = ctx.model;
          if (!currentModel || availModels.length <= 1) {
            sendTo(ws, success(null));
            break;
          }
          const idx = (availModels as ModelCandidate[]).findIndex(
            (candidate) => candidate.provider === currentModel.provider && candidate.id === currentModel.id,
          );
          const nextModel = availModels[(idx + 1) % availModels.length];
          await pi.setModel(nextModel);
          sendTo(ws, success({ model: nextModel, thinkingLevel: pi.getThinkingLevel() }));
          break;
        }

        case "cycle_thinking_level": {
          const levels = ["off", "minimal", "low", "medium", "high"];
          const current = pi.getThinkingLevel();
          const next = levels[(levels.indexOf(current) + 1) % levels.length] as
            | "off"
            | "minimal"
            | "low"
            | "medium"
            | "high";
          pi.setThinkingLevel(next);
          sendTo(ws, success({ level: next }));
          break;
        }

        case "set_thinking_level": {
          pi.setThinkingLevel(params.level as "off" | "minimal" | "low" | "medium" | "high" | undefined);
          sendTo(ws, success());
          break;
        }

        case "get_session_stats": {
          if (!ctx) {
            sendTo(ws, error("No context available"));
            break;
          }
          const usage = ctx.getContextUsage();
          const entries = ctx.sessionManager.getEntries();
          let userMessages = 0;
          let assistantMessages = 0;
          let toolCalls = 0;
          for (const entry of entries) {
            if (entry.type !== "message") continue;
            if (entry.message?.role === "user") userMessages++;
            else if (entry.message?.role === "assistant") assistantMessages++;
            else if (entry.message?.role === "toolResult") toolCalls++;
          }
          sendTo(
            ws,
            success({
              sessionFile: ctx.sessionManager.getSessionFile(),
              userMessages,
              assistantMessages,
              toolCalls,
              totalMessages: entries.length,
              tokens: usage ? { input: usage.tokens, total: usage.tokens } : null,
            }),
          );
          break;
        }

        case "set_session_name": {
          const name = typeof params.name === "string" ? params.name.trim() : "";
          if (!name) {
            sendTo(ws, error("Name cannot be empty"));
            break;
          }
          pi.setSessionName(name);
          sendTo(ws, success());
          break;
        }

        case "set_auto_compaction": {
          sendTo(ws, success());
          break;
        }

        case "compact": {
          if (ctx) {
            broadcast({ type: "event", event: "auto_compaction_start", payload: {} });
            ctx.compact({
              customInstructions: typeof params.customInstructions === "string" ? params.customInstructions : undefined,
              onComplete: (result: { summary?: unknown }) => {
                broadcast({ type: "event", event: "auto_compaction_end", payload: { summary: result?.summary } });
              },
              onError: (err: Error) => {
                broadcast({
                  type: "event",
                  event: "auto_compaction_end",
                  payload: { summary: `Error: ${err.message}` },
                });
              },
            });
          }
          sendTo(ws, success());
          break;
        }

        case "export_html": {
          if (!ctx) {
            sendTo(ws, error("No context available"));
            break;
          }
          try {
            const sessionFile = ctx.sessionManager.getSessionFile();
            if (!sessionFile) throw new Error("No session file to export");
            const { execSync } = require("node:child_process");
            const outputPath = typeof params.outputPath === "string" ? params.outputPath : "";
            const args = outputPath ? `"${sessionFile}" "${outputPath}"` : `"${sessionFile}"`;
            const output = execSync(`pi --export ${args}`, { cwd: process.cwd(), timeout: 30000, encoding: "utf-8" });
            sendTo(ws, success({ path: output.trim().split("\n").pop() || sessionFile.replace(".jsonl", ".html") }));
          } catch (e: unknown) {
            sendTo(ws, error(e instanceof Error ? e.message : String(e)));
          }
          break;
        }

        case "sync_request": {
          const snapshot = ctx
            ? await buildStateSnapshot(ctx)
            : { type: "event", event: "state_sync", payload: { entries: [], tree: [], leafId: null, model: null } };
          sendTo(ws, success(snapshot.payload));
          break;
        }

        case "health": {
          sendTo(ws, success({ status: "ok", mode: "webui", mirrorUrl }));
          break;
        }

        case "get_files": {
          const explicitPath = typeof params.path === "string" ? params.path : "";
          let dirPath = explicitPath || process.cwd();
          if (!explicitPath && latestCtx) {
            try {
              const entries = latestCtx.sessionManager.getEntries() as SessionEntry[];
              const sessionEntry = entries.find((entry) => entry.type === "session");
              if (typeof sessionEntry?.cwd === "string") dirPath = sessionEntry.cwd;
            } catch {}
          }
          sendTo(ws, success(getFileList(dirPath)));
          break;
        }

        case "open_file": {
          const filePath = typeof params.filePath === "string" ? params.filePath : "";
          if (!filePath) {
            sendTo(ws, error("filePath required"));
            break;
          }
          const { execFile } = await import("node:child_process");
          execFile("open", [filePath], (err) => {
            if (err) latestCtx?.ui.notify(`Failed to open file: ${err.message}`, "warning");
          });
          sendTo(ws, success({ ok: true }));
          break;
        }

        case "get_auth": {
          sendTo(ws, success({ configured: false, enabled: false }));
          break;
        }

        case "set_auth": {
          sendTo(
            ws,
            error(
              "Authentication is not supported. Use tailscale serve or a reverse proxy with TLS for remote access.",
            ),
          );
          break;
        }

        case "navigate_tree": {
          if (!advancedFeaturesEnabled || !latestExecuteCtx) {
            sendTo(ws, error("Run /webui first to enable editing"));
            break;
          }
          if (!latestCtx?.isIdle()) {
            sendTo(ws, error("Agent is busy"));
            break;
          }
          const entryId = typeof params.entryId === "string" ? params.entryId : "";
          const entry = latestCtx.sessionManager.getEntry(entryId);
          if (!entry) {
            sendTo(ws, error("Entry not found"));
            break;
          }
          if (!latestCtx.model) {
            sendTo(ws, error("No model selected"));
            break;
          }
          const result = await latestExecuteCtx.navigateTree(entryId);
          if (result.cancelled) {
            sendTo(ws, success({ cancelled: true }));
            break;
          }
          sendTo(ws, success({ editorText: result.editorText, cancelled: false }));
          break;
        }

        case "extension_ui_response": {
          sendTo(ws, success());
          break;
        }

        default:
          sendTo(ws, error(`Unknown method: ${request.method}`));
      }
    } catch (e: unknown) {
      sendTo(ws, error(e instanceof Error ? e.message : String(e)));
    }
  }

  // ═══════════════════════════════════════
  // Static file server
  // ═══════════════════════════════════════
  function serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse) {
    let urlPath = req.url || "/";

    // Strip query params
    urlPath = urlPath.split("?")[0];

    // Default to index.html
    if (urlPath === "/") urlPath = "/index.html";

    const filePath = path.join(STATIC_DIR, urlPath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(STATIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Check file exists
    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      res.writeHead(200, { "Content-Type": contentType });
      fs.createReadStream(filePath).pipe(res);
    });
  }

  // ═══════════════════════════════════════
  // File browser
  // ═══════════════════════════════════════

  const IGNORED_NAMES = new Set([
    "node_modules",
    ".git",
    "__pycache__",
    ".DS_Store",
    ".Trash",
    ".next",
    ".nuxt",
    "dist",
    "build",
    ".cache",
    ".turbo",
    "venv",
    ".venv",
    "env",
    ".env.local",
    ".pi",
    "coverage",
    ".nyc_output",
    ".parcel-cache",
  ]);

  function getFileList(dirPath: string) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      throw new Error("Not a directory");
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const items: FileListItem[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (IGNORED_NAMES.has(entry.name)) continue;

      try {
        const fullPath = path.join(dirPath, entry.name);
        const stat = fs.statSync(fullPath);
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: entry.isDirectory() ? null : stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {
        /* skip inaccessible */
      }
    }

    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { path: dirPath, items };
  }

  // ═══════════════════════════════════════
  // Start server function (reusable)
  // ═══════════════════════════════════════
  function startServer() {
    if (server) return; // Already running

    server = http.createServer(serveStaticFile);
    wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
      if (request.url === "/ws") {
        const activeWss = wss;
        if (!activeWss) {
          socket.destroy();
          return;
        }
        activeWss.handleUpgrade(request, socket, head, (ws) => {
          activeWss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    wss.on("connection", (ws) => {
      clients.add(ws);
      updateMirrorStatus();
      const aliveWs = ws as AliveWebSocket;
      aliveWs.isAlive = true;

      ws.on("pong", () => {
        aliveWs.isAlive = true;
      });

      // Send initial web UI capability state.
      sendTo(ws, {
        type: "event",
        event: "webui_state",
        payload: {
          advancedFeatures: advancedFeaturesEnabled && !!latestExecuteCtx,
          archAvailable: archExtensionPresent,
        },
      });

      // Immediately send state snapshot
      if (latestCtx) {
        buildStateSnapshot(latestCtx).then((snapshot) => {
          sendTo(ws, snapshot);
        });
      }

      ws.on("message", (data) => {
        try {
          const request = JSON.parse(data.toString()) as Partial<WsRequest>;
          if (request.type !== "req" || typeof request.id !== "string" || typeof request.method !== "string") {
            sendTo(ws, { type: "error", code: "bad_request", message: "Invalid client request" });
            return;
          }
          handleRequest(ws, request as WsRequest);
        } catch (_e) {
          sendTo(ws, { type: "error", code: "invalid_json", message: "Invalid client message" });
        }
      });

      ws.on("close", () => {
        clients.delete(ws);
        updateMirrorStatus();
      });

      ws.on("error", () => {
        clients.delete(ws);
        updateMirrorStatus();
      });
    });

    // Heartbeat keeps mobile/Tailscale sessions alive and removes stale clients.
    heartbeatTimer = setInterval(() => {
      let changed = false;
      for (const client of clients) {
        if (client.readyState !== WebSocket.OPEN) {
          clients.delete(client);
          changed = true;
          continue;
        }

        const aliveClient = client as AliveWebSocket;
        if (!aliveClient.isAlive) {
          try {
            client.terminate();
          } catch {}
          clients.delete(client);
          changed = true;
          continue;
        }

        aliveClient.isAlive = false;
        try {
          client.ping();
        } catch {}
      }
      if (changed) updateMirrorStatus();
    }, 20000);

    const tryListen = (port: number, maxAttempts = 10) => {
      const activeServer = server;
      if (!activeServer) return;
      activeServer.listen(port, HOST, () => {
        onListening(port);
      });
      activeServer.once("error", (err: NodeError) => {
        if (err.code === "EADDRINUSE" && port < PORT + maxAttempts) {
          latestCtx?.ui.setStatus("webui", `pi-web-ui: trying port ${port + 1}`);
          activeServer.removeAllListeners("error");
          tryListen(port + 1, maxAttempts);
        } else {
          latestCtx?.ui.setStatus("webui", "");
          latestCtx?.ui.notify(`pi-web-ui failed to start: ${err.message}`, "error");
          stopServer();
        }
      });
    };

    const onListening = (port: number) => {
      mirrorUrl = `http://${HOST}:${port}`;
      mirrorStatusBase = `pi-web-ui: ${HOST}:${port}`;
      updateMirrorStatus();

      latestCtx?.ui.notify(`pi-web-ui: ${mirrorUrl}`, "info");
    };

    tryListen(PORT);
  }

  // ═══════════════════════════════════════
  // Auto-start on session begin
  // ═══════════════════════════════════════
  pi.on("session_start", async (_event, ctx) => {
    latestCtx = ctx;

    if (!AUTO_START) {
      return;
    }

    startServer();
  });

  // ═══════════════════════════════════════
  // Cleanup on shutdown
  // ═══════════════════════════════════════
  pi.on("session_shutdown", async () => {
    advancedFeaturesEnabled = false;
    latestExecuteCtx = null;
    latestCtx = null;
    stopServer();
  });
}
