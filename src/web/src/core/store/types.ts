import type { StateCreator } from "zustand";
import type { AskUserQuestion, QuestionAnswer, QuestionDraft } from "../ask-user-question";
import type { PiClient } from "../pi-client";
import type {
  ChatItem,
  ChatSubmitStatus,
  ConnectionState,
  ContextUsage,
  ExtensionDialog,
  GitDiffResult,
  GitStatusResult,
  LightPalette,
  ModelInfo,
  PromptCommand,
  RightPanelTab,
  RpcEvent,
  SessionTreeNode,
  StateSyncPayload,
  SystemTone,
  ThemeMode,
  Usage,
  UsageTotals,
} from "../types";

export type ConnectionSlice = {
  client: PiClient | null;
  connection: ConnectionState;
  error: string | null;
  advancedFeatures: boolean;
  setClient: (client: PiClient | null) => void;
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  setConnection: (connection: ConnectionState) => void;
  setError: (error: string | null) => void;
  applyWebUiState: (payload: Record<string, unknown>) => void;
};

export type SessionSlice = {
  items: ChatItem[];
  streamingMessage: Extract<ChatItem, { kind: "message" }> | null;
  chatStatus: ChatSubmitStatus;
  tree: SessionTreeNode[];
  leafId: string | null;
  selectedTreeEntryId: string | null;
  loadingTreeEntryId: string | null;
  conversationSyncing: boolean;
  conversationSyncError: string | null;
  lastUsage: Usage | null;
  usageTotals: UsageTotals;
  contextUsage: ContextUsage | null;
  contextWindowSize: number;
  addSystemMessage: (text: string, tone?: SystemTone) => void;
  applyStateSync: (sync: StateSyncPayload) => void;
  requestConversationSync: (options?: { debounce?: boolean }) => Promise<void> | void;
  clearConversationTimers: () => void;
  setChatStatus: (status: ChatSubmitStatus) => void;
  setSelectedTreeEntryId: (entryId: string | null) => void;
  setLoadingTreeEntryId: (entryId: string | null) => void;
  setLastUsage: (usage: Usage | null) => void;
  setContextWindowSize: (size: number) => void;
  sendPrompt: (command: PromptCommand) => Promise<void>;
  abort: () => Promise<void>;
  toggleAllTools: (open: boolean) => void;
  toggleTool: (id: string, open: boolean) => void;
  applyAgentStart: () => void;
  applyAgentEnd: () => void;
  applyMessageStart: (event: RpcEvent) => void;
  applyMessageUpdate: (event: RpcEvent) => void;
  applyMessageEnd: (event: RpcEvent) => void;
  applyToolExecutionStart: (event: RpcEvent) => void;
  applyToolExecutionUpdate: (event: RpcEvent) => void;
  applyToolExecutionEnd: (event: RpcEvent) => void;
  markPromptReady: () => void;
};

export type SettingsSlice = {
  availableModels: ModelInfo[];
  currentModel: ModelInfo | null;
  modelLabel: string;
  thinkingLevel: string;
  sessionName: string;
  autoCompaction: boolean;
  authConfigured: boolean;
  authEnabled: boolean;
  themeMode: ThemeMode;
  lightPalette: LightPalette;
  showThinking: boolean;
  refreshSettingsState: () => Promise<void>;
  refreshAuthState: () => Promise<void>;
  setAvailableModels: (models: ModelInfo[]) => void;
  setCurrentModel: (model: ModelInfo | null) => void;
  setThinkingLevel: (level: string) => void;
  setSessionName: (name: string) => void;
  setAutoCompaction: (enabled: boolean) => void;
  setAuthEnabled: (enabled: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLightPalette: (palette: LightPalette) => void;
  setShowThinking: (show: boolean) => void;
  cycleThinking: () => Promise<void>;
  selectModel: (model: ModelInfo) => Promise<void>;
  setAutoCompactionRemote: (enabled: boolean) => Promise<void>;
  toggleAuth: () => Promise<void>;
  renameActiveSession: (name: string) => Promise<void>;
};

export type WorkspaceSlice = {
  gitStatus: GitStatusResult | null;
  gitLoading: boolean;
  refreshGitStatus: () => Promise<void>;
  requestGitStatusRefresh: (options?: { debounce?: boolean }) => void;
  clearWorkspaceTimers: () => void;
};

export type RightPanelSlice = {
  rightPanelTabs: RightPanelTab[];
  activeRightPanelTabId: string | null;
  rightPanelVisible: boolean;
  rightPanelHasOpened: boolean;
  upsertRightPanelTab: (tab: RightPanelTab) => void;
  openGitDiff: () => Promise<void>;
  refreshRightPanelTab: (tab: RightPanelTab) => void;
  closeRightPanelTab: (id: string) => void;
  setActiveRightPanelTabId: (id: string | null) => void;
  toggleRightPanelVisible: () => void;
};

export type DialogSlice = {
  dialog: ExtensionDialog | null;
  setDialog: (dialog: ExtensionDialog | null) => void;
  respondDialog: (response: Record<string, unknown>) => void;
};

export type QuestionSlice = {
  questionnaires: Record<string, AskUserQuestion>;
  questionDrafts: Record<string, Record<number, QuestionDraft>>;
  updateQuestionDraft: (id: string, index: number, changes: Partial<QuestionDraft>) => void;
  applyQuestionEvent: (event: string, payload: Record<string, unknown>) => void;
  submitQuestion: (id: string, answers: QuestionAnswer[], cancel?: boolean) => Promise<void>;
};

export type PiWebUiStore = QuestionSlice &
  ConnectionSlice &
  SessionSlice &
  SettingsSlice &
  WorkspaceSlice &
  RightPanelSlice &
  DialogSlice;

export type StoreSlice<T> = StateCreator<PiWebUiStore, [], [], T>;

export type SettingsStateResult = {
  model?: ModelInfo;
  thinkingLevel?: string;
  sessionName?: string;
  autoCompactionEnabled?: boolean;
};

export type AuthStateResult = {
  configured?: boolean;
  enabled?: boolean;
};

export type SessionStatsResult = {
  totalMessages?: number;
  userMessages?: number;
  assistantMessages?: number;
  toolCalls?: number;
  tokens?: { input?: number; total?: number };
};

export type { GitDiffResult };
