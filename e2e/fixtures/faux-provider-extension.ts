import { fauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import chatLifecycleResponses from "./responses/chat-lifecycle.ts";
import duplicateArtifactResponses from "./responses/duplicate-artifact.ts";
import editHistoryResponses from "./responses/edit-history.ts";
import externalArtifactResponses from "./responses/external-artifact.ts";
import toolFailureResponses from "./responses/tool-failure.ts";
import workspaceArtifactResponses from "./responses/workspace-artifact.ts";

const responsesByName = {
  "edit-history": editHistoryResponses,
  "chat-lifecycle": chatLifecycleResponses,
  "duplicate-artifact": duplicateArtifactResponses,
  "external-artifact": externalArtifactResponses,
  "tool-failure": toolFailureResponses,
  "workspace-artifact": workspaceArtifactResponses,
};

export default function (pi: ExtensionAPI) {
  const faux = fauxProvider({
    provider: "faux",
    models: [{ id: "faux-1", name: "Faux E2E", reasoning: false }],
    tokenSize: { min: 64, max: 64 },
  });
  const fixtureName = process.env.PI_WEB_UI_E2E_FIXTURE || "chat-lifecycle";
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
