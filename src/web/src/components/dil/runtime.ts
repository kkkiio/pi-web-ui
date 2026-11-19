/**
 * Per-document interaction runtime — the state the renderer did not have before `#48`.
 *
 * DIL documents are evaluated, not compiled (`../../core/dil`), so the dialect has no
 * place to *store* anything: `{@body const [tab, setTab] = DIL.useState("a")}` binds an
 * initial value and an inert setter (`core/dil/evaluator.ts`). This module supplies the
 * other half — slots that survive a re-resolve, setters that write them, and the single
 * host bridge the model may call.
 *
 * Three decisions worth knowing before reading the code:
 *
 *   - **State is bound as a getter, not a copy.** Handlers capture the scope object of
 *     the render that created them; a `scope.x = value` copy would leave
 *     `onChange={v => { setX(v); log(x) }}` reading the previous render's `x`. With a
 *     getter, every read — including one from a handler created earlier — sees the slot.
 *   - **The probe runs the handler for real, with side effects switched off.** A button
 *     cannot be classified as "sends a turn" by reading its source text: `{#if}`,
 *     lookups and template literals decide at evaluation time. So setters and `GenUI`
 *     honour a `probing` flag that records the call instead of performing it.
 *   - **Nothing here touches React.** `bump` is the renderer's own re-render request, so
 *     this file stays unit-testable in Node.
 */

import type { DilScope } from "../../core/dil/evaluator.ts";
import { callSafe, DilEvaluationError } from "../../core/dil/evaluator.ts";
import { callable, isSafeObject, namespaceValue, SAFE } from "../../core/dil/evaluator-allowlist.ts";
import type { DilStateDeclaration } from "../../core/dil/types.ts";

/** What the browser provides a document: one action, and whether it may run now. */
export interface DilHost {
  /** Send `prompt` as the next user message. Rejects when Pi is busy or disconnected. */
  issueNewTurn(prompt: string): Promise<void> | void;
  /** True while a turn is in flight: a card cannot start another one. */
  readonly busy: boolean;
}

/** A host action a handler would perform, as discovered by `probe`. */
export interface DilAction {
  readonly kind: "issueNewTurn";
  readonly text: string;
}

export class DilRuntime {
  private readonly slots = new Map<string, unknown>();
  private readonly bump: () => void;
  private readonly getHost: () => DilHost | null;
  private probing = false;
  private observed: DilAction[] = [];
  private dispatched: Promise<void> | null = null;
  /** Non-zero only while `invoke` runs: a click is the one thing allowed to dispatch. */
  private interacting = 0;

  /**
   * `getHost` reads the host at call time on purpose. The host is rebuilt whenever Pi's
   * status changes (`busy` flips at every turn), and a runtime that captured it would be
   * recreated just as often — taking every card's state with it. The runtime outlives the
   * host; only the slot map has to be stable.
   */
  constructor(bump: () => void, getHost: () => DilHost | null = () => null) {
    this.bump = bump;
    this.getHost = getHost;
  }

  /**
   * The `DIL.useState` half of statement evaluation.
   *
   * Values live in `slots`, keyed by the model's `{ key }` when it names one and by the
   * variable name otherwise, so a slot keeps its value across every re-resolve of the
   * same message.
   *
   * `evaluateStatements` calls this for each declaration so the statements *after* it see
   * the value the user chose: with the reference's own example,
   * `const price = seats * 29` has to follow `setSeats(10)`, which a freshly evaluated
   * initial value would erase on every re-resolve.
   */
  useState = (name: string, initial: unknown, key?: string): readonly [unknown, unknown] => {
    const slot = key ?? name;
    if (!this.slots.has(slot)) this.slots.set(slot, initial);
    return [this.slots.get(slot), callable(([next]) => this.write(slot, next))];
  };

  /**
   * Bind each declaration's value as a **getter** on the scope.
   *
   * `evaluateStatements` bound a plain property holding the current value, which is enough
   * for every statement and for control-flow conditions on this render. A handler is the
   * exception: it captures the scope object, and `onChange={v => { setChoice(v);
   * setRevealed(false) }}` must be able to read what it just wrote. The getter is what
   * makes the second read live; the setter replaces the one `useState` supplied, and both
   * write the same slot.
   */
  bindState(scope: DilScope, declarations: readonly DilStateDeclaration[]): void {
    // The caller owns this scope object; `DilScope` is readonly for consumers only.
    const target = scope as Record<string, unknown>;
    for (const declaration of declarations) {
      const key = declaration.key ?? declaration.name;
      // `document.state` is lexical, so a declaration that is still streaming is reported
      // before `evaluateStatements` can evaluate it. Seeding the slot from such a name
      // would pin it to `undefined` and make `useState` ignore the real initializer once
      // the rest of the source arrives — only an evaluated binding may create a slot.
      if (Object.hasOwn(target, declaration.name) && !this.slots.has(key)) {
        this.slots.set(key, target[declaration.name]);
      }
      Object.defineProperty(target, declaration.name, {
        get: () => this.slots.get(key),
        enumerable: true,
        configurable: true,
      });
      if (!declaration.setter) continue;
      target[declaration.setter] = callable(([next]) => this.write(key, next));
    }
  }

  /** The one global the renderer adds: `GenUI`. Everything else comes from the document. */
  seed(): DilScope {
    return {
      GenUI: namespaceValue({
        issueNewTurn: callable(([text]) => this.issueNewTurn(text)),
      }),
    };
  }

  /**
   * Run `handler` with side effects suppressed and report the action it would perform.
   *
   * `null` means "this control does nothing outside the document" — a local button
   * (`onClick={() => setRevealed(true)}`), or a handler that failed to evaluate.
   */
  probe(handler: unknown): DilAction | null {
    if (!isSafeObject(handler)) return null;
    const wasProbing = this.probing;
    this.observed = [];
    this.probing = true;
    try {
      callSafe(handler);
    } catch {
      // A handler that cannot run advertises nothing; its click is inert either way.
    } finally {
      this.probing = wasProbing;
    }
    const [action] = this.observed;
    this.observed = [];
    return action ?? null;
  }

  /**
   * Run `handler` for real. Returns the host promise when the handler started a turn, so
   * the control can show a sending state until Pi acknowledges it.
   */
  invoke(handler: unknown, args: readonly unknown[] = []): Promise<void> | null {
    if (!isSafeObject(handler)) return null;
    this.dispatched = null;
    this.interacting += 1;
    try {
      callSafe(handler, args);
    } catch {
      // Failure policy of the whole renderer: one broken handler never takes the
      // transcript down. A host rejection is reported by `sendPrompt` via the store.
    } finally {
      this.interacting -= 1;
    }
    const dispatched = this.dispatched;
    this.dispatched = null;
    return dispatched;
  }

  private write(key: string, next: unknown): void {
    // Same rule as dispatch: a value may only change because the user acted. A document
    // that calls a setter from an interpolation (`<text>{setN(n + 1)}</text>`) or from an
    // attribute that is not a handler would otherwise write — and re-render — mid-render.
    if (this.probing || this.interacting === 0) return;
    const previous = this.slots.get(key);
    // `setX(prev => prev + 1)`: an arrow argument is an updater, as in the reference
    // runtime — DIL has no other way to express "derive from the current value".
    //
    // It runs inside the evaluation that produced it, so it shares that evaluation's step
    // budget: a handler that recurses through a functional setter must still hit the limit.
    const value =
      isSafeObject(next) && next[SAFE] === "arrow" ? callSafe(next, [previous], { freshBudget: false }) : next;
    if (Object.is(value, previous)) return;
    this.slots.set(key, value);
    this.bump();
  }

  private issueNewTurn(value: unknown): unknown {
    if (typeof value !== "string") throw new DilEvaluationError("issueNewTurn expects a string");
    const text = value.trim();
    if (!text) throw new DilEvaluationError("issueNewTurn expects a prompt");
    if (this.probing) {
      this.observed.push({ kind: "issueNewTurn", text });
      return undefined;
    }
    // Rendering is not consent. `{@body const x = GenUI.issueNewTurn(…)}` or
    // `<text>{GenUI.issueNewTurn(…)}</text>` evaluates outside any click, and opening a
    // past message would then start agent work by itself — so only `invoke` may dispatch.
    if (this.interacting === 0) {
      throw new DilEvaluationError("issueNewTurn only runs from a control interaction");
    }
    const host = this.getHost();
    if (!host) throw new DilEvaluationError("issueNewTurn is unavailable outside the Web UI");
    const dispatched = Promise.resolve(host.issueNewTurn(text));
    // A control that does not await (a `radio` change that happens to send) must not turn
    // a host rejection into an unhandled one; the button still sees `dispatched` reject.
    dispatched.catch(() => undefined);
    this.dispatched = dispatched;
    return dispatched;
  }
}
