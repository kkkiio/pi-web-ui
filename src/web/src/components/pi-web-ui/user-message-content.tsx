import { cjk } from "@streamdown/cjk";
import type { Extension } from "micromark-util-types";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import type { Processor } from "unified";

function remarkLiteralHtml(this: Processor) {
  // Disable HTML at the tokenizer so Markdown inside XML-like prompt tags still parses.
  const data = this.data() as { micromarkExtensions?: Extension[] };
  data.micromarkExtensions ??= [];
  data.micromarkExtensions.push({ disable: { null: ["htmlFlow", "htmlText"] } });
}

const remarkPlugins = [...cjk.remarkPluginsBefore, remarkLiteralHtml, remarkMath, remarkBreaks];
const rehypePlugins = [rehypeKatex];

export const UserMessageContent = memo(({ children }: { children: string }) => (
  <div className="user-message-content min-w-0 break-words">
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
      {children}
    </ReactMarkdown>
  </div>
));

UserMessageContent.displayName = "UserMessageContent";
