import { fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    [
      fauxThinking("Inspect the exact failure before making changes."),
      fauxText("The retry policy must preserve the original request."),
      fauxToolCall("bash", { command: "printf 'first output line\\nsecond output line\\n'" }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("Explain the selected sentence before changing code."),
];
