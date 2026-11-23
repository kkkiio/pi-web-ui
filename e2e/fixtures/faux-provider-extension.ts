import { fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import cacheStrategyResponses from "./responses/cache-strategy.ts";
import chatLifecycleResponses from "./responses/chat-lifecycle.ts";
import dilHeavyResponses from "./responses/dil-heavy.ts";
import dilInteractionResponses from "./responses/dil-interaction.ts";
import dilListResponses from "./responses/dil-list.ts";
import dilMarkdownResponses from "./responses/dil-markdown.ts";
import dilRenderResponses from "./responses/dil-render.ts";
import dilSvgResponses from "./responses/dil-svg.ts";
import duplicateArtifactResponses from "./responses/duplicate-artifact.ts";
import editHistoryResponses from "./responses/edit-history.ts";
import exportClarifyResponses from "./responses/export-clarify.ts";
import externalArtifactResponses from "./responses/external-artifact.ts";
import imageResponses from "./responses/image-previews.ts";
import processGroupResponses from "./responses/process-group.ts";
import promptDraftResponses from "./responses/prompt-draft.ts";
import reportExportResponses from "./responses/report-export.ts";
import toolCallViewsResponses from "./responses/tool-call-views.ts";
import toolFailureResponses from "./responses/tool-failure.ts";
import transcriptQuoteResponses from "./responses/transcript-quote.ts";
import workspaceArtifactResponses from "./responses/workspace-artifact.ts";

const responsesByName = {
  "image-previews": imageResponses,
  "prompt-draft": promptDraftResponses,
  "process-group": processGroupResponses,
  "report-export": reportExportResponses,
  "cache-strategy": cacheStrategyResponses,
  "export-clarify": exportClarifyResponses,
  "transcript-quote": transcriptQuoteResponses,
  "edit-history": editHistoryResponses,
  "chat-lifecycle": chatLifecycleResponses,
  "dil-render": dilRenderResponses,
  "dil-interaction": dilInteractionResponses,
  "dil-svg": dilSvgResponses,
  "dil-list": dilListResponses,
  "dil-markdown": dilMarkdownResponses,
  "dil-heavy": dilHeavyResponses,
  "duplicate-artifact": duplicateArtifactResponses,
  "external-artifact": externalArtifactResponses,
  "tool-failure": toolFailureResponses,
  "tool-call-views": toolCallViewsResponses,
  "workspace-artifact": workspaceArtifactResponses,
};

export default function (pi: ExtensionAPI) {
  let initialTools: string[] = [];
  let initialPrompt = "";
  let initialName: string | undefined;
  pi.on("session_start", (_event, ctx) => {
    initialTools = pi.getActiveTools();
    initialPrompt = ctx.getSystemPrompt();
    initialName = pi.getSessionName();
  });
  pi.registerCommand("assert-terminal-unchanged", {
    handler: async (_args, ctx) => {
      if (
        JSON.stringify(pi.getActiveTools()) !== JSON.stringify(initialTools) ||
        ctx.getSystemPrompt() !== initialPrompt ||
        pi.getSessionName() !== initialName
      ) {
        throw new Error("Web UI changed the terminal session before activation.");
      }
    },
  });
  pi.registerCommand("assert-dil-prompt", {
    handler: async (args, ctx) => {
      const expected = (args ?? "").trim() === "active";
      const present = ctx.getSystemPrompt().includes("<dil>");
      if (present !== expected) {
        throw new Error(`DIL prompt section is ${present ? "present" : "absent"}; expected ${args}`);
      }
    },
  });
  pi.registerCommand("new-test-session", {
    handler: async (_args, ctx) => {
      await ctx.newSession();
    },
  });
  pi.registerCommand("reload-test-session", {
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });
  pi.registerCommand("wait-test-idle", {
    handler: async (_args, ctx) => {
      await ctx.waitForIdle();
    },
  });
  const fixtureName = process.env.PI_WEB_UI_E2E_FIXTURE || "chat-lifecycle";
  const faux = fauxProvider({
    provider: "faux",
    models: [{ id: "faux-1", name: "Faux E2E", reasoning: false }],
    tokenSize: fixtureName === "process-group" ? { min: 8, max: 8 } : { min: 64, max: 64 },
    ...(fixtureName === "process-group" && { tokensPerSecond: 6 }),
  });
  const fixture = responsesByName[fixtureName as keyof typeof responsesByName] || chatLifecycleResponses;
  const responses = typeof fixture === "function" ? fixture(pi) : fixture;

  faux.setResponses([...responses, ...chatLifecycleResponses]);
  pi.registerProvider(faux.provider);
  pi.on("session_before_tree", () =>
    process.env.PI_WEB_UI_E2E_CANCEL_NAVIGATION === "1" ? { cancel: true } : undefined,
  );
  pi.on("session_shutdown", () => {
    pi.unregisterProvider("faux");
  });
}
