import type { Locator, Page } from "@playwright/test";

interface AnswerChoice {
  readonly index: number;
  readonly label: string;
  readonly value: string;
}

export interface QuizEvidence {
  readonly groups: readonly (readonly AnswerChoice[])[];
  readonly independent: boolean;
}

/** Inspect the usable native radio groups in the rendered answer. */
export async function quizEvidence(root: Locator): Promise<QuizEvidence> {
  return root.getByRole("radiogroup").evaluateAll((elements) => {
    const names = new Set<string>();
    let independent = true;
    const groups = elements.map((element) => {
      const options = [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')].filter(
        (radio) => radio.closest('[role="radiogroup"]') === element,
      );
      const name = options[0]?.name;
      if (!name || names.has(name) || options.some((radio) => radio.name !== name)) independent = false;
      if (name) names.add(name);
      return options.flatMap((radio, index) => {
        const label = radio.labels?.[0]?.innerText.trim() ?? "";
        if (radio.disabled || !radio.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || !label)
          return [];
        return [{ index, label, value: radio.value }];
      });
    });
    return { groups, independent };
  });
}

/** Submit a baseline and vary one question at a time to verify each answer reaches the host. */
export async function checkSubmission(
  page: Page,
  root: Locator,
  quiz: QuizEvidence,
  count: number,
): Promise<string | null> {
  if (
    quiz.groups.length !== count ||
    !quiz.independent ||
    quiz.groups.some((options) => new Set(options.map(({ label, value }) => (value === "on" ? label : value))).size < 2)
  ) {
    return "Each question must have at least two choices and accept answers independently.";
  }

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const answerPatterns = (choice: AnswerChoice) => {
    const label = choice.label.replace(/^[A-Z0-9]+[.、:：)）]\s*/u, "");
    const options = new Set([choice.label, label, choice.value === "on" ? "" : choice.value].filter(Boolean));
    return [...options].map((answer) => {
      const escaped = escapeRegExp(answer);
      const pattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(answer)
        ? escaped
        : `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`;
      return new RegExp(pattern, "giu");
    });
  };

  const groups = root.getByRole("radiogroup");
  const submit = root.locator('button[data-dil-action="issueNewTurn"]:visible').first();
  const baseline = quiz.groups.map(([first]) => first);
  let submitted = "";
  try {
    for (let trial = -1; trial < count; trial++) {
      const alternative =
        trial < 0
          ? undefined
          : quiz.groups[trial].find(
              (option) =>
                option.label !== baseline[trial].label &&
                (option.value === "on" || option.value !== baseline[trial].value),
            );
      const previous = await page.evaluate(() => window.dilSubmittedPrompts.length);
      for (const [index, choice] of baseline.entries()) {
        await groups
          .nth(index)
          .locator('input[type="radio"]')
          .nth(index === trial && alternative ? alternative.index : choice.index)
          .check({ timeout: 2_500 });
      }
      await submit.click({ timeout: 3_000 });
      await page.waitForFunction((offset) => window.dilSubmittedPrompts.length > offset, previous, { timeout: 3_000 });
      const message = await page.evaluate((offset) => window.dilSubmittedPrompts[offset], previous);
      if (trial === -1) {
        if (baseline.some((choice) => !answerPatterns(choice).some((pattern) => pattern.test(message)))) {
          return "The submission omitted a selected answer.";
        }
        submitted = message;
      } else if (
        !alternative ||
        !answerPatterns(alternative).some(
          (pattern) => [...message.matchAll(pattern)].length > [...submitted.matchAll(pattern)].length,
        )
      ) {
        return `The submission omitted the updated answer to question ${trial + 1}.`;
      }
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error.name !== "TimeoutError" && !error.message.includes("did not change its checked state"))
    )
      throw error;
    return "The browser could not finish selecting and submitting the answers.";
  }
  return null;
}
