import type { DilViewState } from "../extensions/dil-view-state.ts";
import { compileDil } from "../src/web/src/components/dil/compiler.ts";
import { type DilHandler, type ResolvedNode, readTree } from "../src/web/src/components/dil/render-tree.ts";
import { createProgram } from "../src/web/src/components/dil/sandbox-worker.js";
import { parseDocument } from "../src/web/src/core/dil/index.ts";
import type { ReferenceEffect } from "./reference.ts";

export interface OurProgram {
  render(): readonly ResolvedNode[];
  state(): Record<string, unknown>;
  effects(): readonly ReferenceEffect[];
  clearEffects(): void;
  /** Apply one event to the node a user would have touched. */
  change(tag: string, value: unknown): boolean;
  click(tag: string): boolean;
}

export function createOurProgram(source: string, viewState?: DilViewState): OurProgram {
  const performed: ReferenceEffect[] = [];
  const runtime = createProgram(viewState?.root);
  const compiled = compileDil(parseDocument(source, { isStreaming: false }));
  const program = compiled.program;
  let result = program ? runtime.load(program) : undefined;
  let tree = program && result ? readTree(result.tree, program.data) : compiled.tree;
  const fire = (value: unknown, args?: unknown[]): void => {
    if (!program || !value) return;
    const next = runtime.trigger((value as DilHandler).id, args);
    if (!next) return;
    result = next;
    tree = readTree(next.tree, program.data);
    for (const prompt of next.effects) performed.push({ name: "issueNewTurn", args: [prompt] });
  };
  const find = (nodes: readonly ResolvedNode[], tag: string): ResolvedNode | null => {
    for (const node of nodes) {
      if (node.kind !== "element") continue;
      if (node.name === tag) return node;
      const nested = find(node.children, tag);
      if (nested) return nested;
    }
    return null;
  };

  return {
    render: () => tree,
    state: () => result?.state ?? {},
    effects: () => performed,
    clearEffects: () => performed.splice(0, performed.length),
    change: (tag, value) => {
      const node = find(tree, tag);
      if (!node || node.kind !== "element") return false;
      fire(node.props.onChange, [value]);
      return true;
    },
    click: (tag) => {
      // The last matching node: a card's submit button follows its controls.
      const all: ResolvedNode[] = [];
      const collect = (nodes: readonly ResolvedNode[]): void => {
        for (const node of nodes) {
          if (node.kind !== "element") continue;
          if (node.name === tag) all.push(node);
          collect(node.children);
        }
      };
      collect(tree);
      const node = all.at(-1);
      if (!node || node.kind !== "element") return false;
      fire(node.props.onClick);
      return true;
    },
  };
}
