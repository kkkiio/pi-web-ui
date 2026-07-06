import {
  extractText,
  extractThinking,
  extractToolCalls,
  findLastUsage,
  formatToolOutput,
  syncToItems,
} from "../chat-conversion";
import { isToolExpandable } from "../tool-summary";
import type { ChatItem } from "../types";
import { artifactsFromEntries } from "../workspace-artifacts";
import type { SessionSlice, StoreSlice } from "./types";

let conversationSyncInFlight = false;
let conversationSyncPending = false;
let conversationSyncTimer: number | null = null;
let streamingId: string | null = null;
let streamingHasToolCall = false;
let itemCounter = 0;

function nextId(prefix: string) {
  itemCounter += 1;
  return `${prefix}-${Date.now()}-${itemCounter}`;
}

export const createSessionSlice: StoreSlice<SessionSlice> = (set, get) => ({
  items: [],
  chatStatus: "ready",
  tree: [],
  leafId: null,
  selectedTreeEntryId: null,
  loadingTreeEntryId: null,
  conversationSyncing: false,
  conversationSyncError: null,
  lastUsage: null,
  contextWindowSize: 0,

  addSystemMessage: (text, tone = "info") => {
    set((state) => ({ items: [...state.items, { kind: "system", id: nextId("system"), text, tone }] }));
  },

  applyStateSync: (sync) => {
    const entries = sync.entries ?? [];
    const items = syncToItems(entries, nextId);
    const artifacts = artifactsFromEntries(entries);
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
      artifacts,
      chatStatus: sync.isStreaming ? "streaming" : "ready",
      connection: "connected",
      contextWindowSize: sync.model?.contextWindow || get().contextWindowSize,
      currentModel: sync.model || null,
      error: null,
      items,
      lastUsage: findLastUsage(entries),
      leafId: sync.leafId ?? null,
      modelLabel: sync.model?.id ? sync.model.id.split("/").pop() || sync.model.id : "model",
      selectedTreeEntryId,
      sessionName: sync.sessionName || "Pi Web UI",
      thinkingLevel: sync.thinkingLevel || "off",
      tree,
    });
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
    const hadToolCall = streamingHasToolCall;
    set((state) => ({
      chatStatus: "ready",
      items: state.items.map((item) =>
        item.kind === "message" && item.streaming
          ? {
              ...item,
              copyable: !hadToolCall,
              presentation: hadToolCall ? "activity" : "normal",
              streaming: false,
            }
          : item,
      ),
    }));
    streamingId = null;
    streamingHasToolCall = false;
    void get().requestConversationSync({ debounce: true });
    get().requestGitStatusRefresh({ debounce: true });
  },

  applyMessageStart: (event) => {
    if (event.message?.role === "assistant") {
      const id = event.message.id || nextId("assistant");
      const hasInitialToolCall = extractToolCalls(event.message.content).length > 0;
      streamingId = id;
      streamingHasToolCall = hasInitialToolCall;
      set((state) => ({
        items: [
          ...state.items,
          {
            kind: "message",
            id,
            role: "assistant",
            text: extractText(event.message?.content),
            reasoning: extractThinking(event.message?.content),
            streaming: true,
            copyable: false,
            presentation: hasInitialToolCall ? "activity" : "normal",
          },
        ],
      }));
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
    const delta = messageEvent?.delta || "";
    const id = streamingId;
    if (!id) return;
    if (messageEvent?.type === "toolcall_delta") {
      streamingHasToolCall = true;
      set((state) => ({
        items: state.items.map((item) =>
          item.kind === "message" && item.id === id ? { ...item, copyable: false, presentation: "activity" } : item,
        ),
      }));
      return;
    }
    if (!delta || (messageEvent?.type !== "text_delta" && messageEvent?.type !== "thinking_delta")) return;

    set((state) => ({
      items: state.items.map((item) => {
        if (item.kind !== "message" || item.id !== id) return item;
        if (messageEvent.type === "thinking_delta") return { ...item, reasoning: `${item.reasoning || ""}${delta}` };
        return { ...item, text: `${item.text}${delta}` };
      }),
    }));
  },

  applyMessageEnd: (event) => {
    const id = streamingId;
    if (!id) return;
    const usage = event.message?.usage;
    const finalText = event.message ? extractText(event.message.content) : undefined;
    const finalReasoning = event.message ? extractThinking(event.message.content) : undefined;
    const finalToolCalls = event.message ? extractToolCalls(event.message.content) : undefined;
    const hasToolCalls = finalToolCalls?.length ? true : streamingHasToolCall;

    set((state) => ({
      items: state.items.map((item) =>
        item.kind === "message" && item.id === id
          ? {
              ...item,
              ...(finalReasoning !== undefined && { reasoning: finalReasoning }),
              ...(finalText !== undefined && { text: finalText }),
              copyable: !hasToolCalls,
              cost: usage?.cost?.total,
              presentation: hasToolCalls ? "activity" : "normal",
              streaming: false,
            }
          : item,
      ),
      lastUsage: usage || null,
    }));
    streamingId = null;
    streamingHasToolCall = false;
  },

  applyToolExecutionStart: (event) => {
    if (!event.toolCallId) return;
    streamingHasToolCall = true;
    set((state) => ({
      items: [
        ...state.items,
        {
          kind: "tool",
          id: event.toolCallId as string,
          name: event.toolName || "tool",
          input: event.args,
          state: "input-streaming",
          open: false,
        } satisfies ChatItem,
      ],
    }));
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
    get().mergeArtifactsFromToolEvent(event);
    get().requestGitStatusRefresh({ debounce: true });
    if (!event.toolCallId) return;
    set((state) => ({
      items: state.items.map((item) =>
        item.kind === "tool" && item.id === event.toolCallId
          ? {
              ...item,
              errorText: event.isError ? String(formatToolOutput(event.result)) : undefined,
              output: event.isError ? undefined : formatToolOutput(event.result),
              state: event.isError ? "output-error" : "output-available",
            }
          : item,
      ),
    }));
  },

  markPromptReady: () => {
    set((state) => ({ chatStatus: state.chatStatus === "submitted" ? "ready" : state.chatStatus }));
  },
});
