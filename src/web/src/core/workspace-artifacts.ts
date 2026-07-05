import type { PiContentBlock, RpcEvent, SessionEntry, WorkspaceArtifact } from "./types";

const ARTIFACT_TOOL_NAMES = new Set(["edit", "write"]);
const MARKDOWN_EXTENSIONS = [".md", ".mdx", ".markdown"];

type ArtifactDraft = Omit<WorkspaceArtifact, "updatedAt"> & { updatedAt?: number };

export function artifactsFromEntries(entries: SessionEntry[] = []): WorkspaceArtifact[] {
  const artifacts: WorkspaceArtifact[] = [];
  const pendingToolCalls = new Map<string, ArtifactDraft>();

  for (const entry of entries) {
    const timestamp = Date.parse(entry.timestamp || "") || Date.now();
    const message = entry.message;

    if (message?.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!isToolCallBlock(block)) continue;
        const draft = artifactDraftFromTool(block.name, block.arguments);
        if (draft && block.id) pendingToolCalls.set(block.id, { ...draft, updatedAt: timestamp });
      }
    }

    if (message?.role === "toolResult" && message.toolCallId) {
      const draft = pendingToolCalls.get(message.toolCallId);
      if (draft && !message.isError) {
        artifacts.push({ ...draft, updatedAt: draft.updatedAt || timestamp });
      }
    }

    const directDraft = artifactDraftFromTool(entry.toolName, entry.args ?? entry.details ?? entry.payload);
    if (directDraft && entry.type === "tool_execution_end" && entry.isError !== true) {
      artifacts.push({ ...directDraft, updatedAt: timestamp });
    }
  }

  return mergeArtifacts([], artifacts);
}

export function artifactsFromToolEvent(event: RpcEvent): WorkspaceArtifact[] {
  if (event.type !== "tool_execution_end" || event.isError) return [];
  const draft = artifactDraftFromTool(event.toolName, event.args);
  return draft ? [{ ...draft, updatedAt: Date.now() }] : [];
}

export function mergeArtifacts(current: WorkspaceArtifact[], incoming: WorkspaceArtifact[]): WorkspaceArtifact[] {
  const byPath = new Map<string, WorkspaceArtifact>();

  for (const artifact of current) {
    byPath.set(artifact.path, artifact);
  }

  for (const artifact of incoming) {
    const existing = byPath.get(artifact.path);
    byPath.set(artifact.path, existing && existing.updatedAt > artifact.updatedAt ? existing : artifact);
  }

  return Array.from(byPath.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function artifactDraftFromTool(name: unknown, input: unknown): ArtifactDraft | null {
  const tool = typeof name === "string" ? name.toLowerCase() : "";
  if (!ARTIFACT_TOOL_NAMES.has(tool)) return null;

  const filePath = normalizeArtifactPath(extractPath(input));
  if (!filePath || !isMarkdownPath(filePath)) return null;

  const slashIndex = filePath.lastIndexOf("/");
  const fileName = slashIndex >= 0 ? filePath.slice(slashIndex + 1) : filePath;
  const directory = slashIndex >= 0 ? filePath.slice(0, slashIndex) : ".";

  return {
    id: filePath,
    path: filePath,
    name: fileName || filePath,
    directory,
    tool: tool as "edit" | "write",
  };
}

function extractPath(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["path", "filePath", "filepath", "file_path", "file", "target", "filename"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

function normalizeArtifactPath(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .replace(/^file:\/\//, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "");
  return normalized || null;
}

function isMarkdownPath(value: string): boolean {
  const lower = value.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isToolCallBlock(block: PiContentBlock): block is Extract<PiContentBlock, { type: "toolCall" }> {
  return block.type === "toolCall";
}
