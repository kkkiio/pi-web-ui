import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage([fauxToolCall("read", { path: "preview.png" })], { stopReason: "toolUse" }),
  fauxAssistantMessage("The image was read successfully."),
];
