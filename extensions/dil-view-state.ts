export const DIL_VIEW_STATE_ENTRY = "pi-web-ui:dil-view-state";

export type DilViewState = Readonly<{ root: Readonly<Record<string, unknown>> }>;

export type DilViewStateEntry = Readonly<{ messageEntryId: string; viewState: DilViewState }>;

/** Read a bounded DIL snapshot from the session or the browser. */
export function parseDilViewState(value: unknown): DilViewState | undefined {
  if (!value || typeof value !== "object" || !("root" in value)) return;
  const root = value.root;
  if (!root || typeof root !== "object" || Object.getPrototypeOf(root) !== Object.prototype) return;

  const pending: [unknown, number][] = [[root, 0]];
  let fields = 40_000;
  let text = 1_000_000;
  for (let field = pending.pop(); field; field = pending.pop()) {
    const [data, depth] = field;
    if (--fields < 0 || depth > 16) return;
    if (typeof data === "string") text -= data.length;
    else if (data === null || typeof data === "boolean" || (typeof data === "number" && Number.isFinite(data))) {
      continue;
    } else if (Array.isArray(data)) {
      if (data.length > fields - pending.length) return;
      for (const item of data) pending.push([item, depth + 1]);
    } else if (data && typeof data === "object" && Object.getPrototypeOf(data) === Object.prototype) {
      const entries = Object.entries(data);
      fields -= entries.length;
      if (entries.length > fields - pending.length) return;
      for (const [key, item] of entries) {
        text -= key.length;
        pending.push([item, depth + 1]);
      }
    } else {
      return;
    }
    if (text < 0) return;
  }
  return { root: root as Record<string, unknown> };
}
