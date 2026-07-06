import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    [
      fauxToolCall("write", {
        path: ".",
        content: "This write intentionally targets a directory so the tool fails.",
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("The write tool failed as expected."),
];
