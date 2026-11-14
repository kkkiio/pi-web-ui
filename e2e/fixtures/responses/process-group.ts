import { fauxAssistantMessage, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    [
      fauxThinking("**Inspecting the process**\n\nI will inspect the process before reporting the result."),
      fauxToolCall("bash", { command: "sleep 2 && printf 'Process check passed'" }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("The process check passed."),
];
