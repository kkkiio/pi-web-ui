import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const artifactsDir = process.env.PI_E2E_ARTIFACTS
  ? path.resolve(process.env.PI_E2E_ARTIFACTS)
  : path.join(__dirname, "test-results");

const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: "steps/**/*.ts",
  outputDir: ".features-gen",
});

/**
 * Storyboard mode records the visual documentation of the test suite:
 * one video, one trace and one screenshot per Gherkin step for every scenario.
 * It is a curated artifact, not the CI gate. CI keeps failure evidence only.
 */
const storyboard = process.env.PI_E2E_STORYBOARD === "1";
// Storyboard recordings pause between actions so each Gherkin step is visible.
// CI runs at full speed; override with PI_E2E_SLOWMO=0 or another delay.
const slowMo = Number(process.env.PI_E2E_SLOWMO ?? (storyboard ? 250 : 0));
const viewport = { width: 1280, height: 800 };

export default defineConfig({
  testDir,
  outputDir: artifactsDir,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["json", { outputFile: path.join(artifactsDir, "results.json") }], ["html", { open: "never" }]],
  use: {
    viewport,
    trace: storyboard ? "on" : "retain-on-failure",
    video: storyboard ? { mode: "on", size: viewport } : { mode: "retain-on-failure", size: viewport },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      slowMo,
    },
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@readme/,
      use: { ...devices["Desktop Chrome"], viewport },
    },
    ...(process.env.PI_WEB_UI_README_SNAPSHOT === "1"
      ? [
          {
            name: "readme",
            grep: /@readme/,
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 1120, height: 780 },
              colorScheme: "light" as const,
              deviceScaleFactor: 1,
              video: "off" as const,
              trace: "off" as const,
            },
            expect: {
              toHaveScreenshot: { pathTemplate: "../docs/images/{arg}{ext}" },
            },
          },
        ]
      : []),
  ],
});
