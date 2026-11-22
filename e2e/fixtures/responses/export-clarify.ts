import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { DIL_EXAMPLE_CLARIFY } from "../../../extensions/examples.gen.ts";

export default [
  fauxAssistantMessage(DIL_EXAMPLE_CLARIFY),
  fauxAssistantMessage("I'll mark overwrites in the dry-run output."),
  fauxAssistantMessage("I'll show only new files in the dry-run output."),
];
