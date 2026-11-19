#!/usr/bin/env node
/**
 * Generate `extensions/examples.gen.ts` from `extensions/*.dil.md`.
 *
 * Run via `just gen`. Keeping the examples as standalone `.dil.md` files avoids
 * escaping backticks and `${...}` in TypeScript template literals, while the generated
 * `.ts` module works identically across Node ESM, jiti, Vitest, and Vite SSR bundling.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "extensions");
const OUT_FILE = join(EXTENSIONS_DIR, "examples.gen.ts");

const EXAMPLES = [
  { exportName: "DIL_EXAMPLE_PROGRESS", file: "progress.dil.md" },
  { exportName: "DIL_EXAMPLE_FLOW", file: "flow.dil.md" },
  { exportName: "DIL_EXAMPLE_OBJECTS", file: "objects.dil.md" },
  { exportName: "DIL_EXAMPLE_SVG", file: "svg.dil.md" },
];

export function renderExamplesModule() {
  const lines = [
    "// Generated from extensions/*.dil.md — do not edit manually.",
    "// Run `just gen` to regenerate.",
    "",
  ];
  for (const { exportName, file } of EXAMPLES) {
    const content = readFileSync(join(EXTENSIONS_DIR, file), "utf8").trim();
    lines.push(`export const ${exportName} = ${JSON.stringify(content)};`);
  }
  lines.push("");
  return lines.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT_FILE, renderExamplesModule(), "utf8");
  console.log(`generated: ${OUT_FILE}`);
}
