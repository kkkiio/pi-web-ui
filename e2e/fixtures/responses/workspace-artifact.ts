import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    [
      fauxToolCall("write", {
        path: "docs/prd/workspace-status-float.md",
        content: [
          "# PRD: Workspace Status Float",
          "",
          "The workspace float shows the current git branch, diff status, and Markdown artifacts.",
          "",
          "The workspace float shows the current git branch and readable diff status.",
        ].join("\n"),
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("Updated the workspace status docs."),
];
