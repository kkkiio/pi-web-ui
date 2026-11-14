import { fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import askUserQuestionResponses from "./responses/ask-user-question.ts";
import chatLifecycleResponses from "./responses/chat-lifecycle.ts";
import duplicateArtifactResponses from "./responses/duplicate-artifact.ts";
import editHistoryResponses from "./responses/edit-history.ts";
import externalArtifactResponses from "./responses/external-artifact.ts";
import processGroupResponses from "./responses/process-group.ts";
import reportExportResponses from "./responses/report-export.ts";
import toolFailureResponses from "./responses/tool-failure.ts";
import transcriptQuoteResponses from "./responses/transcript-quote.ts";
import workspaceArtifactResponses from "./responses/workspace-artifact.ts";

const responsesByName = {
  "ask-user-question": askUserQuestionResponses,
  "process-group": processGroupResponses,
  "report-export": reportExportResponses,
  "transcript-quote": transcriptQuoteResponses,
  "edit-history": editHistoryResponses,
  "chat-lifecycle": chatLifecycleResponses,
  "duplicate-artifact": duplicateArtifactResponses,
  "external-artifact": externalArtifactResponses,
  "tool-failure": toolFailureResponses,
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
  for (const [command, registered, active] of [
    ["assert-question-active", true, true],
    ["assert-question-inactive", true, false],
    ["assert-question-absent", false, false],
  ] as const) {
    pi.registerCommand(command, {
      handler: async () => {
        const tools = pi.getAllTools().filter((tool) => tool.name === "webui_ask_user_question");
        if (
          Boolean(tools.length) !== registered ||
          pi.getActiveTools().includes("webui_ask_user_question") !== active
        ) {
          throw new Error("Question tool registration or activation does not match the expected lifecycle.");
        }
      },
    });
  }
  pi.registerCommand("assert-tool-state", {
    handler: async (args) => {
      const { active = [], inactive = [] } = JSON.parse(args) as { active?: string[]; inactive?: string[] };
      const tools = pi.getActiveTools();
      if (active.some((name) => !tools.includes(name)) || inactive.some((name) => tools.includes(name))) {
        throw new Error(`Unexpected active tools: ${tools.join(", ")}`);
      }
    },
  });
  pi.registerCommand("disable-read", {
    handler: async () => pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "read")),
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
  const responses = responsesByName[fixtureName as keyof typeof responsesByName] || chatLifecycleResponses;

  faux.setResponses([...responses, ...chatLifecycleResponses]);
  pi.registerProvider(faux.provider);
  pi.on("session_before_tree", () =>
    process.env.PI_WEB_UI_E2E_CANCEL_NAVIGATION === "1" ? { cancel: true } : undefined,
  );
  pi.on("session_shutdown", () => {
    pi.unregisterProvider("faux");
  });
}
