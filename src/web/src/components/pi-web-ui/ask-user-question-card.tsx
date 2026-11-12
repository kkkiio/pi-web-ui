import { MessageCircleQuestionIcon } from "lucide-react";
import { useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AskUserQuestion, QuestionAnswer } from "../../core/ask-user-question";
import { usePiWebUiStore } from "../../core/store";

type Draft = { indexes: number[]; text: string; custom: boolean; preview?: number };

export function AskUserQuestionCard({ questionnaire }: { questionnaire: AskUserQuestion }) {
  const { toolCallId, questions, status, submitting, error, summary } = questionnaire;
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const connection = usePiWebUiStore((state) => state.connection);
  const submit = usePiWebUiStore((state) => state.submitQuestion);
  const disabled = status !== "pending" || submitting || connection !== "connected";
  const draftFor = (i: number): Draft => drafts[i] ?? { indexes: [], text: "", custom: false };
  const update = (i: number, value: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [i]: { ...(current[i] ?? { indexes: [], text: "", custom: false }), ...value },
    }));
  const complete = questions.every((question, i) => {
    const draft = draftFor(i);
    return question.multiSelect
      ? draft.indexes.length > 0 || draft.text.trim().length > 0
      : draft.custom
        ? draft.text.trim().length > 0
        : draft.indexes.length === 1;
  });
  const send = (cancel = false) => {
    const answers: QuestionAnswer[] = questions.map((question, questionIndex) => {
      const draft = draftFor(questionIndex);
      return {
        questionIndex,
        optionIndexes: draft.custom && !question.multiSelect ? [] : draft.indexes,
        ...((question.multiSelect || draft.custom) && draft.text.trim() ? { text: draft.text.trim() } : {}),
      };
    });
    void submit(toolCallId, answers, cancel);
  };

  return (
    <section
      aria-label="Agent questions"
      className="w-full min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground"
      data-testid="ask-user-question"
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 text-sm">
        <MessageCircleQuestionIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">A few questions before continuing</span>
        <span aria-live="polite" className="ml-auto text-xs text-muted-foreground">
          {status === "pending" ? "Waiting for your answer" : status === "answered" ? "Answered" : "Cancelled"}
        </span>
      </div>
      {status === "pending" ? (
        <form
          className="space-y-5 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (complete && !disabled) send();
          }}
        >
          {questions.map((question, i) => {
            const draft = draftFor(i);
            const preview = question.options[draft.preview ?? draft.indexes[0]]?.preview;
            return (
              <fieldset className="min-w-0 space-y-3" disabled={disabled} key={question.question}>
                <legend className="mb-2 w-full space-y-2">
                  <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {question.header}
                  </span>
                  <span className="block whitespace-pre-wrap text-sm font-medium leading-relaxed">
                    {question.question}
                  </span>
                </legend>
                <p className="text-xs text-muted-foreground">
                  {question.multiSelect
                    ? "Select all that apply, or add your own answer."
                    : "Choose one, or write your own answer."}
                </p>
                <div className={cn("grid min-w-0 gap-3", preview && "md:grid-cols-2")}>
                  <div className="min-w-0 space-y-2">
                    {question.options.map((option, j) => (
                      <label
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/60",
                          draft.indexes.includes(j) &&
                            !(!question.multiSelect && draft.custom) &&
                            "border-primary bg-primary/5",
                        )}
                        key={option.label}
                      >
                        <input
                          checked={draft.indexes.includes(j) && (question.multiSelect || !draft.custom)}
                          className="mt-1 shrink-0 accent-current"
                          name={`${toolCallId}-${i}`}
                          onChange={() =>
                            update(i, {
                              custom: question.multiSelect ? draft.custom : false,
                              preview: j,
                              indexes: question.multiSelect
                                ? draft.indexes.includes(j)
                                  ? draft.indexes.filter((index) => index !== j)
                                  : [...draft.indexes, j]
                                : [j],
                            })
                          }
                          onFocus={() => update(i, { preview: j })}
                          type={question.multiSelect ? "checkbox" : "radio"}
                        />
                        <span className="min-w-0 break-words">
                          <span className="block font-medium">{option.label}</span>
                          <span className="mt-1 block whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {preview && (
                    <div
                      aria-label="Option preview"
                      role="region"
                      className="min-w-0 overflow-auto rounded-lg border bg-muted/30 p-3 text-sm [&_pre]:max-w-full"
                    >
                      <MessageResponse>{preview}</MessageResponse>
                    </div>
                  )}
                </div>
                <label className="block space-y-2 text-sm">
                  <span className="flex items-center gap-2">
                    {!question.multiSelect && (
                      <input
                        checked={draft.custom}
                        name={`${toolCallId}-${i}`}
                        onChange={() => update(i, { custom: true, indexes: [] })}
                        type="radio"
                      />
                    )}
                    Your own answer
                  </span>
                  <textarea
                    aria-label={`Custom answer: ${question.header}`}
                    className="w-full min-w-0 resize-y rounded-lg border bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground disabled:opacity-50"
                    onChange={(event) =>
                      update(i, {
                        text: event.target.value,
                        ...(!question.multiSelect && { custom: true, indexes: [] }),
                      })
                    }
                    onFocus={() => {
                      if (!question.multiSelect) update(i, { custom: true, indexes: [] });
                    }}
                    placeholder="Type your answer…"
                    rows={2}
                    value={draft.text}
                  />
                </label>
              </fieldset>
            );
          })}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {connection !== "connected" && (
            <p className="text-sm text-muted-foreground">Reconnecting… Your answers are kept here.</p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            <Button disabled={disabled} onClick={() => send(true)} type="button" variant="ghost">
              Cancel questions
            </Button>
            <Button disabled={disabled || !complete} type="submit">
              {submitting ? "Submitting…" : "Submit answers"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 p-4 text-sm" data-quote-source="Question answers">
          {questions.map((question) => (
            <p className="break-words text-muted-foreground" key={question.question}>
              {question.question}
            </p>
          ))}
          {summary && <p className="whitespace-pre-wrap break-words">{summary}</p>}
        </div>
      )}
    </section>
  );
}
