import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

const dryRun = (lines: string[]) => ["```console", "$ node export.mjs ./out --dry-run", ...lines, "```"].join("\n");

export const questions = [
  {
    header: "Existing files",
    question: "What should dry-run report when a target file already exists?",
    options: [
      {
        label: "Mark it as an overwrite (Recommended)",
        description: "List every file and flag the ones a real run would replace.",
        preview: dryRun(["reports/summary.csv   overwrite", "reports/orders.json   new"]),
      },
      {
        label: "List new files only",
        description: "Hide files that already exist in the output directory.",
        preview: dryRun(["reports/orders.json"]),
      },
      {
        label: "Fail the dry-run",
        description: "Exit non-zero so CI catches an accidental overwrite.",
        preview: dryRun(["error: reports/summary.csv already exists"]),
      },
    ],
  },
  {
    header: "Details",
    question: "What else should each line show?",
    multiSelect: true,
    options: [
      { label: "File size", description: "Estimated bytes per file." },
      { label: "Row count", description: "Rows per CSV report." },
    ],
  },
];

export default [
  fauxAssistantMessage([fauxToolCall("webui_ask_user_question", { questions }, { id: "ask-dry-run" })], {
    stopReason: "toolUse",
  }),
  fauxAssistantMessage("Thanks. I'll add `--dry-run` with overwrite markers."),
];
