import { createRoot } from "react-dom/client";
import { DilRenderer } from "../../src/web/src/components/dil/dil-renderer";
import { DilHostContext } from "../../src/web/src/components/dil/runtime-context";
import { type DiagramEvidence, diagramEvidence } from "./diagram-evidence.ts";
import "@/index.css";

declare global {
  interface Window {
    renderDilForEval(source: string): void;
    dilDiagramEvidence(): DiagramEvidence;
    dilSubmittedPrompts: string[];
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing DIL render root");
const root = createRoot(container);
let revision = 0;
window.dilSubmittedPrompts = [];
window.dilDiagramEvidence = () => diagramEvidence(container);
window.renderDilForEval = (source) => {
  window.dilSubmittedPrompts = [];
  root.render(
    <DilHostContext.Provider
      value={{
        busy: false,
        issueNewTurn: (prompt) => {
          window.dilSubmittedPrompts.push(prompt);
        },
      }}
    >
      <DilRenderer key={++revision} source={source} />
    </DilHostContext.Provider>,
  );
};
