import { fauxAssistantMessage, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";

// Rich chat state for visual checks: thinking blocks, a bash tool call (real
// execution, auto-expand/collapse behavior), and a read of sample.png whose
// tool result carries a real image block (IMAGES strip + lightbox).
export default [
  fauxAssistantMessage(
    [fauxThinking("Let me run a quick command first."), fauxToolCall("bash", { command: "echo hello-from-bash" })],
    {
      stopReason: "toolUse",
    },
  ),
  fauxAssistantMessage([fauxThinking("Now let me look at the image."), fauxToolCall("read", { path: "sample.png" })], {
    stopReason: "toolUse",
  }),
  fauxAssistantMessage("Ran bash and viewed sample.png — a dark T-shaped icon on a light background."),
];
