import type { FileContentResult, GitDiffResult, RightPanelSlice, StoreSlice } from "./types";

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
      return { activeRightPanelTabId: tab.id, rightPanelHasOpened: true, rightPanelTabs, rightPanelVisible: true };
    });
  },

  openGitDiff: async () => {
    const startedAt = Date.now();
    const status = get().gitStatus;
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

  openArtifact: async (artifact) => {
    get().upsertRightPanelTab({
      id: `artifact:${artifact.path}`,
      kind: "artifact-file",
      title: artifact.name,
      path: artifact.path,
      loading: true,
      updatedAt: Date.now(),
    });
    try {
      const result = (await get().send("get_file_content", { path: artifact.path })) as FileContentResult;
      get().upsertRightPanelTab({
        id: `artifact:${artifact.path}`,
        kind: "artifact-file",
        title: result.name || artifact.name,
        path: result.path || artifact.path,
        content: result.content,
        size: result.size,
        loading: false,
        updatedAt: Date.now(),
      });
    } catch (error) {
      get().upsertRightPanelTab({
        id: `artifact:${artifact.path}`,
        kind: "artifact-file",
        title: artifact.name,
        path: artifact.path,
        error: error instanceof Error ? error.message : "Failed to load artifact",
        loading: false,
        updatedAt: Date.now(),
      });
    }
  },

  refreshRightPanelTab: (tab) => {
    if (tab.kind === "git-diff") {
      void get().openGitDiff();
      return;
    }
    void get().openArtifact({
      id: tab.path,
      path: tab.path,
      name: tab.title,
      directory: tab.path.includes("/") ? tab.path.slice(0, tab.path.lastIndexOf("/")) : ".",
      tool: "edit",
      updatedAt: Date.now(),
    });
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
