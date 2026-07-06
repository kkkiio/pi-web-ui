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
import { extractText, processPromptFiles } from "./core/chat-conversion";
import { copyText, formatTime, formatTokens, isEditableTarget } from "./core/format";
import { PiClient } from "./core/pi-client";
import { usePiWebUiStore } from "./core/store";
import { dispatchPiEvent } from "./core/store/event-dispatch";
import type { ChatItem, PromptCommand } from "./core/types";

const DEFAULT_LEFT_SIDEBAR_WIDTH = 320;
const MIN_LEFT_SIDEBAR_WIDTH = 240;
const MAX_LEFT_SIDEBAR_WIDTH = 560;
const MIN_MAIN_CONTENT_WIDTH = 560;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "pi-web-ui-left-sidebar-width";

export function App() {
  const items = usePiWebUiStore((state) => state.items);
  const connection = usePiWebUiStore((state) => state.connection);
  const chatStatus = usePiWebUiStore((state) => state.chatStatus);
  const modelLabel = usePiWebUiStore((state) => state.modelLabel);
  const currentModel = usePiWebUiStore((state) => state.currentModel);
  const thinkingLevel = usePiWebUiStore((state) => state.thinkingLevel);
  const sessionName = usePiWebUiStore((state) => state.sessionName);
  const error = usePiWebUiStore((state) => state.error);
  const advancedFeatures = usePiWebUiStore((state) => state.advancedFeatures);
  const archModeEnabled = usePiWebUiStore((state) => state.archModeEnabled);
  const archAvailable = usePiWebUiStore((state) => state.archAvailable);
  const tree = usePiWebUiStore((state) => state.tree);
  const leafId = usePiWebUiStore((state) => state.leafId);
  const selectedTreeEntryId = usePiWebUiStore((state) => state.selectedTreeEntryId);
  const loadingTreeEntryId = usePiWebUiStore((state) => state.loadingTreeEntryId);
  const conversationSyncing = usePiWebUiStore((state) => state.conversationSyncing);
  const conversationSyncError = usePiWebUiStore((state) => state.conversationSyncError);
  const availableModels = usePiWebUiStore((state) => state.availableModels);
  const showThinking = usePiWebUiStore((state) => state.showThinking);
  const autoCompaction = usePiWebUiStore((state) => state.autoCompaction);
  const authConfigured = usePiWebUiStore((state) => state.authConfigured);
  const authEnabled = usePiWebUiStore((state) => state.authEnabled);
  const dialog = usePiWebUiStore((state) => state.dialog);
  const gitStatus = usePiWebUiStore((state) => state.gitStatus);
  const gitLoading = usePiWebUiStore((state) => state.gitLoading);
  const artifacts = usePiWebUiStore((state) => state.artifacts);
  const rightPanelTabs = usePiWebUiStore((state) => state.rightPanelTabs);
  const activeRightPanelTabId = usePiWebUiStore((state) => state.activeRightPanelTabId);
  const rightPanelVisible = usePiWebUiStore((state) => state.rightPanelVisible);
  const rightPanelHasOpened = usePiWebUiStore((state) => state.rightPanelHasOpened);
  const lastUsage = usePiWebUiStore((state) => state.lastUsage);
  const contextWindowSize = usePiWebUiStore((state) => state.contextWindowSize);
  const themeMode = usePiWebUiStore((state) => state.themeMode);
  const abort = usePiWebUiStore((state) => state.abort);
  const addSystemMessage = usePiWebUiStore((state) => state.addSystemMessage);
  const clearConversationTimers = usePiWebUiStore((state) => state.clearConversationTimers);
  const clearWorkspaceTimers = usePiWebUiStore((state) => state.clearWorkspaceTimers);
  const compactSend = usePiWebUiStore((state) => state.send);
  const cycleThinking = usePiWebUiStore((state) => state.cycleThinking);
  const openArtifact = usePiWebUiStore((state) => state.openArtifact);
  const openGitDiff = usePiWebUiStore((state) => state.openGitDiff);
  const refreshAuthState = usePiWebUiStore((state) => state.refreshAuthState);
  const refreshRightPanelTab = usePiWebUiStore((state) => state.refreshRightPanelTab);
  const refreshSettingsState = usePiWebUiStore((state) => state.refreshSettingsState);
  const requestConversationSync = usePiWebUiStore((state) => state.requestConversationSync);
  const renameActiveSession = usePiWebUiStore((state) => state.renameActiveSession);
  const respondDialog = usePiWebUiStore((state) => state.respondDialog);
  const selectModel = usePiWebUiStore((state) => state.selectModel);
  const sendPrompt = usePiWebUiStore((state) => state.sendPrompt);
  const setActiveRightPanelTabId = usePiWebUiStore((state) => state.setActiveRightPanelTabId);
  const setClient = usePiWebUiStore((state) => state.setClient);
  const setConnection = usePiWebUiStore((state) => state.setConnection);
  const setError = usePiWebUiStore((state) => state.setError);
  const setLoadingTreeEntryId = usePiWebUiStore((state) => state.setLoadingTreeEntryId);
  const setSelectedTreeEntryId = usePiWebUiStore((state) => state.setSelectedTreeEntryId);
  const setShowThinking = usePiWebUiStore((state) => state.setShowThinking);
  const setThemeMode = usePiWebUiStore((state) => state.setThemeMode);
  const setThinkingLevel = usePiWebUiStore((state) => state.setThinkingLevel);
  const setAutoCompactionRemote = usePiWebUiStore((state) => state.setAutoCompactionRemote);
  const closeRightPanelTab = usePiWebUiStore((state) => state.closeRightPanelTab);
  const toggleAllTools = usePiWebUiStore((state) => state.toggleAllTools);
  const toggleArchMode = usePiWebUiStore((state) => state.toggleArchMode);
  const toggleAuth = usePiWebUiStore((state) => state.toggleAuth);
  const toggleRightPanelVisible = usePiWebUiStore((state) => state.toggleRightPanelVisible);
  const toggleTool = usePiWebUiStore((state) => state.toggleTool);

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
  const [highlightedEntryId, setHighlightedEntryId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const [queuedMessages, setQueuedMessages] = useState<PromptCommand[]>([]);

  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const pendingFocusEntryIdRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const promptCounterRef = useRef(0);

  const resolvedTheme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;

  const updateLeftSidebarWidth = useCallback((nextWidth: number) => {
    const maxWidth = Math.max(
      MIN_LEFT_SIDEBAR_WIDTH,
      Math.min(MAX_LEFT_SIDEBAR_WIDTH, window.innerWidth - MIN_MAIN_CONTENT_WIDTH),
    );
    setLeftSidebarWidth(Math.min(maxWidth, Math.max(MIN_LEFT_SIDEBAR_WIDTH, Math.round(nextWidth))));
  }, []);

  const nextPromptId = useCallback(() => {
    promptCounterRef.current += 1;
    return `prompt-${Date.now()}-${promptCounterRef.current}`;
  }, []);

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
    void refreshSettingsState();
  }, [refreshSettingsState]);

  useEffect(() => {
    const client = new PiClient({
      onConnectionChange: setConnection,
      onError: setError,
      onEvent: (event) => dispatchPiEvent(usePiWebUiStore.getState(), event),
      onOpen: () => {
        setError(null);
        void usePiWebUiStore.getState().requestConversationSync();
        usePiWebUiStore.getState().requestGitStatusRefresh();
      },
      onPromptResponse: () => usePiWebUiStore.getState().markPromptReady(),
    });
    setClient(client);
    client.connect();

    return () => {
      client.disconnect();
      setClient(null);
      clearConversationTimers();
      clearWorkspaceTimers();
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, [clearConversationTimers, clearWorkspaceTimers, setClient, setConnection, setError]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") usePiWebUiStore.getState().client?.ensureConnected();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

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
        id: nextPromptId(),
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
    [chatStatus, nextPromptId, sendPrompt],
  );

  const openModelPicker = useCallback(async () => {
    setModelOpen(true);
    await refreshSettingsState();
  }, [refreshSettingsState]);

  const selectModelAndClose = useCallback(
    async (model: Parameters<typeof selectModel>[0]) => {
      await selectModel(model);
      setModelOpen(false);
    },
    [selectModel],
  );

  const openSettings = useCallback(async () => {
    setSettingsOpen(true);
    await refreshAuthState();
  }, [refreshAuthState]);

  const compactContext = useCallback(async () => {
    try {
      await compactSend("compact");
      addSystemMessage("Compaction requested");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compaction failed");
    }
  }, [addSystemMessage, compactSend, setError]);

  const exportHtml = useCallback(async () => {
    try {
      const result = (await compactSend("export_html")) as { path?: string } | undefined;
      if (result?.path) addSystemMessage(`Exported: ${result.path}`, "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }, [addSystemMessage, compactSend, setError]);

  const showSessionStats = useCallback(async () => {
    try {
      const stats = (await compactSend("get_session_stats")) as {
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
  }, [addSystemMessage, compactSend, setError]);

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
    [focusEntry, setSelectedTreeEntryId],
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
        const result = (await compactSend("navigate_tree", { entryId })) as
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
    [
      addSystemMessage,
      compactSend,
      draftText,
      requestConversationSync,
      setError,
      setLoadingTreeEntryId,
      setSelectedTreeEntryId,
      tree,
    ],
  );

  const continueBranch = useCallback(
    async (entryId: string) => {
      setSelectedTreeEntryId(entryId);
      setLoadingTreeEntryId(entryId);
      setError(null);
      try {
        const result = (await compactSend("navigate_tree", { entryId })) as { cancelled?: boolean } | undefined;
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
    [compactSend, requestConversationSync, setError, setLoadingTreeEntryId, setSelectedTreeEntryId],
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
                              onToggleTool={toggleTool}
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

          {(rightPanelTabs.length > 0 || rightPanelHasOpened) && (
            <RightPanel
              activeTabId={activeRightPanelTabId}
              onCloseTab={closeRightPanelTab}
              onRefreshTab={refreshRightPanelTab}
              onSelectTab={setActiveRightPanelTabId}
              onToggleVisible={toggleRightPanelVisible}
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
            onSelect={selectModelAndClose}
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
            onSetAutoCompaction={setAutoCompactionRemote}
            onSetTheme={setThemeMode}
            onSetThinking={async (level) => {
              await compactSend("set_thinking_level", { level });
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
