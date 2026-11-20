import { readBalanced, topLevelIndex } from "./scanner.ts";

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

/** Supply the document key for a standalone state declaration. */
export function stateStatement(statement: string): string {
  const match = USE_STATE.exec(statement);
  const prefix = match?.[0];
  if (prefix && match[1]) {
    const call = prefix.search(/(?:DIL\.)?useState\s*\($/);
    const open = prefix.length - 1;
    const args = readBalanced(statement, open, "(", ")");
    if (call >= 0 && args.ok && !statement.slice(args.end).trim()) {
      const initial = args.inner.trim() ? `,${args.inner}` : "";
      return `${statement.slice(0, call)}__dil.safe(() => __dil.state(${JSON.stringify(match[1])}${initial}\n)) ?? []`;
    }
  }
  const binding = /^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+)$/.exec(statement);
  return binding && topLevelIndex(binding[3], ",") < 0
    ? `${binding[1]} ${binding[2]} = __dil.safe(() => (${binding[3]}\n))`
    : statement;
}
