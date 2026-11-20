/**
 * The DIL eval harness: a real Pi agent session, not a bare model call.
 *
 * pi-web-ui is a Pi extension, so the thing worth measuring is what Pi actually sends:
 * Pi's own system prompt (preamble, tools, rules, docs, cwd), plus our `<dil>` section
 * injected through `before_agent_start` — the same mechanism the extension will use in
 * production. The model then answers as Pi, and the transcript text is scored by
 * `scoring.ts`.
 *
 * Isolation: each run gets a throwaway workspace and agent dir so `~/.pi` and this
 * repository's `evals/` fixtures cannot leak. When `projectRepo` is specified, the target
 * repo is mounted inside a `--network=none` Docker sandbox and Pi's tools (`read`, `write`,
 * `edit`, `bash`) proxy into that container via Pi's pluggable `operations` API.
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
import { startRepoSandbox } from "./container.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TRAJECTORIES_DIR = join(HERE, "trajectories");

/** Providers whose credential variable is not just `<PROVIDER>_API_KEY`. */
const PROVIDER_ENV_NAMES: Record<string, readonly string[]> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN"],
  "cloudflare-ai-gateway": ["CLOUDFLARE_API_KEY"],
  "cloudflare-workers-ai": ["CLOUDFLARE_API_KEY"],
  "github-copilot": ["COPILOT_GITHUB_TOKEN"],
  google: ["GEMINI_API_KEY"],
  "google-vertex": ["GOOGLE_CLOUD_API_KEY"],
  huggingface: ["HF_TOKEN"],
  "moonshotai-cn": ["MOONSHOT_API_KEY"],
  "opencode-go": ["OPENCODE_API_KEY"],
  "qwen-token-plan-individual": ["QWEN_TOKEN_PLAN_API_KEY"],
  "qwen-token-plan-individual-cn": ["QWEN_TOKEN_PLAN_CN_API_KEY"],
  "vercel-ai-gateway": ["AI_GATEWAY_API_KEY"],
};

function envNames(provider: string): readonly string[] {
  const generic = `${provider.toUpperCase().replaceAll("-", "_")}_API_KEY`;
  return [...new Set([...(PROVIDER_ENV_NAMES[provider] ?? []), generic])];
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
  readonly toolCallCount?: number;
  readonly toolNames?: readonly string[];
  readonly assistantTurns?: number;
  /** Persisted Pi session JSONL trajectory (includes thinking, tool calls, tool results). */
  readonly trajectoryFile?: string;
}

export interface DilAgentRunOptions {
  readonly projectRepo?: string;
  readonly caseId?: string;
}

export interface DilAgent {
  readonly label: string;
  /** Every run carries the `<dil>` section, i.e. the state after `/webui`. */
  run(prompt: string, options?: DilAgentRunOptions): Promise<AgentRun>;
}

export type EvalThinkingLevel = NonNullable<Parameters<typeof createAgentSessionFromServices>[0]["thinkingLevel"]>;

export interface AgentOptions {
  readonly provider: string;
  readonly model: string;
  /**
   * Optional working directory. By default each run gets a fresh empty directory inside
   * `tmpdir()` so the agent cannot see this repository's `evals/` fixtures or DIL source.
   */
  readonly cwd?: string;
  /**
   * Tools the agent may use. Default: Pi's built-in coding tools (`read`, `bash`, `edit`,
   * `write`) so the eval matches real Pi sessions.
   */
  readonly tools?: readonly string[];
  /** Thinking level. Default: `DIL_EVAL_THINKING` env var or `"high"` (clamped by Pi). */
  readonly thinkingLevel?: EvalThinkingLevel;
}

export async function createDilAgent(options: AgentOptions): Promise<DilAgent> {
  const credentials = new InMemoryCredentialStore();
  const key = apiKeyFor(options.provider);
  await credentials.modify(options.provider, async () => ({ type: "api_key", key }));

  const modelRuntime = await ModelRuntime.create({ credentials, modelsPath: null });
  const model = modelRuntime.getModel(options.provider, options.model);
  if (!model) {
    const available = modelRuntime
      .getModels(options.provider)
      .map((candidate) => candidate.id)
      .join(", ");
    throw new Error(`unknown model ${options.provider}/${options.model}. Available: ${available}`);
  }

  const tools = options.tools ?? ["read", "bash", "edit", "write"];
  const thinkingLevel =
    options.thinkingLevel ?? (process.env.DIL_EVAL_THINKING as EvalThinkingLevel | undefined) ?? "high";
  return {
    label: `${model.provider}/${model.id}`,
    run: (prompt, runOptions) =>
      runPiSession(modelRuntime, model, prompt, {
        cwd: options.cwd,
        projectRepo: runOptions?.projectRepo,
        caseId: runOptions?.caseId,
        tools,
        thinkingLevel,
      }),
  };
}

type ResolvedModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;

async function runPiSession(
  modelRuntime: ModelRuntime,
  model: ResolvedModel,
  prompt: string,
  layout: {
    readonly cwd?: string;
    readonly projectRepo?: string;
    readonly caseId?: string;
    readonly tools: readonly string[];
    readonly thinkingLevel: EvalThinkingLevel;
  },
): Promise<AgentRun> {
  // Isolate both Pi's global config and the working directory per run.
  const root = await mkdtemp(join(tmpdir(), "pi-session-"));
  const agentDir = join(root, "agent");
  await mkdir(agentDir, { recursive: true });

  const modelSlug = `${model.provider}-${model.id}`.replaceAll("/", "-").replaceAll(" ", "-");
  const sessionsDir = layout.caseId ? join(TRAJECTORIES_DIR, modelSlug, layout.caseId) : join(root, "sessions");
  await mkdir(sessionsDir, { recursive: true });

  const sandbox = layout.projectRepo ? await startRepoSandbox(layout.projectRepo) : null;
  try {
    const workspace = sandbox?.workDir ?? layout.cwd ?? join(root, "workspace");
    if (!sandbox && !layout.cwd) await mkdir(workspace, { recursive: true });

    // Exactly the production mechanism: a new `<dil>` section, diffed by Pi into one
    // mid-conversation system patch instead of rewriting the prompt head.
    const extensionFactories: InlineExtension[] = [
      ...(sandbox ? [sandbox.extension] : []),
      {
        name: "pi-web-ui",
        hidden: true,
        factory: (pi) => {
          pi.on("before_agent_start", async (event) => {
            event.systemPromptOptions.sections.dil = DIL_SYSTEM_PROMPT;
          });
        },
      },
    ];

    const services = await createAgentSessionServices({
      cwd: workspace,
      agentDir,
      modelRuntime,
      resourceLoaderOptions: {
        extensionFactories,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      },
    });

    const sessionManager = SessionManager.create(workspace, sessionsDir);
    const trajectoryFile = layout.caseId ? sessionManager.getSessionFile() : undefined;
    const { session } = await createAgentSessionFromServices({
      services,
      sessionManager,
      model,
      thinkingLevel: layout.thinkingLevel,
      ...(layout.tools.length > 0 ? { tools: [...layout.tools] } : { noTools: "all" as const }),
    });

    try {
      await session.prompt(prompt);
      const text = session.getLastAssistantText() ?? "";
      const systemPrompt = getCurrentSystemPrompt(session.messages);
      const trace = extractAssistantTrace(session.messages);
      if (!text && trace.lastAssistantError) {
        throw new Error(trace.lastAssistantError);
      }
      return {
        text,
        systemPrompt,
        toolCallCount: trace.toolCallCount,
        toolNames: trace.toolNames,
        assistantTurns: trace.assistantTurns,
        ...(trajectoryFile ? { trajectoryFile } : {}),
      };
    } finally {
      session.dispose();
    }
  } finally {
    await sandbox?.dispose();
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

function extractAssistantTrace(messages: readonly { readonly role: string }[]): {
  readonly toolCallCount: number;
  readonly toolNames: readonly string[];
  readonly assistantTurns: number;
  readonly lastAssistantError?: string;
} {
  let assistantTurns = 0;
  let toolCallCount = 0;
  const seenTools = new Set<string>();
  let lastAssistantError: string | undefined;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    assistantTurns += 1;

    const assistant = message as {
      readonly stopReason?: string;
      readonly errorMessage?: string;
      readonly content?: readonly { readonly type?: string; readonly name?: string }[];
    };
    lastAssistantError = assistant.stopReason === "error" ? assistant.errorMessage : undefined;

    if (!Array.isArray(assistant.content)) continue;
    for (const block of assistant.content) {
      if (block.type === "toolCall") {
        toolCallCount += 1;
        if (typeof block.name === "string") seenTools.add(block.name);
      }
    }
  }

  return {
    toolCallCount,
    toolNames: [...seenTools],
    assistantTurns,
    lastAssistantError,
  };
}
