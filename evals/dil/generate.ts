/**
 * Provider access for DIL evals — one implementation, two front ends.
 *
 * `run.ts` uses it for a CLI report; `pipeline.eval.ts` wraps it in a vitest-evals
 * harness. Generation goes through `@earendil-works/pi-ai`, the runtime Pi itself uses, so
 * a live run authenticates exactly like the product: `DEEPSEEK_API_KEY`, a repo `.env`,
 * or `~/.pi/agent/auth.json`.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Credentials — env, then a repo `.env`, then Pi's own store
// ---------------------------------------------------------------------------

export function apiKeyFor(provider: string): string {
  const envName = `${provider.toUpperCase().replaceAll("-", "_")}_API_KEY`;
  if (process.env[envName]) return process.env[envName] as string;

  const dotenv = join(HERE, "..", "..", ".env");
  if (existsSync(dotenv)) {
    for (const line of readFileSync(dotenv, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && match[1] === envName) return match[2].replace(/^["']|["']$/g, "");
    }
  }

  const authFile = join(homedir(), ".pi", "agent", "auth.json");
  if (existsSync(authFile)) {
    const entry = JSON.parse(readFileSync(authFile, "utf8"))[provider] as { key?: string } | undefined;
    if (entry?.key) return entry.key;
  }
  throw new Error(`no ${envName}: set it, add it to .env, or log in through Pi`);
}

// ---------------------------------------------------------------------------
// Generation — pi-ai, so it is the same model runtime the product uses
// ---------------------------------------------------------------------------

export interface DilGenerator {
  readonly label: string;
  generate(system: string | null, prompt: string): Promise<string>;
}

export interface GeneratorOptions {
  readonly provider: string;
  readonly model: string;
}

export async function createGenerator(options: GeneratorOptions): Promise<DilGenerator> {
  const { createModels, InMemoryCredentialStore, contentText } = await import("@earendil-works/pi-ai");
  const { builtinProviders } = await import("@earendil-works/pi-ai/providers/all");

  const credentials = new InMemoryCredentialStore();
  await credentials.modify(options.provider, async () => ({ type: "api_key", key: apiKeyFor(options.provider) }));
  const models = createModels({ credentials });
  for (const provider of builtinProviders()) models.setProvider(provider);

  const model = models.getModel(options.provider, options.model) ?? models.getModels(options.provider)[0];
  if (!model) throw new Error(`unknown model ${options.provider}/${options.model}`);

  return {
    label: `${model.provider}/${model.id}`,
    async generate(system, prompt) {
      const message = await models.completeSimple(
        model,
        {
          ...(system ? { systemPrompt: system } : {}),
          messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
        },
        { maxTokens: 3000 },
      );
      return contentText(message.content).trim();
    },
  };
}
