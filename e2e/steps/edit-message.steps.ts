import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { world } from "./world";

/**
 * Regression guarded by these scenarios: edit rewinds the session tree through
 * navigate_tree. If the rewind is cancelled, the browser must keep the old
 * conversation, the edit text and the composer draft; if it succeeds, the old
 * branch's text and tool rows must disappear from the transcript.
 */
const { When, Then } = createBdd();

When("I enable inline editing", async () => {
  await world.harness?.enableEditing();
});

When("I edit the message to {string} with the draft {string}", async ({ page }, edited: string, draft: string) => {
  if (draft) {
    await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill(draft);
  }
  const edit = page.getByRole("button", { name: "Edit message", exact: true });
  await expect(edit).toBeEnabled();
  await edit.click();
  await page.getByRole("textbox", { name: "Edit message", exact: true }).fill(edited);
  await page.getByRole("button", { name: "Save & Send", exact: true }).click();
  // A reload immediately after a successful rewind can read the previous session
  // state; a refused rewind persists nothing on purpose.
  if (!world.cancelNavigation) await world.harness?.waitForSessionText(edited);
});

When("I expand all tool calls", async ({ page }) => {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page.getByRole("button", { name: /^Expand All Tools/ }).click();
});

Then("the edit control is available", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Edit message", exact: true })).toBeEnabled();
});

Then("the original question is gone from the transcript", async ({ page }) => {
  await expect(page.getByRole("log").getByText("original question", { exact: true })).toHaveCount(0);
});

Then("the composer still holds {string}", async ({ page }, draft: string) => {
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toHaveValue(draft);
});

Then("the rewind is refused and nothing is applied", async ({ page }) => {
  await expect(page.getByRole("alert")).toContainText("Navigation cancelled");
  await expect(page.getByRole("textbox", { name: "Edit message", exact: true })).toHaveValue("edited question");
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toHaveValue("kept draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("log").getByText("original question", { exact: true })).toBeVisible();
  await expect(page.getByRole("log").getByText("edited question", { exact: true })).toHaveCount(0);
});

Then("the old branch's text and tool rows are gone", async ({ page }) => {
  await expect(page.getByRole("log").getByText("New branch reply", { exact: true })).toBeVisible();
  await expect(page.getByRole("log").getByText("Old branch explanation", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("log").getByText("Old branch done", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "2 tool calls", exact: true })).toHaveCount(0);
  await expect(page.getByRole("log").getByText("write", { exact: true })).toHaveCount(0);
});
