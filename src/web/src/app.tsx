import { TerminalIcon, XIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  AppHeader,
  ChatInput,
  ChatItemView,
  ContextPopover,
  ConversationSidebar,
  ExtensionDialogView,
  ModelPicker,
  RightPanel,
  SettingsPanel,
  UserMessageView,
} from "./components/pi-web-ui";
import { processPromptFiles } from "./core/chat-conversion";
import { copyText, isEditableTarget } from "./core/format";
import { PiClient } from "./core/pi-client";
import { usePiWebUiStore } from "./core/store";
import { dispatchPiEvent } from "./core/store/event-dispatch";
import type { PromptCommand } from "./core/types";

/** Jump to the latest message when a session's content first fills in
 * (attach / session switch) — StickToBottom's `initial` only covers the
 * very first mount, and content arrives asynchronously via state_sync. */
function ScrollToLatestOnFill({ filled }: { filled: boolean }) {
  const { scrollToBottom } = useStickToBottomContext();
  useEffect(() => {
    if (!filled) return;
    void scrollToBottom({ animation: "instant", wait: 100, ignoreEscapes: true });
  }, [filled, scrollToBottom]);
  return null;
}

const DEFAULT_LEFT_SIDEBAR_WIDTH = 320;
const MIN_LEFT_SIDEBAR_WIDTH = 240;
const MAX_LEFT_SIDEBAR_WIDTH = 560;
const MIN_MAIN_CONTENT_WIDTH = 560;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "pi-web-ui-left-sidebar-width";

export function App() {
  const items = usePiWebUiStore((state) => state.items);
  const connection = usePiWebUiStore((state) => state.connection);
  const liveSessions = usePiWebUiStore((state) => state.liveSessions);
  const attachedAgentId = usePiWebUiStore((state) => state.attachedAgentId);
  const chatStatus = usePiWebUiStore((state) => state.chatStatus);
  const modelLabel = usePiWebUiStore((state) => state.modelLabel);
  const currentModel = usePiWebUiStore((state) => state.currentModel);
  const thinkingLevel = usePiWebUiStore((state) => state.thinkingLevel);
  const sessionName = usePiWebUiStore((state) => state.sessionName);
  const error = usePiWebUiStore((state) => state.error);
  const archModeEnabled = usePiWebUiStore((state) => state.archModeEnabled);
  const archAvailable = usePiWebUiStore((state) => state.archAvailable);
  const availableModels = usePiWebUiStore((state) => state.availableModels);
  const showThinking = usePiWebUiStore((state) => state.showThinking);
  const autoCompaction = usePiWebUiStore((state) => state.autoCompaction);
  const authConfigured = usePiWebUiStore((state) => state.authConfigured);
  const authEnabled = usePiWebUiStore((state) => state.authEnabled);
  const dialog = usePiWebUiStore((state) => state.dialog);
  const gitStatus = usePiWebUiStore((state) => state.gitStatus);
  const gitLoading = usePiWebUiStore((state) => state.gitLoading);
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
  const openGitDiff = usePiWebUiStore((state) => state.openGitDiff);
  const refreshAuthState = usePiWebUiStore((state) => state.refreshAuthState);
  const refreshRightPanelTab = usePiWebUiStore((state) => state.refreshRightPanelTab);
  const refreshSettingsState = usePiWebUiStore((state) => state.refreshSettingsState);
  const requestConversationSync = usePiWebUiStore((state) => state.requestConversationSync);
  const renameActiveSession = usePiWebUiStore((state) => state.renameActiveSession);
  const respondDialog = usePiWebUiStore((state) => state.respondDialog);
  const selectModel = usePiWebUiStore((state) => state.selectModel);
  const sendPrompt = usePiWebUiStore((state) => state.sendPrompt);
  const switchAgent = usePiWebUiStore((state) => state.switchAgent);
  const setActiveRightPanelTabId = usePiWebUiStore((state) => state.setActiveRightPanelTabId);
  const setClient = usePiWebUiStore((state) => state.setClient);
  const setConnection = usePiWebUiStore((state) => state.setConnection);
  const setError = usePiWebUiStore((state) => state.setError);
  const setShowThinking = usePiWebUiStore((state) => state.setShowThinking);
  const setThemeMode = usePiWebUiStore((state) => state.setThemeMode);
  const setThinkingLevel = usePiWebUiStore((state) => state.setThinkingLevel);
  const setAutoCompactionRemote = usePiWebUiStore((state) => state.setAutoCompactionRemote);
  const closeRightPanelTab = usePiWebUiStore((state) => state.closeRightPanelTab);
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
  const [draftText, setDraftText] = useState("");

  const [queuedMessages, setQueuedMessages] = useState<PromptCommand[]>([]);

  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

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
      if (!attachedAgentId) return;
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
    [attachedAgentId, chatStatus, nextPromptId, sendPrompt],
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

  const setThinkingLevelRemote = useCallback(
    async (level: string) => {
      await compactSend("set_thinking_level", { level });
      setThinkingLevel(level);
    },
    [compactSend, setThinkingLevel],
  );

  const compactContext = useCallback(async () => {
    try {
      await compactSend("compact");
      addSystemMessage("Compaction requested");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Compaction failed");
    }
  }, [addSystemMessage, compactSend, setError]);

  useEffect(() => {
    if (!dialog?.timeout) return;
    const timeout = window.setTimeout(() => respondDialog({ cancelled: true }), dialog.timeout);
    return () => window.clearTimeout(timeout);
  }, [dialog, respondDialog]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
      } else if (event.key === "Escape") {
        if (modelOpen) setModelOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (chatStatus === "streaming") abort();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [abort, chatStatus, modelOpen, settingsOpen]);

  const totalCost = useMemo(
    () => items.reduce((sum, item) => sum + (item.kind === "message" ? item.cost || 0 : 0), 0),
    [items],
  );

  const usedContextTokens = (lastUsage?.input || 0) + (lastUsage?.cacheRead || 0);
  const contextPercent = contextWindowSize > 0 ? Math.round((usedContextTokens / contextWindowSize) * 100) : 0;
  const shouldSuggestCompaction = contextPercent >= 80;

  return (
    <SidebarProvider
      className="h-full min-h-0 bg-background text-foreground"
      onOpenChange={setSidebarOpen}
      open={sidebarOpen}
      style={{ "--sidebar-width": `${leftSidebarWidth}px` } as CSSProperties}
    >
      <ConversationSidebar
        attachedAgentId={attachedAgentId}
        connection={connection}
        liveSessions={liveSessions}
        onOpenSettings={openSettings}
        onResizeSidebar={updateLeftSidebarWidth}
        onSwitchAgent={(agentId) => void switchAgent(agentId)}
      />

      <SidebarInset className="h-full min-h-0">
        <AppHeader
          connection={connection}
          contextPercent={contextPercent}
          contextWindowSize={contextWindowSize}
          gitLoading={gitLoading}
          gitStatus={gitStatus}
          isViewingOtherSession={false}
          modelLabel={modelLabel}
          onCompactContext={compactContext}
          onOpenGitDiff={() => void openGitDiff()}
          onReturnToLive={() => void requestConversationSync()}
          onToggleContext={() => setContextOpen((open) => !open)}
          shouldSuggestCompaction={shouldSuggestCompaction}
          title={sessionName}
          totalCost={totalCost}
        />

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
              <Conversation className="h-full">
                <ScrollToLatestOnFill filled={items.length > 0} />
                <ConversationContent className="mx-auto w-full max-w-3xl gap-3 px-4 py-6">
                  {items.length === 0 ? (
                    <ConversationEmptyState
                      description="Connect to the running Pi session and send a message."
                      icon={<TerminalIcon className="size-7" />}
                      title="Pi Web UI"
                    />
                  ) : (
                    items.map((item) =>
                      item.kind === "message" && item.role === "user" ? (
                        <UserMessageView
                          item={item as typeof item & { kind: "message"; role: "user" }}
                          key={item.id}
                          onCopy={(text) => copyText(text)}
                        />
                      ) : (
                        <ChatItemView
                          item={item}
                          key={item.id}
                          onCopy={(text) => copyText(text)}
                          onToggleTool={toggleTool}
                          showThinking={showThinking}
                        />
                      ),
                    )
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
              agentAttached={attachedAgentId !== null}
              archAvailable={archAvailable}
              archModeEnabled={archModeEnabled}
              chatStatus={chatStatus}
              connection={connection}
              currentModel={currentModel}
              modelLabel={modelLabel}
              onAbort={abort}
              onOpenModelPicker={openModelPicker}
              onSetThinkingLevel={(level) => void setThinkingLevelRemote(level)}
              onSubmit={submitMessage}
              onToggleArchMode={toggleArchMode}
              onValueChange={setDraftText}
              thinkingLevel={thinkingLevel}
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
            currentModel={currentModel}
            onClose={() => setSettingsOpen(false)}
            onRenameSession={renameActiveSession}
            onSetAutoCompaction={setAutoCompactionRemote}
            onSetTheme={setThemeMode}
            onSetThinking={setThinkingLevelRemote}
            onToggleAuth={toggleAuth}
            sessionName={sessionName}
            showThinking={showThinking}
            setShowThinking={setShowThinking}
            themeMode={themeMode}
            thinkingLevel={thinkingLevel}
          />
        )}
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
