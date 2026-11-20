import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import "./preview.css";
import { App } from "./app";
import type { PreviewData } from "./types";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root element");

fetch("/data.json")
  .then((res) => {
    if (!res.ok) throw new Error(`failed to load preview data: ${res.status} ${res.statusText}`);
    return res.json() as Promise<PreviewData>;
  })
  .then((data) => {
    createRoot(rootEl).render(
      <StrictMode>
        <App data={data} />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    rootEl.textContent = err instanceof Error ? err.message : String(err);
  });
