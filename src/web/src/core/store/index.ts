import { create } from "zustand";
import { createConnectionSlice } from "./connection-slice";
import { createDialogSlice } from "./dialog-slice";
import { createRightPanelSlice } from "./right-panel-slice";
import { createSessionSlice } from "./session-slice";
import { createSettingsSlice } from "./settings-slice";
import type { PiWebUiStore } from "./types";
import { createWorkspaceSlice } from "./workspace-slice";

export const usePiWebUiStore = create<PiWebUiStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createSessionSlice(...args),
  ...createSettingsSlice(...args),
  ...createWorkspaceSlice(...args),
  ...createRightPanelSlice(...args),
  ...createDialogSlice(...args),
}));

export type { PiWebUiStore };
