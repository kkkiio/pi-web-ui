import { useMemo, useState } from "react";
import type { SessionTreeNode } from "../../core/types";
import { buildConversationTreeItems } from "./conversation-tree-model";

export function useConversationTree(tree: SessionTreeNode[], leafId: string | null, searchQuery: string) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const { currentEntryId, currentOrder, items } = useMemo(
    () => buildConversationTreeItems({ tree, leafId, collapsedIds, searchQuery }),
    [tree, leafId, collapsedIds, searchQuery],
  );

  const toggleExpanded = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return { collapsedIds, currentEntryId, currentOrder, items, toggleExpanded };
}
