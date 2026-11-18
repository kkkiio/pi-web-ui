import { fauxAssistantMessage } from "@earendil-works/pi-ai";

/** A list that continues earlier steps: `start="5"` must reach the `<ol>`. */
export default [
  fauxAssistantMessage(
    [
      '<box padding={2} border radius="md">',
      "  <caption>前四步已完成</caption>",
      "</box>",
      "",
      "5. Deploy",
      "6. Verify",
    ].join("\n"),
  ),
];
