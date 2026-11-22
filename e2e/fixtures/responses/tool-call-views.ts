import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const content = Array.from({ length: 14 }, (_, index) => `export const item${index + 1} = ${index + 1};`).join("\n");

export default [
  fauxAssistantMessage(
    [
      fauxToolCall("bash", {
        command: [
          "printf '\\033[32mBuild started\\033[0m\\n\\033[40mBackground notice\\033[0m\\n'",
          "while [ ! -f .finish ]; do",
          `  : 'https://example.test/${"long-path".repeat(12)}'`,
          "  sleep 0.1",
          "done",
          "printf 'Build failed\\n' >&2",
          "exit 7",
        ].join("\n"),
        timeout: 25,
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([fauxToolCall("write", { path: "example.ts", content })], { stopReason: "toolUse" }),
  fauxAssistantMessage([fauxToolCall("read", { path: "example.ts", offset: 3, limit: 10 })], { stopReason: "toolUse" }),
  fauxAssistantMessage(
    [
      fauxToolCall("edit", {
        path: "example.ts",
        edits: [{ oldText: "export const item3 = 3;", newText: "export const item3 = 30;" }],
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage("The file review is complete."),
];
