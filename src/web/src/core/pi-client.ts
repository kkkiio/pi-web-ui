import type { WsError, WsEvent, WsRequest, WsResponse } from "./types";
import { wsUrl } from "./ws";

type PiClientOptions = {
  onConnectionChange: (state: "connecting" | "connected" | "disconnected") => void;
  onError: (message: string) => void;
  onEvent: (event: WsEvent) => void;
  onOpen: () => void;
  onPromptResponse: () => void;
};

type PendingRequest = {
  method: string;
  request: WsRequest;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class PiClient {
  private ws: WebSocket | null = null;
  private intentionallyClosed = false;
  private reconnectTimer: number | null = null;
  private requestCounter = 0;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly queuedRequests: WsRequest[] = [];
  private readonly options: PiClientOptions;

  constructor(options: PiClientOptions) {
    this.options = options;
  }

  connect() {
    this.intentionallyClosed = false;
    this.options.onConnectionChange("connecting");
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.options.onConnectionChange("connected");
      this.flushQueuedRequests();
      this.options.onOpen();
    };

    ws.onmessage = (messageEvent) => {
      if (this.ws !== ws) return;
      try {
        const data = JSON.parse(messageEvent.data) as WsResponse | WsEvent | WsError;
        if (data.type === "res") {
          const pending = this.pendingRequests.get(data.id);
          if (!pending) return;
          this.pendingRequests.delete(data.id);
          if (data.ok) {
            pending.resolve(data.result);
            if (pending.method === "prompt") this.options.onPromptResponse();
          } else {
            pending.reject(new Error(data.error || "Request failed"));
          }
        } else if (data.type === "event") {
          this.options.onEvent(data);
        } else if (data.type === "error") {
          this.options.onError(data.message || "Server error");
        }
      } catch (error) {
        console.error("[pi-web-ui] Failed to parse WebSocket message", error);
      }
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
      this.options.onError("WebSocket error");
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.options.onConnectionChange("disconnected");
      if (!this.intentionallyClosed) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 1200);
      }
    };
  }

  send(method: string, params?: Record<string, unknown>) {
    return new Promise<unknown>((resolve, reject) => {
      this.requestCounter += 1;
      const request: WsRequest = {
        type: "req",
        id: `req-${Date.now()}-${this.requestCounter}`,
        method,
        ...(params && { params }),
      };
      this.pendingRequests.set(request.id, { method, request, resolve, reject });
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(request));
      else this.queuedRequests.push(request);
    });
  }

  ensureConnected() {
    if (this.ws?.readyState === WebSocket.OPEN || this.reconnectTimer) return;
    if (this.ws) {
      this.ws.close();
      return;
    }
    this.connect();
  }

  disconnect() {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error("Client disconnected"));
    }
    this.pendingRequests.clear();
    this.queuedRequests.length = 0;
  }

  private flushQueuedRequests() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const queued = this.queuedRequests.splice(0);
    for (const request of queued) this.ws.send(JSON.stringify(request));
  }
}
