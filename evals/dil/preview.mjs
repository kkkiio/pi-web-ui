#!/usr/bin/env node
/**
 * Bundle the preview entry with Vite (SSR) and render the last eval report.
 *
 * The renderer imports through the `@` alias and is a React component tree, so the only
 * honest preview is the real component. Output: evals/dil/preview-out/index.html.
 *
 *   node evals/dil/preview.mjs                 # the last `npm run eval:dil` report
 *   node evals/dil/preview.mjs --recordings    # the committed recordings
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
const css = existsSync(join(root, "dist", "assets"))
  ? null
  : "run `npm run build:web` first (the preview reuses the built stylesheet)";
if (css) {
  console.error(css);
  process.exit(1);
}

const out = join(root, ".eval-preview-out");
rmSync(out, { recursive: true, force: true });
execFileSync("npx", ["vite", "build", "--ssr", "../../evals/dil/preview-entry.tsx", "--outDir", "../../.eval-preview-out", "--logLevel", "error"], {
  cwd: join(root, "src", "web"),
  stdio: "inherit",
});
const recordings = process.argv.includes("--recordings");
const file = execFileSync("node", [join(out, "preview-entry.mjs")], {
  encoding: "utf8",
  env: { ...process.env, DIL_PREVIEW_SOURCE: recordings ? "recordings" : "report" },
}).trim();
rmSync(out, { recursive: true, force: true });
console.log(`preview: ${file}`);
