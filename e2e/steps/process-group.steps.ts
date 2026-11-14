import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

/**
 * Regression guarded by this feature: ProcessGroup keeps its open state in local
 * useState and its identity is key={process:<first row kind>:<first row id>}
 * (src/web/src/app.tsx). A streamed row that changes that identity remounts the
 * group, so every row the user opened collapses. Keep that key stable.
 */
const { Given, When, Then, After } = createBdd();
let harness: PiWebUiHarness | null = null;

Given("Pi thinks for a moment, then runs a two second command", async ({ page }) => {
  harness = await startPiWebUi("process-group");
  await page.goto(harness.pageUrl);
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
});

When("I open the reasoning row while Pi is thinking", async ({ page }) => {
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill("Check the process.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();

  // The group starts collapsed; two clicks open it and then the reasoning row.
  const group = page.getByRole("button", { name: "Thinking…", exact: true });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  const preview = page.getByRole("button", { name: "Thinking… · Inspecting the process", exact: true });
  await expect(preview).toHaveAttribute("aria-expanded", "false");
  await preview.click();

  const reasoningRow = page.getByRole("button", { name: "Thinking... · Inspecting the process", exact: true });
  await expect(reasoningRow).toHaveAttribute("aria-expanded", "false");
  await reasoningRow.click();
});

When("I open the bash row when it arrives", async ({ page }) => {
  // The row streams in while the command is still running; opening it here is
  // the moment the group must not lose its identity.
  const toolRow = page.getByRole("button", { name: /bash.*sleep 2/ });
  await expect(toolRow).toBeVisible();
  await toolRow.click();
});

Then("the rows I opened are still open when the command finishes", async ({ page }) => {
  await expect(page.getByText("The process check passed.", { exact: true })).toBeVisible();

  // The group title changed from "Thinking…" to "1 tool call"; it must still be open.
  await expect(page.getByRole("button", { name: "1 tool call", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("I will inspect the process before reporting the result.", { exact: true }),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: /bash.*sleep 2/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Process check passed", { exact: true })).toBeVisible();
});

After(async () => {
  await harness?.stop();
  harness = null;
});
