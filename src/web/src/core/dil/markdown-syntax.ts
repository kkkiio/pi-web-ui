import { cjk } from "@streamdown/cjk";
import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const markdown = unified().use(remarkParse).use(cjk.remarkPluginsBefore).use(remarkGfm).use(cjk.remarkPluginsAfter);

// DIL owns indentation. During streaming, a lone list marker on the next line should
// not temporarily turn the previous paragraph into a Setext heading.
const documentMarkdown = markdown().data("micromarkExtensions", [{ disable: { null: ["codeIndented"] } }]);
const streamingMarkdown = markdown().data("micromarkExtensions", [
  { disable: { null: ["codeIndented", "setextUnderline"] } },
]);
const inlineMarkdown = markdown().data("micromarkExtensions", [
  {
    disable: {
      null: [
        "codeIndented",
        "setextUnderline",
        "headingAtx",
        "list",
        "blockQuote",
        "thematicBreak",
        "codeFenced",
        "table",
        "htmlFlow",
      ],
    },
  },
]);

export function parseMarkdown(source: string, mode: "document" | "streaming" | "inline"): Root {
  const processor = mode === "inline" ? inlineMarkdown : mode === "streaming" ? streamingMarkdown : documentMarkdown;
  return processor.runSync(processor.parse(source)) as Root;
}

// The structural scan runs before Markdown lowering. A Markdown HTML block can otherwise
// consume a DIL container and hide every link or nested Markdown fence within it.
const scanMarkdown = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .data("micromarkExtensions", [{ disable: { null: ["codeIndented", "htmlFlow"] } }]);

export interface MarkdownSpan {
  readonly end: number;
  readonly node: RootContent;
}

/** Spans where the DIL scanner must leave Markdown syntax or literal source intact. */
export function markdownSpans(source: string): ReadonlyMap<number, MarkdownSpan> {
  const spans = new Map<number, MarkdownSpan>();
  if (!/[[<>`~]/.test(source)) return spans;

  function visit(node: RootContent, nested: boolean): void {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    switch (node.type) {
      case "code":
        // The DIL scanner already handles top-level fences and records whether they closed.
        if (!nested && (start === 0 || source[start - 1] === "\n")) return;
        break;
      case "link":
      case "linkReference":
      case "definition":
      case "image":
      case "imageReference":
      case "footnoteDefinition":
      case "footnoteReference":
      case "html":
        break;
      default:
        if ("children" in node) {
          for (const child of node.children) visit(child, true);
        }
        return;
    }
    spans.set(start, { end, node });
  }
  for (const child of scanMarkdown.parse(source).children) visit(child, false);
  return spans;
}
