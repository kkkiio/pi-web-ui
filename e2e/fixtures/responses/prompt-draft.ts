import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage([fauxToolCall("bash", { command: "sleep 8" })], { stopReason: "toolUse" }),
  fauxAssistantMessage("The draft check is complete."),
];
