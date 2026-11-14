import {
  addUsageToTotals,
  createUsageTotals,
  extractText,
  extractThinking,
  extractToolCalls,
  findLastUsage,
  formatToolOutput,
  sumUsageTotals,
  syncToItems,
} from "../chat-conversion";
import { isToolExpandable } from "../tool-summary";
import type { ChatItem } from "../types";
import { dispatchPiEvent } from "./event-dispatch";
import type { SessionSlice, StoreSlice } from "./types";

let conversationSyncInFlight = false;
let conversationSyncPending = false;
let conversationSyncTimer: number | null = null;
let itemCounter = 0;
let sessionFile: string | undefined;
let streamingHasToolCall = false;
let pendingMessage: SessionSlice["streamingMessage"] = null;
let frame: number | null = null;

function nextId(prefix: string) {
  itemCounter += 1;
  return `${prefix}-${Date.now()}-${itemCounter}`;
}

// End events can arrive before the scheduled frame, including in background tabs.
function takeStreamingMessage(published: SessionSlice["streamingMessage"]) {
  if (frame !== null) window.cancelAnimationFrame(frame);
  frame = null;
  const message = pendingMessage ?? published;
  pendingMessage = null;
  return message;
}

export const createSessionSlice: StoreSlice<SessionSlice> = (set, get) => ({
  items: [],
  streamingMessage: null,
  chatStatus: "ready",
  tree: [],
  leafId: null,
  selectedTreeEntryId: null,
  loadingTreeEntryId: null,
  conversationSyncing: false,
  conversationSyncError: null,
  lastUsage: null,
  usageTotals: createUsageTotals(),
  contextUsage: null,
  contextWindowSize: 0,

  addSystemMessage: (text, tone = "info") => {
    set((state) => ({ items: [...state.items, { kind: "system", id: nextId("system"), text, tone }] }));
  },

  applyStateSync: (sync) => {
    const entries = sync.entries ?? [];
    const sameSession = sessionFile === sync.sessionFile;
    sessionFile = sync.sessionFile;
    const currentItems = sameSession ? get().items : [];
    const items = syncToItems(entries, nextId, currentItems);
    const liveMessage = sameSession && sync.isStreaming ? get().streamingMessage : null;
    const keepStreaming = liveMessage && !items.some((item) => item.id === liveMessage.id);
    if (keepStreaming) {
      items.push(liveMessage);
    } else {
      takeStreamingMessage(get().streamingMessage);
      streamingHasToolCall = false;
    }
    const tree = sync.tree ?? [];
    const currentSelection = get().selectedTreeEntryId;
    let selectedTreeEntryId: string | null = sync.leafId ?? null;

    if (currentSelection) {
      const stack = [...tree];
      while (stack.length > 0) {
        const node = stack.pop();
        if (node?.entry.id === currentSelection) {
          selectedTreeEntryId = currentSelection;
          break;
        }
        if (node) stack.push(...node.children);
      }
    }

    set({
      chatStatus: sync.isStreaming ? "streaming" : "ready",
      connection: "connected",
      contextWindowSize: sync.model?.contextWindow || get().contextWindowSize,
      currentModel: sync.model || null,
      error: null,
      items,
      streamingMessage: keepStreaming ? liveMessage : null,
      questionnaires: {},
      lastUsage: findLastUsage(entries),
      usageTotals: sumUsageTotals(tree),
      contextUsage: sync.contextUsage ?? null,
      leafId: sync.leafId ?? null,
      modelLabel: sync.model?.id ? sync.model.id.split("/").pop() || sync.model.id : "model",
      selectedTreeEntryId,
      sessionName: sync.sessionName || "Pi Web UI",
      thinkingLevel: sync.thinkingLevel || "off",
      tree,
    });
    for (const event of sync.liveEvents ?? []) dispatchPiEvent(get(), event);
    set((state) => ({
      questionDrafts: Object.fromEntries(
        Object.entries(state.questionDrafts).filter(([id]) => state.questionnaires[id]?.status === "pending"),
      ),
    }));
    get().requestGitStatusRefresh({ debounce: true });
  },

  requestConversationSync: async (options) => {
    if (options?.debounce) {
      if (conversationSyncTimer) window.clearTimeout(conversationSyncTimer);
      conversationSyncTimer = window.setTimeout(() => {
        conversationSyncTimer = null;
        void get().requestConversationSync();
      }, 250);
      return;
    }

    if (conversationSyncInFlight) {
      conversationSyncPending = true;
      return;
    }

    conversationSyncInFlight = true;
    set({ conversationSyncError: null, conversationSyncing: true });
    try {
      const sync = await get().send("sync_request");
      get().applyStateSync(sync as Parameters<SessionSlice["applyStateSync"]>[0]);
    } catch (error) {
      set({ conversationSyncError: error instanceof Error ? error.message : "Sync failed" });
    } finally {
      conversationSyncInFlight = false;
      set({ conversationSyncing: false });
      if (conversationSyncPending) {
        conversationSyncPending = false;
        window.setTimeout(() => void get().requestConversationSync(), 0);
      }
    }
  },

  clearConversationTimers: () => {
    if (conversationSyncTimer) window.clearTimeout(conversationSyncTimer);
    conversationSyncTimer = null;
  },

  setChatStatus: (chatStatus) => set({ chatStatus }),
  setSelectedTreeEntryId: (selectedTreeEntryId) => set({ selectedTreeEntryId }),
  setLoadingTreeEntryId: (loadingTreeEntryId) => set({ loadingTreeEntryId }),
  setLastUsage: (lastUsage) => set({ lastUsage }),
  setContextWindowSize: (contextWindowSize) => set({ contextWindowSize }),

  sendPrompt: async (command) => {
    set({ chatStatus: "submitted", error: null });
    try {
      await get().send("prompt", {
        message: command.message,
        ...(command.images?.length && { images: command.images }),
      });
    } catch (error) {
      set({ chatStatus: "error", error: error instanceof Error ? error.message : "Prompt failed" });
    }
  },

  abort: async () => {
    try {
      await get().send("abort");
      set({ chatStatus: "ready" });
      get().addSystemMessage("Aborted by user", "error");
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Abort failed" });
    }
  },

  toggleAllTools: (open) => {
    set((state) => ({
      items: state.items.map((item) => (item.kind === "tool" && isToolExpandable(item) ? { ...item, open } : item)),
    }));
  },

  toggleTool: (id, open) => {
    set((state) => ({
      items: state.items.map((item) => (item.kind === "tool" && item.id === id ? { ...item, open } : item)),
    }));
  },

  applyAgentStart: () => {
    set({ chatStatus: "streaming" });
  },

  applyAgentEnd: () => {
    const message = takeStreamingMessage(get().streamingMessage);
    const copyable = !streamingHasToolCall;
    streamingHasToolCall = false;
    set((state) => ({
      chatStatus: "ready",
      streamingMessage: null,
      items: message
        ? state.items.map((item) =>
            item.kind === "message" && item.id === message.id
              ? { ...message, copyable, thinking: false, streaming: false }
              : item,
          )
        : state.items,
    }));
    void get().requestConversationSync({ debounce: true });
    get().requestGitStatusRefresh({ debounce: true });
  },

  applyMessageStart: (event) => {
    if (event.message?.role === "assistant") {
      takeStreamingMessage(get().streamingMessage);
      const { id: messageId, timestamp } = event.message;
      const id = messageId || nextId("assistant");
      streamingHasToolCall = extractToolCalls(event.message.content).length > 0;
      const message = {
        kind: "message",
        id,
        role: "assistant",
        text: extractText(event.message.content),
        reasoning: extractThinking(event.message.content),
        streaming: true,
        copyable: false,
        timestamp,
      } satisfies ChatItem;
      set((state) => ({ items: [...state.items, message], streamingMessage: message }));
      return;
    }

    if (event.message?.role === "user") {
      const text = extractText(event.message.content);
      if (!text) return;
      set((state) => ({
        items: [...state.items, { kind: "message", id: event.message?.id || nextId("user"), role: "user", text }],
      }));
    }
  },

  applyMessageUpdate: (event) => {
    const messageEvent = event.assistantMessageEvent;
    const message = pendingMessage ?? get().streamingMessage;
    if (!message || !messageEvent) return;

    const { type, delta = "" } = messageEvent;
    if (type.startsWith("toolcall_")) streamingHasToolCall = true;
    switch (type) {
      case "text_delta":
        pendingMessage = { ...message, text: message.text + delta };
        break;
      case "thinking_delta":
        pendingMessage = { ...message, thinking: true, reasoning: (message.reasoning ?? "") + delta };
        break;
      case "thinking_start":
      case "thinking_end":
        pendingMessage = { ...message, thinking: type === "thinking_start" };
        break;
      default:
        return;
    }

    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      const previous = get().streamingMessage;
      const next = takeStreamingMessage(previous);
      if (!next || !previous) return;
      // The transcript only needs a new array when the message gains or loses a row.
      const rowsChanged =
        Boolean(previous.text.trim()) !== Boolean(next.text.trim()) ||
        Boolean(previous.thinking || previous.reasoning?.trim()) !== Boolean(next.thinking || next.reasoning?.trim());
      set((state) => ({
        streamingMessage: next,
        items: rowsChanged
          ? state.items.map((item) => (item.kind === "message" && item.id === next.id ? next : item))
          : state.items,
      }));
    });
  },

  applyMessageEnd: (event) => {
    const message = takeStreamingMessage(get().streamingMessage);
    if (!message) return;
    const usage = event.message?.usage;
    const content = event.message?.content;
    const completed = {
      ...message,
      ...(content && { text: extractText(content), reasoning: extractThinking(content) }),
      copyable: !(streamingHasToolCall || extractToolCalls(content).length),
      cost: usage?.cost?.total,
      thinking: false,
      streaming: false,
    };
    streamingHasToolCall = false;

    set((state) => ({
      streamingMessage: null,
      items: state.items.map((item) => (item.kind === "message" && item.id === message.id ? completed : item)),
      lastUsage: usage || null,
      usageTotals: addUsageToTotals(state.usageTotals, usage),
    }));
  },

  applyToolExecutionStart: (event) => {
    if (!event.toolCallId) return;
    streamingHasToolCall = true;
    const id = event.toolCallId;
    const name = event.toolName || "tool";
    set((state) => {
      const tool = { kind: "tool", id, name, input: event.args, state: "input-streaming" } satisfies ChatItem;
      const existing = state.items.findIndex((item) => item.kind === "tool" && item.id === id);
      return {
        items:
          existing < 0
            ? [...state.items, tool]
            : state.items.map((item, index) => (index === existing ? { ...item, ...tool } : item)),
      };
    });
  },

  applyToolExecutionUpdate: (event) => {
    if (!event.toolCallId) return;
    set((state) => ({
      items: state.items.map((item) =>
        item.kind === "tool" && item.id === event.toolCallId
          ? { ...item, output: formatToolOutput(event.partialResult), state: "input-available" }
          : item,
      ),
    }));
  },

  applyToolExecutionEnd: (event) => {
    get().requestGitStatusRefresh({ debounce: true });
    if (!event.toolCallId) return;
    set((state) => ({
      items: state.items.map((item) =>
        item.kind === "tool" && item.id === event.toolCallId
          ? {
              ...item,
              errorText: event.isError ? String(formatToolOutput(event.result)) : undefined,
              output: event.isError ? undefined : formatToolOutput(event.result),
              outputDetails: (event.result as { details?: unknown } | undefined)?.details,
              state: event.isError ? "output-error" : "output-available",
            }
          : item,
      ),
    }));
    const question = get().questionnaires[event.toolCallId];
    if (question) {
      const details = (event.result as { details?: { cancelled?: boolean } } | undefined)?.details;
      set((state) => ({
        questionnaires: {
          ...state.questionnaires,
          [question.toolCallId]: {
            ...question,
            status: event.isError || details?.cancelled ? "cancelled" : "answered",
            submitting: false,
            summary: formatToolOutput(event.result),
          },
        },
      }));
    }
  },

  markPromptReady: () => {
    set((state) => ({ chatStatus: state.chatStatus === "submitted" ? "ready" : state.chatStatus }));
  },
});
