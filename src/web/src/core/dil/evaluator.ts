/**
 * The safe expression evaluator behind `{expr}`.
 *
 * Parsing is **not** ours: `acorn` produces a standard ESTree AST, and this module only
 * walks that tree under the allowlist in `evaluator-allowlist.ts`. That keeps the trust
 * boundary in one place — "which node types are reachable, and which values they may
 * touch" — instead of splitting it between a hand-written grammar and a tree walker.
 *
 * Two rules shape the whole file:
 *
 *   **Nothing throws at the caller.** A streaming document is full of prefixes
 *   (`{m.p.toFixed(`, `{#each items.fi`), and one broken expression must never take the
 *   message down. Every entry point catches and returns a fallback — the `__dilSafe`
 *   contract from the reference runtime:
 *
 *     condition  → false      `{#if}`
 *     list       → []         `{#each}`
 *     value      → undefined  interpolation and attributes
 *
 *   **Only what is written in the document is reachable.** Identifiers resolve to the
 *   scope the renderer built (`{@body const …}`, `DIL.useState` initials, `{#each}`
 *   bindings). There is no global object: `window`, `document`, `process`, `fetch`,
 *   `globalThis`, `Function`, `require` are simply unknown names.
 *
 * Reachable node types (`acorn.Expression`): Literal, Identifier, TemplateLiteral,
 * ArrayExpression, ObjectExpression, UnaryExpression, BinaryExpression,
 * LogicalExpression, ConditionalExpression, ChainExpression, MemberExpression,
 * CallExpression, ArrowFunctionExpression. Everything else — assignment, `new`, `this`,
 * `typeof`, spread, sequence, regex, `function`/`async`/generator forms — is refused.
 * Arrow bodies may be expressions or blocks; the block subset (`const`, expression,
 * `return`, `;`) is what #48's `onClick={() => { setX(1) }}` needs.
 */

import {
  type ArrowFunctionExpression,
  type BlockStatement,
  type CallExpression,
  type Expression,
  parse,
  parseExpressionAt,
  type Statement,
  type VariableDeclarator,
} from "acorn";
import {
  type ArrowValue,
  BUILTIN_SCOPE,
  type CallbackFactory,
  DilEvaluationError,
  type DilScope,
  formatValue,
  getMember,
  isForbiddenKey,
  isSafeObject,
  noopSetter,
  SAFE,
} from "./evaluator-allowlist.ts";

export { DilEvaluationError, type DilScope, formatValue } from "./evaluator-allowlist.ts";

type Context = readonly DilScope[];

/** An arrow whose body is a real ESTree node (the allowlist only needs it opaque). */
type Arrow = ArrowValue & { readonly body: Expression | BlockStatement };

const ACORN_OPTIONS = { ecmaVersion: "latest" } as const;

// ---------------------------------------------------------------------------
// Public API — the __dilSafe boundary
// ---------------------------------------------------------------------------

/** Evaluate an expression; throws `DilEvaluationError` on any problem. */
export function evaluateExpression(source: string, scope: DilScope = {}): unknown {
  steps = 0;
  return evaluate(parseExpression(source), [BUILTIN_SCOPE, scope]);
}

/** `__dilSafe(evaluate, failureValue)`: any failure (including a streamed prefix) → `failureValue`. */
export function safeEvaluate<T>(source: string, scope: DilScope | undefined, failureValue: T): T {
  try {
    return evaluateExpression(source, scope ?? {}) as T;
  } catch {
    return failureValue;
  }
}

/** `{#if}` condition: a missing or broken condition is false. */
export function evaluateCondition(source: string | null, scope: DilScope): boolean {
  if (source === null || source.trim() === "") return true; // `{:else}`
  try {
    return Boolean(evaluateExpression(source, scope));
  } catch {
    return false;
  }
}

/** `{#each}` list: anything that is not an array is an empty list. */
export function evaluateList(source: string, scope: DilScope): readonly unknown[] {
  try {
    const value = evaluateExpression(source, scope);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * Build the render scope from `{@body …}` statements, in source order:
 *
 *   const items = [{ name: "a" }]        → items
 *   const total = items.length           → total (sees `items`)
 *   const [open, setOpen] = useState(false)
 *                                        → open = false; the setter is a no-op until #48
 *
 * A statement that does not parse or evaluate is skipped: it may still be streaming, and
 * the rest of the document has to keep rendering.
 */
export function evaluateStatements(statements: readonly string[], seed: DilScope = {}): DilScope {
  steps = 0;
  const scope: Record<string, unknown> = { ...seed };
  const context: Context = [BUILTIN_SCOPE, scope];
  for (const source of statements) {
    const statement = parseStatement(source);
    if (statement?.type !== "VariableDeclaration") continue;
    declare(statement.declarations, context, (name, value) => {
      scope[name] = value;
    });
  }
  return scope;
}

// ---------------------------------------------------------------------------
// Parsing — acorn, wrapped in parentheses so grouping is legal and trailing input is not
// ---------------------------------------------------------------------------

const EXPRESSION_CACHE = new Map<string, Expression | DilEvaluationError>();
const STATEMENT_CACHE = new Map<string, Statement | null>();
const CACHE_LIMIT = 512;

function parseExpression(source: string): Expression {
  const cached = EXPRESSION_CACHE.get(source);
  if (cached instanceof DilEvaluationError) throw cached;
  if (cached) return cached;

  let parsed: Expression | DilEvaluationError;
  try {
    // Wrapping means `(1 + 2)` is a complete expression (acorn's `end` stops before the
    // closing paren) while `1) 2` or `1 2` stay syntax errors.
    const program = parse(`(${source})`, ACORN_OPTIONS);
    const statement = program.body[0];
    if (program.body.length !== 1 || statement.type !== "ExpressionStatement") {
      throw new DilEvaluationError("not a single expression");
    }
    parsed = statement.expression;
  } catch (error) {
    parsed = error instanceof DilEvaluationError ? error : new DilEvaluationError(String(error));
  }

  if (EXPRESSION_CACHE.size >= CACHE_LIMIT) EXPRESSION_CACHE.clear();
  EXPRESSION_CACHE.set(source, parsed);
  if (parsed instanceof DilEvaluationError) throw parsed;
  return parsed;
}

function parseStatement(source: string): Statement | null {
  const cached = STATEMENT_CACHE.get(source);
  if (cached !== undefined) return cached;

  let statement: Statement | null = null;
  try {
    const program = parse(source, ACORN_OPTIONS);
    const first = program.body[0];
    // A script cannot contain module declarations; the guard keeps the types honest.
    if (program.body.length === 1 && first.type !== "ImportDeclaration" && first.type !== "ExportNamedDeclaration") {
      statement = first as Statement;
    }
  } catch {
    statement = null;
  }

  if (STATEMENT_CACHE.size >= CACHE_LIMIT) STATEMENT_CACHE.clear();
  STATEMENT_CACHE.set(source, statement);
  return statement;
}

// ---------------------------------------------------------------------------
// Tree-walking evaluator
// ---------------------------------------------------------------------------

/**
 * Total node visits allowed for one evaluation.
 *
 * A recursive arrow (`const f = n => n > 0 ? f(n - 1) + f(n - 1) : 1`) stays shallow —
 * `f(40)` is 40 frames — but performs 2^40 calls. Array-size caps do not see it, and the
 * renderer runs on the main thread, so the cap has to be on work, not on depth or size.
 */
const MAX_STEPS = 200_000;
let steps = 0;

/**
 * `a?.b.c` sentinel: the chain was skipped at an optional access, so every remaining
 * access in the same chain is skipped too. It never escapes a `ChainExpression`.
 */
const SHORT_CIRCUIT = Symbol("optional-chain-short-circuit");

function evaluate(node: Expression, context: Context): unknown {
  if (++steps > MAX_STEPS) throw new DilEvaluationError("evaluation budget exceeded");

  switch (node.type) {
    case "Literal":
      if ("regex" in node || "bigint" in node) throw new DilEvaluationError("unsupported literal");
      return node.value;

    case "Identifier":
      return node.name === "undefined" ? undefined : lookup(node.name, context);

    case "TemplateLiteral":
      return node.quasis
        .map((quasi, index) => {
          const expression = node.expressions[index];
          return (quasi.value.cooked ?? "") + (expression ? formatValue(evaluate(expression, context)) : "");
        })
        .join("");

    case "ArrayExpression":
      return node.elements.map((element) => {
        if (element === null) return undefined;
        if (element.type === "SpreadElement") throw new DilEvaluationError("spread is not allowed");
        return evaluate(element, context);
      });

    case "ObjectExpression": {
      const value: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (property.type !== "Property" || property.kind !== "init" || property.method || property.computed) {
          throw new DilEvaluationError("unsupported object member");
        }
        const keyNode = property.key;
        const key =
          keyNode.type === "Identifier" ? keyNode.name : keyNode.type === "Literal" ? String(keyNode.value) : null;
        if (key === null) throw new DilEvaluationError("unsupported object key");
        if (isForbiddenKey(key)) throw new DilEvaluationError(`forbidden key ${key}`);
        value[key] = evaluate(property.value as Expression, context);
      }
      return value;
    }

    case "UnaryExpression": {
      if (node.operator !== "!" && node.operator !== "-" && node.operator !== "+") {
        throw new DilEvaluationError(`unsupported operator ${node.operator}`);
      }
      const argument = evaluate(node.argument, context);
      if (node.operator === "!") return !argument;
      const number = toNumber(argument);
      return node.operator === "-" ? -number : number;
    }

    case "BinaryExpression":
      return binary(node.operator, evaluate(node.left as Expression, context), evaluate(node.right, context));

    case "LogicalExpression": {
      const left = evaluate(node.left, context);
      if (node.operator === "&&") return left ? evaluate(node.right, context) : left;
      if (node.operator === "||") return left ? left : evaluate(node.right, context);
      return left === null || left === undefined ? evaluate(node.right, context) : left;
    }

    case "ConditionalExpression":
      return evaluate(node.test, context) ? evaluate(node.consequent, context) : evaluate(node.alternate, context);

    case "ChainExpression": {
      // A short-circuit inside `a?.b.c` skips the *rest of the chain*, not just the one
      // access: `user?.profile.name` with a null `user` must be `undefined`, not a read
      // of `name` on `undefined`. The sentinel travels up to here and becomes `undefined`.
      const value = evaluate(node.expression, context);
      return value === SHORT_CIRCUIT ? undefined : value;
    }

    case "MemberExpression": {
      if (node.object.type === "Super") throw new DilEvaluationError("super is not available");
      const object = evaluate(node.object, context);
      if (object === SHORT_CIRCUIT) return SHORT_CIRCUIT;
      if (node.optional && (object === null || object === undefined)) return SHORT_CIRCUIT;
      return getMember(object, memberKey(node, context), callback);
    }

    case "CallExpression":
      return call(node, context);

    case "ArrowFunctionExpression":
      return arrow(node, context);

    default:
      throw new DilEvaluationError(`unsupported expression ${(node as { type: string }).type}`);
  }
}

function memberKey(node: Extract<Expression, { type: "MemberExpression" }>, context: Context): string {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  const key = evaluate(node.property as Expression, context);
  if (typeof key === "string") return key;
  if (typeof key === "number" && Number.isInteger(key)) return String(key);
  throw new DilEvaluationError("property names must be strings or integers");
}

function call(node: CallExpression, context: Context): unknown {
  if (node.callee.type === "Super") throw new DilEvaluationError("super is not available");

  // JavaScript evaluates the callee before the arguments, and a skipped optional call
  // never evaluates them at all: `fn?.(missing)` with a null `fn` must not look up
  // `missing`.
  const value = evaluate(node.callee, context);
  if (value === SHORT_CIRCUIT) return SHORT_CIRCUIT;
  if (node.optional && (value === null || value === undefined)) return SHORT_CIRCUIT;

  const args = node.arguments.map((argument) => {
    if (argument.type === "SpreadElement") throw new DilEvaluationError("spread is not allowed");
    return evaluate(argument, context);
  });

  return callValue(value, args);
}

function arrow(node: ArrowFunctionExpression, context: Context): Arrow {
  if (node.async || node.generator) throw new DilEvaluationError("async/generator functions are not allowed");
  const params = node.params.map((param) => {
    if (param.type !== "Identifier") throw new DilEvaluationError("unsupported parameter");
    return param.name;
  });
  return { [SAFE]: "arrow", params, body: node.body, context };
}

/** The one bridge between the allowlist and this walker: a callback runs a subtree. */
const callback: CallbackFactory =
  (value) =>
  (...args) =>
    callValue(value, args);

function callValue(callee: unknown, args: readonly unknown[]): unknown {
  if (!isSafeObject(callee)) throw new DilEvaluationError("not a function");
  if (callee[SAFE] === "arrow") return runArrow(callee as Arrow, args);
  if (callee[SAFE] === "callable") return callee.invoke(args);
  if (callee[SAFE] === "namespace" && callee.invoke) return callee.invoke(args);
  throw new DilEvaluationError("not a function");
}

function runArrow(arrowValue: Arrow, args: readonly unknown[]): unknown {
  const frame: Record<string, unknown> = {};
  arrowValue.params.forEach((param, index) => {
    frame[param] = args[index];
  });
  const context = [...arrowValue.context, frame];
  if (arrowValue.body.type !== "BlockStatement") return evaluate(arrowValue.body, context);

  for (const statement of arrowValue.body.body) {
    if (statement.type === "ReturnStatement") {
      return statement.argument ? evaluate(statement.argument, context) : undefined;
    }
    if (statement.type === "ExpressionStatement") {
      evaluate(statement.expression, context);
      continue;
    }
    if (statement.type === "VariableDeclaration") {
      declare(statement.declarations, context, (name, value) => {
        frame[name] = value;
      });
      continue;
    }
    if (statement.type === "EmptyStatement") continue;
    throw new DilEvaluationError(`unsupported statement ${statement.type}`);
  }
  return undefined;
}

function lookup(name: string, context: Context): unknown {
  for (let i = context.length - 1; i >= 0; i--) {
    const frame = context[i];
    if (Object.hasOwn(frame, name)) return frame[name];
  }
  throw new DilEvaluationError(`${name} is not defined`);
}

function declare(
  declarations: readonly VariableDeclarator[],
  context: Context,
  bind: (name: string, value: unknown) => void,
): void {
  for (const declarator of declarations) {
    if (declarator.id.type === "Identifier") {
      bind(declarator.id.name, declarator.init ? safeNode(declarator.init, context) : undefined);
      continue;
    }
    if (declarator.id.type !== "ArrayPattern") continue;

    // `const [open, setOpen] = DIL.useState(init)`: #46 needs the initial value; the
    // setter is bound to an inert callable so expressions that mention it still resolve.
    const state = stateInitArgument(declarator.init);
    if (state === undefined) continue;
    const initial = state === null ? undefined : safeNode(state, context);
    const [first, second] = declarator.id.elements;
    if (first?.type === "Identifier") bind(first.name, initial);
    if (second?.type === "Identifier") bind(second.name, noopSetter);
  }
}

/** `x = useState(init)` → `init`, `x = useState()` → `null`, anything else → `undefined`. */
function stateInitArgument(node: Expression | null | undefined): Expression | null | undefined {
  if (!node || node.type !== "CallExpression") return undefined;
  const callee = node.callee;
  const name =
    callee.type === "Identifier"
      ? callee.name
      : callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier"
        ? callee.property.name
        : "";
  if (name !== "useState") return undefined;
  const first = node.arguments[0];
  return first && first.type !== "SpreadElement" ? first : null;
}

/** A declaration initialiser never fails the whole scope: it is undefined instead. */
function safeNode(node: Expression, context: Context): unknown {
  try {
    return evaluate(node, context);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

const BINARY: ReadonlySet<string> = new Set(["+", "-", "*", "/", "%", "===", "!==", ">", "<", ">=", "<="]);

function binary(operator: string, left: unknown, right: unknown): unknown {
  if (!BINARY.has(operator)) throw new DilEvaluationError(`unsupported operator ${operator}`);
  switch (operator) {
    case "+":
      return add(left, right);
    case "-":
      return toNumber(left) - toNumber(right);
    case "*":
      return toNumber(left) * toNumber(right);
    case "/":
      return toNumber(left) / toNumber(right);
    case "%":
      return toNumber(left) % toNumber(right);
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    default:
      return compare(operator, left, right);
  }
}

/** `+` on primitives only: numbers add, anything else concatenates like JavaScript. */
function add(left: unknown, right: unknown): unknown {
  if (typeof left === "number" && typeof right === "number") return left + right;
  const a = primitiveText(left);
  const b = primitiveText(right);
  if (a === null || b === null) throw new DilEvaluationError("cannot add objects");
  return a + b;
}

function primitiveText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return null;
}

function compare(operator: string, left: unknown, right: unknown): boolean {
  const sameKind =
    (typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string");
  if (!sameKind) throw new DilEvaluationError(`${operator} needs two numbers or two strings`);
  if (operator === ">") return left > right;
  if (operator === "<") return left < right;
  return operator === ">=" ? left >= right : left <= right;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new DilEvaluationError("expected a finite number");
}
