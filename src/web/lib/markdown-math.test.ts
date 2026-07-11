import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeLatexDelimiters, normalizeMarkdownMath } from "./markdown-math.ts";

describe("normalizeLatexDelimiters", () => {
  it("preserves dollar-delimited inline and display math", () => {
    const markdown = "Inline $x + y$ and display:\n\n$$\\sum_i x_i$$";

    assert.equal(normalizeLatexDelimiters(markdown), markdown);
  });

  it("normalizes LaTeX inline and display delimiters", () => {
    assert.equal(
      normalizeLatexDelimiters("Inline \\(x + y\\) and display \\[\\sum_i x_i\\]."),
      "Inline $x + y$ and display $$\\sum_i x_i$$.",
    );
  });

  it("does not normalize delimiters inside inline code", () => {
    const markdown = "Use `\\(not math\\)` but render \\(math\\).";

    assert.equal(normalizeLatexDelimiters(markdown), "Use `\\(not math\\)` but render $math$.");
  });

  it("does not normalize delimiters inside backtick or tilde fences", () => {
    const markdown = [
      "```tex",
      "\\[not math here\\]",
      "```",
      "~~~",
      "\\(also not math\\)",
      "~~~",
      "Outside \\(math\\).",
    ].join("\n");

    const expected = [
      "```tex",
      "\\[not math here\\]",
      "```",
      "~~~",
      "\\(also not math\\)",
      "~~~",
      "Outside $math$.",
    ].join("\n");

    assert.equal(normalizeLatexDelimiters(markdown), expected);
  });

  it("normalizes unmatched opening delimiters while content is streaming", () => {
    assert.equal(normalizeLatexDelimiters("Inline \\(partial"), "Inline $partial");
    assert.equal(normalizeLatexDelimiters("Display \\[partial"), "Display $$partial");
  });

  it("preserves escaped backslash-delimiter sequences", () => {
    const markdown = String.raw`Literal \\(not math\\) and \\[also not math\\]`;

    assert.equal(normalizeLatexDelimiters(markdown), markdown);
  });
});

describe("normalizeMarkdownMath", () => {
  it("preserves undefined streaming content", () => {
    assert.equal(normalizeMarkdownMath(undefined), undefined);
  });
});
