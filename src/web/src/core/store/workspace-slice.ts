import type { GitStatusResult } from "../types";
import { artifactsFromToolEvent, mergeArtifacts } from "../workspace-artifacts";
import type { StoreSlice, WorkspaceSlice } from "./types";

let gitRefreshTimer: number | null = null;

export const createWorkspaceSlice: StoreSlice<WorkspaceSlice> = (set, get) => ({
  gitStatus: null,
  gitLoading: false,
  artifacts: [],

  setArtifacts: (artifacts) => set({ artifacts }),

  mergeArtifactsFromToolEvent: (event) => {
    const incoming = artifactsFromToolEvent(event);
    if (incoming.length === 0) return;
    set((state) => ({ artifacts: mergeArtifacts(state.artifacts, incoming) }));
  },

  refreshGitStatus: async () => {
    set({ gitLoading: true });
    try {
      set({ gitStatus: (await get().send("get_git_status")) as GitStatusResult });
    } catch (error) {
      console.error("[pi-web-ui] get_git_status failed", error);
      set({ gitStatus: null });
    } finally {
      set({ gitLoading: false });
    }
  },

  requestGitStatusRefresh: (options) => {
    if (options?.debounce) {
      if (gitRefreshTimer) window.clearTimeout(gitRefreshTimer);
      gitRefreshTimer = window.setTimeout(() => {
        gitRefreshTimer = null;
        void get().refreshGitStatus();
      }, 350);
      return;
    }
    void get().refreshGitStatus();
  },

  clearWorkspaceTimers: () => {
    if (gitRefreshTimer) window.clearTimeout(gitRefreshTimer);
    gitRefreshTimer = null;
  },
});
