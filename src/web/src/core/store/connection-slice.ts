import type { ConnectionSlice, StoreSlice } from "./types";

export const createConnectionSlice: StoreSlice<ConnectionSlice> = (set, get) => ({
  client: null,
  connection: "connecting",
  error: null,
  advancedFeatures: false,
  archAvailable: false,

  setClient: (client) => set({ client }),

  send: async (method, params) => {
    const client = get().client;
    if (!client) throw new Error("Pi client is not connected");
    return client.send(method, params);
  },

  setConnection: (connection) => set({ connection }),
  setError: (error) => set({ error }),

  applyWebUiState: (payload) => {
    const next: Partial<ConnectionSlice> = {};
    if (typeof payload.advancedFeatures === "boolean") next.advancedFeatures = payload.advancedFeatures;
    if (typeof payload.archAvailable === "boolean") next.archAvailable = payload.archAvailable;
    if (Object.keys(next).length > 0) set(next);
  },
});
