import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

/**
 * Regression guarded by these scenarios: the header change counts come from real
 * git state in the temp workspace, and the right panel is the only place where the
 * diff and its tabs are addressable. A non-git workspace must not fall back to an
 * empty diff.
 */
const { When, Then } = createBdd();

Then("the layout is single column", async ({ page }) => {
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
  await expect(page.getByTestId("workspace-status-float")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});

Then("the header shows the change counts", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Open Changes" })).toContainText(/\+\d+.*−\d+/);
});

When("I open Changes", async ({ page }) => {
  await page.getByRole("button", { name: "Open Changes" }).click();
});

Then("the right panel shows the git diff", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel).toContainText("docs/prd/workspace-status-float.md");
  await expect(panel).toContainText("The workspace float shows the current git branch");
});

When("I hide the right panel", async ({ page }) => {
  await page.getByRole("button", { name: "Hide right panel", exact: true }).click();
});

Then("the right panel is hidden", async ({ page }) => {
  await expect(page.locator("aside")).toBeHidden();
});

When("I restore the right panel", async ({ page }) => {
  await page.getByRole("button", { name: "Show right panel", exact: true }).click();
});

Then("the right panel has one Changes tab", async ({ page }) => {
  await expect(page.locator("aside").getByRole("button", { name: "Changes", exact: true })).toHaveCount(1);
});

Then("the panel says the workspace has no git repository", async ({ page }) => {
  await expect(page.locator("aside")).toContainText("No git repository");
});

When("I switch to a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

Then("the right panel fills the mobile width", async ({ page }) => {
  const box = await page.locator("aside").boundingBox();
  expect(box?.width).toBe(390);
});

Then("the composer stays fully visible", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
});
