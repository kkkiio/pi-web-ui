import {
  ArchiveIcon,
  BarChart3Icon,
  DownloadIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  TerminalIcon,
  XIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import {
  AppHeader,
  ChatInput,
  ChatItemView,
  CommandPalette,
  ContextPopover,
  ConversationSidebar,
  ExtensionDialogView,
  ModelPicker,
  RightPanel,
  SettingsPanel,
  UserMessageView,
  WorkspaceStatusFloat,
} from "./components/pi-web-ui";
import {
  extractText,
  extractThinking,
  extractToolCalls,
  findLastUsage,
  formatToolOutput,
  processPromptFiles,
  syncToItems,
} from "./core/chat-conversion";
import { copyText, formatTime, formatTokens, isEditableTarget, shortModelName } from "./core/format";
import { isToolExpandable } from "./core/tool-summary";
import type {
  ChatItem,
  ChatSubmitStatus,
  ConnectionState,
  ExtensionDialog,
  FileContentResult,
  GitDiffResult,
  GitStatusResult,
  ModelInfo,
  PromptCommand,
  RightPanelTab,
  RpcEvent,
  SessionTreeNode,
  StateSyncPayload,
  SystemTone,
  ThemeMode,
  Usage,
  WorkspaceArtifact,
  WsError,
  WsEvent,
  WsRequest,
  WsResponse,
} from "./core/types";
import { artifactsFromEntries, artifactsFromToolEvent, mergeArtifacts } from "./core/workspace-artifacts";
import { wsUrl } from "./core/ws";

type PendingWsRequest = {
  method: string;
  request: WsRequest;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const DEFAULT_LEFT_SIDEBAR_WIDTH = 320;
const MIN_LEFT_SIDEBAR_WIDTH = 240;
const MAX_LEFT_SIDEBAR_WIDTH = 560;
const MIN_MAIN_CONTENT_WIDTH = 560;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "pi-web-ui-left-sidebar-width";

export function App() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [chatStatus, setChatStatus] = useState<ChatSubmitStatus>("ready");
  const [modelLabel, setModelLabel] = useState("model");
  const [currentModel, setCurrentModel] = useState<ModelInfo | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState("off");
  const [sessionName, setSessionName] = useState("Pi Web UI");
  const [error, setError] = useState<string | null>(null);
  const [advancedFeatures, setAdvancedFeatures] = useState(false);
  const [archModeEnabled, setArchModeEnabled] = useState(false);
  const [archAvailable, setArchAvailable] = useState(false);

  const [themeMode, setThemeMode] = useState<ThemeMode>(
    () => (localStorage.getItem("pi-web-ui-theme-mode") as ThemeMode | null) || "system",
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches,
  );
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
    const storedWidth = Number(localStorage.getItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY));
    const requestedWidth = Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : DEFAULT_LEFT_SIDEBAR_WIDTH;
    const maxWidth = Math.max(
      MIN_LEFT_SIDEBAR_WIDTH,
      Math.min(MAX_LEFT_SIDEBAR_WIDTH, window.innerWidth - MIN_MAIN_CONTENT_WIDTH),
    );
    return Math.min(maxWidth, Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.round(requestedWidth)));
  });
  const [tree, setTree] = useState<SessionTreeNode[]>([]);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [selectedTreeEntryId, setSelectedTreeEntryId] = useState<string | null>(null);
  const [loadingTreeEntryId, setLoadingTreeEntryId] = useState<string | null>(null);
  const [conversationSyncing, setConversationSyncing] = useState(false);
  const [conversationSyncError, setConversationSyncError] = useState<string | null>(null);
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const [queuedMessages, setQueuedMessages] = useState<PromptCommand[]>([]);

  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [showThinking, setShowThinking] = useState(() => localStorage.getItem("pi-web-ui-show-thinking") !== "false");
  const [autoCompaction, setAutoCompaction] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [dialog, setDialog] = useState<ExtensionDialog | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [artifacts, setArtifacts] = useState<WorkspaceArtifact[]>([]);
  const [rightPanelTabs, setRightPanelTabs] = useState<RightPanelTab[]>([]);
  const [activeRightPanelTabId, setActiveRightPanelTabId] = useState<string | null>(null);
  const [rightPanelVisible, setRightPanelVisible] = useState(false);

  const [lastUsage, setLastUsage] = useState<Usage | null>(null);
  const [contextWindowSize, setContextWindowSize] = useState(0);
  const [contextOpen, setContextOpen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const requestCounterRef = useRef(0);
  const pendingRequestsRef = useRef<Map<string, PendingWsRequest>>(new Map());
  const queuedRequestsRef = useRef<WsRequest[]>([]);
  const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const conversationSyncInFlightRef = useRef(false);
  const conversationSyncPendingRef = useRef(false);
  const conversationSyncTimerRef = useRef<number | null>(null);
  const pendingFocusEntryIdRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const gitRefreshTimerRef = useRef<number | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const streamingHasToolCallRef = useRef(false);
  const itemCounterRef = useRef(0);
  const unreadCountRef = useRef(0);
  const originalTitleRef = useRef(document.title);

  const resolvedTheme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;

  const updateLeftSidebarWidth = useCallback((nextWidth: number) => {
    const maxWidth = Math.max(
      MIN_LEFT_SIDEBAR_WIDTH,
      Math.min(MAX_LEFT_SIDEBAR_WIDTH, window.innerWidth - MIN_MAIN_CONTENT_WIDTH),
    );
    setLeftSidebarWidth(Math.min(maxWidth, Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.round(nextWidth))));
  }, []);

  const nextId = useCallback((prefix: string) => {
    itemCounterRef.current += 1;
    return `${prefix}-${Date.now()}-${itemCounterRef.current}`;
  }, []);

  const addSystemMessage = useCallback(
    (text: string, tone: SystemTone = "info") => {
      setItems((current) => [...current, { kind: "system", id: nextId("system"), text, tone }]);
    },
    [nextId],
  );

  const flushQueuedRequests = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return;
    const queued = queuedRequestsRef.current.splice(0);
    for (const request of queued) ws.send(JSON.stringify(request));
  }, []);

  const send = useCallback(
    (method: string, params?: Record<string, unknown>) =>
      new Promise<unknown>((resolve, reject) => {
        requestCounterRef.current += 1;
        const request: WsRequest = {
          type: "req",
          id: `req-${Date.now()}-${requestCounterRef.current}`,
          method,
          ...(params && { params }),
        };
        pendingRequestsRef.current.set(request.id, { method, request, resolve, reject });
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(request));
        } else {
          queuedRequestsRef.current.push(request);
        }
      }),
    [],
  );

  const refreshState = useCallback(async () => {
    try {
      const [stateResult, modelsResult] = await Promise.allSettled([send("get_state"), send("get_available_models")]);

      if (modelsResult.status === "fulfilled") {
        const data = modelsResult.value as { models?: ModelInfo[] };
        setAvailableModels(data.models || []);
      }

      if (stateResult.status === "fulfilled") {
        const data = (stateResult.value || {}) as {
          model?: ModelInfo;
          thinkingLevel?: string;
          sessionName?: string;
          autoCompactionEnabled?: boolean;
        };
        setCurrentModel(data.model || null);
        setModelLabel(shortModelName(data.model?.id || "model"));
        setThinkingLevel(data.thinkingLevel || "off");
        setSessionName(data.sessionName || "Pi Web UI");
        setAutoCompaction(Boolean(data.autoCompactionEnabled));
        if (data.model?.contextWindow) setContextWindowSize(data.model.contextWindow);
      }
    } catch (err) {
      console.error("[pi-web-ui] get_state failed", err);
    }
  }, [send]);

  const refreshGitStatus = useCallback(async () => {
    setGitLoading(true);
    try {
      setGitStatus((await send("get_git_status")) as GitStatusResult);
    } catch (err) {
      console.error("[pi-web-ui] get_git_status failed", err);
      setGitStatus(null);
    } finally {
      setGitLoading(false);
    }
  }, [send]);

  const requestGitStatusRefresh = useCallback(
    (options?: { debounce?: boolean }) => {
      if (options?.debounce) {
        if (gitRefreshTimerRef.current) window.clearTimeout(gitRefreshTimerRef.current);
        gitRefreshTimerRef.current = window.setTimeout(() => {
          gitRefreshTimerRef.current = null;
          void refreshGitStatus();
        }, 350);
        return;
      }
      void refreshGitStatus();
    },
    [refreshGitStatus],
  );

  const applySync = useCallback(
    (sync: StateSyncPayload) => {
      const parsedItems = syncToItems(sync.entries ?? [], nextId);
      const nextArtifacts = artifactsFromEntries(sync.entries ?? []);
      const nextTree = sync.tree ?? [];
      setItems(parsedItems);
      setTree(nextTree);
      setLeafId(sync.leafId ?? null);
      setSelectedTreeEntryId((current) => {
        if (current) {
          const stack = [...nextTree];
          while (stack.length > 0) {
            const node = stack.pop();
            if (node?.entry.id === current) return current;
            if (node) stack.push(...node.children);
          }
        }
        return sync.leafId ?? null;
      });
      setArtifacts(nextArtifacts);
      setChatStatus(sync.isStreaming ? "streaming" : "ready");
      setConnection("connected");
      setSessionName(sync.sessionName || "Pi Web UI");
      setCurrentModel(sync.model || null);
      setModelLabel(shortModelName(sync.model?.id || "model"));
      setThinkingLevel(sync.thinkingLevel || "off");
      setLastUsage(findLastUsage(sync.entries ?? []));
      if (sync.model?.contextWindow) setContextWindowSize(sync.model.contextWindow);
      setError(null);
      requestGitStatusRefresh({ debounce: true });
    },
    [nextId, requestGitStatusRefresh],
  );

  const requestConversationSync = useCallback(
    async (options?: { debounce?: boolean }) => {
      if (options?.debounce) {
        if (conversationSyncTimerRef.current) window.clearTimeout(conversationSyncTimerRef.current);
        conversationSyncTimerRef.current = window.setTimeout(() => {
          conversationSyncTimerRef.current = null;
          void requestConversationSync();
        }, 250);
        return;
      }

      if (conversationSyncInFlightRef.current) {
        conversationSyncPendingRef.current = true;
        return;
      }

      conversationSyncInFlightRef.current = true;
      setConversationSyncing(true);
      setConversationSyncError(null);
      try {
        const sync = (await send("sync_request")) as StateSyncPayload;
        applySync(sync);
      } catch (err) {
        setConversationSyncError(err instanceof Error ? err.message : "Sync failed");
      } finally {
        conversationSyncInFlightRef.current = false;
        setConversationSyncing(false);
        if (conversationSyncPendingRef.current) {
          conversationSyncPendingRef.current = false;
          window.setTimeout(() => void requestConversationSync(), 0);
        }
      }
    },
    [applySync, send],
  );

  const handleEvent = useCallback(
    (event: RpcEvent) => {
      switch (event.type) {
        case "agent_start":
          setChatStatus("streaming");
          break;

        case "agent_end": {
          const hadToolCall = streamingHasToolCallRef.current;
          const streamingCopyable = !hadToolCall;
          setChatStatus("ready");
          streamingIdRef.current = null;
          streamingHasToolCallRef.current = false;
          setItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.streaming
                ? {
                    ...item,
                    streaming: false,
                    copyable: streamingCopyable,
                    presentation: hadToolCall ? "activity" : "normal",
                  }
                : item,
            ),
          );
          if (document.hidden) {
            unreadCountRef.current += 1;
            document.title = `(${unreadCountRef.current}) ${originalTitleRef.current}`;
          }
          void requestConversationSync({ debounce: true });
          requestGitStatusRefresh({ debounce: true });
          break;
        }

        case "turn_end":
        case "session_tree":
          void requestConversationSync({ debounce: true });
          requestGitStatusRefresh({ debounce: true });
          break;

        case "message_start":
          if (event.message?.role === "assistant") {
            const id = event.message.id || nextId("assistant");
            const hasInitialToolCall = extractToolCalls(event.message.content).length > 0;
            streamingIdRef.current = id;
            streamingHasToolCallRef.current = hasInitialToolCall;
            setItems((current) => [
              ...current,
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
            ]);
          } else if (event.message?.role === "user") {
            const text = extractText(event.message.content);
            if (!text) break;
            setItems((current) => [
              ...current,
              {
                kind: "message",
                id: event.message?.id || nextId("user"),
                role: "user",
                text,
              },
            ]);
          }
          break;

        case "message_update": {
          const messageEvent = event.assistantMessageEvent;
          const delta = messageEvent?.delta || "";
          const id = streamingIdRef.current;
          if (!id) break;
          if (messageEvent?.type === "toolcall_delta") {
            streamingHasToolCallRef.current = true;
            setItems((current) =>
              current.map((item) =>
                item.kind === "message" && item.id === id
                  ? { ...item, copyable: false, presentation: "activity" }
                  : item,
              ),
            );
            break;
          }
          if (!delta) break;
          if (messageEvent?.type !== "text_delta" && messageEvent?.type !== "thinking_delta") break;

          setItems((current) =>
            current.map((item) => {
              if (item.kind !== "message" || item.id !== id) return item;
              if (messageEvent.type === "thinking_delta") {
                return {
                  ...item,
                  reasoning: `${item.reasoning || ""}${delta}`,
                };
              }
              return { ...item, text: `${item.text}${delta}` };
            }),
          );
          break;
        }

        case "message_end": {
          const id = streamingIdRef.current;
          if (!id) break;
          const usage = event.message?.usage;
          const finalText = event.message ? extractText(event.message.content) : undefined;
          const finalReasoning = event.message ? extractThinking(event.message.content) : undefined;
          const finalToolCalls = event.message ? extractToolCalls(event.message.content) : undefined;
          const hasToolCalls = finalToolCalls?.length ? true : streamingHasToolCallRef.current;
          setLastUsage(usage || null);
          setItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.id === id
                ? {
                    ...item,
                    streaming: false,
                    cost: usage?.cost?.total,
                    ...(finalText !== undefined && { text: finalText }),
                    ...(finalReasoning !== undefined && {
                      reasoning: finalReasoning,
                    }),
                    copyable: !hasToolCalls,
                    presentation: hasToolCalls ? "activity" : "normal",
                  }
                : item,
            ),
          );
          streamingIdRef.current = null;
          streamingHasToolCallRef.current = false;
          break;
        }

        case "tool_execution_start":
          if (!event.toolCallId) break;
          streamingHasToolCallRef.current = true;
          setItems((current) => [
            ...current,
            {
              kind: "tool",
              id: event.toolCallId as string,
              name: event.toolName || "tool",
              input: event.args,
              state: "input-streaming",
              open: false,
            },
          ]);
          break;

        case "tool_execution_update":
          if (!event.toolCallId) break;
          setItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? {
                    ...item,
                    output: formatToolOutput(event.partialResult),
                    state: "input-available",
                  }
                : item,
            ),
          );
          break;

        case "tool_execution_end":
          setArtifacts((current) => mergeArtifacts(current, artifactsFromToolEvent(event)));
          requestGitStatusRefresh({ debounce: true });
          if (!event.toolCallId) break;
          setItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? {
                    ...item,
                    output: event.isError ? undefined : formatToolOutput(event.result),
                    errorText: event.isError ? String(formatToolOutput(event.result)) : undefined,
                    state: event.isError ? "output-error" : "output-available",
                  }
                : item,
            ),
          );
          break;

        case "auto_compaction_start":
          addSystemMessage("Compacting context...");
          break;

        case "auto_compaction_end":
          addSystemMessage(`Context compacted${event.summary ? `: ${event.summary}` : ""}`, "success");
          setLastUsage(null);
          setContextOpen(false);
          break;

        case "extension_ui_request":
          if (event.id && event.method) {
            setDialog({
              id: event.id,
              method: event.method,
              title: event.title,
              message: event.message as string | undefined,
              options: event.options,
              timeout: event.timeout,
              placeholder: event.placeholder,
              prefill: event.prefill,
            });
          }
          break;

        case "extension_error":
          addSystemMessage(`Extension error: ${event.error || "Unknown error"}`, "error");
          break;

        case "session_name":
          if (event.name) setSessionName(event.name);
          break;

        case "auth_changed":
          setAuthEnabled(Boolean(event.enabled));
          break;

        case "arch:state-changed":
          setArchModeEnabled(Boolean(event.enabled));
          break;

        case "model_select":
          if (event.model) {
            setCurrentModel(event.model);
            setModelLabel(shortModelName(event.model.id));
            if (event.model.contextWindow) setContextWindowSize(event.model.contextWindow);
          }
          break;

        default:
          break;
      }
    },
    [addSystemMessage, nextId, requestConversationSync, requestGitStatusRefresh],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    localStorage.setItem("pi-web-ui-theme-mode", themeMode);
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme, themeMode]);

  useEffect(() => {
    localStorage.setItem("pi-web-ui-show-thinking", String(showThinking));
  }, [showThinking]);

  useEffect(() => {
    localStorage.setItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY, String(leftSidebarWidth));
  }, [leftSidebarWidth]);

  useEffect(() => {
    const handleResize = () => {
      setLeftSidebarWidth((current) => {
        const maxWidth = Math.max(
          MIN_LEFT_SIDEBAR_WIDTH,
          Math.min(MAX_LEFT_SIDEBAR_WIDTH, window.innerWidth - MIN_MAIN_CONTENT_WIDTH),
        );
        return Math.min(maxWidth, Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.round(current)));
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  useEffect(() => {
    let intentionallyClosed = false;

    const connect = () => {
      setConnection("connecting");
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        setConnection("connected");
        setError(null);
        flushQueuedRequests();
        void requestConversationSync();
        requestGitStatusRefresh();
      };

      ws.onmessage = (messageEvent) => {
        if (wsRef.current !== ws) return;
        try {
          const data = JSON.parse(messageEvent.data) as WsResponse | WsEvent | WsError;
          if (data.type === "res") {
            const pending = pendingRequestsRef.current.get(data.id);
            if (!pending) return;
            pendingRequestsRef.current.delete(data.id);
            if (data.ok) {
              pending.resolve(data.result);
              if (pending.method === "prompt") {
                setChatStatus((current) => (current === "submitted" ? "ready" : current));
              }
            } else {
              pending.reject(new Error(data.error || "Request failed"));
            }
          } else if (data.type === "event") {
            const payload = data.payload ?? {};
            if (data.event === "state_sync") {
              applySync(payload as StateSyncPayload);
            } else if (data.event === "webui_state") {
              if (typeof payload.advancedFeatures === "boolean") setAdvancedFeatures(payload.advancedFeatures);
              if (typeof payload.archAvailable === "boolean") setArchAvailable(payload.archAvailable);
            } else {
              handleEvent({ type: data.event, ...payload } as RpcEvent);
            }
          } else if (data.type === "error") {
            setError(data.message || "Server error");
          } else {
            const fallback = data as unknown as { type?: string };
            if (fallback.type) {
              setChatStatus((current) => {
                return current;
              });
            }
          }
        } catch (err) {
          console.error("[pi-web-ui] Failed to parse WebSocket message", err);
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setError("WebSocket error");
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setConnection("disconnected");
        wsRef.current = null;
        if (!intentionallyClosed) {
          reconnectTimerRef.current = window.setTimeout(connect, 1200);
        }
      };
    };

    connect();

    return () => {
      intentionallyClosed = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (conversationSyncTimerRef.current) window.clearTimeout(conversationSyncTimerRef.current);
      if (gitRefreshTimerRef.current) window.clearTimeout(gitRefreshTimerRef.current);
      wsRef.current?.close();
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, [applySync, flushQueuedRequests, handleEvent, requestConversationSync, requestGitStatusRefresh]);

  useEffect(() => {
    const onFocus = () => {
      unreadCountRef.current = 0;
      document.title = originalTitleRef.current;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && wsRef.current?.readyState !== WebSocket.OPEN) {
        wsRef.current?.close();
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const sendPrompt = useCallback(
    async (command: PromptCommand) => {
      setChatStatus("submitted");
      setError(null);

      try {
        await send("prompt", {
          message: command.message,
          images: command.images,
        });
      } catch (err) {
        setChatStatus("error");
        setError(err instanceof Error ? err.message : "Prompt failed");
      }
    },
    [send],
  );

  useEffect(() => {
    if (chatStatus !== "ready" || queuedMessages.length === 0) return;
    const [next, ...rest] = queuedMessages;
    setQueuedMessages(rest);
    sendPrompt(next);
  }, [chatStatus, queuedMessages, sendPrompt]);

  const submitMessage = useCallback(
    async ({ text, files }: { text: string; files?: unknown[] }) => {
      const trimmed = text.trim();
      const images = await processPromptFiles(files);
      if (!trimmed && images.length === 0) return;

      const command: PromptCommand = {
        id: nextId("prompt"),
        message: trimmed || "(see attached image)",
        images: images.length ? images : undefined,
      };

      if (chatStatus === "streaming" || chatStatus === "submitted") {
        setQueuedMessages((current) => [...current, command]);
        setDraftText("");
        return;
      }

      await sendPrompt(command);
      setDraftText("");
    },
    [chatStatus, nextId, sendPrompt],
  );

  const abort = useCallback(async () => {
    try {
      await send("abort");
      setChatStatus("ready");
      addSystemMessage("Aborted by user", "error");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Abort failed");
    }
  }, [addSystemMessage, send]);

  const cycleThinking = useCallback(async () => {
    try {
      const result = (await send("cycle_thinking_level")) as { level?: string; thinkingLevel?: string } | undefined;
      setThinkingLevel(result?.level || result?.thinkingLevel || "off");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change thinking level");
    }
  }, [send]);

  const openModelPicker = useCallback(async () => {
    setModelOpen(true);
    await refreshState();
  }, [refreshState]);

  const selectModel = useCallback(
    async (model: ModelInfo) => {
      try {
        await send("set_model", {
          provider: model.provider,
          modelId: model.id,
        });
        setCurrentModel(model);
        setModelLabel(shortModelName(model.id));
        if (model.contextWindow) setContextWindowSize(model.contextWindow);
        setModelOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to switch model");
      }
    },
    [send],
  );

  const openSettings = useCallback(async () => {
    setSettingsOpen(true);
    await refreshState();
    try {
      const result = (await send("get_auth")) as { configured?: boolean; enabled?: boolean } | undefined;
      setAuthConfigured(Boolean(result?.configured));
      setAuthEnabled(Boolean(result?.enabled));
    } catch {
      setAuthConfigured(false);
    }
  }, [refreshState, send]);

  const toggleAuth = useCallback(async () => {
    try {
      const result = (await send("set_auth", { enabled: !authEnabled })) as { enabled?: boolean } | undefined;
      setAuthEnabled(Boolean(result?.enabled));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update auth");
    }
  }, [authEnabled, send]);

  const compactContext = useCallback(async () => {
    try {
      await send("compact");
      addSystemMessage("Compaction requested");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compaction failed");
    }
  }, [addSystemMessage, send]);

  const exportHtml = useCallback(async () => {
    try {
      const result = (await send("export_html")) as { path?: string } | undefined;
      if (result?.path) addSystemMessage(`Exported: ${result.path}`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }, [addSystemMessage, send]);

  const upsertRightPanelTab = useCallback((tab: RightPanelTab) => {
    setRightPanelTabs((current) => {
      const index = current.findIndex((candidate) => candidate.id === tab.id);
      if (index === -1) return [...current, tab];
      return current.map((candidate) => (candidate.id === tab.id ? { ...candidate, ...tab } : candidate));
    });
    setActiveRightPanelTabId(tab.id);
    setRightPanelVisible(true);
  }, []);

  const openGitDiff = useCallback(async () => {
    const startedAt = Date.now();
    upsertRightPanelTab({
      id: "git-diff",
      kind: "git-diff",
      title: "Changes",
      branch: gitStatus?.branch ?? null,
      isRepo: gitStatus?.isRepo,
      loading: true,
      updatedAt: startedAt,
    });
    try {
      const result = (await send("get_git_diff")) as GitDiffResult;
      upsertRightPanelTab({
        id: "git-diff",
        kind: "git-diff",
        title: "Changes",
        branch: result.branch,
        diff: result.diff,
        isRepo: result.isRepo,
        loading: false,
        updatedAt: Date.now(),
      });
    } catch (err) {
      upsertRightPanelTab({
        id: "git-diff",
        kind: "git-diff",
        title: "Changes",
        branch: gitStatus?.branch ?? null,
        isRepo: gitStatus?.isRepo,
        error: err instanceof Error ? err.message : "Failed to load git diff",
        loading: false,
        updatedAt: Date.now(),
      });
    }
  }, [gitStatus?.branch, gitStatus?.isRepo, send, upsertRightPanelTab]);

  const openArtifact = useCallback(
    async (artifact: WorkspaceArtifact) => {
      upsertRightPanelTab({
        id: `artifact:${artifact.path}`,
        kind: "artifact-file",
        title: artifact.name,
        path: artifact.path,
        loading: true,
        updatedAt: Date.now(),
      });
      try {
        const result = (await send("get_file_content", { path: artifact.path })) as FileContentResult;
        upsertRightPanelTab({
          id: `artifact:${artifact.path}`,
          kind: "artifact-file",
          title: result.name || artifact.name,
          path: result.path || artifact.path,
          content: result.content,
          size: result.size,
          loading: false,
          updatedAt: Date.now(),
        });
      } catch (err) {
        upsertRightPanelTab({
          id: `artifact:${artifact.path}`,
          kind: "artifact-file",
          title: artifact.name,
          path: artifact.path,
          error: err instanceof Error ? err.message : "Failed to load artifact",
          loading: false,
          updatedAt: Date.now(),
        });
      }
    },
    [send, upsertRightPanelTab],
  );

  const refreshRightPanelTab = useCallback(
    (tab: RightPanelTab) => {
      if (tab.kind === "git-diff") {
        void openGitDiff();
        return;
      }
      void openArtifact({
        id: tab.path,
        path: tab.path,
        name: tab.title,
        directory: tab.path.includes("/") ? tab.path.slice(0, tab.path.lastIndexOf("/")) : ".",
        tool: "edit",
        updatedAt: Date.now(),
      });
    },
    [openArtifact, openGitDiff],
  );

  const closeRightPanelTab = useCallback((id: string) => {
    setRightPanelTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      setActiveRightPanelTabId((activeId) => {
        if (activeId !== id)
          return activeId && next.some((tab) => tab.id === activeId) ? activeId : (next[0]?.id ?? null);
        return next[index]?.id ?? next[index - 1]?.id ?? null;
      });
      if (next.length === 0) setRightPanelVisible(false);
      return next;
    });
  }, []);

  const showSessionStats = useCallback(async () => {
    try {
      const stats = (await send("get_session_stats")) as {
        totalMessages?: number;
        userMessages?: number;
        assistantMessages?: number;
        toolCalls?: number;
        tokens?: { input?: number; total?: number };
      };
      addSystemMessage(
        [
          "Session stats",
          `Messages: ${stats.totalMessages} (${stats.userMessages} user, ${stats.assistantMessages} assistant)`,
          `Tool calls: ${stats.toolCalls}`,
          stats.tokens ? `Context: ~${formatTokens(stats.tokens.input || stats.tokens.total || 0)} tokens` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stats failed");
    }
  }, [addSystemMessage, send]);

  const toggleArchMode = useCallback(() => {
    send(archModeEnabled ? "exit_arch_mode" : "enter_arch_mode").catch((err) =>
      setError(err instanceof Error ? err.message : "Arch mode toggle failed"),
    );
  }, [archModeEnabled, send]);

  const toggleAllTools = useCallback((open: boolean) => {
    setItems((current) =>
      current.map((item) => (item.kind === "tool" && isToolExpandable(item) ? { ...item, open } : item)),
    );
  }, []);

  const renameActiveSession = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        await send("set_session_name", { name: trimmed });
        setSessionName(trimmed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rename failed");
      }
    },
    [send],
  );

  const respondDialog = useCallback(
    (response: Record<string, unknown>) => {
      if (!dialog) return;
      send("extension_ui_response", { id: dialog.id, ...response }).catch(() => {});
      setDialog(null);
    },
    [dialog, send],
  );

  useEffect(() => {
    if (!dialog?.timeout) return;
    const timeout = window.setTimeout(() => respondDialog({ cancelled: true }), dialog.timeout);
    return () => window.clearTimeout(timeout);
  }, [dialog, respondDialog]);

  const registerItemElement = useCallback((item: ChatItem, node: HTMLElement | null) => {
    const ids = [item.entryId, ...(item.relatedEntryIds ?? [])].filter((value): value is string => Boolean(value));
    for (const id of ids) {
      if (node) itemElementsRef.current.set(id, node);
      else itemElementsRef.current.delete(id);
    }
  }, []);

  const findVisibleEntryId = useCallback(
    (entryId: string) => {
      const byId = new Map<string, { parentId?: string | null }>();
      const stack = [...tree];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node?.entry.id) continue;
        byId.set(node.entry.id, { parentId: node.entry.parentId });
        stack.push(...node.children);
      }

      let cursor: string | null | undefined = entryId;
      while (cursor) {
        if (itemElementsRef.current.has(cursor)) return cursor;
        cursor = byId.get(cursor)?.parentId ?? null;
      }
      return null;
    },
    [tree],
  );

  const focusEntry = useCallback(
    (entryId: string) => {
      const visibleEntryId = findVisibleEntryId(entryId);
      if (!visibleEntryId) return false;
      const element = itemElementsRef.current.get(visibleEntryId);
      if (!element) return false;
      let scrollContainer: HTMLElement | null = null;
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body) {
        const style = window.getComputedStyle(ancestor);
        if (style.overflowY === "hidden" && ancestor.scrollTop !== 0) ancestor.scrollTop = 0;
        if (
          !scrollContainer &&
          ["auto", "scroll"].includes(style.overflowY) &&
          ancestor.scrollHeight > ancestor.clientHeight
        ) {
          scrollContainer = ancestor;
        }
        ancestor = ancestor.parentElement;
      }
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const targetTop =
          scrollContainer.scrollTop +
          elementRect.top -
          containerRect.top -
          (containerRect.height - elementRect.height) / 2;
        scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      }
      setHighlightedEntryId(visibleEntryId);
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => setHighlightedEntryId(null), 1200);
      return true;
    },
    [findVisibleEntryId],
  );

  useEffect(() => {
    const targetEntryId = pendingFocusEntryIdRef.current;
    if (!targetEntryId) return;
    if (focusEntry(targetEntryId)) pendingFocusEntryIdRef.current = null;
  }, [focusEntry]);

  const selectTreeEntry = useCallback(
    (entryId: string) => {
      setSelectedTreeEntryId(entryId);
      focusEntry(entryId);
    },
    [focusEntry],
  );

  const branchFromMessage = useCallback(
    async (entryId: string) => {
      if (draftText.trim() && !window.confirm("Replace the current draft with this message?")) return;
      let timestamp = "";
      let fallbackText = "";
      const stack = [...tree];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        if (node.entry.id === entryId) {
          timestamp = typeof node.entry.timestamp === "string" ? node.entry.timestamp : "";
          fallbackText = extractText(node.entry.message?.content);
          break;
        }
        stack.push(...node.children);
      }

      pendingFocusEntryIdRef.current = entryId;
      setSelectedTreeEntryId(entryId);
      setLoadingTreeEntryId(entryId);
      setError(null);
      try {
        const result = (await send("navigate_tree", { entryId })) as
          | { editorText?: string; cancelled?: boolean }
          | undefined;
        if (result?.cancelled) {
          pendingFocusEntryIdRef.current = null;
          return;
        }
        await requestConversationSync();
        setDraftText(result?.editorText ?? fallbackText);
        addSystemMessage(
          `Branching from ${formatTime(timestamp) || "selected message"}. Previous branch is preserved in this session.`,
        );
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
          input?.focus();
          input?.setSelectionRange(input.value.length, input.value.length);
        });
      } catch (err) {
        pendingFocusEntryIdRef.current = null;
        setError(err instanceof Error ? err.message : "Branch failed");
      } finally {
        setLoadingTreeEntryId(null);
      }
    },
    [addSystemMessage, draftText, requestConversationSync, send, tree],
  );

  const continueBranch = useCallback(
    async (entryId: string) => {
      setSelectedTreeEntryId(entryId);
      setLoadingTreeEntryId(entryId);
      setError(null);
      try {
        const result = (await send("navigate_tree", { entryId })) as { cancelled?: boolean } | undefined;
        if (result?.cancelled) return;
        await requestConversationSync();
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
          input?.focus();
          input?.setSelectionRange(input.value.length, input.value.length);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Continue branch failed");
      } finally {
        setLoadingTreeEntryId(null);
      }
    },
    [requestConversationSync, send],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      } else if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
      } else if (event.key === "Escape") {
        if (commandOpen) setCommandOpen(false);
        else if (modelOpen) setModelOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (chatStatus === "streaming") abort();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [abort, chatStatus, commandOpen, modelOpen, settingsOpen]);

  const totalCost = useMemo(
    () => items.reduce((sum, item) => sum + (item.kind === "message" ? item.cost || 0 : 0), 0),
    [items],
  );

  const usedContextTokens = (lastUsage?.input || 0) + (lastUsage?.cacheRead || 0);
  const contextPercent = contextWindowSize > 0 ? Math.round((usedContextTokens / contextWindowSize) * 100) : 0;
  const shouldSuggestCompaction = contextPercent >= 80;
  const rightPanelOpen = rightPanelVisible && rightPanelTabs.length > 0;

  const commandActions = [
    {
      label: "Compact",
      desc: "Compact context to save tokens",
      icon: ArchiveIcon,
      action: compactContext,
    },
    {
      label: "Export HTML",
      desc: "Export current session as HTML",
      icon: DownloadIcon,
      action: exportHtml,
    },
    {
      label: "Session Stats",
      desc: "Show message and tool call counts",
      icon: BarChart3Icon,
      action: showSessionStats,
    },
    {
      label: "Expand All Tools",
      desc: "Open every tool card",
      icon: PanelLeftOpenIcon,
      action: () => toggleAllTools(true),
    },
    {
      label: "Collapse All Tools",
      desc: "Close every tool card",
      icon: PanelLeftCloseIcon,
      action: () => toggleAllTools(false),
    },
  ];

  return (
    <SidebarProvider
      className="h-full min-h-0 bg-background text-foreground"
      onOpenChange={setSidebarOpen}
      open={sidebarOpen}
      style={{ "--sidebar-width": `${leftSidebarWidth}px` } as CSSProperties}
    >
      <ConversationSidebar
        branchEnabled={advancedFeatures}
        connection={connection}
        leafId={leafId}
        loadingEntryId={loadingTreeEntryId}
        onBranchTree={branchFromMessage}
        onContinueTree={continueBranch}
        onOpenSettings={openSettings}
        onRefreshTree={() => void requestConversationSync()}
        onResizeSidebar={updateLeftSidebarWidth}
        onSelectTree={selectTreeEntry}
        selectedEntryId={selectedTreeEntryId}
        syncError={conversationSyncError}
        syncing={conversationSyncing}
        tree={tree}
      />

      <SidebarInset className="h-full min-h-0">
        <AppHeader
          connection={connection}
          contextPercent={contextPercent}
          contextWindowSize={contextWindowSize}
          isViewingOtherSession={false}
          modelLabel={modelLabel}
          onCompactContext={compactContext}
          onCycleThinking={cycleThinking}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onOpenModelPicker={openModelPicker}
          onReturnToLive={() => void requestConversationSync()}
          onToggleContext={() => setContextOpen((open) => !open)}
          shouldSuggestCompaction={shouldSuggestCompaction}
          thinkingLevel={thinkingLevel}
          title={sessionName}
          totalCost={totalCost}
        />

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Conversation className="h-full">
                <ConversationContent className="mx-auto w-full max-w-3xl gap-3 px-4 py-6">
                  {items.length === 0 ? (
                    <ConversationEmptyState
                      description="Connect to the running Pi session and send a message."
                      icon={<TerminalIcon className="size-7" />}
                      title="Pi Web UI"
                    />
                  ) : (
                    items.map((item) => {
                      const highlighted = [item.entryId, ...(item.relatedEntryIds ?? [])].includes(
                        highlightedEntryId ?? "",
                      );
                      return (
                        <div
                          className={cn(
                            "rounded-lg transition-[background-color,box-shadow] duration-300",
                            highlighted && "bg-primary/10 ring-1 ring-primary/40",
                          )}
                          key={item.id}
                          ref={(node) => registerItemElement(item, node)}
                        >
                          {item.kind === "message" && item.role === "user" ? (
                            <UserMessageView
                              actionsVisible={highlighted}
                              item={item as typeof item & { kind: "message"; role: "user" }}
                              onBranch={advancedFeatures && item.entryId ? branchFromMessage : undefined}
                              onCopy={(text) => copyText(text)}
                            />
                          ) : (
                            <ChatItemView
                              item={item}
                              onCopy={(text) => copyText(text)}
                              onToggleTool={(id, open) =>
                                setItems((current) =>
                                  current.map((candidate) =>
                                    candidate.kind === "tool" && candidate.id === id
                                      ? { ...candidate, open }
                                      : candidate,
                                  ),
                                )
                              }
                              showThinking={showThinking}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>

              {contextOpen && (
                <ContextPopover
                  contextWindowSize={contextWindowSize}
                  lastUsage={lastUsage}
                  onClose={() => setContextOpen(false)}
                />
              )}
              {!rightPanelOpen && !contextOpen && (
                <WorkspaceStatusFloat
                  artifacts={artifacts}
                  gitLoading={gitLoading}
                  gitStatus={gitStatus}
                  onOpenArtifact={openArtifact}
                  onOpenGitDiff={openGitDiff}
                />
              )}
            </div>

            {queuedMessages.length > 0 && (
              <div className="mx-auto w-full max-w-3xl px-4 pt-2">
                <div className="flex flex-wrap gap-2">
                  {queuedMessages.map((queued) => (
                    <div
                      className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs"
                      key={queued.id}
                    >
                      <span className="text-muted-foreground">Queued</span>
                      <span className="max-w-72 truncate">{queued.message}</span>
                      <button
                        onClick={() =>
                          setQueuedMessages((current) => current.filter((candidate) => candidate.id !== queued.id))
                        }
                        type="button"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="mx-auto w-full max-w-3xl px-4 py-2">
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {error}
                </div>
              </div>
            )}

            <ChatInput
              archAvailable={archAvailable}
              archModeEnabled={archModeEnabled}
              chatStatus={chatStatus}
              connection={connection}
              onAbort={abort}
              onSubmit={submitMessage}
              onToggleArchMode={toggleArchMode}
              onValueChange={setDraftText}
              value={draftText}
              viewingHistory={false}
            />
          </div>

          {rightPanelTabs.length > 0 && (
            <RightPanel
              activeTabId={activeRightPanelTabId}
              onCloseTab={closeRightPanelTab}
              onRefreshTab={refreshRightPanelTab}
              onSelectTab={setActiveRightPanelTabId}
              onToggleVisible={() => setRightPanelVisible((visible) => !visible)}
              tabs={rightPanelTabs}
              visible={rightPanelVisible}
            />
          )}
        </div>

        {modelOpen && (
          <ModelPicker
            currentModel={currentModel}
            models={availableModels}
            onClose={() => setModelOpen(false)}
            onSelect={selectModel}
            query={modelSearch}
            setQuery={setModelSearch}
          />
        )}
        {settingsOpen && (
          <SettingsPanel
            authConfigured={authConfigured}
            authEnabled={authEnabled}
            autoCompaction={autoCompaction}
            onClose={() => setSettingsOpen(false)}
            onRenameSession={renameActiveSession}
            onSetAutoCompaction={async (enabled) => {
              setAutoCompaction(enabled);
              await send("set_auto_compaction", { enabled });
            }}
            onSetTheme={setThemeMode}
            onSetThinking={async (level) => {
              await send("set_thinking_level", { level });
              setThinkingLevel(level);
            }}
            onToggleAuth={toggleAuth}
            sessionName={sessionName}
            showThinking={showThinking}
            setShowThinking={setShowThinking}
            themeMode={themeMode}
            thinkingLevel={thinkingLevel}
          />
        )}
        {commandOpen && <CommandPalette commands={commandActions} onClose={() => setCommandOpen(false)} />}
        {dialog && (
          <ExtensionDialogView
            dialog={dialog}
            onCancel={() => respondDialog({ cancelled: true })}
            onRespond={respondDialog}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
