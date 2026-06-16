import { useMemo, useState } from "react";
import type { SessionTreeNode } from "../../core/types";
import {
  buildActivePathSet,
  buildConversationTreeItems,
  collectVisibleConversationTreeItems,
} from "./conversation-tree-model";

export function useConversationTree(tree: SessionTreeNode[], leafId: string | null, searchQuery: string) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const activePathIds = useMemo(() => buildActivePathSet(tree, leafId), [tree, leafId]);
  const { currentEntryId, currentOrder, items } = useMemo(
    () => buildConversationTreeItems({ tree, leafId, activePathIds, collapsedIds, searchQuery }),
    [tree, leafId, activePathIds, collapsedIds, searchQuery],
  );
  const visibleItems = useMemo(() => collectVisibleConversationTreeItems(items), [items]);

  const toggleExpanded = (id: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return { activePathIds, collapsedIds, currentEntryId, currentOrder, items, toggleExpanded, visibleItems };
}
