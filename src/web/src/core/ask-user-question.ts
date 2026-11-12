import type { ChatItem } from "./types";

export type Question = {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string; preview?: string }[];
};
export type QuestionAnswer = { questionIndex: number; optionIndexes?: number[]; text?: string };
export type QuestionDraft = { indexes: number[]; text: string; custom: boolean; preview?: number };
export type AskUserQuestion = {
  toolCallId: string;
  questions: Question[];
  status: "pending" | "answered" | "cancelled";
  submitting?: boolean;
  error?: string;
  summary?: string;
};

export function readQuestions(value: unknown): Question[] {
  if (!value || typeof value !== "object" || !("questions" in value) || !Array.isArray(value.questions)) return [];
  return value.questions.flatMap((question) => {
    if (!question || typeof question.question !== "string" || !Array.isArray(question.options)) return [];
    return [
      {
        question: question.question,
        header: typeof question.header === "string" ? question.header : "Question",
        multiSelect: question.multiSelect === true,
        options: question.options.flatMap((option: Record<string, unknown> | null) =>
          option && typeof option.label === "string"
            ? [
                {
                  label: option.label,
                  description: typeof option.description === "string" ? option.description : "",
                  ...(typeof option.preview === "string" && { preview: option.preview }),
                },
              ]
            : [],
        ),
      },
    ];
  });
}

export function historicalQuestion(item: ChatItem & { kind: "tool" }): AskUserQuestion | undefined {
  if (item.name !== "webui_ask_user_question") return;
  const questions = readQuestions(item.input);
  if (!questions.length) return;
  const details = item.outputDetails as { cancelled?: boolean } | undefined;
  return {
    toolCallId: item.id,
    questions,
    status: details?.cancelled || item.state !== "output-available" ? "cancelled" : "answered",
    summary: item.errorText || (typeof item.output === "string" ? item.output : undefined),
  };
}
