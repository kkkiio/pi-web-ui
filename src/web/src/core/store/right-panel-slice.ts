import type { GitDiffResult, RightPanelSlice, StoreSlice } from "./types";

export const createRightPanelSlice: StoreSlice<RightPanelSlice> = (set, get) => ({
  rightPanelTabs: [],
  activeRightPanelTabId: null,
  rightPanelVisible: false,
  rightPanelHasOpened: false,

  upsertRightPanelTab: (tab) => {
    set((state) => {
      const index = state.rightPanelTabs.findIndex((candidate) => candidate.id === tab.id);
      const rightPanelTabs =
        index === -1
          ? [...state.rightPanelTabs, tab]
          : state.rightPanelTabs.map((candidate) => (candidate.id === tab.id ? { ...candidate, ...tab } : candidate));
      // NOTE: visibility is deliberately NOT set here. Async load completions
      // also upsert, and they must not reopen the panel after the user hid it.
      // Explicit user actions (openGitDiff) set visibility.
      return { activeRightPanelTabId: tab.id, rightPanelHasOpened: true, rightPanelTabs };
    });
  },

  openGitDiff: async () => {
    const startedAt = Date.now();
    const status = get().gitStatus;
    set({ rightPanelVisible: true });
    get().upsertRightPanelTab({
      id: "git-diff",
      kind: "git-diff",
      title: "Changes",
      branch: status?.branch ?? null,
      isRepo: status?.isRepo,
      loading: true,
      updatedAt: startedAt,
    });
    try {
      const result = (await get().send("get_git_diff")) as GitDiffResult;
      get().upsertRightPanelTab({
        id: "git-diff",
        kind: "git-diff",
        title: "Changes",
        branch: result.branch,
        diff: result.diff,
        isRepo: result.isRepo,
        loading: false,
        updatedAt: Date.now(),
      });
    } catch (error) {
      get().upsertRightPanelTab({
        id: "git-diff",
        kind: "git-diff",
        title: "Changes",
        branch: status?.branch ?? null,
        isRepo: status?.isRepo,
        error: error instanceof Error ? error.message : "Failed to load git diff",
        loading: false,
        updatedAt: Date.now(),
      });
    }
  },

  refreshRightPanelTab: (tab) => {
    if (tab.kind === "git-diff") {
      void get().openGitDiff();
    }
  },

  closeRightPanelTab: (id) => {
    set((state) => {
      const index = state.rightPanelTabs.findIndex((tab) => tab.id === id);
      const rightPanelTabs = state.rightPanelTabs.filter((tab) => tab.id !== id);
      const activeRightPanelTabId =
        state.activeRightPanelTabId !== id
          ? state.activeRightPanelTabId && rightPanelTabs.some((tab) => tab.id === state.activeRightPanelTabId)
            ? state.activeRightPanelTabId
            : (rightPanelTabs[0]?.id ?? null)
          : (rightPanelTabs[index]?.id ?? rightPanelTabs[index - 1]?.id ?? null);
      return { activeRightPanelTabId, rightPanelTabs, rightPanelVisible: rightPanelTabs.length > 0 };
    });
  },

  setActiveRightPanelTabId: (activeRightPanelTabId) => set({ activeRightPanelTabId }),
  toggleRightPanelVisible: () => set((state) => ({ rightPanelVisible: !state.rightPanelVisible })),
});
