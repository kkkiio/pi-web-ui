import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { world } from "./world";

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
  await expect(panel.getByText(/The workspace float shows the current git branch/).first()).toBeVisible();
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

When("I prepare a replacement, a new file and a staged edit reverted on disk", () => {
  if (!world.harness) throw new Error("Pi harness is not running");
  const cwd = world.harness.workspaceDir;
  writeFileSync(path.join(cwd, "replacement.txt"), "original line\n");
  writeFileSync(path.join(cwd, "reverted.txt"), "baseline\n");
  execFileSync("git", ["add", "replacement.txt", "reverted.txt"], { cwd });
  execFileSync("git", ["commit", "-m", "Add review files"], { cwd });
  writeFileSync(path.join(cwd, "reverted.txt"), "staged change\n");
  execFileSync("git", ["add", "reverted.txt"], { cwd });
  writeFileSync(path.join(cwd, "reverted.txt"), "baseline\n");
  writeFileSync(path.join(cwd, "replacement.txt"), "first addition\nsecond addition\n");
  writeFileSync(path.join(cwd, "new file.txt"), "untracked file\n");
});

Then("Changes lists the replacement and the new file", async ({ page }) => {
  const files = page.getByRole("list", { name: "Changed files" });
  await expect(files.getByRole("listitem")).toHaveCount(2);
  await expect(files.getByRole("button", { name: "replacement.txt +2 −1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Changes" })).toContainText("+3 −1");
  await files.getByRole("button", { name: "new file.txt +1 −0" }).click();
  await expect(page.locator("aside").getByText("untracked file", { exact: true })).toBeVisible();
  await files.getByRole("button", { name: "replacement.txt +2 −1" }).click();
});

When("I comment on the removed line", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(async () => {
    await panel.getByText("original line", { exact: true }).hover();
    await panel.getByRole("button", { name: "Comment", exact: true }).click({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await panel.getByRole("textbox", { name: "Comment on old line 1" }).fill("Keep the original meaning.");
  await panel.getByRole("button", { name: "Add to Chat" }).click();
});

When("I write a comment on a range of new lines in split view", async ({ page }) => {
  const panel = page.locator("aside");
  await panel.getByRole("button", { name: "Split", exact: true }).click();
  const first = panel.locator('[data-column-number="1"][data-line-type="change-addition"]');
  const last = panel.locator('[data-column-number="2"][data-line-type="change-addition"]');
  await first.click();
  await last.click({ modifiers: ["Shift"] });
  await panel.getByRole("textbox", { name: "Comment on new lines 1–2" }).fill("Combine these additions.");
});

When("I switch to unified view and attach the comment", async ({ page }) => {
  const panel = page.locator("aside");
  await panel.getByRole("button", { name: "Unified", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Comment on new lines 1–2" })).toHaveValue(
    "Combine these additions.",
  );
  await panel.getByRole("button", { name: "Add to Chat" }).click();
});

When("I edit the first comment and refresh Changes after another workspace edit", async ({ page }) => {
  await page.getByRole("button", { name: "Edit comment on replacement.txt (old line 1)" }).click();
  await page
    .getByRole("textbox", { name: "Comment on replacement.txt (old line 1)" })
    .fill("Preserve the original behavior.");
  await page.getByRole("button", { name: "Done editing comment" }).click();
  if (!world.harness) throw new Error("Pi harness is not running");
  writeFileSync(path.join(world.harness.workspaceDir, "replacement.txt"), "updated after review\n");
  await page.getByRole("button", { name: "Refresh tab" }).click();
  await expect(page.locator("aside").getByText("updated after review", { exact: true })).toBeVisible();
});

Then("the composer still shows both original excerpts", async ({ page }) => {
  const quotes = page.getByRole("group", { name: "Quoted selections" });
  await expect(quotes.getByText("-original line", { exact: true })).toBeVisible();
  await expect(quotes.getByText("+first addition +second addition", { exact: true })).toBeVisible();
});

When("I send the diff comments", async ({ page }) => {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});

Then("the transcript shows the edited comment and both original excerpts", async ({ page }) => {
  const log = page.getByRole("log");
  await expect(log).toContainText("Preserve the original behavior.");
  await expect(log).toContainText("-original line");
  await expect(log).toContainText("+first addition");
  await expect(log).toContainText("+second addition");
  await expect(page.getByRole("group", { name: "Quoted selections" })).toHaveCount(0);
});

When("I tap a line number and write a comment", async ({ page }) => {
  const touch = await page.context().newCDPSession(page);
  const panel = page.locator("aside");
  const line = panel.locator('[data-column-number="2"][data-line-type="change-addition"]');
  await expect(line).toBeInViewport();
  const bounds = await line.boundingBox();
  if (!bounds) throw new Error("The diff line number is outside the viewport");
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
  });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await panel.getByRole("textbox", { name: "Comment on new line 2" }).fill("Keep this concise.");
});

When("I attach the mobile diff comment", async ({ page }) => {
  await page.locator("aside").getByRole("button", { name: "Add to Chat" }).click();
});

Then("the mobile composer shows the diff comment", async ({ page }) => {
  await expect(page.locator("aside")).toBeHidden();
  await expect(
    page.getByRole("group", { name: "Quoted selections" }).getByText("Keep this concise.", { exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
