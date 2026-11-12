import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";

export const questions = [
  {
    header: "Storage",
    question: "Where should we store the project data?",
    options: [
      {
        label: "SQLite (Recommended)",
        description: "Keep setup simple with a local database.",
        preview: "### Local storage\n\n```sql\nCREATE TABLE projects (id INTEGER PRIMARY KEY);\n```",
      },
      {
        label: "PostgreSQL",
        description: "Use a shared server for collaborative access.",
        preview: "### Shared storage\n\nUse a **managed database** for the team.",
      },
    ],
  },
  {
    header: "Features",
    question: "Which features should be included?",
    multiSelect: true,
    options: [
      { label: "Search", description: "Find projects quickly." },
      { label: "Export", description: "Download a copy of your data." },
    ],
  },
];

export default [
  fauxAssistantMessage([fauxToolCall("webui_ask_user_question", { questions }, { id: "ask-storage" })], {
    stopReason: "toolUse",
  }),
  fauxAssistantMessage("I received your clarification and can continue."),
];
