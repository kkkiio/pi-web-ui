import type { DilProgram } from "./compiler.ts";
import type { DilData, WireNode } from "./render-tree.ts";

export interface DilArtifact {
  readonly code: string;
  readonly data: DilData;
}

export function assembleProgram(program: DilProgram): DilArtifact;

export interface DilResult {
  readonly tree: WireNode[];
  readonly state: Record<string, unknown>;
  readonly effects: readonly string[];
}

export function createProgram(initialState?: Record<string, unknown>): {
  load(program: DilProgram): DilResult;
  trigger(id: string, args?: readonly unknown[]): DilResult | null;
};
