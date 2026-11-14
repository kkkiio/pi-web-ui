import { writeFile } from "node:fs/promises";
import { createBdd, test } from "playwright-bdd";

/**
 * Storyboard recording hooks.
 *
 * They only run when `PI_E2E_STORYBOARD=1`: one viewport screenshot per Gherkin
 * step plus wall-clock start/end per step, so the gallery can turn the recorded
 * video into clickable chapters that line up with the Gherkin steps.
 *
 * Normal CI runs skip this work entirely.
 */
const storyboard = process.env.PI_E2E_STORYBOARD === "1";

const { BeforeScenario, BeforeStep, AfterStep, AfterScenario } = createBdd();

type StepTiming = { index: number; startedAt: number; endedAt: number };

let stepIndex = 0;
let timings: StepTiming[] = [];
let stepStartedAt = 0;

BeforeScenario(() => {
  stepIndex = 0;
  timings = [];
  stepStartedAt = 0;
});

BeforeStep(() => {
  if (!storyboard) return;
  stepStartedAt = Date.now();
});

AfterStep(async ({ page }) => {
  if (!storyboard) return;
  stepIndex += 1;
  timings.push({ index: stepIndex, startedAt: stepStartedAt, endedAt: Date.now() });

  const name = `step-${String(stepIndex).padStart(2, "0")}`;
  try {
    const body = await page.screenshot({ animations: "disabled" });
    const file = test.info().outputPath(`${name}.png`);
    await writeFile(file, body);
    await test.info().attach(name, { path: file, contentType: "image/png" });
  } catch {
    // An aborted scenario may have no page left; its video still tells the story.
  }
});

AfterScenario(async () => {
  if (!storyboard || timings.length === 0) return;
  const file = test.info().outputPath("storyboard-timings.json");
  await writeFile(file, JSON.stringify({ endedAt: Date.now(), steps: timings }));
  await test.info().attach("storyboard-timings", { path: file, contentType: "application/json" });
});
