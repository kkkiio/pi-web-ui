import { extractText, extractThinking, extractToolCalls, formatToolOutput } from "../../core/chat-conversion";
import { formatToolInvocationSummary, formatToolInvocationTitle } from "../../core/tool-summary";
import type { ConversationTreeItem, PiContentBlock, SessionEntry, SessionTreeNode } from "../../core/types";

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
  const itemMetaById = new Map<
    string,
    {
      detail?: string;
      label?: string;
      selfMatches: boolean;
      text: string;
    }
  >();
  const subtreeMatchesById = new Map<string, boolean>();

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

  for (const node of visibleById.values()) {
    node.children.sort(compareTreeNodes);
  }
  visibleRoots.sort(compareTreeNodes);

  let effectiveLeafId: string | null = leafId;
  while (effectiveLeafId && !visibleById.has(effectiveLeafId)) {
    effectiveLeafId = nodeById.get(effectiveLeafId)?.entry.parentId ?? null;
  }

  const matchStack = visibleRoots.map((node) => ({ node, visited: false })).reverse();
  while (matchStack.length > 0) {
    const frame = matchStack.pop();
    const id = frame?.node.entry.id;
    if (!frame || !id) continue;
    if (!frame.visited) {
      matchStack.push({ node: frame.node, visited: true });
      for (let index = frame.node.children.length - 1; index >= 0; index -= 1) {
        matchStack.push({ node: frame.node.children[index], visited: false });
      }
      continue;
    }

    const { detail, text } = getConversationTreeItemText(frame.node.entry, toolCallsById);
    const label = frame.node.label ?? (typeof frame.node.entry.label === "string" ? frame.node.entry.label : undefined);
    const searchText = `${text} ${detail ?? ""} ${label ?? ""} ${frame.node.entry.type}`.toLowerCase();
    const selfMatches = !normalizedQuery || searchText.includes(normalizedQuery);
    const descendantMatches = frame.node.children.some(
      (child) => subtreeMatchesById.get(child.entry.id ?? "") === true,
    );
    itemMetaById.set(id, { detail, label, selfMatches, text });
    subtreeMatchesById.set(id, selfMatches || descendantMatches);
  }

  let currentOrder = -1;
  const renderStack = visibleRoots
    .map((node, index) => ({
      ancestorColumns: [] as ConversationTreeItem["connectorColumns"],
      connectorContinues: false,
      connectorKind: "none" as ConversationTreeItem["connectorKind"],
      depth: 0,
      node,
      siblingIndex: index,
      siblingCount: visibleRoots.length,
    }))
    .reverse();

  while (renderStack.length > 0) {
    const frame = renderStack.pop();
    const id = frame?.node.entry.id;
    if (!frame || !id) continue;
    if (normalizedQuery && !subtreeMatchesById.get(id)) continue;

    const meta = itemMetaById.get(id) ?? { selfMatches: false, text: "Event" };
    const children = frame.node.children.filter(
      (child) => !normalizedQuery || subtreeMatchesById.get(child.entry.id ?? ""),
    );
    const isBranchable = frame.node.entry.type === "message" && frame.node.entry.message?.role === "user";
    const isCustomMessage = frame.node.entry.type === "custom_message";
    const isContinuable = terminalEntryIds.has(id) && id !== leafId && !isBranchable && !isCustomMessage;
    const isBranchSegmentStart = frame.connectorKind === "middle" || frame.connectorKind === "last";
    const isSegmentExpanded = Boolean(normalizedQuery) || !collapsedIds.has(id);
    const isExpandable = isBranchSegmentStart && children.length > 0;
    const item: ConversationTreeItem = {
      childCount: children.length,
      connectorColumns: frame.ancestorColumns,
      connectorKind: frame.connectorKind,
      continueTargetId: isContinuable ? id : undefined,
      depth: frame.depth,
      detail: meta.detail,
      entry: frame.node.entry,
      entryType: frame.node.entry.type,
      hiddenChildCount:
        isExpandable && !isSegmentExpanded ? countVisibleDescendants(children, normalizedQuery, subtreeMatchesById) : 0,
      id,
      isBranchable,
      isContinuable,
      isExpandable,
      isExpanded: isSegmentExpanded,
      isLeaf: id === effectiveLeafId,
      isSearchMatch: meta.selfMatches && Boolean(normalizedQuery),
      label: meta.label,
      order: items.length,
      parentId: frame.node.entry.parentId ?? null,
      text: meta.text,
    };

    if (item.id === effectiveLeafId) currentOrder = item.order;
    items.push(item);

    if (isExpandable && !isSegmentExpanded) continue;
    const childCreatesBranchSegments = children.length > 1;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      const childIsLast = index === children.length - 1;
      renderStack.push(
        childCreatesBranchSegments
          ? {
              ancestorColumns:
                frame.depth > 0
                  ? [
                      ...frame.ancestorColumns,
                      {
                        key: `${id}:column-${frame.depth}`,
                        state: frame.connectorContinues ? "line" : "blank",
                      },
                    ]
                  : [...frame.ancestorColumns],
              connectorContinues: !childIsLast,
              connectorKind: childIsLast ? "last" : "middle",
              depth: frame.depth + 1,
              node: child,
              siblingIndex: index,
              siblingCount: children.length,
            }
          : {
              ancestorColumns: frame.ancestorColumns,
              connectorContinues: frame.connectorContinues,
              connectorKind: frame.depth === 0 ? "none" : frame.connectorContinues ? "line" : "blank",
              depth: frame.depth,
              node: child,
              siblingIndex: index,
              siblingCount: children.length,
            },
      );
    }
  }

  return { currentEntryId: effectiveLeafId, currentOrder, items };
}

function countVisibleDescendants(
  children: SessionTreeNode[],
  normalizedQuery: string,
  subtreeMatchesById: Map<string, boolean>,
) {
  let count = 0;
  const stack = [...children];
  while (stack.length > 0) {
    const node = stack.pop();
    const id = node?.entry.id;
    if (!node || !id) continue;
    if (normalizedQuery && !subtreeMatchesById.get(id)) continue;
    count += 1;
    stack.push(...node.children);
  }
  return count;
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
