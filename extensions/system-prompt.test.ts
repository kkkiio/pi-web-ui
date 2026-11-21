import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { getCurrentSystemPrompt } from "@earendil-works/pi-ai/utils/transcript";
import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";
import { renderExamplesModule } from "../scripts/gen-dil-examples.mjs";
import { parseDocument } from "../src/web/src/core/dil/index.ts";
import { createDilPrompt, DIL_PROMPT_EXAMPLES, type DilPromptController } from "./system-prompt.ts";

test("every prompt example parses without diagnostics", () => {
  for (const [name, source] of Object.entries(DIL_PROMPT_EXAMPLES)) {
    const document = parseDocument(source);
    assert.deepEqual(
      document.diagnostics.map((d) => d.code),
      [],
      `${name} example must parse cleanly`,
    );
  }
});

test("examples.gen.ts matches extensions/examples/*.dil.md", () => {
  const actual = readFileSync(new URL("./examples.gen.ts", import.meta.url), "utf8");
  assert.equal(actual, renderExamplesModule(), "extensions/examples.gen.ts is stale — run `just gen`");
});

test("DIL system prompt token increase matches the snapshot", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-web-ui-prompt-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("OK"), fauxAssistantMessage("OK")]);
  let dilPrompt: DilPromptController | undefined;
  const services = await createAgentSessionServices({
    cwd,
    agentDir: join(cwd, "agent"),
    resourceLoaderOptions: {
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noContextFiles: true,
      extensionFactories: [
        {
          name: "prompt-token-test",
          factory: (pi) => {
            pi.registerProvider(faux.provider);
            dilPrompt = createDilPrompt(pi);
          },
        },
      ],
    },
  });
  const { session } = await createAgentSessionFromServices({
    services,
    sessionManager: SessionManager.inMemory(cwd),
    model: faux.getModel(),
    noTools: "all",
  });

  try {
    assert.ok(dilPrompt);
    await session.prompt("Hello");
    const before = getCurrentSystemPrompt(session.messages);
    dilPrompt.activate();
    await session.prompt("Hello");
    const after = getCurrentSystemPrompt(session.messages);
    assert.equal(faux.getPendingResponseCount(), 0);

    const tokenizer = new Tiktoken(o200kBase);
    const addedTokens = tokenizer.encode(after).length - tokenizer.encode(before).length;
    t.assert.fileSnapshot(
      { encoding: "o200k_base", addedTokens },
      fileURLToPath(new URL("./system-prompt.tokens.json", import.meta.url)),
      { serializers: [(value) => `${JSON.stringify(value, null, 2)}\n`] },
    );
  } finally {
    session.dispose();
  }
});
