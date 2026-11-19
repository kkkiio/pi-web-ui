import { fauxAssistantMessage } from "@earendil-works/pi-ai";

/** #49 primitives: KaTeX for `math`, Shiki for `CodeBlock`, and a connected list. */
export default [
  fauxAssistantMessage(
    [
      '<box padding={2} border radius="md">',
      "  <caption>推导</caption>",
      "  <text>质能关系 $E = mc^2$ 是本例的核心。</text>",
      "</box>",
      "",
      "$$",
      "\\int_0^1 x^2 dx = \\frac{1}{3}",
      "$$",
      "",
      "```js",
      "const energy = (m, c) => m * c ** 2;",
      "```",
      "",
      '<list marker="number" connector="solid" gap={2}>',
      "  <list-item>读取质量 m</list-item>",
      "  <list-item>计算 m·c²</list-item>",
      "</list>",
    ].join("\n"),
  ),
];
