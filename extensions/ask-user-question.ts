import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const QUESTION_TOOL = "webui_ask_user_question";
export const QUESTION_CHANNEL = "pi-web-ui:ask-user";
const CONFLICT_TOOLS = new Set(["ask_user_question"]);

const OptionSchema = Type.Object({
  label: Type.String({ minLength: 1, maxLength: 60 }),
  description: Type.String(),
  preview: Type.Optional(Type.String()),
});
const QuestionSchema = Type.Object({
  question: Type.String({ minLength: 1 }),
  header: Type.String({ minLength: 1, maxLength: 16 }),
  options: Type.Array(OptionSchema, { minItems: 2, maxItems: 4 }),
  multiSelect: Type.Optional(Type.Boolean()),
});
const ParametersSchema = Type.Object({ questions: Type.Array(QuestionSchema, { minItems: 1, maxItems: 4 }) });

type Question = {
  question: string;
  header: string;
  options: { label: string; description: string; preview?: string }[];
  multiSelect?: boolean;
};
type Answer = {
  questionIndex: number;
  question: string;
  kind: "option" | "custom" | "multi";
  answer: string | null;
  selected?: string[];
  notes?: string;
  preview?: string;
};
type Result = { answers: Answer[]; cancelled: boolean; globalNote?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function createQuestionTool(pi: ExtensionAPI) {
  const pending = new Map<string, { questions: Question[]; finish: (result: Result) => void }>();
  let enabled = false;
  let registered = false;
  const disabledConflicts = new Set<string>();

  function answer(raw: unknown) {
    const data = isRecord(raw) ? raw : {};
    const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : undefined;
    const reply = (code?: string, reason?: string) => ({ ok: !code, ...(code && { code, reason }) });
    const target = toolCallId ? pending.get(toolCallId) : undefined;
    if (!target) return reply("not_found", "This questionnaire is no longer pending.");
    try {
      const result = validateAnswer(target.questions, data);
      target.finish(result);
      return reply();
    } catch (error) {
      return reply("invalid_answer", error instanceof Error ? error.message : "Invalid answer");
    }
  }

  function deactivate() {
    if (!enabled) return;
    enabled = false;
    cancelAll();
    const active = pi.getActiveTools().filter((name) => name !== QUESTION_TOOL);
    pi.setActiveTools([...new Set([...active, ...disabledConflicts])]);
    disabledConflicts.clear();
  }

  function cancelAll() {
    for (const target of [...pending.values()]) target.finish({ answers: [], cancelled: true });
  }

  return {
    deactivate,
    answer,
    replay: () =>
      [...pending].map(([toolCallId, { questions }]) => ({
        type: "event" as const,
        event: `${QUESTION_CHANNEL}:prompt`,
        payload: { payload: { toolCallId, questions } },
      })),
    activate() {
      if (enabled) return;
      if (!registered) {
        if (pi.getAllTools().some((tool) => tool.name === QUESTION_TOOL)) {
          throw new Error(`${QUESTION_TOOL} is already registered by another extension.`);
        }
        pi.registerTool({
          name: QUESTION_TOOL,
          label: "Ask User Question",
          defaultActive: false,
          exposure: "model-only",
          description:
            "Ask 1-4 structured clarification questions when requirements are ambiguous. Each question has 2-4 options. Users can select options or type a custom answer in Pi Web UI. Do not add an Other option. Put a recommended option first and append (Recommended) to its label. Use multiSelect for multiple choices and optional Markdown previews for concrete alternatives.",
          promptSnippet: "Clarify ambiguous requirements with structured questions before proceeding",
          promptGuidelines: [
            "Use webui_ask_user_question to clarify ambiguous requirements before making implementation decisions. Group related questions in one call; the user can answer in Pi Web UI.",
          ],
          parameters: ParametersSchema,
          async execute(toolCallId, { questions }, signal) {
            if (!enabled) throw new Error("Run /webui before using webui_ask_user_question.");
            if (new Set(questions.map((q) => q.question)).size !== questions.length) {
              throw new Error("Question texts must be distinct.");
            }
            for (const question of questions) {
              if (new Set(question.options.map((option) => option.label)).size !== question.options.length) {
                throw new Error("Option labels must be distinct.");
              }
            }
            if (signal?.aborted) return toolResult({ answers: [], cancelled: true });
            const result = await new Promise<Result>((resolve) => {
              const finish = (answer: Result) => {
                if (!pending.delete(toolCallId)) return;
                signal?.removeEventListener("abort", abort);
                pi.events.emit(`${QUESTION_CHANNEL}:blocked`, {
                  toolCallId,
                  active: false,
                  cancelled: answer.cancelled,
                });
                resolve(answer);
              };
              const abort = () => finish({ answers: [], cancelled: true });
              pending.set(toolCallId, { questions, finish });
              signal?.addEventListener("abort", abort, { once: true });
              pi.events.emit(`${QUESTION_CHANNEL}:prompt`, { toolCallId, questions });
            });
            return toolResult(result);
          },
        });
        registered = true;
      }
      const active = pi.getActiveTools();
      for (const name of active) if (CONFLICT_TOOLS.has(name)) disabledConflicts.add(name);
      try {
        pi.setActiveTools([...active.filter((name) => !CONFLICT_TOOLS.has(name)), QUESTION_TOOL]);
        if (!pi.getActiveTools().includes(QUESTION_TOOL))
          throw new Error(`${QUESTION_TOOL} is not allowed in this session's tool configuration.`);
        enabled = true;
      } catch (error) {
        pi.setActiveTools(active);
        disabledConflicts.clear();
        throw error;
      }
    },
  };
}

function validateAnswer(questions: Question[], data: Record<string, unknown>): Result {
  if (data.cancel !== undefined && typeof data.cancel !== "boolean") throw new Error("cancel must be a boolean.");
  if (data.globalNote !== undefined && typeof data.globalNote !== "string") throw new Error("Invalid global note.");
  const globalNote = typeof data.globalNote === "string" ? data.globalNote.trim() : "";
  if (data.cancel === true) return { answers: [], cancelled: true, ...(globalNote && { globalNote }) };
  if (!Array.isArray(data.answers) || data.answers.length !== questions.length) {
    throw new Error("Answer every question before submitting.");
  }
  const seen = new Set<number>();
  const answers = data.answers.map((entry): Answer => {
    if (!isRecord(entry) || !Number.isInteger(entry.questionIndex)) throw new Error("Invalid question index.");
    const index = entry.questionIndex as number;
    const question = questions[index];
    if (!question || seen.has(index)) throw new Error("Unknown or duplicate question.");
    seen.add(index);
    const indexes = entry.optionIndexes ?? [];
    if (!Array.isArray(indexes) || new Set(indexes).size !== indexes.length) throw new Error("Invalid choices.");
    if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= question.options.length)) {
      throw new Error("Choice is out of range.");
    }
    if (entry.text !== undefined && (typeof entry.text !== "string" || !entry.text.trim())) {
      throw new Error("Custom answers cannot be blank.");
    }
    if (entry.notes !== undefined && typeof entry.notes !== "string") throw new Error("Invalid question note.");
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (indexes.length === 0 && !text) throw new Error("Answer every question before submitting.");
    if (!question.multiSelect && indexes.length + Number(Boolean(text)) !== 1) {
      throw new Error("Select one option or provide a custom answer.");
    }
    const selected = indexes.map((i: number) => question.options[i].label);
    const preview = !question.multiSelect && indexes.length === 1 ? question.options[indexes[0]].preview : undefined;
    return {
      questionIndex: index,
      question: question.question,
      kind: question.multiSelect ? "multi" : text ? "custom" : "option",
      answer: text || (question.multiSelect ? null : selected[0]),
      ...(question.multiSelect && { selected }),
      ...(preview && { preview }),
      ...(entry.notes && { notes: entry.notes as string }),
    };
  });
  return { answers, cancelled: false, ...(globalNote && { globalNote }) };
}

function toolResult(result: Result) {
  const answers = result.answers.map((answer) => {
    const lines = [answer.question, [...(answer.selected ?? []), answer.answer].filter(Boolean).join(", ")];
    if (answer.preview) lines.push(`Selected preview:\n${answer.preview}`);
    if (answer.notes) lines.push(`Notes: ${answer.notes}`);
    return lines.join("\n");
  });
  if (result.globalNote) answers.push(`Global note: ${result.globalNote}`);
  return {
    content: [
      {
        type: "text" as const,
        text: result.cancelled
          ? "User declined to answer questions"
          : `User has answered your questions:\n${answers.join("\n\n")}`,
      },
    ],
    details: result,
  };
}
