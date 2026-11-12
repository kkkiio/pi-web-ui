import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
export default [
  fauxAssistantMessage(
    [
      fauxText("Old branch explanation"),
      fauxToolCall("write", { path: "one.txt", content: "one" }),
      fauxToolCall("write", { path: "two.txt", content: "two" }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("Old branch done"),
  fauxAssistantMessage("New branch reply"),
];
