import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const writeLine = 'writeFileSync(target, "item,total\\norders,42\\n");';

export default [
  fauxAssistantMessage(
    "The export command already builds the output paths before writing. I’d print those paths in dry-run mode, then return before any files are created.",
  ),
  fauxAssistantMessage([fauxToolCall("read", { path: "export.mjs" })], { stopReason: "toolUse" }),
  fauxAssistantMessage(
    [
      fauxToolCall("edit", {
        path: "export.mjs",
        edits: [
          {
            oldText: ["mkdirSync(dirname(target), { recursive: true });", writeLine].join("\n"),
            newText: [
              'if (process.argv.includes("--dry-run")) {',
              "  console.log(relative(output, target));",
              "} else {",
              "  mkdirSync(dirname(target), { recursive: true });",
              `  ${writeLine}`,
              "}",
            ].join("\n"),
          },
        ],
      }),
    ],
    { stopReason: "toolUse" },
  ),
  fauxAssistantMessage([fauxToolCall("bash", { command: "node --test export.test.mjs" })], { stopReason: "toolUse" }),
  fauxAssistantMessage(
    [
      "Added `--dry-run`. It prints paths relative to the output directory and skips writing.",
      "",
      "```console",
      "$ node export.mjs ./out --dry-run",
      "reports/summary.csv",
      "```",
      "",
      "The test confirms the path is relative and the output directory stays empty.",
    ].join("\n"),
  ),
];
