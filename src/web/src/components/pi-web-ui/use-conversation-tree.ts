import { useMemo, useState } from "react";
import type { SessionTreeNode } from "../../core/types";
import {
  buildActivePathSet,
  buildConversationTreeItems,
  collectVisibleConversationTreeItems,
} from "./conversation-tree-model";

export function useConversationTree(tree: SessionTreeNode[], leafId: string | null, searchQuery: string) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const activePathIds = useMemo(() => buildActivePathSet(tree, leafId), [tree, leafId]);
  const { currentOrder, items } = useMemo(
    () => buildConversationTreeItems({ tree, leafId, activePathIds, expandedIds, searchQuery }),
    [tree, leafId, activePathIds, expandedIds, searchQuery],
  );
  const visibleItems = useMemo(() => collectVisibleConversationTreeItems(items), [items]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return { activePathIds, currentOrder, expandedIds, items, toggleExpanded, visibleItems };
}
