export interface CaseResult {
  readonly id: string;
  readonly category: string;
  readonly text: string;
  readonly score: number;
  readonly passed: number;
  readonly total: number;
  readonly diagnostics: string;
  readonly unscored?: number;
  readonly checks: readonly {
    readonly id?: string;
    readonly label: string;
    readonly pass: boolean | null;
    readonly detail?: string;
  }[];
  readonly toolCallCount?: number;
  readonly toolNames?: readonly string[];
  readonly assistantTurns?: number;
  /** Relative URL of the copied Pi session JSONL under preview-out/trajectories/. */
  readonly trajectoryUrl?: string;
}

export interface Summary {
  readonly variant: string;
  readonly score: number;
  readonly cases: readonly CaseResult[];
}

export interface Report {
  readonly model: string;
  readonly capturedAt?: string;
  readonly summary?: Summary;
  /** Shape written by the earlier with/without runner; still readable. */
  readonly summaries?: readonly Summary[];
}

export interface CaseDefinition {
  readonly id: string;
  readonly prompt: string;
  readonly why: string;
}

export interface ExamplesPreviewData {
  readonly mode: "examples";
  readonly examples: readonly { readonly name: string; readonly source: string }[];
}

export interface ReportsPreviewData {
  readonly mode: "report" | "recordings";
  readonly systemPrompt: string;
  readonly reports: readonly Report[];
  readonly definitions: Readonly<Record<string, CaseDefinition>>;
}

export type PreviewData = ExamplesPreviewData | ReportsPreviewData;
