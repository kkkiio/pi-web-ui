(() => {
  const LIMIT = 5_000;
  const MAX_TEXT = 1_000_000;
  const NativeFunction = Function;
  const copy = structuredClone;
  const trim = (value) => (typeof value === "string" ? value.trim() : "");
  const isArray = Array.isArray;

  function sanitize(value, budget, depth = 0) {
    if (--budget.nodes < 0 || depth > 16) throw new Error("DIL value exceeds its size limit");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string") {
      budget.text -= value.length;
      if (budget.text < 0) throw new Error("DIL value exceeds its text limit");
      return value;
    }
    if (isArray(value)) {
      if (value.length > budget.nodes) throw new Error("DIL list exceeds its size limit");
      return value.map((item) => sanitize(item, budget, depth + 1));
    }
    if (value && typeof value === "object") {
      const fields = Object.keys(value);
      if (fields.length > budget.nodes) throw new Error("DIL object exceeds its size limit");
      return Object.fromEntries(
        fields.map((key) => {
          sanitize(key, budget);
          return [key, sanitize(value[key], budget, depth + 1)];
        }),
      );
    }
    return undefined;
  }

  /** Assemble a runnable JS body and its data using the worker's native syntax checks. */
  function assembleProgram(program) {
    let errors = 0;
    const code = program.script
      .map((part) => {
        if (typeof part === "string") return part;
        try {
          switch (part.kind) {
            case "each":
              new NativeFunction(`"use strict"; return ((${part.code}) => 0);`);
              return `(${part.code})`;
            case "expr":
              new NativeFunction(`"use strict"; return (${part.code}\n);`);
              return part.code;
            default:
              new NativeFunction(`"use strict";\n${part.code}\n`);
              return part.code;
          }
        } catch {
          errors++;
          return part.kind === "each" ? `(${part.fallback})` : part.fallback;
        }
      })
      .join("");
    return { code, data: program.data, errors };
  }

  /** Execute DIL revisions and serialize the nodes, state, and effects of explicit control events. */
  function createProgram(initialState = {}) {
    let slots = new Map(Object.entries(initialState));
    let factory;
    let programData;
    let callbacks = new Map();
    let effects;
    let updating = false;

    const GenUI = Object.freeze({
      issueNewTurn(value) {
        const prompt = trim(value);
        if (effects && prompt && prompt.length <= MAX_TEXT && effects.length === 0) effects.push(prompt);
      },
    });
    const DIL = Object.freeze({ useState: (initial, options) => state(options?.key, initial, options) });

    function state(key, initial, options) {
      const slot = typeof options?.key === "string" ? options.key : key;
      if (typeof slot !== "string" || slot.length > 512) return [initial, () => undefined];
      if (!slots.has(slot)) slots.set(slot, initial);
      return [
        slots.get(slot),
        (next) => {
          if (updating) slots.set(slot, typeof next === "function" ? next(slots.get(slot)) : next);
        },
      ];
    }

    function render(nextFactory, data) {
      const handlers = new Map();
      const buttons = [];
      const budget = { nodes: LIMIT * 8, text: MAX_TEXT };
      let errors = 0;
      let nodes = LIMIT;
      let iterations = LIMIT;
      const safe = (fn) => {
        try {
          return fn();
        } catch {
          errors++;
          return undefined;
        }
      };
      const format = (value, depth = 0) => {
        if (value == null || typeof value === "function" || depth > 16) return "";
        if (typeof value === "string") return value;
        if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
        if (isArray(value))
          return value
            .slice(0, LIMIT)
            .map((item) => format(item, depth + 1))
            .join(", ");
        return typeof value === "boolean" ? String(value) : (JSON.stringify(sanitize(value, budget)) ?? "");
      };
      const runtime = {
        safe,
        state,
        text(value) {
          if (nodes <= 0) return null;
          const result = safe(() => sanitize(format(value), budget));
          if (result) nodes--;
          return result || null;
        },
        flatten(children) {
          const result = [];
          for (const child of children) {
            if (child?.list) {
              for (const item of child.list) result.push(item);
            } else if (child != null) {
              result.push(child);
            }
          }
          return { list: result };
        },
        each(items, path, renderItem) {
          const result = [];
          if (isArray(items)) {
            for (let i = 0; i < items.length && nodes > 0 && iterations-- > 0; i++) {
              if (!(i in items)) continue;
              const item = safe(() => renderItem(items[i], i, `${path}.${i}`));
              if (item?.list) for (const child of item.list) result.push(child);
            }
          }
          return { list: result };
        },
        node(site, path, dynamic, children) {
          if (nodes-- <= 0) return null;
          const props = Object.create(null);
          for (const [name, value] of Object.entries(dynamic)) {
            if (name === "onClick" || name === "onChange") {
              if (typeof value !== "function") continue;
              const { offset, name: tag } = data[site];
              const id = `${offset}:${tag}:${path}:${name}`;
              if (tag === "button" && name === "onClick") buttons.push(id);
              handlers.set(id, value);
              props[name] = { id };
            } else {
              const property = safe(() => sanitize(value, budget));
              if (property !== undefined) props[name] = property;
            }
          }
          return [site, props, children().list];
        },
      };
      const tree = nextFactory(runtime, data, DIL, GenUI, "")?.list;
      if (!isArray(tree)) throw new Error("DIL program did not return a tree");
      const saved = sanitize(Object.fromEntries(slots), budget);
      return { tree, handlers, buttons, state: saved, errors };
    }

    return {
      load(program) {
        const artifact = assembleProgram(program);
        const nextFactory = new NativeFunction(
          "__dil",
          "__dilData",
          "DIL",
          "GenUI",
          "__dilPath",
          `"use strict";\n${artifact.code}`,
        );
        const before = new Map(slots);
        try {
          const next = render(nextFactory, artifact.data);
          callbacks = next.handlers;
          factory = nextFactory;
          programData = artifact.data;
          return { tree: next.tree, buttons: next.buttons, state: next.state, effects: [], errors: artifact.errors + next.errors };
        } catch (error) {
          slots = before;
          throw error;
        }
      },
      probe(id) {
        const handler = callbacks.get(id);
        if (!handler) return false;
        const recorded = [];
        effects = recorded;
        try {
          handler();
        } catch {
        } finally {
          effects = undefined;
        }
        return recorded.length > 0;
      },
      trigger(id, args = []) {
        if (!factory || !callbacks.has(id)) return null;
        const before = new Map(slots);
        const performed = [];
        effects = performed;
        updating = true;
        try {
          callbacks.get(id)(...args);
          updating = false;
          effects = undefined;
          const next = render(factory, programData);
          callbacks = next.handlers;
          return { tree: next.tree, buttons: next.buttons, state: next.state, effects: performed, errors: next.errors };
        } catch {
          slots = before;
          return null;
        } finally {
          updating = false;
          effects = undefined;
        }
      },
    };
  }

  if (typeof exports === "object") {
    exports.assembleProgram = assembleProgram;
    exports.createProgram = createProgram;
  }

  if (
    typeof self !== "undefined" &&
    typeof self.document === "undefined" &&
    typeof self.addEventListener === "function"
  ) {
    self.addEventListener(
      "message",
      (event) => {
        const port = event.ports[0];
        if (!port) return;
        const send = port.postMessage.bind(port);
        const receive = port.addEventListener.bind(port);
        const program = createProgram(event.data.state);
        for (const name of ["Worker", "SharedWorker", "BroadcastChannel", "postMessage", "importScripts", "close"]) {
          Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false });
        }
        const task = event.data.intent;
        if (task) {
          for (const handler of task.buttons) {
            try {
              const specimen = createProgram(copy(event.data.state));
              specimen.load(task.program);
              if (specimen.probe(handler)) send({ handler });
            } catch {}
          }
          send({ done: true });
          return;
        }
        let revision = 0;
        receive("message", ({ data }) => {
          const { id, request } = data;
          let result = null;
          try {
            if (request.kind === "load") {
              result = program.load(request.program);
              revision = request.revision;
            } else if (request.kind === "trigger" && request.revision === revision) {
              result = program.trigger(request.handler, request.args);
            }
            if (result) result = copy(result);
          } catch {
            result = null;
          }
          send({ id, result });
        });
        port.start();
        send({ ready: true });
      },
      { once: true },
    );
  }
})();
