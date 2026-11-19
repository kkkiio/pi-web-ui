/**
 * Our side of a conformance run: the same sample, the same events, the projections.
 *
 * It deliberately drives the *product* modules (`parseDocument` → `evaluateStatements` →
 * `resolveNodes`, with `DilRuntime` owning state and the host bridge) rather than a
 * harness-only reimplementation, so a difference means the shipped renderer differs from
 * the reference — not that a test double does.
 */

import { type ResolvedNode, resolveNodes } from "../src/web/src/components/dil/resolve.ts";
import { DilRuntime } from "../src/web/src/components/dil/runtime.ts";
import { collectStatements, evaluateStatements, parseDocument } from "../src/web/src/core/dil/index.ts";
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

export interface OurOptions {
  /**
   * Seed the slots from the captured `view_state`, as the reference does.
   *
   * Off by default: we do not implement state restore yet, and the comparison this PR
   * makes is about *transitions*. The restore itself is a separate, registered gap.
   */
  readonly seedViewState?: boolean;
  readonly viewState?: Record<string, unknown>;
}

export function createOurProgram(source: string, options: OurOptions = {}): OurProgram {
  const performed: ReferenceEffect[] = [];
  const runtime = new DilRuntime(
    () => undefined,
    () => ({
      issueNewTurn: (prompt: string) => {
        performed.push({ name: "issueNewTurn", args: [prompt] });
      },
      busy: false,
    }),
  );

  // A harness-only seed: the product has no restore path yet (see `deviations.json`).
  if (options.seedViewState && options.viewState) {
    for (const [key, value] of Object.entries(options.viewState)) {
      runtime.stateSlot(key, value, key);
    }
  }

  const render = (): readonly ResolvedNode[] => {
    const document = parseDocument(source, { isStreaming: false });
    const statements = collectStatements(document.raw);
    const scope = statements.length
      ? evaluateStatements(statements, runtime.seed(), { useState: runtime.stateSlot })
      : runtime.seed();
    return resolveNodes(document.tree, scope);
  };

  let tree = render();
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
    state: () => runtime.state(),
    effects: () => performed,
    clearEffects: () => performed.splice(0, performed.length),
    change: (tag, value) => {
      const node = find(tree, tag);
      if (!node || node.kind !== "element") return false;
      runtime.invoke(node.props.onChange, [value]);
      tree = render();
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
      runtime.invoke(node.props.onClick);
      tree = render();
      return true;
    },
  };
}
