import type { DialogSlice, StoreSlice } from "./types";

export const createDialogSlice: StoreSlice<DialogSlice> = (set, get) => ({
  dialog: null,

  setDialog: (dialog) => set({ dialog }),

  respondDialog: (response) => {
    const dialog = get().dialog;
    if (!dialog) return;
    get()
      .send("extension_ui_response", { id: dialog.id, ...response })
      .catch(() => {});
    set({ dialog: null });
  },
});
