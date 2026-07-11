import { createMathPlugin } from "@streamdown/math";

/** Enable the inline $...$ syntax commonly emitted by LLMs. */
export const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

/**
 * Convert LaTeX's \\(...\\) and \\[...\\] delimiters to the dollar
 * delimiters understood by remark-math. Fenced and inline code are left alone.
 *
 * The scanner tolerates an unmatched opening delimiter while a response is
 * streaming; a later render will normalize the closing delimiter when it
 * arrives.
 */
export function normalizeLatexDelimiters(markdown: string): string {
  let fence: { char: "`" | "~"; length: number } | undefined;
  let inlineCodeTicks = 0;

  return markdown
    .split("\n")
    .map((line) => {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fenceMatch?.[1]) {
        const marker = fenceMatch[1];
        const char = marker[0] as "`" | "~";
        if (!fence) {
          fence = { char, length: marker.length };
        } else if (char === fence.char && marker.length >= fence.length) {
          fence = undefined;
        }
        return line;
      }

      if (fence) return line;

      let result = "";
      for (let index = 0; index < line.length; ) {
        if (line[index] === "`") {
          let end = index + 1;
          while (line[end] === "`") end += 1;
          const ticks = end - index;
          if (inlineCodeTicks === 0) inlineCodeTicks = ticks;
          else if (inlineCodeTicks === ticks) inlineCodeTicks = 0;
          result += line.slice(index, end);
          index = end;
          continue;
        }

        if (inlineCodeTicks === 0) {
          const delimiter = line.slice(index, index + 2);
          let precedingBackslashes = 0;
          for (let previous = index - 1; previous >= 0 && line[previous] === "\\"; previous -= 1) {
            precedingBackslashes += 1;
          }
          const isEscaped = precedingBackslashes % 2 === 1;

          if (!isEscaped && (delimiter === "\\(" || delimiter === "\\)")) {
            result += "$";
            index += 2;
            continue;
          }
          if (!isEscaped && (delimiter === "\\[" || delimiter === "\\]")) {
            result += "$$";
            index += 2;
            continue;
          }
        }

        result += line[index];
        index += 1;
      }
      return result;
    })
    .join("\n");
}

export function normalizeMarkdownMath(content: string | undefined): string | undefined {
  return content === undefined ? undefined : normalizeLatexDelimiters(content);
}
