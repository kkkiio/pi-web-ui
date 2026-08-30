/**
 * pi-web-ui Extension (connect-out architecture, ADR 0012)
 *
 * Connects outward to a standalone pi-web-ui hub over WebSocket, allowing
 * one hub to serve many Pi processes:
 *
 * - Forwards all Pi events to the hub (which fans out to attached browsers)
 * - Accepts commands relayed by the hub and executes them via the extension API
 * - Reconnects with backoff; the TUI is unaffected when the hub is down
 * - Updates its session identity in place after session replacement
 *
 * Connect with /webui:connect [url]. Connection is manual only: nothing
 * talks to the hub until the command runs (or a rpc-injected prompt of it).
 * A default target can be set with PI_WEB_UI_HUB (e.g. ws://127.0.0.1:3001/ws/extension)
 * or the "hub" key in the pi-web-ui section of ~/.pi/agent/settings.json;
 * /webui:connect without an explicit URL uses it. PI_WEB_UI_HUB_PORT derives
 * a default target (ws://127.0.0.1:<port>/ws/extension) at lower priority.
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { WebSocket } from "ws";
import type { AgentSessionInfo, WsEvent, WsRequest, WsResponse } from "../src/protocol/index";
import { PROTOCOL_VERSION } from "../src/protocol/index";

type SettingsData = {
  hub?: string;
};

type BrowserImage = {
  data?: string;
  mimeType?: string;
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
    toolCallId?: string;
    isError?: boolean;
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

type GitStatusResult = {
  isRepo: boolean;
  branch: string | null;
  hasChanges: boolean;
  additions: number;
  deletions: number;
  untracked: number;
};

type GitDiffResult = {
  isRepo: boolean;
  branch: string | null;
  diff: string;
};

type ExtensionAPIWithEvents = ExtensionAPI & {
  events?: {
    on?: (eventType: string, listener: (payload: unknown) => void) => void;
    emit?: (eventType: string, payload: unknown) => void;
  };
};

const AGENT_DIR = path.resolve(
  (process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME || "~", ".pi/agent")).replace(
    /^~(?=$|\/)/,
    process.env.HOME || "~",
  ),
);

const DEFAULT_HUB_URL = "ws://127.0.0.1:3001/ws/extension";
const MAX_FILE_CONTENT_BYTES = 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 10 * 1024 * 1024;
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

function loadSettings(): { hubUrl: string | null } {
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
  // Derive a default target from PI_WEB_UI_HUB_PORT when no explicit hub URL
  // is configured (env PI_WEB_UI_HUB > settings.hub > PI_WEB_UI_HUB_PORT).
  const port = process.env.PI_WEB_UI_HUB_PORT;
  const portUrl = port && /^\d+$/.test(port) ? `ws://127.0.0.1:${port}/ws/extension` : null;
  return {
    hubUrl: process.env.PI_WEB_UI_HUB || settings.hub || portUrl || null,
  };
}

export default function (pi: ExtensionAPI) {
  const settings = loadSettings();
  const agentId = randomUUID();

  let hubSocket: WebSocket | null = null;
  let hubUrl: string | null = null;
  let wantConnection = false;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectDelay = RECONNECT_MIN_MS;

  // Store latest context reference for use in command handlers
  let latestCtx: ExtensionContext | null = null;
  let archExtensionPresent = false;
  let advancedFeaturesEnabled = false;
  let latestExecuteCtx: ExtensionCommandContext | null = null;

  // ═══════════════════════════════════════
  // Hub connection
  // ═══════════════════════════════════════

  function sendToHub(data: WsResponse | WsEvent | Record<string, unknown>) {
    if (hubSocket && hubSocket.readyState === WebSocket.OPEN) {
      hubSocket.send(JSON.stringify(data));
    }
  }

  function isConnected(): boolean {
    return !!hubSocket && hubSocket.readyState === WebSocket.OPEN;
  }

  function buildAgentInfo(overrides?: Partial<AgentSessionInfo>): AgentSessionInfo {
    const sessionFile = latestCtx?.sessionManager.getSessionFile() ?? null;
    return {
      agentId,
      sessionId: sessionFile ? path.basename(sessionFile).replace(/\.jsonl$/, "") : null,
      sessionName: pi.getSessionName() ?? null,
      sessionFile,
      cwd: workspaceDir(),
      pid: process.pid,
      isStreaming: latestCtx ? !latestCtx.isIdle() : false,
      ...overrides,
    };
  }

  function workspaceDir(): string {
    try {
      const entries = latestCtx?.sessionManager.getEntries() as SessionEntry[] | undefined;
      const sessionEntry = entries?.find((entry) => entry.type === "session");
      if (typeof sessionEntry?.cwd === "string" && sessionEntry.cwd) return path.resolve(sessionEntry.cwd);
    } catch {}
    return path.resolve(process.cwd());
  }

  function updateHubStatus() {
    if (!wantConnection) {
      latestCtx?.ui.setStatus("webui", "");
      return;
    }
    latestCtx?.ui.setStatus("webui", isConnected() ? `pi-web-ui: ${hubUrl}` : "pi-web-ui: reconnecting…");
  }

  function connectToHub(url: string) {
    hubUrl = url;
    wantConnection = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (hubSocket) {
      try {
        hubSocket.close();
      } catch {}
      hubSocket = null;
    }
    openSocket();
  }

  function disconnectFromHub() {
    wantConnection = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (hubSocket) {
      try {
        hubSocket.close();
      } catch {}
      hubSocket = null;
    }
    updateHubStatus();
  }

  function openSocket() {
    if (!hubUrl || !wantConnection) return;
    const ws = new WebSocket(hubUrl);
    hubSocket = ws;

    ws.on("open", () => {
      if (hubSocket !== ws) return;
      reconnectDelay = RECONNECT_MIN_MS;
      sendToHub({ type: "hello", protocolVersion: PROTOCOL_VERSION, agent: buildAgentInfo() });
      sendToHub({
        type: "event",
        event: "webui_state",
        payload: {
          advancedFeatures: advancedFeaturesEnabled && !!latestExecuteCtx,
          archAvailable: archExtensionPresent,
        },
      });
      updateHubStatus();
    });

    ws.on("message", (data) => {
      if (hubSocket !== ws) return;
      try {
        const request = JSON.parse(data.toString()) as Partial<WsRequest>;
        if (request.type !== "req" || typeof request.id !== "string" || typeof request.method !== "string") return;
        void handleRequest(request as WsRequest);
      } catch {
        // Malformed hub message; ignore.
      }
    });

    const onGone = () => {
      if (hubSocket !== ws) return;
      hubSocket = null;
      updateHubStatus();
      if (wantConnection) scheduleReconnect();
    };
    ws.on("close", onGone);
    ws.on("error", () => {
      try {
        ws.close();
      } catch {}
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      openSocket();
    }, reconnectDelay);
  }

  // ═══════════════════════════════════════
  // /webui:connect and /webui:disconnect
  // ═══════════════════════════════════════

  pi.registerCommand("webui:connect", {
    description: "Connect this Pi session to a pi-web-ui hub",
    handler: async (args, ctx) => {
      latestCtx = ctx;
      // Capture full ExtensionCommandContext for session-control methods
      // (navigateTree, fork, etc.). Cleared on session_start/session_shutdown;
      // re-run /webui:connect after session replacement.
      latestExecuteCtx = ctx;
      advancedFeaturesEnabled = true;

      const url = args.trim() || settings.hubUrl || DEFAULT_HUB_URL;
      connectToHub(url);
      sendToHub({
        type: "event",
        event: "webui_state",
        payload: { advancedFeatures: true, archAvailable: archExtensionPresent },
      });
      // No notify: connection state is presented via the status area only
      // (updateHubStatus shows the url or "reconnecting…").
    },
  });

  pi.registerCommand("webui:disconnect", {
    description: "Disconnect this Pi session from the pi-web-ui hub",
    handler: async (_args, ctx) => {
      if (!wantConnection) {
        ctx.ui.notify("pi-web-ui is not connected", "warning");
        return;
      }
      disconnectFromHub();
      // No notify on disconnect: the status area clearing is the feedback
      // (updateHubStatus clears when wantConnection turns false).
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
    "session_compact",
    "auto_retry_start",
    "auto_retry_end",
    "model_select",
  ] as const;

  for (const eventType of eventTypes) {
    pi.on(eventType as Parameters<ExtensionAPI["on"]>[0], async (event: unknown, ctx: ExtensionContext) => {
      latestCtx = ctx;
      const eventPayload = typeof event === "object" && event !== null ? (event as Record<string, unknown>) : {};

      // Forward event to the hub (which fans out to attached browsers)
      sendToHub({
        type: "event",
        event: eventType,
        payload: eventPayload,
      });
    });
  }

  pi.on("session_tree", async (event: unknown, ctx: ExtensionContext) => {
    latestCtx = ctx;
    const payload = typeof event === "object" && event !== null ? (event as Record<string, unknown>) : {};
    sendToHub({ type: "event", event: "session_tree", payload });
  });

  // Forward arch-mode state changes from other extensions to the hub
  (pi as ExtensionAPIWithEvents).events?.on?.("arch:state-changed", (payload: unknown) => {
    sendToHub({
      type: "event",
      event: "arch:state-changed",
      payload: typeof payload === "object" && payload !== null ? payload : {},
    });
  });

  // Listen for arch-mode extension presence announcement
  (pi as ExtensionAPIWithEvents).events?.on?.("arch:ready", () => {
    archExtensionPresent = true;
    sendToHub({ type: "event", event: "webui_state", payload: { archAvailable: true } });
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
    sendToHub({ type: "event", event: "webui_state", payload: { advancedFeatures: false } });
    turnCount = 0;
    titleSet = false;
    userMessages = [];

    // Session replacement: update identity in place on the same connection
    if (isConnected()) {
      sendToHub({ type: "session_update", agent: buildAgentInfo() });
    }
    // No auto-connect here: connecting to the hub is manual-only, triggered
    // exclusively by /webui:connect (env/settings only provide its default
    // target URL).
  });

  pi.on("turn_start", async (_event, _ctx) => {
    turnCount++;
  });

  // Keep the hub's live-agent registry in sync with the agent lifecycle so
  // browsers see the streaming indicator change in real time. The hub
  // rebroadcasts hub:sessions on every session_update (ADR 0012).
  // Boundaries: agent_start = busy; agent_settled = fully idle (agent_end can
  // still run before the session flips back to idle, so it is not a reliable
  // idle boundary). The flag is stated explicitly because ctx.isIdle() is not
  // yet updated when these events fire.
  pi.on("agent_start", async (_event, ctx) => {
    latestCtx = ctx;
    sendToHub({ type: "session_update", agent: buildAgentInfo({ isStreaming: true }) });
  });

  // agent_settled is not yet in the published ExtensionAPI typings (it exists
  // in pi >= 0.84), so register it through the same cast as the generic loop.
  pi.on("agent_settled" as Parameters<ExtensionAPI["on"]>[0], async (_event: unknown, ctx: ExtensionContext) => {
    latestCtx = ctx;
    sendToHub({ type: "session_update", agent: buildAgentInfo({ isStreaming: false }) });
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
      sendToHub({
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
      .replace(/^(ok |okay |so |actually |hey |please|can you |could you |i want(ed)? to |i wanna |let'?s )/i, "")
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
  // Handle commands relayed by the hub
  // ═══════════════════════════════════════
  async function handleRequest(request: WsRequest) {
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
                const mimeType = (img.mimeType && validMimes.includes(img.mimeType) ? img.mimeType : "image/png") as
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
          sendToHub(success());
          break;
        }

        case "steer": {
          pi.sendUserMessage(typeof params.message === "string" ? params.message : "", { deliverAs: "steer" });
          sendToHub(success());
          break;
        }

        case "follow_up": {
          pi.sendUserMessage(typeof params.message === "string" ? params.message : "", { deliverAs: "followUp" });
          sendToHub(success());
          break;
        }

        case "abort": {
          ctx?.abort();
          sendToHub(success());
          break;
        }

        case "enter_arch_mode": {
          (pi as ExtensionAPIWithEvents).events?.emit?.("cmd:arch:enter", {});
          sendToHub(success());
          break;
        }

        case "exit_arch_mode": {
          (pi as ExtensionAPIWithEvents).events?.emit?.("cmd:arch:exit", {});
          sendToHub(success());
          break;
        }

        case "get_state": {
          if (!ctx) {
            sendToHub(error("No context available"));
            break;
          }
          sendToHub(
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
            sendToHub(error("No context available"));
            break;
          }
          sendToHub(success({ entries: ctx.sessionManager.getEntries() }));
          break;
        }

        case "get_available_models": {
          if (!ctx) {
            sendToHub(error("No context available"));
            break;
          }
          sendToHub(success({ models: await ctx.modelRegistry.getAvailable() }));
          break;
        }

        case "set_model": {
          if (!ctx) {
            sendToHub(error("No context available"));
            break;
          }
          const models = await ctx.modelRegistry.getAvailable();
          const model = models.find(
            (candidate) => candidate.provider === params.provider && candidate.id === params.modelId,
          );
          if (!model) {
            sendToHub(error(`Model not found: ${params.provider}/${params.modelId}`));
            break;
          }
          if (!(await pi.setModel(model))) {
            sendToHub(error("No API key for this model"));
            break;
          }
          sendToHub(success(model));
          break;
        }

        case "cycle_model": {
          if (!ctx) {
            sendToHub(success(null));
            break;
          }
          const availModels = await ctx.modelRegistry.getAvailable();
          const currentModel = ctx.model;
          if (!currentModel || availModels.length <= 1) {
            sendToHub(success(null));
            break;
          }
          const idx = availModels.findIndex(
            (candidate) => candidate.provider === currentModel.provider && candidate.id === currentModel.id,
          );
          const nextModel = availModels[(idx + 1) % availModels.length];
          await pi.setModel(nextModel);
          sendToHub(success({ model: nextModel, thinkingLevel: pi.getThinkingLevel() }));
          break;
        }

        case "set_thinking_level": {
          pi.setThinkingLevel(params.level as Parameters<typeof pi.setThinkingLevel>[0]);
          sendToHub(success());
          break;
        }

        case "get_session_stats": {
          if (!ctx) {
            sendToHub(error("No context available"));
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
          sendToHub(
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
            sendToHub(error("Name cannot be empty"));
            break;
          }
          pi.setSessionName(name);
          sendToHub(success());
          break;
        }

        case "set_auto_compaction": {
          sendToHub(success());
          break;
        }

        case "compact": {
          if (ctx) {
            sendToHub({ type: "event", event: "auto_compaction_start", payload: {} });
            ctx.compact({
              customInstructions: typeof params.customInstructions === "string" ? params.customInstructions : undefined,
              onComplete: (result: { summary?: unknown }) => {
                sendToHub({ type: "event", event: "auto_compaction_end", payload: { summary: result?.summary } });
              },
              onError: (err: Error) => {
                sendToHub({
                  type: "event",
                  event: "auto_compaction_end",
                  payload: { summary: `Error: ${err.message}` },
                });
              },
            });
          }
          sendToHub(success());
          break;
        }

        case "export_html": {
          if (!ctx) {
            sendToHub(error("No context available"));
            break;
          }
          try {
            const sessionFile = ctx.sessionManager.getSessionFile();
            if (!sessionFile) throw new Error("No session file to export");
            const { execSync } = require("node:child_process");
            const outputPath = typeof params.outputPath === "string" ? params.outputPath : "";
            const exportArgs = outputPath ? `"${sessionFile}" "${outputPath}"` : `"${sessionFile}"`;
            const output = execSync(`pi --export ${exportArgs}`, {
              cwd: process.cwd(),
              timeout: 30000,
              encoding: "utf-8",
            });
            sendToHub(success({ path: output.trim().split("\n").pop() || sessionFile.replace(".jsonl", ".html") }));
          } catch (e: unknown) {
            sendToHub(error(e instanceof Error ? e.message : String(e)));
          }
          break;
        }

        case "sync_request": {
          const snapshot = ctx
            ? await buildStateSnapshot(ctx)
            : { type: "event", event: "state_sync", payload: { entries: [], tree: [], leafId: null, model: null } };
          sendToHub(success(snapshot.payload));
          break;
        }

        case "health": {
          sendToHub(success({ status: "ok", mode: "extension", agentId }));
          break;
        }

        case "get_files": {
          const explicitPath = typeof params.path === "string" ? params.path : "";
          const dirPath = explicitPath || workspaceDir();
          sendToHub(success(getFileList(dirPath)));
          break;
        }

        case "get_git_status": {
          sendToHub(success(getGitStatus(ctx)));
          break;
        }

        case "get_git_diff": {
          const filePath = typeof params.path === "string" ? params.path : undefined;
          sendToHub(success(getGitDiff(ctx, filePath)));
          break;
        }

        case "open_file": {
          const filePath = typeof params.filePath === "string" ? params.filePath : "";
          if (!filePath) {
            sendToHub(error("filePath required"));
            break;
          }
          const { execFile } = await import("node:child_process");
          execFile("open", [filePath], (err) => {
            if (err) latestCtx?.ui.notify(`Failed to open file: ${err.message}`, "warning");
          });
          sendToHub(success({ ok: true }));
          break;
        }

        case "get_auth": {
          sendToHub(success({ configured: false, enabled: false }));
          break;
        }

        case "set_auth": {
          sendToHub(
            error(
              "Authentication is not supported. Use tailscale serve or a reverse proxy with TLS for remote access.",
            ),
          );
          break;
        }

        case "navigate_tree": {
          if (!advancedFeaturesEnabled || !latestExecuteCtx) {
            sendToHub(error("Run /webui:connect first to enable editing"));
            break;
          }
          if (!latestCtx?.isIdle()) {
            sendToHub(error("Agent is busy"));
            break;
          }
          const entryId = typeof params.entryId === "string" ? params.entryId : "";
          const entry = latestCtx.sessionManager.getEntry(entryId);
          if (!entry) {
            sendToHub(error("Entry not found"));
            break;
          }
          if (!latestCtx.model) {
            sendToHub(error("No model selected"));
            break;
          }
          const result = (await latestExecuteCtx.navigateTree(entryId)) as {
            cancelled: boolean;
            editorText?: string;
          };
          if (result.cancelled) {
            sendToHub(success({ cancelled: true }));
            break;
          }
          sendToHub(success({ editorText: result.editorText, cancelled: false }));
          break;
        }

        case "extension_ui_response": {
          sendToHub(success());
          break;
        }

        default:
          sendToHub(error(`Unknown method: ${request.method}`));
      }
    } catch (e: unknown) {
      sendToHub(error(e instanceof Error ? e.message : String(e)));
    }
  }

  // ═══════════════════════════════════════
  // File browser / git helpers
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

  function getGitStatus(ctx: ExtensionContext | null): GitStatusResult {
    let workspace = path.resolve(process.cwd());
    if (ctx) {
      try {
        const entries = ctx.sessionManager.getEntries() as SessionEntry[];
        const sessionEntry = entries.find((entry) => entry.type === "session");
        if (typeof sessionEntry?.cwd === "string" && sessionEntry.cwd) workspace = path.resolve(sessionEntry.cwd);
      } catch {}
    }

    const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: workspace,
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
    if (rootResult.error || rootResult.status !== 0 || typeof rootResult.stdout !== "string") {
      return { isRepo: false, branch: null, hasChanges: false, additions: 0, deletions: 0, untracked: 0 };
    }
    const gitRoot = path.resolve(rootResult.stdout.trim());

    const gitOptions = { cwd: gitRoot, encoding: "utf8" as const, maxBuffer: MAX_GIT_OUTPUT_BYTES };
    const outputs = new Map<string, string>();
    const commands: Array<[string, string[]]> = [
      ["branch", ["branch", "--show-current"]],
      ["head", ["rev-parse", "--short", "HEAD"]],
      ["porcelain", ["status", "--porcelain=v1", "--untracked-files=all"]],
      ["unstagedStat", ["diff", "--numstat"]],
      ["stagedStat", ["diff", "--cached", "--numstat"]],
      ["untracked", ["ls-files", "--others", "--exclude-standard", "-z"]],
    ];
    for (const [name, args] of commands) {
      const result = spawnSync("git", args, gitOptions);
      if (result.error) throw result.error;
      if (result.status !== 0 && name !== "branch") {
        throw new Error(String(result.stderr || `git ${args.join(" ")} failed`).trim());
      }
      outputs.set(name, typeof result.stdout === "string" ? result.stdout : "");
    }

    let additions = 0;
    let deletions = 0;
    for (const line of `${outputs.get("unstagedStat") || ""}\n${outputs.get("stagedStat") || ""}`.split(/\r?\n/)) {
      const [added, deleted] = line.split("\t");
      const addedCount = Number(added);
      const deletedCount = Number(deleted);
      if (Number.isFinite(addedCount)) additions += addedCount;
      if (Number.isFinite(deletedCount)) deletions += deletedCount;
    }

    const untrackedPaths = (outputs.get("untracked") || "").split("\0").filter(Boolean);
    let untrackedAdditions = 0;

    for (const relativePath of untrackedPaths) {
      const absolutePath = path.resolve(gitRoot, relativePath);
      try {
        const stat = fs.statSync(absolutePath);
        if (!stat.isFile() || stat.size > MAX_FILE_CONTENT_BYTES) continue;
        const content = fs.readFileSync(absolutePath, "utf8");
        if (content.includes("\0")) continue;
        untrackedAdditions += content ? (content.match(/\n/g)?.length ?? 0) + (content.endsWith("\n") ? 0 : 1) : 0;
      } catch {}
    }

    return {
      isRepo: true,
      branch: (outputs.get("branch") || outputs.get("head") || "").trim() || null,
      hasChanges: (outputs.get("porcelain") || "").trim().length > 0,
      additions: additions + untrackedAdditions,
      deletions,
      untracked: untrackedPaths.length,
    };
  }

  function getGitDiff(ctx: ExtensionContext | null, requestedPath?: string): GitDiffResult {
    let workspace = path.resolve(process.cwd());
    if (ctx) {
      try {
        const entries = ctx.sessionManager.getEntries() as SessionEntry[];
        const sessionEntry = entries.find((entry) => entry.type === "session");
        if (typeof sessionEntry?.cwd === "string" && sessionEntry.cwd) workspace = path.resolve(sessionEntry.cwd);
      } catch {}
    }

    const rootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: workspace,
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
    });
    if (rootResult.error || rootResult.status !== 0 || typeof rootResult.stdout !== "string") {
      return { isRepo: false, branch: null, diff: "" };
    }
    const gitRoot = path.resolve(rootResult.stdout.trim());
    let requestedRelativePath: string | null = null;
    if (requestedPath) {
      const absolutePath = path.isAbsolute(requestedPath)
        ? path.resolve(requestedPath)
        : path.resolve(workspace, requestedPath);
      if (absolutePath !== workspace && !absolutePath.startsWith(`${workspace}${path.sep}`)) {
        throw new Error("path outside workspace");
      }
      requestedRelativePath = path.relative(gitRoot, absolutePath).replace(/\\/g, "/");
      if (requestedRelativePath.startsWith("..") || path.isAbsolute(requestedRelativePath)) {
        throw new Error("path outside git repository");
      }
    }

    const gitOptions = { cwd: gitRoot, encoding: "utf8" as const, maxBuffer: MAX_GIT_OUTPUT_BYTES };
    const pathArgs = requestedRelativePath ? ["--", requestedRelativePath] : [];
    const outputs = new Map<string, string>();
    const commands: Array<[string, string[]]> = [
      ["branch", ["branch", "--show-current"]],
      ["head", ["rev-parse", "--short", "HEAD"]],
      ["staged", ["diff", "--cached", "--no-ext-diff", ...pathArgs]],
      ["unstaged", ["diff", "--no-ext-diff", ...pathArgs]],
      ["untracked", ["ls-files", "--others", "--exclude-standard", "-z"]],
    ];
    for (const [name, args] of commands) {
      const result = spawnSync("git", args, gitOptions);
      if (result.error) throw result.error;
      if (result.status !== 0 && name !== "branch") {
        throw new Error(String(result.stderr || `git ${args.join(" ")} failed`).trim());
      }
      outputs.set(name, typeof result.stdout === "string" ? result.stdout : "");
    }

    const untrackedPaths = (outputs.get("untracked") || "")
      .split("\0")
      .filter(Boolean)
      .filter((relativePath) => !requestedRelativePath || relativePath === requestedRelativePath);
    const parts: string[] = [];
    const staged = (outputs.get("staged") || "").trimEnd();
    const unstaged = (outputs.get("unstaged") || "").trimEnd();

    // Untracked files: `git diff --no-index /dev/null <path>` produces standard
    // new-file diffs (text) and standard "Binary files ... differ" notices
    // (binary), with no hand-assembled diff text. Exit code 1 means
    // "differences found", not an error. Large files are skipped.
    const untrackedDiffs: string[] = [];
    for (const relativePath of untrackedPaths) {
      const absolutePath = path.resolve(gitRoot, relativePath);
      try {
        const stat = fs.statSync(absolutePath);
        if (!stat.isFile() || stat.size > MAX_FILE_CONTENT_BYTES) continue;
        const result = spawnSync("git", ["diff", "--no-index", "--", "/dev/null", relativePath], gitOptions);
        if (result.error) continue;
        // exit 0 = identical (shouldn't happen for /dev/null), 1 = differences
        if (result.status !== 0 && result.status !== 1) continue;
        const text = typeof result.stdout === "string" ? result.stdout.trimEnd() : "";
        if (text) untrackedDiffs.push(text);
      } catch {}
    }

    if (staged) parts.push(staged);
    if (unstaged) parts.push(unstaged);
    parts.push(...untrackedDiffs);

    return {
      isRepo: true,
      branch: (outputs.get("branch") || outputs.get("head") || "").trim() || null,
      diff: parts.join("\n\n"),
    };
  }

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
  // Cleanup on shutdown
  // ═══════════════════════════════════════
  pi.on("session_shutdown", async () => {
    advancedFeaturesEnabled = false;
    latestExecuteCtx = null;
    latestCtx = null;
    disconnectFromHub();
  });
}
