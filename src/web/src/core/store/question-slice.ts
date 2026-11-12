import { type AskUserQuestion, readQuestions } from "../ask-user-question";
import type { QuestionSlice, StoreSlice } from "./types";

export const createQuestionSlice: StoreSlice<QuestionSlice> = (set, get) => ({
  questionnaires: {},
  applyQuestionEvent: (event, raw) => {
    const payload = (raw.payload ?? raw) as Record<string, unknown>;
    const id = payload.toolCallId;
    if (typeof id !== "string") return;
    if (event.endsWith(":prompt")) {
      const questions = readQuestions(payload);
      if (!questions.length) return;
      const tool = get().items.find((item) => item.kind === "tool" && item.id === id);
      const questionnaire: AskUserQuestion = {
        toolCallId: id,
        questions,
        status: "pending",
      };
      set((state) => ({
        questionnaires: { ...state.questionnaires, [id]: questionnaire },
        ...(!tool && {
          items: [
            ...state.items,
            {
              kind: "tool" as const,
              id,
              name: "webui_ask_user_question",
              input: { questions },
              state: "input-available" as const,
            },
          ],
        }),
      }));
    } else if (event.endsWith(":blocked") && payload.active === false) {
      const current = get().questionnaires[id];
      if (current?.status === "pending") {
        set((state) => ({
          questionnaires: {
            ...state.questionnaires,
            [id]: { ...current, status: payload.cancelled ? "cancelled" : "answered", submitting: false },
          },
        }));
      }
    }
  },
  submitQuestion: async (id, answers, cancel = false) => {
    const current = get().questionnaires[id];
    if (!current || current.status !== "pending" || current.submitting) return;
    const update = (changes: Partial<AskUserQuestion>) => {
      // A session replacement may remove this questionnaire while the request is in flight.
      set((state) =>
        state.questionnaires[id]
          ? {
              questionnaires: { ...state.questionnaires, [id]: { ...state.questionnaires[id], ...changes } },
            }
          : {},
      );
    };
    if (get().connection !== "connected") return update({ error: "Reconnect before answering." });
    update({ submitting: true, error: undefined });
    try {
      const verdict = (await get().send("answer_question", {
        toolCallId: id,
        ...(cancel ? { cancel: true } : { answers }),
      })) as { ok: boolean; reason?: string; code?: string };
      if (!verdict.ok) {
        update({ submitting: false, error: verdict.reason || "Answer was not accepted." });
        if (verdict.code === "not_found") void get().requestConversationSync();
      } else update({ submitting: false, status: cancel ? "cancelled" : "answered", error: undefined });
    } catch (error) {
      update({ submitting: false, error: error instanceof Error ? error.message : "Answer failed." });
    }
  },
});
