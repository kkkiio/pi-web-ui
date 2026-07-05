import type { ChatItem } from "./types";

type ToolItem = Extract<ChatItem, { kind: "tool" }>;

const EDIT_TOOL_NAMES = new Set(["edit", "write", "apply_patch", "patch", "replace", "create"]);

export function isToolExpandable(tool: ToolItem): boolean {
  return tool.name !== "read" || tool.state === "output-error" || Boolean(tool.errorText);
}

export function formatToolSummary(tool: ToolItem): string {
  return formatToolInvocationSummary(tool.name, tool.input);
}

export function formatToolInvocationTitle(name: string | undefined): string {
  if (!name) return "Tool";
  return name
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatToolInvocationSummary(name: string | undefined, input: unknown): string {
  const record = asRecord(input);
  const normalizedName = (name || "").toLowerCase();

  if (normalizedName === "read") return formatReadSummary(record);
  if (normalizedName === "bash") return formatBashSummary(record);
  if (normalizedName === "agent") return formatAgentSummary(record);
  if (EDIT_TOOL_NAMES.has(normalizedName)) return formatEditSummary(normalizedName, record);

  return record ? formatRecordSummary(record) : formatPrimitive(input);
}

function formatReadSummary(input: Record<string, unknown> | null): string {
  if (!input) return "";
  const path = firstString(input, ["path", "filePath", "filepath", "file"]);
  const offset = input.offset ?? input.start ?? input.line;
  const limit = input.limit ?? input.lines;
  const parts = [path ? compactPath(path) : ""];
  if (offset !== undefined) parts.push(`offset ${String(offset)}`);
  if (limit !== undefined) parts.push(`limit ${String(limit)}`);
  return parts.filter(Boolean).join(" · ");
}

function formatBashSummary(input: Record<string, unknown> | null): string {
  if (!input) return "";
  const command = firstString(input, ["command", "cmd", "script"]);
  const description = firstString(input, ["description"]);
  const timeout = input.timeout_ms ?? input.timeoutMs ?? input.timeout;
  const parts = [command ? truncate(command, 220) : "", description ? truncate(description, 80) : ""];
  if (timeout !== undefined) parts.push(`timeout ${String(timeout)}`);
  return parts.filter(Boolean).join(" · ") || formatRecordSummary(input);
}

function formatAgentSummary(input: Record<string, unknown> | null): string {
  if (!input) return "";
  const description = firstString(input, ["description"]);
  const prompt = firstString(input, ["prompt", "message"]);
  if (description) return truncate(description, 120);
  return prompt ? truncate(prompt.replace(/\s+/g, " "), 180) : formatRecordSummary(input);
}

function formatEditSummary(name: string, input: Record<string, unknown> | null): string {
  if (!input) return name;
  const path = firstString(input, ["path", "filePath", "filepath", "file", "target", "filename"]);
  return path ? compactPath(path) : formatRecordSummary(input);
}

function formatRecordSummary(input: Record<string, unknown>): string {
  const entries = Object.entries(input).slice(0, 4);
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}: ${formatValue(value)}`).join(" · ");
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return truncate(compactPath(value), 160);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (value && typeof value === "object") return "{...}";
  if (value === null) return "null";
  return "";
}

function formatPrimitive(value: unknown): string {
  if (typeof value === "string") return truncate(value, 220);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  try {
    return truncate(JSON.stringify(value), 220);
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstString(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function compactPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized.includes("/") || normalized.length <= 72) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 4) return normalized;
  return `.../${parts.slice(-4).join("/")}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}
