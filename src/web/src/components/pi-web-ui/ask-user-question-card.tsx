import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, SquareIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import type { AskUserQuestion, QuestionAnswer, QuestionDraft } from "../../core/ask-user-question";
import { usePiWebUiStore } from "../../core/store";

const EMPTY_DRAFT: QuestionDraft = { indexes: [], text: "" };
const EMPTY_DRAFTS: Record<number, QuestionDraft> = {};

export function AskUserQuestionCard({
  questionnaire,
  onAbort,
}: {
  questionnaire: AskUserQuestion;
  onAbort: () => void;
}) {
  const { toolCallId, questions, submitting, error } = questionnaire;
  const drafts = usePiWebUiStore((state) => state.questionDrafts[toolCallId] ?? EMPTY_DRAFTS);
  const update = usePiWebUiStore((state) => state.updateQuestionDraft);
  const connection = usePiWebUiStore((state) => state.connection);
  const submit = usePiWebUiStore((state) => state.submitQuestion);
  const titleId = useId();
  const [index, setIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const question = questions[index];
  const draft = drafts[index] ?? EMPTY_DRAFT;
  const last = index === questions.length - 1;
  const locked = Boolean(submitting) || connection !== "connected";
  const complete = questions.every((_, i) => drafts[i]?.skipped || drafts[i]?.indexes.length || drafts[i]?.text.trim());

  const finish = (skipCurrent = false) => {
    const answers = questions.map((_, i): QuestionAnswer => {
      const answer = drafts[i] ?? EMPTY_DRAFT;
      if (answer.skipped || (skipCurrent && i === index)) return { questionIndex: i, skipped: true };
      const text = answer.text.trim();
      return { questionIndex: i, optionIndexes: answer.indexes, ...(text && { text }) };
    });
    const incomplete = answers.findIndex((answer) => !answer.skipped && !answer.optionIndexes?.length && !answer.text);
    if (incomplete !== -1) return setIndex(incomplete);
    void submit(toolCallId, answers);
  };

  return (
    <footer className="flex min-h-0 shrink-0 justify-center bg-background px-4 py-3">
      <section
        aria-labelledby={titleId}
        className="flex max-h-[min(60dvh,32rem)] w-full max-w-3xl min-w-0 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-sm"
        data-testid="ask-user-question"
      >
        <div className="flex shrink-0 items-center gap-2 px-4 py-2">
          {collapsed ? (
            <h2 id={titleId} className="min-w-0 flex-1 truncate font-medium text-sm">
              {question.question}
            </h2>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">{question.header}</span>
          )}
          <Button
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand questions" : "Collapse questions"}
            onClick={() => setCollapsed(!collapsed)}
            size="icon-sm"
            variant="ghost"
          >
            {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
          <Button
            aria-label="Cancel questions"
            disabled={locked}
            onClick={() => void submit(toolCallId, [], true)}
            size="icon-sm"
            title="Cancel questions"
            variant="ghost"
          >
            <XIcon />
          </Button>
          <Button
            aria-label="Stop run"
            disabled={connection !== "connected"}
            onClick={onAbort}
            size="icon-sm"
            title="Stop run"
            variant="ghost"
          >
            <SquareIcon />
          </Button>
        </div>
        {!collapsed && (
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              if (!locked) finish();
            }}
          >
            <div key={index} className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 pb-3">
              <h2 id={titleId} className="whitespace-pre-wrap break-words font-medium text-sm">
                {question.question}
              </h2>
              <fieldset aria-labelledby={titleId} className="min-w-0 space-y-2" disabled={locked}>
                {question.options.map((option, j) => (
                  <div
                    className="rounded-lg border px-3 py-2 has-checked:border-primary has-checked:bg-primary/5"
                    key={option.label}
                  >
                    <label className="flex cursor-pointer items-start gap-3 text-sm">
                      <input
                        checked={draft.indexes.includes(j)}
                        className="mt-1 shrink-0 accent-current"
                        name={titleId}
                        onChange={() => {
                          update(toolCallId, index, {
                            indexes: question.multiSelect
                              ? draft.indexes.includes(j)
                                ? draft.indexes.filter((selected) => selected !== j)
                                : [...draft.indexes, j]
                              : [j],
                            text: question.multiSelect ? draft.text : "",
                            skipped: false,
                          });
                          if (!question.multiSelect && !last) setIndex(index + 1);
                        }}
                        type={question.multiSelect ? "checkbox" : "radio"}
                      />
                      <span className="min-w-0 break-words">
                        <span className="block font-medium">{option.label}</span>
                        {option.description && (
                          <span className="block whitespace-pre-wrap text-muted-foreground text-xs">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </label>
                    {option.preview && (
                      <details className="mt-1 ml-6 text-muted-foreground text-xs">
                        <summary className="cursor-pointer">Preview</summary>
                        <div
                          aria-label="Option preview"
                          role="region"
                          className="mt-2 overflow-auto text-card-foreground text-sm"
                        >
                          <MessageResponse>{option.preview}</MessageResponse>
                        </div>
                      </details>
                    )}
                  </div>
                ))}
                <textarea
                  aria-label={`Custom answer: ${question.header}`}
                  className="block w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-base sm:text-sm"
                  onChange={(event) =>
                    update(toolCallId, index, {
                      text: event.target.value,
                      ...(question.multiSelect ? {} : { indexes: [] }),
                      skipped: false,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                    event.preventDefault();
                    if (locked || (!draft.text.trim() && !draft.indexes.length)) return;
                    if (last) finish();
                    else setIndex(index + 1);
                  }}
                  placeholder="Type your answer"
                  rows={2}
                  value={draft.text}
                />
              </fieldset>
            </div>
            {error && (
              <p className="px-4 text-destructive text-sm" role="alert">
                {error}
              </p>
            )}
            {connection !== "connected" && (
              <p className="px-4 text-muted-foreground text-sm" role="status">
                Reconnecting…
              </p>
            )}
            <div className="flex shrink-0 flex-wrap items-center gap-1 border-t px-3 py-2">
              <Button
                aria-label="Previous question"
                disabled={index === 0 || submitting}
                onClick={() => setIndex(index - 1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronLeftIcon />
              </Button>
              <span aria-live="polite" className="text-muted-foreground text-xs tabular-nums">
                {index + 1} / {questions.length}
              </span>
              <Button
                aria-label="Next question"
                disabled={last || submitting}
                onClick={() => setIndex(index + 1)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronRightIcon />
              </Button>
              <Button
                className="ml-auto"
                disabled={locked}
                onClick={() => {
                  update(toolCallId, index, { ...EMPTY_DRAFT, skipped: true });
                  if (last) finish(true);
                  else setIndex(index + 1);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Skip
              </Button>
              {last ? (
                <Button disabled={locked || !complete} size="sm" type="submit">
                  {submitting ? "Submitting…" : "Submit answers"}
                </Button>
              ) : (
                <Button
                  disabled={locked || (!draft.skipped && !draft.indexes.length && !draft.text.trim())}
                  onClick={() => setIndex(index + 1)}
                  size="sm"
                  type="button"
                >
                  Continue
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
    </footer>
  );
}
