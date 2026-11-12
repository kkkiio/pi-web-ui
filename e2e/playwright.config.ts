import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";

const testDir = defineBddConfig({
  features: "features/**/*.feature",
  steps: "steps/**/*.ts",
  outputDir: ".features-gen",
});

export default defineConfig({
  testDir,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@readme/,
      use: { ...devices["Desktop Chrome"] },
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
            },
            expect: {
              toHaveScreenshot: { pathTemplate: "../docs/images/{arg}{ext}" },
            },
          },
        ]
      : []),
  ],
});
