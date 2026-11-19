/**
 * The DIL eval harness: a real Pi agent session, not a bare model call.
 *
 * pi-web-ui is a Pi extension, so the thing worth measuring is what Pi actually sends:
 * Pi's own system prompt (preamble, tools, rules, docs, cwd), plus our `<dil>` section
 * injected through `before_agent_start` — the same mechanism the extension will use in
 * production. The model then answers as Pi, and the transcript text is scored by
 * `scoring.ts`.
 *
 * Isolation: each run gets a throwaway workspace and agent dir, no tools (`noTools:
 * "all"`), no skills/prompt templates/context files, and `getCurrentSystemPrompt` is read
 * back per run so a variant can prove the section really reached the prompt.
 *
 * The provider layer is `ModelRuntime` from `pi-coding-agent`, so credentials resolve
 * exactly like the product (`~/.pi/agent/auth.json`, or an API key from the environment /
 * repo `.env`).
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai/utils/transcript";
import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  type InlineExtension,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import { DIL_SYSTEM_PROMPT } from "../../extensions/system-prompt.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Providers whose credential variable is not just `<PROVIDER>_API_KEY`. */
const PROVIDER_ENV_NAMES: Record<string, readonly string[]> = {
  "opencode-go": ["OPENCODE_API_KEY"],
};

function envNames(provider: string): readonly string[] {
  const generic = `${provider.toUpperCase().replaceAll("-", "_")}_API_KEY`;
  return [...(PROVIDER_ENV_NAMES[provider] ?? []), generic];
}

/** Environment → repo `.env` → Pi's own credential store. */
export function apiKeyFor(provider: string): string {
  const names = envNames(provider);
  for (const name of names) {
    if (process.env[name]) return process.env[name] as string;
  }

  const dotenv = join(HERE, "..", "..", ".env");
  if (existsSync(dotenv)) {
    const entries = new Map<string, string>();
    for (const line of readFileSync(dotenv, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) entries.set(match[1], match[2].replace(/^["']|["']$/g, ""));
    }
    for (const name of names) {
      const value = entries.get(name);
      if (value) return value;
    }
  }

  const authFile = join(homedir(), ".pi", "agent", "auth.json");
  if (existsSync(authFile)) {
    const entry = JSON.parse(readFileSync(authFile, "utf8"))[provider] as { key?: string } | undefined;
    if (entry?.key) return entry.key;
  }
  throw new Error(`no ${names.join(" / ")}: set it, add it to .env, or log in through Pi`);
}

export interface AgentRun {
  readonly text: string;
  /** Pi's effective system prompt for the run, as replayed from the transcript. */
  readonly systemPrompt: string;
}

export interface DilAgent {
  readonly label: string;
  /** Every run carries the `<dil>` section, i.e. the state after `/webui`. */
  run(prompt: string): Promise<AgentRun>;
}

export interface AgentOptions {
  readonly provider: string;
  readonly model: string;
  /**
   * Working directory the agent may inspect. Default: this repository — the real product
   * situation (pi-web-ui runs inside the project it is asked about).
   */
  readonly cwd?: string;
  /**
   * Tools the agent may use. Default: read-only inspection (`read`, `grep`, `find`,
   * `ls`) — the agent must be able to look at the project, but the eval never lets it
   * write. `[]` disables tools, which measures raw model willingness but makes coding
   * models emit pseudo tool calls instead of an answer.
   */
  readonly tools?: readonly string[];
}

export async function createDilAgent(options: AgentOptions): Promise<DilAgent> {
  const credentials = new InMemoryCredentialStore();
  const key = apiKeyFor(options.provider);
  await credentials.modify(options.provider, async () => ({ type: "api_key", key }));

  const modelRuntime = await ModelRuntime.create({ credentials });
  const model = modelRuntime.getModel(options.provider, options.model);
  if (!model) {
    const available = modelRuntime
      .getModels(options.provider)
      .map((candidate) => candidate.id)
      .join(", ");
    throw new Error(`unknown model ${options.provider}/${options.model}. Available: ${available}`);
  }

  const cwd = options.cwd ?? join(HERE, "..", "..");
  const tools = options.tools ?? ["read", "grep", "find", "ls"];
  return {
    label: `${model.provider}/${model.id}`,
    run: (prompt) => runPiSession(modelRuntime, model, prompt, { cwd, tools }),
  };
}

type ResolvedModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;

async function runPiSession(
  modelRuntime: ModelRuntime,
  model: ResolvedModel,
  prompt: string,
  layout: { readonly cwd: string; readonly tools: readonly string[] },
): Promise<AgentRun> {
  // The workspace is the project itself; only Pi's global config is isolated per run so
  // the user's extensions/skills cannot leak into the measurement.
  const root = await mkdtemp(join(tmpdir(), "dil-eval-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir, { recursive: true });

  // Exactly the production mechanism: a new `<dil>` section, diffed by Pi into one
  // mid-conversation system patch instead of rewriting the prompt head.
  const extensionFactories: InlineExtension[] = [
    {
      name: "dil-eval-prompt",
      hidden: true,
      factory: (pi) => {
        pi.on("before_agent_start", async (event) => {
          event.systemPromptOptions.sections.dil = DIL_SYSTEM_PROMPT;
        });
      },
    },
  ];

  const services = await createAgentSessionServices({
    cwd: layout.cwd,
    agentDir,
    modelRuntime,
    resourceLoaderOptions: {
      extensionFactories,
      noSkills: true,
      noPromptTemplates: true,
      noContextFiles: true,
      noThemes: true,
    },
  });

  const sessionManager = SessionManager.create(layout.cwd, join(root, "sessions"));
  const { session } = await createAgentSessionFromServices({
    services,
    sessionManager,
    model,
    thinkingLevel: "off",
    ...(layout.tools.length > 0 ? { tools: [...layout.tools] } : { noTools: "all" as const }),
  });

  try {
    await session.prompt(prompt);
    const text = session.getLastAssistantText() ?? "";
    const systemPrompt = getCurrentSystemPrompt(session.messages);
    return { text, systemPrompt };
  } finally {
    session.dispose();
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}
