import { registerFauxProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import chatLifecycleResponses from "./responses/chat-lifecycle.ts";
import externalArtifactResponses from "./responses/external-artifact.ts";
import workspaceArtifactResponses from "./responses/workspace-artifact.ts";

const responsesByName = {
  "chat-lifecycle": chatLifecycleResponses,
  "external-artifact": externalArtifactResponses,
  "workspace-artifact": workspaceArtifactResponses,
};

export default function (pi: ExtensionAPI) {
  const faux = registerFauxProvider({
    provider: "faux",
    models: [{ id: "faux-1", name: "Faux E2E", reasoning: false }],
    tokenSize: { min: 64, max: 64 },
  });
  const model = faux.getModel();
  const fixtureName = process.env.PI_WEB_UI_E2E_FIXTURE || "chat-lifecycle";
  const responses = responsesByName[fixtureName as keyof typeof responsesByName] || chatLifecycleResponses;

  faux.setResponses(responses);
  pi.registerProvider("faux", {
    name: "Faux E2E",
    baseUrl: model.baseUrl,
    apiKey: "faux-key",
    api: faux.api as never,
    models: faux.models.map((registeredModel) => ({
      id: registeredModel.id,
      name: registeredModel.name,
      api: registeredModel.api as never,
      reasoning: registeredModel.reasoning,
      input: registeredModel.input,
      cost: registeredModel.cost,
      contextWindow: registeredModel.contextWindow,
      maxTokens: registeredModel.maxTokens,
      baseUrl: registeredModel.baseUrl,
    })),
  });

  pi.on("session_shutdown", () => {
    faux.unregister();
    pi.unregisterProvider("faux");
  });
}
