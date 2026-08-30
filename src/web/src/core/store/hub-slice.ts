import type { AgentSessionInfo, HistorySessionInfo } from "../../../../protocol/index";
import type { PiWebUiStore, StoreSlice } from "./types";

export type HubSlice = {
  liveSessions: AgentSessionInfo[];
  attachedAgentId: string | null;
  recentSessions: HistorySessionInfo[];
  applyHubSessions: (sessions: AgentSessionInfo[]) => void;
  applyAgentGone: (agentId: string) => void;
  syncAttachment: () => Promise<void>;
  switchAgent: (agentId: string) => Promise<void>;
  refreshRecentSessions: () => Promise<void>;
};

// State tied to the currently attached agent; cleared when switching agents.
const agentStateReset: Partial<PiWebUiStore> = {
  items: [],
  chatStatus: "ready",
  conversationSyncError: null,
  lastUsage: null,
  contextWindowSize: 0,
  currentModel: null,
  modelLabel: "model",
  thinkingLevel: "off",
  sessionName: "",
  gitStatus: null,
  rightPanelTabs: [],
  activeRightPanelTabId: null,
  error: null,
};

export const createHubSlice: StoreSlice<HubSlice> = (set, get) => ({
  liveSessions: [],
  attachedAgentId: null,
  recentSessions: [],

  applyHubSessions: (sessions) => {
    set({ liveSessions: sessions });
    const { attachedAgentId } = get();
    // The hub auto-attaches at the socket level, but an agent that connects
    // after the browser needs an explicit attach.
    if (!attachedAgentId && sessions.length > 0) {
      void get().switchAgent(sessions[sessions.length - 1].agentId);
    }
  },

  applyAgentGone: (agentId) => {
    if (get().attachedAgentId !== agentId) return;
    set({ attachedAgentId: null, ...agentStateReset });
    get().addSystemMessage("Agent disconnected");
  },

  syncAttachment: async () => {
    try {
      const result = (await get().send("attach")) as { attached?: string | null };
      set({ attachedAgentId: result.attached ?? null });
    } catch {}
  },

  switchAgent: async (agentId) => {
    if (get().attachedAgentId === agentId) return;
    const result = (await get().send("attach", { agentId })) as { attached?: string | null };
    if (!result?.attached) return;
    set({ attachedAgentId: result.attached, ...agentStateReset });
    await get().requestConversationSync();
    await get().refreshSettingsState();
    get().requestGitStatusRefresh();
  },

  refreshRecentSessions: async () => {
    try {
      const result = (await get().send("list_history")) as { history?: HistorySessionInfo[] };
      set({ recentSessions: result.history ?? [] });
    } catch {}
  },
});
