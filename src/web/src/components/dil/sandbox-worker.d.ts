import type { DilProgram } from "./compiler.ts";
import type { DilData, WireNode } from "./render-tree.ts";

export interface DilArtifact {
  readonly code: string;
  readonly data: DilData;
  readonly errors: number;
}

export function assembleProgram(program: DilProgram): DilArtifact;

export interface DilResult {
  readonly tree: WireNode[];
  readonly buttons: readonly string[];
  readonly state: Record<string, unknown>;
  readonly effects: readonly string[];
  readonly errors: number;
}

export function createProgram(initialState?: Record<string, unknown>): {
  load(program: DilProgram): DilResult;
  probe(id: string): boolean;
  trigger(id: string, args?: readonly unknown[]): DilResult | null;
};
