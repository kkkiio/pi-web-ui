import { createContext, useContext } from "react";
import type { DilHost, DilSandbox } from "./runtime";

/** What a control needs from the renderer above it: the document's runtime, and the host. */
export interface DilRuntimeValue {
  readonly runtime: DilSandbox;
  readonly sends: ReadonlySet<string>;
  readonly host: DilHost | null;
}

/**
 * Provided by the app (`app.tsx`) for the whole transcript: the browser half of
 * `GenUI`. Absent outside an activated Web UI session, which makes `issueNewTurn`
 * unavailable instead of silently inert.
 */
export const DilHostContext = createContext<DilHost | null>(null);

/**
 * Provided by `DilRenderer` for one message. Controls read it instead of receiving the
 * runtime through props, because `renderNode` is a plain function, not a component.
 */
export const DilRuntimeContext = createContext<DilRuntimeValue | null>(null);

export function useDilRuntime(): DilRuntimeValue | null {
  return useContext(DilRuntimeContext);
}
