/**
 * Agent registry and message routing for the pi-web-ui hub (ADR 0012).
 *
 * Owns two WebSocket populations — agents (extensions, one per Pi process)
 * and browsers — and relays req/res between them with id rewriting so
 * browser id namespaces never collide.
 */

import type { WebSocket } from "ws";
import type {
  AgentHello,
  AgentSessionInfo,
  AgentSessionUpdate,
  ExtensionMessage,
  WsError,
  WsEvent,
  WsRequest,
  WsResponse,
} from "../protocol/index.js";
import {
  HUB_EVENT_AGENT_GONE,
  HUB_EVENT_SESSIONS,
  HUB_METHOD_ATTACH,
  HUB_METHOD_DETACH,
  HUB_METHOD_LIST_HISTORY,
  HUB_METHOD_LIST_SESSIONS,
} from "../protocol/index.js";

type AgentConnection = {
  ws: WebSocket;
  info: AgentSessionInfo;
  /** Last webui_state event, replayed to browsers on attach. */
  webuiState: Record<string, unknown> | null;
};

type BrowserConnection = {
  ws: WebSocket;
  attachedAgentId: string | null;
};

type PendingRelay = {
  browser: BrowserConnection;
  originalId: string;
};

export type RegistryOptions = {
  listHistory: () => Promise<unknown>;
};

export class HubRegistry {
  private readonly agents = new Map<string, AgentConnection>();
  private readonly browsers = new Set<BrowserConnection>();
  private readonly pending = new Map<string, PendingRelay>();
  private relayCounter = 0;

  constructor(private readonly options: RegistryOptions) {}

  // ── Agent lifecycle ─────────────────────────────────

  addAgent(ws: WebSocket, hello: AgentHello) {
    const existing = this.agents.get(hello.agent.agentId);
    if (existing && existing.ws !== ws) {
      try {
        existing.ws.close();
      } catch {}
      this.detachBrowsersFrom(hello.agent.agentId, { silent: true });
    }
    this.agents.set(hello.agent.agentId, {
      ws,
      info: hello.agent,
      webuiState: existing?.webuiState ?? null,
    });
    this.broadcastSessionsChanged();
  }

  updateAgent(message: AgentSessionUpdate) {
    const agent = this.agents.get(message.agent.agentId);
    if (!agent) return;
    agent.info = message.agent;
    this.broadcastSessionsChanged();
  }

  removeAgent(ws: WebSocket) {
    for (const [agentId, agent] of this.agents) {
      if (agent.ws !== ws) continue;
      this.agents.delete(agentId);
      this.detachBrowsersFrom(agentId);
      this.broadcastSessionsChanged();
      return;
    }
  }

  /** Handle one parsed message from an agent socket. */
  handleAgentMessage(ws: WebSocket, message: ExtensionMessage) {
    if (message.type === "hello") {
      this.addAgent(ws, message);
      return;
    }
    if (message.type === "session_update") {
      this.updateAgent(message);
      return;
    }
    if (message.type === "res") {
      this.deliverAgentResponse(message);
      return;
    }
    if (message.type === "event") {
      this.fanOutAgentEvent(ws, message);
    }
  }

  // ── Browser lifecycle ───────────────────────────────

  addBrowser(ws: WebSocket): BrowserConnection {
    const browser: BrowserConnection = { ws, attachedAgentId: null };
    this.browsers.add(browser);
    this.attach(browser, this.mostRecentAgentId());
    this.sendSessionsList(browser);
    return browser;
  }

  removeBrowser(ws: WebSocket) {
    for (const browser of this.browsers) {
      if (browser.ws === ws) {
        this.browsers.delete(browser);
        return;
      }
    }
  }

  /** Handle one parsed request from a browser socket. */
  handleBrowserRequest(browser: BrowserConnection, request: WsRequest) {
    switch (request.method) {
      case HUB_METHOD_ATTACH: {
        const agentId = typeof request.params?.agentId === "string" ? request.params.agentId : this.mostRecentAgentId();
        this.attach(browser, agentId);
        this.reply(browser, request, {
          attached: browser.attachedAgentId,
          agent: browser.attachedAgentId ? this.agents.get(browser.attachedAgentId)?.info : null,
        });
        return;
      }
      case HUB_METHOD_DETACH: {
        browser.attachedAgentId = null;
        this.reply(browser, request, { attached: null });
        return;
      }
      case HUB_METHOD_LIST_SESSIONS: {
        this.reply(browser, request, { sessions: this.liveSessionList() });
        return;
      }
      case HUB_METHOD_LIST_HISTORY: {
        this.options
          .listHistory()
          .then((history) => this.reply(browser, request, { history }))
          .catch((error) => this.replyError(browser, request, error instanceof Error ? error.message : String(error)));
        return;
      }
      case "health": {
        this.reply(browser, request, { status: "ok", mode: "hub", agents: this.agents.size });
        return;
      }
      default:
        this.relayToAgent(browser, request);
    }
  }

  // ── Routing internals ───────────────────────────────

  private attach(browser: BrowserConnection, agentId: string | null) {
    browser.attachedAgentId = agentId && this.agents.has(agentId) ? agentId : null;
    if (!browser.attachedAgentId) return;
    const agent = this.agents.get(browser.attachedAgentId);
    if (agent?.webuiState) {
      this.sendTo(browser.ws, { type: "event", event: "webui_state", payload: agent.webuiState });
    }
  }

  private relayToAgent(browser: BrowserConnection, request: WsRequest) {
    const agent = browser.attachedAgentId ? this.agents.get(browser.attachedAgentId) : undefined;
    if (!agent) {
      this.replyError(browser, request, "No agent attached");
      return;
    }
    const relayId = `hub-${++this.relayCounter}`;
    this.pending.set(relayId, { browser, originalId: request.id });
    this.sendTo(agent.ws, { ...request, id: relayId });
  }

  private deliverAgentResponse(response: WsResponse) {
    const relay = this.pending.get(response.id);
    if (!relay) return;
    this.pending.delete(response.id);
    this.sendTo(relay.browser.ws, { ...response, id: relay.originalId });
  }

  private fanOutAgentEvent(agentWs: WebSocket, event: WsEvent) {
    let agentId: string | null = null;
    for (const [id, agent] of this.agents) {
      if (agent.ws === agentWs) {
        agentId = id;
        if (event.event === "webui_state") agent.webuiState = event.payload;
        break;
      }
    }
    if (!agentId) return;
    for (const browser of this.browsers) {
      if (browser.attachedAgentId === agentId) this.sendTo(browser.ws, event);
    }
  }

  private detachBrowsersFrom(agentId: string, options?: { silent?: boolean }) {
    for (const browser of this.browsers) {
      if (browser.attachedAgentId !== agentId) continue;
      browser.attachedAgentId = null;
      if (!options?.silent) {
        this.sendTo(browser.ws, { type: "event", event: HUB_EVENT_AGENT_GONE, payload: { agentId } });
      }
    }
  }

  private broadcastSessionsChanged() {
    const event: WsEvent = { type: "event", event: HUB_EVENT_SESSIONS, payload: { sessions: this.liveSessionList() } };
    for (const browser of this.browsers) this.sendTo(browser.ws, event);
  }

  private sendSessionsList(browser: BrowserConnection) {
    this.sendTo(browser.ws, {
      type: "event",
      event: HUB_EVENT_SESSIONS,
      payload: { sessions: this.liveSessionList() },
    });
  }

  private liveSessionList(): AgentSessionInfo[] {
    return [...this.agents.values()].map((agent) => agent.info);
  }

  private mostRecentAgentId(): string | null {
    let last: string | null = null;
    for (const agentId of this.agents.keys()) last = agentId;
    return last;
  }

  // ── Wire helpers ────────────────────────────────────

  private reply(browser: BrowserConnection, request: WsRequest, result: unknown) {
    this.sendTo(browser.ws, { type: "res", id: request.id, ok: true, result });
  }

  private replyError(browser: BrowserConnection, request: WsRequest, error: string) {
    this.sendTo(browser.ws, { type: "res", id: request.id, ok: false, error });
  }

  private sendTo(ws: WebSocket, data: WsRequest | WsResponse | WsEvent | WsError) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  }
}
