/**
 * The allowlist `evaluator.ts` walks against.
 *
 * The evaluator's policy ("which node types are reachable") lives next door; this module
 * is the data behind it: the values an expression may name (`Math`, `Number`, `String`,
 * `Array`), the properties and methods it may read, and the sanitisers that keep every
 * call bounded and DOM-free.
 *
 * Nothing here imports the evaluator. The one operation that needs to run user code —
 * a callback passed to `map`/`filter`/`replace` — arrives as the `callback` factory, so
 * this module stays a plain table of pure functions.
 *
 * Guarantees:
 *
 *   - no prototype chain: own properties only, and `__proto__` / `constructor` /
 *     `prototype` are refused before any lookup;
 *   - no mutation: no `push`, `sort`, `splice`, `reverse`, and no assignments anywhere;
 *   - bounded work: string lengths and `Array.from` sizes are capped, numbers must be
 *     finite, and every conversion is validated.
 */

/** A name → value map. Values are produced by the evaluator or by the renderer. */
export interface DilScope {
  readonly [name: string]: unknown;
}

export class DilEvaluationError extends Error {}

type Context = readonly DilScope[];

// ---------------------------------------------------------------------------
// Safe values
// ---------------------------------------------------------------------------

export const SAFE = Symbol("dil.safeValue");

export interface ArrowValue {
  readonly [SAFE]: "arrow";
  readonly params: readonly string[];
  readonly body: unknown;
  readonly context: Context;
}

export interface CallableValue {
  readonly [SAFE]: "callable";
  /** `callback` is supplied for members reached through a namespace (`Array.from`). */
  readonly invoke: (args: readonly unknown[], callback?: CallbackFactory) => unknown;
}

export interface NamespaceValue {
  readonly [SAFE]: "namespace";
  readonly members: ReadonlyMap<string, unknown>;
  /** `Number(x)` / `String(x)`: the namespace is also its own constructor. */
  readonly invoke?: (args: readonly unknown[]) => unknown;
}

export type SafeObject = ArrowValue | CallableValue | NamespaceValue;

export function isSafeObject(value: unknown): value is SafeObject {
  return typeof value === "object" && value !== null && SAFE in value;
}

export function callable(invoke: (args: readonly unknown[], callback?: CallbackFactory) => unknown): CallableValue {
  return { [SAFE]: "callable", invoke };
}

/** `setX` until #48: callable, so expressions resolve, and inert, so nothing happens. */
export const noopSetter = callable(() => undefined);

/** A DOM-free callback: arrows run inside the evaluator, never as escaped JS. */
export type CallbackFactory = (value: unknown) => (...args: unknown[]) => unknown;

// ---------------------------------------------------------------------------
// Formatting — what the transcript shows for a value
// ---------------------------------------------------------------------------

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (isSafeObject(value)) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Member access
// ---------------------------------------------------------------------------

/** Never reachable: refused before any lookup, whatever the target is. */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype", "caller", "arguments"]);

export function isForbiddenKey(key: string): boolean {
  return DANGEROUS_KEYS.has(key);
}

export function getMember(target: unknown, key: string, callback: CallbackFactory): unknown {
  if (target === null || target === undefined) {
    throw new DilEvaluationError(`cannot read ${key} of ${String(target)}`);
  }
  if (isForbiddenKey(key)) throw new DilEvaluationError(`forbidden property ${key}`);

  if (isSafeObject(target)) {
    if (target[SAFE] === "namespace") {
      const member = target.members.get(key);
      if (member === undefined) throw new DilEvaluationError(`${key} is not available`);
      // Namespace members can need a callback (`Array.from({ length }, (_, i) => …)`).
      if (isSafeObject(member) && member[SAFE] === "callable") {
        const invoke = (member as CallableValue).invoke;
        return callable((args) => invoke(args, callback));
      }
      return member;
    }
    throw new DilEvaluationError(`cannot read ${key} of a function`);
  }

  if (Array.isArray(target)) return arrayMember(target, key, callback);
  if (typeof target === "string") return stringMember(target, key, callback);
  if (typeof target === "number") return numberMember(target, key, callback);
  if (typeof target === "object") {
    // Own properties only; a missing one is `undefined` like JavaScript, and the
    // prototype chain is never consulted.
    const record = target as Record<string, unknown>;
    return Object.hasOwn(record, key) ? record[key] : undefined;
  }
  throw new DilEvaluationError(`cannot read ${key} of ${typeof target}`);
}

function arrayMember(array: readonly unknown[], key: string, callback: CallbackFactory): unknown {
  if (key === "length") return array.length;
  if (/^(?:0|[1-9]\d*)$/.test(key)) return array[Number(key)];
  const method = ARRAY_METHODS[key];
  if (!method) throw new DilEvaluationError(`${key} is not an allowed array method`);
  return callable((args) => method(array, args, callback));
}

function stringMember(text: string, key: string, callback: CallbackFactory): unknown {
  if (key === "length") return text.length;
  if (/^(?:0|[1-9]\d*)$/.test(key)) return text[Number(key)];
  const method = STRING_METHODS[key];
  if (!method) throw new DilEvaluationError(`${key} is not an allowed string method`);
  return callable((args) => method(text, args, callback));
}

function numberMember(value: number, key: string, callback: CallbackFactory): unknown {
  const method = NUMBER_METHODS[key];
  if (!method) throw new DilEvaluationError(`${key} is not an allowed number method`);
  return callable((args) => method(value, args, callback));
}

// ---------------------------------------------------------------------------
// Methods — pure, bounded, callback-safe
// ---------------------------------------------------------------------------

const MAX_REPEAT = 100_000;
const MAX_ARRAY_LENGTH = 10_000;

/**
 * Builtins allocate natively, so the evaluator's step budget cannot interrupt them:
 * `'a'.repeat(1000).repeat(100000)` is two node visits and 100 MB of string. Results are
 * therefore checked *after* the call as well as before it — cheap insurance, and it also
 * bounds `+` chains that would otherwise concatenate without limit.
 */
export const MAX_STRING_LENGTH = 100_000;

export function boundedString(value: string): string {
  if (value.length > MAX_STRING_LENGTH) throw new DilEvaluationError("result is too large");
  return value;
}

export function boundedArray<T>(value: readonly T[]): readonly T[] {
  if (value.length > MAX_ARRAY_LENGTH) throw new DilEvaluationError("result is too large");
  return value;
}

type Method<Self> = (self: Self, args: readonly unknown[], callback: CallbackFactory) => unknown;

const ARRAY_METHODS: Record<string, Method<readonly unknown[]>> = {
  map: (self, args, callback) => self.map(callback(args[0]) as (value: unknown, index: number) => unknown),
  filter: (self, args, callback) => self.filter(callback(args[0]) as (value: unknown) => unknown),
  find: (self, args, callback) => self.find(callback(args[0]) as (value: unknown) => unknown),
  findIndex: (self, args, callback) => self.findIndex(callback(args[0]) as (value: unknown) => unknown),
  some: (self, args, callback) => self.some(callback(args[0]) as (value: unknown) => unknown),
  every: (self, args, callback) => self.every(callback(args[0]) as (value: unknown) => unknown),
  reduce: (self, args, callback) => self.reduce(callback(args[0]) as (a: unknown, b: unknown) => unknown, args[1]),
  slice: (self, args) => self.slice(optionalIndex(args[0]), optionalIndex(args[1])),
  join: (self, args) => boundedString(self.join(typeof args[0] === "string" ? args[0] : ",")),
  includes: (self, args) => self.includes(args[0]),
  indexOf: (self, args) => self.indexOf(args[0]),
  at: (self, args) => self.at(toIndex(args[0])),
  concat: (self, args) => boundedArray([...self, ...args.flat()]),
  flat: (self, args) => boundedArray(self.flat(optionalDepth(args[0]))),
};

const STRING_METHODS: Record<string, Method<string>> = {
  split: (self, args) => boundedArray(args[0] === undefined ? [self] : self.split(String(args[0]))),
  slice: (self, args) => self.slice(optionalIndex(args[0]), optionalIndex(args[1])),
  substring: (self, args) => self.substring(optionalIndex(args[0]) ?? 0, optionalIndex(args[1])),
  includes: (self, args) => self.includes(String(args[0])),
  indexOf: (self, args) => self.indexOf(String(args[0])),
  startsWith: (self, args) => self.startsWith(String(args[0])),
  endsWith: (self, args) => self.endsWith(String(args[0])),
  toUpperCase: (self) => self.toUpperCase(),
  toLowerCase: (self) => self.toLowerCase(),
  trim: (self) => self.trim(),
  replace: (self, args, callback) => {
    const search = String(args[0]);
    const value = replacement(args[1], callback);
    // `value` is either a literal replacement or a callback produced by `replacement()`.
    return boundedString(self.replace(search, value as string));
  },
  replaceAll: (self, args, callback) => {
    const search = String(args[0]);
    const value = replacement(args[1], callback);
    return boundedString(self.replaceAll(search, value as string));
  },
  padStart: (self, args) =>
    boundedString(self.padStart(boundedLength(args[0]), typeof args[1] === "string" ? args[1] : " ")),
  padEnd: (self, args) =>
    boundedString(self.padEnd(boundedLength(args[0]), typeof args[1] === "string" ? args[1] : " ")),
  repeat: (self, args) => boundedString(self.repeat(boundedLength(args[0]))),
  charAt: (self, args) => self.charAt(toIndex(args[0])),
  at: (self, args) => self.at(toIndex(args[0])),
  toString: (self: string) => self,
};

const NUMBER_METHODS: Record<string, Method<number>> = {
  toFixed: (self, args) => {
    const digits = args[0] === undefined ? 0 : toIndex(args[0]);
    if (digits < 0 || digits > 100) throw new DilEvaluationError("toFixed digits out of range");
    return self.toFixed(digits);
  },
  toLocaleString: (self: number, args: readonly unknown[]) => {
    const [locales, options] = args;
    if (locales !== undefined && typeof locales !== "string" && !Array.isArray(locales)) {
      throw new DilEvaluationError("invalid locales");
    }
    if (options !== undefined && (typeof options !== "object" || options === null)) {
      throw new DilEvaluationError("invalid number format options");
    }
    return self.toLocaleString(locales as string | string[] | undefined, options as Intl.NumberFormatOptions);
  },
  toString: (self: number, args: readonly unknown[]) => {
    const radix = args[0] === undefined ? 10 : toIndex(args[0]);
    if (radix < 2 || radix > 36) throw new DilEvaluationError("invalid radix");
    return self.toString(radix);
  },
};

function replacement(value: unknown, callback: CallbackFactory): string | ((...args: unknown[]) => string) {
  if (typeof value === "string") return value;
  const fn = callback(value);
  return (...args) => formatValue(fn(...args));
}

function toIndex(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new DilEvaluationError("expected an integer");
}

function optionalIndex(value: unknown): number | undefined {
  return value === undefined ? undefined : toIndex(value);
}

function boundedLength(value: unknown): number {
  const length = toIndex(value);
  if (length < 0 || length > MAX_REPEAT) throw new DilEvaluationError("length is out of range");
  return length;
}

function optionalDepth(value: unknown): number {
  if (value === undefined) return 1;
  return Math.min(Math.max(toIndex(value), 0), 8);
}

// ---------------------------------------------------------------------------
// Builtins — Math, Number, String, Array
// ---------------------------------------------------------------------------

function namespace(members: Record<string, unknown>, invoke?: (args: readonly unknown[]) => unknown): NamespaceValue {
  const base: NamespaceValue = { [SAFE]: "namespace", members: new Map(Object.entries(members)) };
  return invoke ? { ...base, invoke } : base;
}

const MATH_NAMES = [
  "abs",
  "ceil",
  "floor",
  "round",
  "trunc",
  "sign",
  "min",
  "max",
  "pow",
  "sqrt",
  "cbrt",
  "hypot",
  "log",
  "log2",
  "log10",
  "exp",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
] as const;

const MATH_CONSTANTS = ["PI", "E", "LN2", "LN10", "SQRT2", "SQRT1_2"] as const;

function mathNamespace(): NamespaceValue {
  const members: Record<string, unknown> = {};
  for (const name of MATH_NAMES) {
    const fn = Math[name] as (...args: number[]) => number;
    members[name] = callable((args) => fn(...args.map((argument) => toNumber(argument))));
  }
  for (const name of MATH_CONSTANTS) members[name] = Math[name];
  return namespace(members);
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new DilEvaluationError("expected a finite number");
}

function toNumeric(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  throw new DilEvaluationError("expected a numeric value");
}

function numberNamespace(): NamespaceValue {
  return namespace(
    {
      isFinite: callable((args) => Number.isFinite(args[0])),
      isInteger: callable((args) => Number.isInteger(args[0])),
      isNaN: callable((args) => Number.isNaN(args[0])),
      MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
      EPSILON: Number.EPSILON,
    },
    (args) => toNumeric(args[0]),
  );
}

function stringNamespace(): NamespaceValue {
  return namespace(
    { fromCharCode: callable((args) => String.fromCharCode(...args.map((argument) => toIndex(argument)))) },
    (args) => (args.length === 0 ? "" : formatValue(args[0])),
  );
}

function arrayNamespace(): NamespaceValue {
  return namespace({
    from: callable((args, callback) => {
      const source = args[0];
      let list: readonly unknown[];
      if (Array.isArray(source)) {
        list = [...source].slice(0, MAX_ARRAY_LENGTH);
      } else if (typeof source === "object" && source !== null && Object.hasOwn(source, "length")) {
        const raw = (source as { length: unknown }).length;
        const length =
          typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? Math.min(raw, MAX_ARRAY_LENGTH) : 0;
        list = Array.from({ length }, (_, index) => index);
      } else {
        return [];
      }

      // The optional mapFn only runs when it is an arrow we can evaluate; anything else is
      // ignored rather than treated as a value to call.
      const map = args[1];
      if (!callback || !isSafeObject(map) || map[SAFE] !== "arrow") return list;
      const run = callback(map);
      return list.map((value, index) => run(value, index));
    }),
    isArray: callable((args) => Array.isArray(args[0])),
    of: callable((args) => args.slice(0, MAX_ARRAY_LENGTH)),
  });
}

/**
 * The globals an expression may name. Everything else — `window`, `document`, `process`,
 * `fetch`, `globalThis`, `Function`, `require`, `import` — is simply not in scope, so
 * using it fails inside `__dilSafe` instead of reaching the page.
 */
export const BUILTIN_SCOPE: DilScope = {
  Math: mathNamespace(),
  Number: numberNamespace(),
  String: stringNamespace(),
  Array: arrayNamespace(),
};
