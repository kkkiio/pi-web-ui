import { fauxAssistantMessage } from "@earendil-works/pi-ai";

export default [
  fauxAssistantMessage(
    [
      "## 请求路径",
      "",
      '<box padding={3} gap={2} background="surface-secondary" radius="lg">',
      '  <text weight="semibold">Request path</text>',
      '  <row justify="between" align="center">',
      "    <caption>Browser</caption>",
      "    <text tabularNums>62%</text>",
      "  </row>",
      '  <row justify="between" align="center">',
      "    <caption>mirror-server</caption>",
      "    <text tabularNums>28%</text>",
      "  </row>",
      "  <divider/>",
      "  <caption>两跳都走 WebSocket。</caption>",
      "</box>",
    ].join("\n"),
  ),
];
