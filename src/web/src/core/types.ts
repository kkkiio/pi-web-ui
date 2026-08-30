import type { ChatStatus } from "ai";
import type { ComponentType } from "react";

export type ConnectionState = "connecting" | "connected" | "disconnected";
export type ThemeMode = "system" | "light" | "dark";
export type AppView = "chat" | "projects";
export type SystemTone = "info" | "success" | "error";
export type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error";

export type PromptImage = {
  data: string;
  mimeType: string;
};

export type PromptCommand = {
  id: string;
  message: string;
  images?: PromptImage[];
};

export type ChatItem =
  | {
      kind: "message";
      id: string;
      role: "user" | "assistant";
      text: string;
      reasoning?: string;
      streaming?: boolean;
      copyable?: boolean;
      presentation?: "normal" | "activity";
      cost?: number;
      images?: PromptImage[];
      /** Session entry ID this chat item was converted from. */
      entryId?: string;
      relatedEntryIds?: string[];
    }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: unknown;
      output?: unknown;
      errorText?: string;
      images?: PromptImage[];
      state: ToolState;
      open?: boolean;
      /** Set once the user manually expands/collapses; disables auto-collapse. */
      userToggled?: boolean;
      entryId?: string;
      relatedEntryIds?: string[];
    }
  | {
      kind: "system";
      id: string;
      text: string;
      tone?: SystemTone;
      entryId?: string;
      relatedEntryIds?: string[];
    };

export type RpcEvent = {
  type: string;
  payload?: unknown;
  message?: PiMessage;
  assistantMessageEvent?: {
    type: string;
    delta?: string;
  };
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  partialResult?: unknown;
  result?: unknown;
  isError?: boolean;
  name?: string;
  summary?: string;
  error?: string;
  method?: ExtensionDialog["method"];
  id?: string;
  title?: string;
  options?: string[];
  timeout?: number;
  placeholder?: string;
  prefill?: string;
  notifyType?: "info" | "warning" | "error";
  enabled?: boolean;
  model?: ModelInfo;
};

export type PiMessage = {
  id?: string;
  role: "user" | "assistant" | "toolResult" | string;
  content?: string | PiContentBlock[];
  customType?: string;
  details?: unknown;
  usage?: Usage;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
};

export type PiContentBlock =
  | { type: "text"; text?: string }
  | { type: "thinking"; thinking?: string }
  | { type: "toolCall"; id?: string; name?: string; arguments?: unknown }
  | {
      type: "image";
      data?: string;
      mimeType?: string;
      source?: { data?: string; media_type?: string };
    }
  | Record<string, unknown>;

export type Usage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number };
};

export type ModelInfo = {
  id: string;
  provider?: string;
  contextWindow?: number;
  /** Raw pi-ai model fields, forwarded unchanged by the extension (ADR 0002). */
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null | undefined>;
};

export type WsRequest = {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export type WsResponse = {
  type: "res";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

export type WsEvent = {
  type: "event";
  event: string;
  payload?: Record<string, unknown>;
};

export type WsError = {
  type: "error";
  id?: string;
  code?: string;
  message: string;
};

export type StateSyncPayload = {
  entries?: SessionEntry[];
  model?: ModelInfo;
  thinkingLevel?: string;
  sessionName?: string;
  sessionFile?: string;
  isStreaming?: boolean;
  contextUsage?: { tokens?: number };
};

export type SessionEntry = {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  customType?: string;
  message?: PiMessage;
  details?: unknown;
  data?: unknown;
  value?: unknown;
  payload?: unknown;
  summary?: string;
  label?: string;
  modelId?: string;
  provider?: string;
  thinkingLevel?: string;
  activeToolNames?: string[];
  [key: string]: unknown;
};

export type GitStatusResult = {
  isRepo: boolean;
  branch: string | null;
  hasChanges: boolean;
  additions: number;
  deletions: number;
  untracked?: number;
};

export type GitDiffResult = {
  isRepo: boolean;
  branch: string | null;
  diff: string;
};

export type RightPanelTab = {
  id: "git-diff";
  kind: "git-diff";
  title: string;
  branch: string | null;
  diff?: string;
  isRepo?: boolean;
  loading?: boolean;
  error?: string;
  updatedAt: number;
};

export type ExtensionDialog = {
  id: string;
  method: "select" | "confirm" | "input" | "editor" | "notify";
  title?: string;
  message?: string;
  options?: string[];
  timeout?: number;
  placeholder?: string;
  prefill?: string;
  notifyType?: "info" | "warning" | "error";
};

export type CommandAction = {
  label: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
  action: () => void;
};

export type ChatSubmitStatus = ChatStatus;
