import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function imagePreviewResponses(pi: ExtensionAPI) {
  const reading = Promise.withResolvers<void>();
  pi.registerCommand("finish-test-image-read", {
    handler: async () => reading.resolve(),
  });

  return [
    async () => {
      await reading.promise;
      return fauxAssistantMessage([fauxToolCall("read", { path: "preview.png" })], { stopReason: "toolUse" });
    },
    fauxAssistantMessage("The image was read successfully."),
  ];
}
