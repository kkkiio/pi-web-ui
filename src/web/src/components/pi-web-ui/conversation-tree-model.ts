import { extractText, extractThinking, extractToolCalls, formatToolOutput } from "../../core/chat-conversion";
import { formatToolInvocationSummary, formatToolInvocationTitle } from "../../core/tool-summary";
import type { ConversationTreeItem, PiContentBlock, SessionEntry, SessionTreeNode } from "../../core/types";

export function buildActivePathSet(tree: SessionTreeNode[], leafId: string | null) {
  const byId = new Map<string, SessionEntry>();
  const stack = [...tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node?.entry.id) continue;
    byId.set(node.entry.id, node.entry);
    for (const child of node.children) stack.push(child);
  }

  const activePathIds = new Set<string>();
  let cursor: string | null | undefined = leafId;
  while (cursor) {
    const entry = byId.get(cursor);
    if (!entry?.id) break;
    activePathIds.add(entry.id);
    cursor = entry.parentId;
  }
  return activePathIds;
}

export function buildConversationTreeItems({
  collapsedIds,
  leafId,
  searchQuery,
  tree,
}: {
  tree: SessionTreeNode[];
  leafId: string | null;
  collapsedIds: Set<string>;
  searchQuery: string;
}) {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const toolCallsById = buildToolCallIndex(tree);
  const nodeById = new Map<string, SessionTreeNode>();
  const visibleById = new Map<string, SessionTreeNode>();
  const visibleRoots: SessionTreeNode[] = [];
  const items: ConversationTreeItem[] = [];
  const terminalEntryIds = new Set<string>();

  const sourceStack = [...tree].reverse();
  while (sourceStack.length > 0) {
    const node = sourceStack.pop();
    if (!node?.entry.id) continue;
    nodeById.set(node.entry.id, node);
    if (node.children.length === 0) terminalEntryIds.add(node.entry.id);
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      sourceStack.push(node.children[index]);
    }
  }

  const isVisibleNode = (node: SessionTreeNode) => {
    const entry = node.entry;
    const isCurrentLeaf = entry.id === leafId;
    const isSettingsEntry =
      entry.type === "label" ||
      entry.type === "custom" ||
      entry.type === "model_change" ||
      entry.type === "thinking_level_change" ||
      entry.type === "session_info";

    if (isSettingsEntry) return false;
    if (entry.type !== "message" || entry.message?.role !== "assistant" || isCurrentLeaf) return true;

    const message = entry.message as { errorMessage?: string; stopReason?: string };
    const hasText = extractText(entry.message.content).trim().length > 0;
    const isErrorOrAborted = Boolean(message.errorMessage || (message.stopReason && message.stopReason !== "stop"));
    return hasText || isErrorOrAborted;
  };

  for (const node of nodeById.values()) {
    if (!isVisibleNode(node)) continue;
    const nodeId = node.entry.id;
    if (!nodeId) continue;
    visibleById.set(nodeId, {
      children: [],
      entry: node.entry,
      label: node.label,
      labelTimestamp: node.labelTimestamp,
    });
  }

  for (const node of nodeById.values()) {
    const nodeId = node.entry.id;
    if (!nodeId) continue;
    const visibleNode = visibleById.get(nodeId);
    if (!visibleNode) continue;

    let parentId = node.entry.parentId ?? null;
    while (parentId && !visibleById.has(parentId)) {
      parentId = nodeById.get(parentId)?.entry.parentId ?? null;
    }

    const visibleParent = parentId ? visibleById.get(parentId) : undefined;
    if (visibleParent) visibleParent.children.push(visibleNode);
    else visibleRoots.push(visibleNode);
  }

  let effectiveLeafId: string | null = leafId;
  while (effectiveLeafId && !visibleById.has(effectiveLeafId)) {
    effectiveLeafId = nodeById.get(effectiveLeafId)?.entry.parentId ?? null;
  }

  const visit = (
    node: SessionTreeNode,
    branchMeta?: { isBranchChild: boolean; isFirstBranchChild: boolean; isLastBranchChild: boolean },
  ): { items: ConversationTreeItem[]; matches: boolean } => {
    const id = node.entry.id;
    if (!id) return { items: [], matches: false };
    const { detail, text } = getConversationTreeItemText(node.entry, toolCallsById);
    const label = node.label ?? (typeof node.entry.label === "string" ? node.entry.label : undefined);
    const searchText = `${text} ${detail ?? ""} ${label ?? ""} ${node.entry.type}`.toLowerCase();
    const selfMatches = !normalizedQuery || searchText.includes(normalizedQuery);
    const childItems: ConversationTreeItem[] = [];
    let descendantMatches = false;

    const sortedChildren = [...node.children].sort(compareTreeNodes);
    const hasBranchChildren = sortedChildren.length > 1;
    for (const [index, child] of sortedChildren.entries()) {
      const result = visit(
        child,
        hasBranchChildren
          ? {
              isBranchChild: true,
              isFirstBranchChild: index === 0,
              isLastBranchChild: index === sortedChildren.length - 1,
            }
          : undefined,
      );
      if (result.matches) descendantMatches = true;
      childItems.push(...result.items);
    }

    const matches = selfMatches || descendantMatches;
    if (normalizedQuery && !matches) return { items: [], matches: false };

    const isBranchChild = Boolean(branchMeta?.isBranchChild);
    const isFirstBranchChild = Boolean(branchMeta?.isFirstBranchChild);
    const isLastBranchChild = Boolean(branchMeta?.isLastBranchChild);
    const isBranchable = node.entry.type === "message" && node.entry.message?.role === "user";
    const isCustomMessage = node.entry.type === "custom_message";
    const isContinuable = terminalEntryIds.has(id) && id !== leafId && !isBranchable && !isCustomMessage;
    const isSegmentExpanded = Boolean(normalizedQuery) || !collapsedIds.has(id);
    const isExpandable = isBranchChild && childItems.length > 0;
    const shouldNestChildren = hasBranchChildren || isExpandable;
    const visibleChildren = shouldNestChildren && (!isExpandable || isSegmentExpanded) ? childItems : [];
    const renderedChildCount = shouldNestChildren ? childItems.length : 0;
    const item: ConversationTreeItem = {
      childCount: renderedChildCount,
      children: visibleChildren,
      entry: node.entry,
      entryType: node.entry.type,
      hasChildren: renderedChildCount > 0,
      hiddenChildCount: isExpandable && !isSegmentExpanded ? childItems.length : 0,
      id,
      detail,
      isExpandable,
      isExpanded: isSegmentExpanded,
      isBranchChild,
      isFirstBranchChild,
      isBranchable,
      isContinuable,
      continueTargetId: isContinuable ? id : undefined,
      isLastBranchChild,
      isLeaf: id === effectiveLeafId,
      isSearchMatch: selfMatches && Boolean(normalizedQuery),
      label,
      order: 0,
      parentId: node.entry.parentId ?? null,
      text,
    };

    if (hasBranchChildren || isExpandable) return { items: [item], matches };
    return { items: [item, ...childItems], matches };
  };

  let currentOrder = -1;
  let order = 0;
  const assignOrder = (item: ConversationTreeItem) => {
    item.order = order;
    if (item.id === effectiveLeafId) currentOrder = order;
    order += 1;
    for (const child of item.children) assignOrder(child);
  };

  for (const node of visibleRoots.sort(compareTreeNodes)) {
    const result = visit(node);
    items.push(...result.items);
  }
  for (const root of items) assignOrder(root);

  return { currentEntryId: effectiveLeafId, currentOrder, items };
}

export function collectVisibleConversationTreeItems(items: ConversationTreeItem[]) {
  const output: ConversationTreeItem[] = [];
  const stack = [...items].reverse();
  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) continue;
    output.push(item);
    for (const child of [...item.children].reverse()) stack.push(child);
  }
  return output;
}

function getConversationTreeItemText(entry: SessionEntry, toolCallsById: Map<string, ToolCallInfo>) {
  if (entry.type === "message") {
    if (entry.message?.role === "toolResult") {
      const call = entry.message.toolCallId ? toolCallsById.get(entry.message.toolCallId) : undefined;
      const toolName = entry.message.toolName || call?.name || "Tool";
      const callSummary = formatToolInvocationSummary(toolName, call?.arguments);
      const resultPreview =
        extractText(entry.message.content).replace(/\s+/g, " ").trim() || formatToolOutput(entry.message.content);
      return {
        detail: callSummary || truncateTreeText(resultPreview.replace(/\s+/g, " ").trim(), 140) || undefined,
        text: formatToolInvocationTitle(toolName),
      };
    }
    const text = extractText(entry.message?.content).replace(/\s+/g, " ").trim();
    if (text) return { text: truncateTreeText(text, 140) || "Message" };
    if (entry.message?.role === "assistant") {
      const toolCalls = extractToolCalls(entry.message.content);
      if (toolCalls.length > 0) return summarizeAssistantToolCalls(toolCalls);
      const thinking = extractThinking(entry.message.content).replace(/\s+/g, " ").trim();
      if (thinking) return { detail: truncateTreeText(thinking, 140), text: "Reasoning" };
      return { text: "Assistant update" };
    }
    if (entry.message?.role === "user") return { text: "User message" };
    return { text: "Message" };
  }
  if (entry.type === "branch_summary") {
    return { text: truncateTreeText(typeof entry.summary === "string" ? entry.summary : "", 140) || "Branch summary" };
  }
  if (entry.type === "compaction") {
    return {
      text: "Compaction",
      detail: truncateTreeText(typeof entry.summary === "string" ? entry.summary : "", 140),
    };
  }
  if (entry.type === "model_change") {
    return { text: "Model change", detail: [entry.provider, entry.modelId].filter(Boolean).join("/") || undefined };
  }
  if (entry.type === "thinking_level_change") return { text: `Thinking: ${entry.thinkingLevel || "changed"}` };
  if (entry.type === "label") return { text: typeof entry.label === "string" ? entry.label : "Label" };
  if (entry.type === "session_info") return { text: typeof entry.name === "string" ? entry.name : "Session info" };
  if (entry.type === "custom_message") {
    const content = entry.content;
    if (typeof content === "string") return { text: truncateTreeText(content.replace(/\s+/g, " ").trim(), 140) };
    return { text: "Custom message" };
  }
  return { text: entry.type || "Event" };
}

type ToolCallInfo = Extract<PiContentBlock, { type: "toolCall" }>;

function buildToolCallIndex(tree: SessionTreeNode[]) {
  const toolCallsById = new Map<string, ToolCallInfo>();
  const stack = [...tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    for (const call of extractToolCalls(node.entry.message?.content)) {
      if (call.id) toolCallsById.set(call.id, call);
    }
    stack.push(...node.children);
  }
  return toolCallsById;
}

function summarizeAssistantToolCalls(toolCalls: ToolCallInfo[]) {
  if (toolCalls.length === 1) {
    const call = toolCalls[0];
    return {
      detail: formatToolInvocationSummary(call.name, call.arguments) || undefined,
      text: formatToolInvocationTitle(call.name),
    };
  }

  const counts = new Map<string, number>();
  for (const call of toolCalls) {
    const title = formatToolInvocationTitle(call.name);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const firstDetails = toolCalls
    .slice(0, 3)
    .map((call) => formatToolInvocationSummary(call.name, call.arguments))
    .filter(Boolean)
    .join(" · ");
  const label =
    dominant && dominant[1] === toolCalls.length
      ? `${dominant[0]} ${toolCalls.length}x`
      : `${toolCalls.length} tool calls`;
  return { detail: truncateTreeText(firstDetails, 180), text: label };
}

function truncateTreeText(value: string, max: number) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function compareTreeNodes(a: SessionTreeNode, b: SessionTreeNode) {
  const aTimeValue = typeof a.entry.timestamp === "string" ? new Date(a.entry.timestamp).getTime() : 0;
  const bTimeValue = typeof b.entry.timestamp === "string" ? new Date(b.entry.timestamp).getTime() : 0;
  const aTime = Number.isFinite(aTimeValue) ? aTimeValue : 0;
  const bTime = Number.isFinite(bTimeValue) ? bTimeValue : 0;
  if (aTime !== bTime) return aTime - bTime;
  return (a.entry.id ?? "").localeCompare(b.entry.id ?? "");
}
