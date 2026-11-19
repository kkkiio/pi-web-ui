/**
 * Executes the reference implementation's compiled artifact (`*.raw.js`).
 *
 * The corpus is not documentation: every sample ships the JavaScript ChatGPT's server
 * compiled the model's DIL into, plus the data the client supplied (`constants`,
 * `appData`, `view_state`). That program is closed — its only free variables are the
 * runtime names below — so it runs in Node with a shim, and its output is the oracle our
 * interpreter is measured against.
 *
 * Two things the shim must get right, because the whole comparison rests on them:
 *
 *   - **Bindings are ordinary JavaScript.** `const [x, setX] = DIL.useState(…)}` compiles
 *     to a real `const`, so a handler created in one render reads that render's value, and
 *     a setter does nothing but write the slot and re-run the program. That is React
 *     semantics, and it is not ours to choose.
 *   - **`view_state` seeds the slots.** The captured state is keyed the same way the model
 *     keyed it (`{ key }`), which makes "how state is named and restored" observable.
 */

/** One node of the reference's render output, expanded to plain data. */
export type ReferenceNode =
  | { readonly kind: "text"; readonly value: string }
  | {
      readonly kind: "element";
      readonly tag: string;
      readonly props: Readonly<Record<string, unknown>>;
      readonly children: readonly ReferenceNode[];
    };

/** A host action the program performed, in call order. */
export interface ReferenceEffect {
  readonly name: string;
  readonly args: readonly unknown[];
}

/** `*.data.json`: what the client handed the compiled program. */
export interface SampleData {
  readonly constants?: readonly unknown[];
  readonly appData?: unknown;
  readonly view_state?: { readonly root?: Record<string, unknown> };
}

export interface ReferenceProgram {
  /** The tree the program produces right now. */
  render(): readonly ReferenceNode[];
  /** Slot values, as the client persisted them (`view_state.root`). */
  state(): Record<string, unknown>;
  /** Host actions performed since the last `clearEffects()`. */
  effects(): readonly ReferenceEffect[];
  clearEffects(): void;
  /** Fire a control's `onChange`, as the client would; false when there is no such node. */
  change(tag: string, value: unknown): boolean;
  /** Fire the last `tag` node's `onClick`; false when there is no such node. */
  click(tag: string): boolean;
}

/** Host components the compiled program names; they carry no behaviour we compare. */
const HOST_COMPONENTS = ["Cite", "Link", "Entity", "AsyncImage", "AsyncImageGroup", "__chatgptClientDefinedWidget"];

const FRAGMENT = Symbol("Fragment");

export interface ReferenceOptions {
  /**
   * Start from the captured `view_state`.
   *
   * Off by default: the transition comparison starts both sides from their declared
   * initial values. Restore is its own check, because we do not implement it yet.
   */
  readonly seedViewState?: boolean;
}

export function createReferenceProgram(
  code: string,
  data: SampleData,
  options: ReferenceOptions = {},
): ReferenceProgram {
  const slots = new Map<string, unknown>();
  const seeded = options.seedViewState ? (data.view_state?.root ?? {}) : {};
  const performed: ReferenceEffect[] = [];
  let anonymous = 0;
  let root: unknown = null;

  const record =
    (name: string) =>
    (...args: unknown[]) => {
      performed.push({ name, args });
      return undefined;
    };

  const runtime = {
    Fragment: FRAGMENT,
    jsx: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
      type,
      props: props ?? {},
      children,
    }),
    render: (element: unknown) => {
      root = element;
    },
    useState: (initial: unknown, options?: { key?: string }) => {
      const key = typeof options?.key === "string" ? options.key : `anonymous:${anonymous++}`;
      if (!slots.has(key)) slots.set(key, Object.hasOwn(seeded, key) ? seeded[key] : initial);
      const set = (next: unknown) => {
        const previous = slots.get(key);
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(previous) : next;
        // The reference runtime bails out on an identical value, as React does.
        if (Object.is(value, previous)) return;
        slots.set(key, value);
        render(); // the reference re-runs the whole program
      };
      return [slots.get(key), set];
    },
    useConstants: () => data.constants ?? [],
    useAppData: (select?: (value: unknown) => unknown) => (select ? select(data.appData) : data.appData),
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (fn: unknown) => fn,
    useEffect: () => undefined,
    useRef: (initial: unknown) => ({ current: initial }),
    useNow: () => 0,
  };

  const GenUI = {
    issueNewTurn: record("issueNewTurn"),
    openUrl: record("openUrl"),
  };

  const host = (tag: string) => (props: Record<string, unknown>) => ({ type: tag, props, children: [props.children] });

  const parameters = ["DIL", "__dil", "__dilSafe", "GenUI", ...HOST_COMPONENTS];
  // `new Function` keeps the corpus out of the module graph; the program is data.
  const run = new Function(...parameters, code) as (...args: unknown[]) => void;

  function render(): void {
    root = null;
    run(
      runtime,
      { Fragment: FRAGMENT, jsx: runtime.jsx },
      (evaluate: () => unknown, failure: unknown) => {
        try {
          return evaluate();
        } catch {
          return failure;
        }
      },
      GenUI,
      ...HOST_COMPONENTS.map(host),
    );
  }

  render();

  /** Expand the current program, renumbering anonymous slots per pass like the client. */
  function currentTree(): readonly ReferenceNode[] {
    anonymous = 0;
    return expand(root);
  }

  const handlers = (tag: string): Array<(...args: unknown[]) => unknown> => {
    const found: Array<(...args: unknown[]) => unknown> = [];
    const walk = (nodes: readonly ReferenceNode[]): void => {
      for (const node of nodes) {
        if (node.kind !== "element") continue;
        if (node.tag === tag && typeof node.props.onClick === "function") {
          found.push(node.props.onClick as (...args: unknown[]) => unknown);
        }
        if (node.tag === tag && typeof node.props.onChange === "function") {
          found.push(node.props.onChange as (...args: unknown[]) => unknown);
        }
        walk(node.children);
      }
    };
    walk(currentTree());
    return found;
  };

  return {
    render: currentTree,
    state: () => {
      currentTree(); // the component runs during expansion, so slots exist only after it
      return Object.fromEntries(slots);
    },
    effects: () => performed,
    clearEffects: () => performed.splice(0, performed.length),
    change: (tag, value) => {
      const [onChange] = handlers(tag);
      if (!onChange) return false;
      onChange(value);
      return true;
    },
    click: (tag) => {
      const onClick = handlers(tag).at(-1);
      if (!onClick) return false;
      onClick();
      return true;
    },
  };
}

/** Expand a compiled element tree into plain data, calling component functions. */
function expand(node: unknown): ReferenceNode[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string") return node === "" ? [] : [{ kind: "text", value: node }];
  if (typeof node === "number") return [{ kind: "text", value: String(node) }];
  if (Array.isArray(node)) return node.flatMap(expand);
  if (typeof node === "function") return expand((node as () => unknown)());
  if (typeof node !== "object") return [];

  const element = node as { type: unknown; props: Record<string, unknown>; children?: unknown[] };
  if (element.type === FRAGMENT) return expand(element.children ?? []);
  if (typeof element.type === "function") {
    const rendered = (element.type as (props: unknown) => unknown)({
      ...element.props,
      children: element.children ?? [],
    });
    return expand(rendered);
  }
  if (typeof element.type !== "string") return [];

  return [
    {
      kind: "element",
      tag: element.type,
      props: element.props,
      children: expand(element.children ?? []),
    },
  ];
}
