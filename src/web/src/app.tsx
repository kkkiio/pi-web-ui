import { ArchiveIcon, BarChart3Icon, DownloadIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AppHeader,
  ChatInput,
  ChatItemView,
  CommandPalette,
  ExtensionDialogView,
  ModelPicker,
  RightPanel,
  SettingsPanel,
  UserMessageView,
} from "./components/pi-web-ui";
import { AskUserQuestionCard } from "./components/pi-web-ui/ask-user-question-card";
import { ConversationOutline } from "./components/pi-web-ui/conversation-outline";
import { groupTranscript, ProcessGroup } from "./components/pi-web-ui/process-group";
import {
  formatQuotedPrompt,
  type TranscriptQuote,
  TranscriptQuoteAction,
} from "./components/pi-web-ui/transcript-quote";
import { processPromptFiles } from "./core/chat-conversion";
import { copyText, formatTokens, isEditableTarget } from "./core/format";
import { PiClient } from "./core/pi-client";
import { usePiWebUiStore } from "./core/store";
import { dispatchPiEvent } from "./core/store/event-dispatch";
import type { StateSyncPayload } from "./core/types";

export function App() {
  const items = usePiWebUiStore((state) => state.items);
  const pendingQuestion = usePiWebUiStore((state) =>
    Object.values(state.questionnaires).find((question) => question.status === "pending"),
  );
  const connection = usePiWebUiStore((state) => state.connection);
  const chatStatus = usePiWebUiStore((state) => state.chatStatus);
  const modelLabel = usePiWebUiStore((state) => state.modelLabel);
  const currentModel = usePiWebUiStore((state) => state.currentModel);
  const thinkingLevel = usePiWebUiStore((state) => state.thinkingLevel);
  const sessionName = usePiWebUiStore((state) => state.sessionName);
  const error = usePiWebUiStore((state) => state.error);
  const advancedFeatures = usePiWebUiStore((state) => state.advancedFeatures);
  const loadingTreeEntryId = usePiWebUiStore((state) => state.loadingTreeEntryId);
  const availableModels = usePiWebUiStore((state) => state.availableModels);
  const showThinking = usePiWebUiStore((state) => state.showThinking);
  const transcriptSections = useMemo(() => groupTranscript(items, showThinking), [items, showThinking]);
  const autoCompaction = usePiWebUiStore((state) => state.autoCompaction);
  const authConfigured = usePiWebUiStore((state) => state.authConfigured);
  const authEnabled = usePiWebUiStore((state) => state.authEnabled);
  const dialog = usePiWebUiStore((state) => state.dialog);
  const gitStatus = usePiWebUiStore((state) => state.gitStatus);
  const gitLoading = usePiWebUiStore((state) => state.gitLoading);
  const rightPanelTabs = usePiWebUiStore((state) => state.rightPanelTabs);
  const activeRightPanelTabId = usePiWebUiStore((state) => state.activeRightPanelTabId);
  const rightPanelVisible = usePiWebUiStore((state) => state.rightPanelVisible);
  const lastUsage = usePiWebUiStore((state) => state.lastUsage);
  const contextWindowSize = usePiWebUiStore((state) => state.contextWindowSize);
  const lightPalette = usePiWebUiStore((state) => state.lightPalette);
  const setLightPalette = usePiWebUiStore((state) => state.setLightPalette);
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
  const setActiveRightPanelTabId = usePiWebUiStore((state) => state.setActiveRightPanelTabId);
  const setClient = usePiWebUiStore((state) => state.setClient);
  const setConnection = usePiWebUiStore((state) => state.setConnection);
  const setError = usePiWebUiStore((state) => state.setError);
  const setLoadingTreeEntryId = usePiWebUiStore((state) => state.setLoadingTreeEntryId);
  const setShowThinking = usePiWebUiStore((state) => state.setShowThinking);
  const setThemeMode = usePiWebUiStore((state) => state.setThemeMode);
  const setThinkingLevel = usePiWebUiStore((state) => state.setThinkingLevel);
  const setAutoCompactionRemote = usePiWebUiStore((state) => state.setAutoCompactionRemote);
  const closeRightPanelTab = usePiWebUiStore((state) => state.closeRightPanelTab);
  const toggleAllTools = usePiWebUiStore((state) => state.toggleAllTools);
  const [toolExpansion, setToolExpansion] = useState<{ open: boolean } | null>(null);
  const toggleAuth = usePiWebUiStore((state) => state.toggleAuth);
  const toggleRightPanelVisible = usePiWebUiStore((state) => state.toggleRightPanelVisible);
  const toggleTool = usePiWebUiStore((state) => state.toggleTool);

  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );

  const [draftText, setDraftText] = useState("");
  const [quotes, setQuotes] = useState<TranscriptQuote[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const addQuote = (quote: TranscriptQuote) => {
    setQuotes((current) => [...current, quote]);
    document.querySelector<HTMLTextAreaElement>('textarea[name="message"]')?.focus();
  };

  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const resolvedTheme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => setSystemDark(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    localStorage.setItem("pi-web-ui-theme-mode", themeMode);
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.dataset.palette = resolvedTheme === "dark" ? "solarized-dark" : lightPalette;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [lightPalette, resolvedTheme, themeMode]);

  useEffect(() => {
    document.title = sessionName || "Pi Web UI";
  }, [sessionName]);

  useEffect(() => {
    localStorage.setItem("pi-web-ui-show-thinking", String(showThinking));
  }, [showThinking]);

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

  const submitMessage = useCallback(
    async ({ text, files }: { text: string; files?: unknown[] }) => {
      const trimmed = formatQuotedPrompt(text, quotes);
      const images = await processPromptFiles(files);
      if (!trimmed && images.length === 0) return;
      if (usePiWebUiStore.getState().loadingTreeEntryId) throw new Error("Wait for the current operation to finish");

      await sendPrompt({
        message: trimmed || "(see attached image)",
        images: images.length ? images : undefined,
      });
      setDraftText((current) => (current === text ? "" : current));
      setQuotes((current) => current.filter((quote) => !quotes.some((sent) => sent.id === quote.id)));
    },
    [sendPrompt, quotes],
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

  const editMessage = useCallback(
    async (entryId: string, message: string) => {
      if (usePiWebUiStore.getState().loadingTreeEntryId || usePiWebUiStore.getState().chatStatus !== "ready") {
        throw new Error("Wait for the current operation to finish");
      }
      const original = usePiWebUiStore
        .getState()
        .items.find((item) => item.kind === "message" && item.entryId === entryId);
      const images = original?.kind === "message" ? original.images : undefined;
      setLoadingTreeEntryId(entryId);
      try {
        const result = (await compactSend("navigate_tree", { entryId })) as { cancelled?: boolean };
        if (result?.cancelled) throw new Error("Navigation cancelled");
        const sync = await compactSend("sync_request");
        usePiWebUiStore.getState().applyStateSync(sync as StateSyncPayload);
        await sendPrompt({ message, images });
      } finally {
        setLoadingTreeEntryId(null);
      }
    },
    [compactSend, sendPrompt, setLoadingTreeEntryId],
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

  const selectThinking = async (level: string) => {
    try {
      await compactSend("set_thinking_level", { level });
      setThinkingLevel(level);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to change thinking level");
    }
  };

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
      action: () => {
        toggleAllTools(true);
        setToolExpansion({ open: true });
      },
    },
    {
      label: "Collapse All Tools",
      desc: "Close every tool card",
      icon: PanelLeftCloseIcon,
      action: () => {
        toggleAllTools(false);
        setToolExpansion({ open: false });
      },
    },
  ];

  return (
    <TooltipProvider>
      <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <AppHeader
          connection={connection}
          gitStatus={gitStatus}
          gitLoading={gitLoading}
          onOpenGitDiff={openGitDiff}
          onOpenSettings={openSettings}
          onToggleRightPanel={() => (rightPanelTabs.length ? toggleRightPanelVisible() : void openGitDiff())}
          rightPanelOpen={rightPanelOpen}
          isViewingOtherSession={false}
          modelLabel={modelLabel}
          onCompactContext={compactContext}
          onSetThinking={selectThinking}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onOpenModelPicker={openModelPicker}
          onReturnToLive={() => void requestConversationSync()}
          shouldSuggestCompaction={shouldSuggestCompaction}
          thinkingLevel={thinkingLevel}
          title={sessionName}
        />

        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div ref={transcriptRef} className="relative min-h-0 flex-1">
              <Conversation className="h-full">
                <ConversationContent className="mx-auto w-full max-w-3xl gap-3 px-4 py-6">
                  {items.length === 0 ? (
                    <ConversationEmptyState
                      description="Connect to the running Pi session and send a message."
                      icon={<img alt="" className="size-16" height={64} src="/logo.svg" width={64} />}
                      title="Pi Web UI"
                    />
                  ) : (
                    transcriptSections.map((section, index) => {
                      if (section.kind === "process") {
                        const first = section.rows[0];
                        return (
                          <ProcessGroup
                            active={
                              chatStatus === "streaming" &&
                              (index === transcriptSections.length - 1 ||
                                section.rows.some((row) => row.id === pendingQuestion?.toolCallId))
                            }
                            rows={section.rows}
                            key={`process:${first.kind}:${first.id}`}
                            toolExpansion={toolExpansion}
                          >
                            {section.rows.map((item) => (
                              <ChatItemView
                                item={item}
                                key={`${item.kind}:${item.id}`}
                                onCopy={copyText}
                                onQuote={addQuote}
                                onToggleTool={toggleTool}
                                reasoningRow={item.kind === "message"}
                                processRow
                                theme={resolvedTheme}
                              />
                            ))}
                          </ProcessGroup>
                        );
                      }

                      const { item } = section;
                      return item.kind === "message" && item.role === "user" ? (
                        <div id={`user-message-${item.id}`} key={`user:${item.entryId ?? item.id}`}>
                          <UserMessageView
                            item={item as typeof item & { kind: "message"; role: "user" }}
                            onEdit={advancedFeatures && item.entryId ? editMessage : undefined}
                            editDisabled={
                              chatStatus !== "ready" || loadingTreeEntryId !== null || connection !== "connected"
                            }
                            onCopy={copyText}
                          />
                        </div>
                      ) : (
                        <ChatItemView
                          item={item}
                          key={`${item.kind}:${item.id}`}
                          onCopy={copyText}
                          onQuote={addQuote}
                          onToggleTool={toggleTool}
                          theme={resolvedTheme}
                        />
                      );
                    })
                  )}
                </ConversationContent>
                <ConversationScrollButton />
                <ConversationOutline items={items} />
              </Conversation>

              <TranscriptQuoteAction
                transcriptRef={transcriptRef}
                disabled={loadingTreeEntryId !== null}
                onQuote={addQuote}
              />
            </div>

            {error && (
              <div className="mx-auto w-full max-w-3xl px-4 py-2">
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {error}
                </div>
              </div>
            )}

            <div hidden={Boolean(pendingQuestion)}>
              <ChatInput
                connection={connection}
                quotes={quotes}
                onEditQuote={(id, comment) =>
                  setQuotes((current) => current.map((quote) => (quote.id === id ? { ...quote, comment } : quote)))
                }
                onRemoveQuote={(id) => setQuotes((current) => current.filter((quote) => quote.id !== id))}
                disabled={Boolean(pendingQuestion) || loadingTreeEntryId !== null}
                chatStatus={chatStatus}
                onAbort={abort}
                onSubmit={submitMessage}
                onValueChange={setDraftText}
                value={draftText}
                viewingHistory={false}
              />
            </div>
            {pendingQuestion && (
              <AskUserQuestionCard key={pendingQuestion.toolCallId} questionnaire={pendingQuestion} onAbort={abort} />
            )}
          </div>

          {rightPanelTabs.length > 0 && (
            <RightPanel
              activeTabId={activeRightPanelTabId}
              onCloseTab={closeRightPanelTab}
              onQuote={(quote) => {
                setQuotes((current) => [...current, quote]);
                if (!window.matchMedia("(min-width: 1280px)").matches) toggleRightPanelVisible();
              }}
              theme={resolvedTheme}
              onRefreshTab={refreshRightPanelTab}
              onSelectTab={setActiveRightPanelTabId}
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
            lightPalette={lightPalette}
            onSetLightPalette={setLightPalette}
            onSetTheme={setThemeMode}
            resolvedTheme={resolvedTheme}
            onSetThinking={selectThinking}
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
      </main>
    </TooltipProvider>
  );
}
