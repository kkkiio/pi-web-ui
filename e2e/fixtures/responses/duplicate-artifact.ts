import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    [
      fauxToolCall("write", {
        path: "docs/prd/workspace-status-float.md",
        content: "# PRD: Workspace Status Float\n\nFirst artifact update.",
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage(
    [
      fauxToolCall("write", {
        path: "docs/prd/workspace-status-float.md",
        content: "# PRD: Workspace Status Float\n\nSecond artifact update.",
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("Updated the same artifact twice."),
];
