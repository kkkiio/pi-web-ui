import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { checkSubmission, quizEvidence } from "./quiz-check.ts";
import { type CaseResult, type CaseTrace, CHECK_LABELS, type CheckResult, type DilCase, scoreCase } from "./scoring.ts";
import { assessSvgLayout, requestSvgJudge, SVG_CHECKS } from "./svg-judge.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
type SvgJudge = (screenshots: readonly Buffer[]) => Promise<readonly CheckResult[]>;

/** Evaluate the product renderer and optional SVG screenshot judge. Close after all cases finish. */
export class DilEvalScorer {
  private renderer?: Promise<{ server: ViteDevServer; browser: Browser; origin: string }>;

  private readonly provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  /** Score one answer. Pass a null judge to record the SVG checks as unscored. */
  async score(
    dilCase: DilCase,
    text: string,
    trace?: CaseTrace,
    judge: SvgJudge | null = (screenshots) =>
      assessSvgLayout(
        dilCase.prompt,
        async (input) => (await requestSvgJudge(this.provider, screenshots, input)).output,
      ),
  ): Promise<CaseResult> {
    this.renderer ??= this.startRenderer();
    const { browser, origin } = await this.renderer;
    const page = await browser.newPage({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });
    const errors: string[] = [];
    const screenshots: Buffer[] = [];
    let diagramCount = 0;
    const checks: CheckResult[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.route(/^https?:\/\//, (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      await page.goto(`${origin}/render-check.html`);
      await page.waitForFunction(() => typeof window.renderDilForEval === "function");
      await page.evaluate((source) => window.renderDilForEval(source), text);
      const root = page.locator(".dil-root");
      const ready = await page
        .locator('.dil-root[data-dil-ready="true"]')
        .waitFor({ state: "attached", timeout: 8_000 })
        .then(
          () => true,
          (error: unknown) => {
            if (!(error instanceof Error) || error.name !== "TimeoutError") throw error;
            return false;
          },
        );
      const errorCount = ready ? Number(await root.getAttribute("data-dil-errors")) : 0;
      checks.push({
        id: "renderClean",
        label: CHECK_LABELS.renderClean,
        pass: ready && !errorCount && errors.length === 0,
        detail:
          errors[0] ??
          (!ready
            ? "DIL rendering did not finish."
            : errorCount
              ? `Runtime errors caught (${errorCount}).`
              : undefined),
      });

      if (ready) {
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const needsQuiz = dilCase.checks.some(
          ({ id }) => id === "singleChoiceQuestions" || id === "submitSelectedAnswers",
        );
        const quiz = needsQuiz ? await quizEvidence(root) : null;
        const diagram = await page.evaluate(() => window.dilDiagramEvidence());
        const svgs = await root.locator("svg[data-dil-svg]:not(svg svg):visible").all();
        diagramCount = svgs.length;
        if (judge) {
          for (const svg of svgs) {
            screenshots.push(await svg.screenshot({ type: "png", animations: "disabled", timeout: 10_000 }));
          }
        }
        for (const check of dilCase.checks) {
          const atLeast = "atLeast" in check ? (check.atLeast ?? 1) : 1;
          let pass: boolean;
          let detail: string;
          switch (check.id) {
            case "labeledConcepts":
              pass = diagram.labels.length >= atLeast;
              detail = `Found ${diagram.labels.length} labeled concepts. The minimum is ${atLeast}.`;
              break;
            case "visibleConnections":
            case "flowDirection": {
              const count = check.id === "flowDirection" ? diagram.directedConnections : diagram.connections;
              pass = count >= atLeast;
              detail = `Found ${count} connections. The minimum is ${atLeast}.`;
              break;
            }
            case "nestedBoundaries":
              pass = diagram.nesting.length > 0;
              detail = pass
                ? `${diagram.nesting[0]} contains ${diagram.nesting[1]}.`
                : "Found no nested pair of labeled boundaries.";
              break;
            case "colorDistinction":
              pass = diagram.colorPair.length > 0;
              detail = pass
                ? `${diagram.colorPair.join(" and ")} use distinct colors.`
                : "Found no distinguishable colors among related elements.";
              break;
            case "singleChoiceQuestions": {
              const counts =
                quiz?.groups.map(
                  (choices) => new Set(choices.map(({ label, value }) => (value === "on" ? label : value))).size,
                ) ?? [];
              pass = quiz?.independent === true && counts.length === check.count && counts.every((count) => count >= 2);
              detail = `Expected ${check.count} independent questions. Choices per question (${counts.join(", ") || "none"}).`;
              break;
            }
            case "submitSelectedAnswers": {
              const failure = quiz && (await checkSubmission(page, root, quiz, check.count));
              pass = quiz !== null && failure === null;
              detail = failure ?? "The host received the updated answer after each selection change.";
              break;
            }
          }
          checks.push({ id: check.id, label: CHECK_LABELS[check.id], pass, detail });
        }
      } else {
        for (const { id } of dilCase.checks) {
          checks.push({ id, label: CHECK_LABELS[id], pass: null, detail: "DIL rendering did not finish." });
        }
      }
    } finally {
      await page.close();
    }

    if (diagramCount > 0) {
      let reason = "SVG screenshot review was disabled for this run.";
      try {
        if (judge) checks.push(...(await judge(screenshots)));
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }
      for (const id of SVG_CHECKS) {
        if (!checks.some((check) => check.id === id)) {
          checks.push({ id, label: CHECK_LABELS[id], pass: null, detail: reason });
        }
      }
    }
    return scoreCase(dilCase, text, trace, checks);
  }

  async close(): Promise<void> {
    const renderer = this.renderer;
    this.renderer = undefined;
    if (!renderer) return;
    const session = await renderer.catch(() => undefined);
    if (session) {
      try {
        await session.browser.close();
      } finally {
        await session.server.close();
      }
    }
  }

  private async startRenderer() {
    const server = await createServer({
      root: HERE,
      configFile: join(HERE, "preview", "vite.config.ts"),
      cacheDir: join(HERE, "../../node_modules/.vite-dil-eval"),
      publicDir: false,
      server: { host: "127.0.0.1", port: 0, hmr: false },
    });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === "string") throw new Error("DIL render server is not listening on a TCP port");
      const browser = await chromium.launch();
      return { server, browser, origin: `http://127.0.0.1:${address.port}` };
    } catch (error) {
      await server.close();
      throw error;
    }
  }
}
