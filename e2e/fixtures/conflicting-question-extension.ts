import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// A real independent extension with an intentionally incompatible schema. Web UI
// takes over its known name without reading its implementation or event contract.
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_user_question",
    label: "Another question tool",
    description: "A third-party question tool with its own protocol.",
    defaultActive: process.env.PI_WEB_UI_E2E_CONFLICT_INACTIVE !== "1",
    parameters: Type.Object({ prompt: Type.String() }),
    execute: async () => {
      throw new Error("The third-party question tool must not execute during Web UI activation.");
    },
  });
}
