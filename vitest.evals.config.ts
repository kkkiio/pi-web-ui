import { defineConfig } from "vitest/config";

/**
 * Live LLM evals, separate from the fast `node --test` suite.
 *
 * `evals/**\/*.eval.ts` calls a real model, so it is opt-in (`npm run eval:dil:vitest`)
 * and never part of `just check`. The offline contract — case checks, scoring, ideal
 * answers — stays in `npm run test:dil`.
 */
export default defineConfig({
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    testTimeout: 180_000,
    hookTimeout: 60_000,
    sequence: { concurrent: false },
  },
});
