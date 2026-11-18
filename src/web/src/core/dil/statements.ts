/**
 * `{@body …}` payload handling.
 *
 * One directive may hold several statements (`const a = …; const b = …`), and the
 * state declarations inside it are the only thing the renderer needs before the
 * expression evaluator exists: they define the per-message state slots and their
 * semantic keys.
 *
 * Nothing here parses JavaScript beyond balanced scanning — validation and evaluation
 * belong to the evaluator (issue #47) so this module stays usable in the browser.
 */

import { readBalanced, topLevelIndex } from "./scanner.ts";
import type { DilStateDeclaration } from "./types.ts";

/** One `{@body}` may hold several statements; split at top-level `;`. */
export function splitStatements(code: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let at = topLevelIndex(code, ";"); at >= 0; at = topLevelIndex(code, ";", start)) {
    parts.push(code.slice(start, at));
    start = at + 1;
  }
  parts.push(code.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const USE_STATE =
  /^(?:const|let|var)\s+\[\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\]\s*=\s*(?:DIL\.)?useState\s*\(/;

export type StateDeclaration = DilStateDeclaration;

/** Every `DIL.useState` declared by a list of `{@body}` statements, in order. */
export function findStateDeclarations(statements: readonly string[]): DilStateDeclaration[] {
  const out: DilStateDeclaration[] = [];
  for (const statement of statements) {
    const match = USE_STATE.exec(statement.trim());
    if (!match) continue;
    const open = match[0].length - 1;
    const args = readBalanced(statement, open, "(", ")");
    const firstComma = topLevelIndex(args.inner, ",");
    const initial = (firstComma < 0 ? args.inner : args.inner.slice(0, firstComma)).trim();
    out.push({ name: match[1], setter: match[2] ?? null, initial: initial || "undefined" });
  }
  return out;
}

/** State keys, keyed by variable name, as reported back to the session view state. */
export function stateKeys(statements: readonly string[]): string[] {
  return findStateDeclarations(statements).map((declaration) => declaration.name);
}
