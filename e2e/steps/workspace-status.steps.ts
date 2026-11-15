import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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
  await expect(panel.getByRole("button", { name: /workspace-status-float\.md/ })).toContainText("docs/prd/");
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

const retryFile = "src/http/retry.ts";
const originalRetry = "  return 500;";
const retryBackoff = "  const delay = 500 * 2 ** attempt;";
const cappedRetry = "  return Math.min(delay, 30_000);";

When("the workspace has retry code changes and a staged edit reverted on disk", () => {
  if (!world.harness) throw new Error("Pi harness is not running");
  const cwd = world.harness.workspaceDir;
  mkdirSync(path.join(cwd, "src/http"), { recursive: true });
  const before = ["export function retryDelay(attempt: number) {", originalRetry, "}", ""];
  writeFileSync(path.join(cwd, retryFile), before.join("\n"));
  writeFileSync(path.join(cwd, "reverted.txt"), "baseline\n");
  execFileSync("git", ["add", retryFile, "reverted.txt"], { cwd });
  execFileSync("git", ["commit", "-m", "Add a fixed retry delay"], { cwd });
  writeFileSync(path.join(cwd, "reverted.txt"), "staged change\n");
  execFileSync("git", ["add", "reverted.txt"], { cwd });
  writeFileSync(path.join(cwd, "reverted.txt"), "baseline\n");
  writeFileSync(path.join(cwd, retryFile), [before[0], retryBackoff, cappedRetry, "}", ""].join("\n"));
  writeFileSync(
    path.join(cwd, "src/http/retry.test.ts"),
    [
      'import { strictEqual } from "node:assert";',
      'import { retryDelay } from "./retry";',
      "",
      "strictEqual(retryDelay(2), 2_000);",
      "strictEqual(retryDelay(10), 30_000);",
      "",
    ].join("\n"),
  );
});

Then("Changes groups the two files in their directory", async ({ page }) => {
  const files = page.getByRole("list", { name: "Changed files" });
  await expect(files.getByText("src/http/", { exact: true })).toBeVisible();
  const replacement = files.getByRole("button", { name: /retry\.ts.*\+2.*−1.*Modified/ });
  const newFile = files.getByRole("button", { name: /retry\.test\.ts.*\+5.*Added/ });
  await expect(replacement).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Changes" })).toContainText("+7 −1");
  await replacement.click();
  await newFile.click();
  await expect(page.locator("aside").getByText(/strictEqual.*retryDelay.*30_000/)).toBeVisible();
  await expect(replacement).toHaveAttribute("aria-expanded", "true");
  await files.getByText("src/http/", { exact: true }).click();
  await expect(newFile).toBeHidden();
  await files.getByText("src/http/", { exact: true }).click();
  await expect(newFile).toBeVisible();
});

When("I comment on the removed line", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(async () => {
    await panel.locator('[data-line="2"][data-line-type="change-deletion"]').hover();
    await panel.getByRole("button", { name: "Comment", exact: true }).click({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await panel.getByRole("textbox", { name: "Comment on old line 2" }).fill("Keep the first retry at 500 ms.");
  await panel.getByRole("button", { name: "Add to Chat" }).click();
});

When("I write a comment on a range of new lines in split view", async ({ page }) => {
  const panel = page.locator("aside");
  await panel.getByRole("button", { name: "Split", exact: true }).click();
  const file = panel.getByRole("button", { name: /retry\.ts.*Modified/ }).locator("..");
  const first = file.locator('[data-column-number="2"][data-line-type="change-addition"]');
  const last = file.locator('[data-column-number="3"][data-line-type="change-addition"]');
  await expect(first).toBeInViewport();
  await expect(last).toBeInViewport();
  const start = await first.boundingBox();
  const end = await last.boundingBox();
  if (!start || !end) throw new Error("The diff lines are outside the viewport");
  await page.mouse.move(start.x + start.width - 5, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width - 5, end.y + end.height / 2, { steps: 5 });
  await page.mouse.up();
  await panel
    .getByRole("textbox", { name: "Comment on new lines 2–3" })
    .fill("Can we extract the retry cap into a constant?");
});

When("I switch to unified view and attach the comment", async ({ page }) => {
  const panel = page.locator("aside");
  await panel.getByRole("button", { name: "Unified", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Comment on new lines 2–3" })).toHaveValue(
    "Can we extract the retry cap into a constant?",
  );
  await panel.getByRole("button", { name: "Add to Chat" }).click();
});

When("I edit the first comment and refresh Changes after another workspace edit", async ({ page }) => {
  await page.getByRole("button", { name: "Edit comment on src/http/retry.ts (old line 2)" }).click();
  await page
    .getByRole("textbox", { name: "Comment on src/http/retry.ts (old line 2)" })
    .fill("Keep the initial delay at 500 ms.");
  await page.getByRole("button", { name: "Done editing comment" }).click();
  if (!world.harness) throw new Error("Pi harness is not running");
  writeFileSync(path.join(world.harness.workspaceDir, retryFile), "export const retryDelay = () => 1_000;\n");
  await page.getByRole("button", { name: "Refresh tab" }).click();
  await expect(page.locator("aside").getByText(/retryDelay.*1_000/)).toBeVisible();
});

Then("the composer still shows both original excerpts", async ({ page }) => {
  const quotes = page.getByRole("group", { name: "Quoted selections" });
  await expect(quotes.getByText(/-\s+return 500;/)).toBeVisible();
  await expect(quotes.getByText(/const delay[\s\S]*Math\.min/)).toBeVisible();
});

When("I send the diff comments", async ({ page }) => {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});

Then("the transcript shows the edited comment and both original excerpts", async ({ page }) => {
  const log = page.getByRole("log");
  await expect(log).toContainText("Keep the initial delay at 500 ms.");
  await expect(log).toContainText(originalRetry.trim());
  await expect(log).toContainText(retryBackoff.trim());
  await expect(log).toContainText(cappedRetry.trim());
  await expect(page.getByRole("group", { name: "Quoted selections" })).toHaveCount(0);
});

When("I tap a line number and write a comment", async ({ page }) => {
  const touch = await page.context().newCDPSession(page);
  const panel = page.locator("aside");
  await panel.getByRole("button", { name: /retry\.ts.*Modified/ }).click();
  const line = panel.locator('[data-column-number="3"][data-line-type="change-addition"]');
  await expect(line).toBeInViewport();
  const bounds = await line.boundingBox();
  if (!bounds) throw new Error("The diff line number is outside the viewport");
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }],
  });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await panel.getByRole("textbox", { name: "Comment on new line 3" }).fill("Give the retry cap a name.");
});

When("I attach the mobile diff comment", async ({ page }) => {
  await page.locator("aside").getByRole("button", { name: "Add to Chat" }).click();
});

Then("the mobile composer shows the diff comment", async ({ page }) => {
  await expect(page.locator("aside")).toBeHidden();
  await expect(
    page.getByRole("group", { name: "Quoted selections" }).getByText("Give the retry cap a name.", { exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

When("the workspace has a long code diff", () => {
  if (!world.harness) throw new Error("Pi harness is not running");
  writeFileSync(
    path.join(world.harness.workspaceDir, "http-status.ts"),
    [
      "export const statusMessages = {",
      ...Array.from({ length: 100 }, (_, index) => `  ${400 + index}: "Request error",`),
      "};",
      "",
    ].join("\n"),
  );
});

Then("I can scroll to the end of the diff while the review controls stay in place", async ({ page }) => {
  const controls = page.getByRole("button", { name: "Wrap lines" });
  const header = page.getByRole("button", { name: "Open Changes" });
  const diff = page.locator("aside");
  const first = diff.getByText(/400:.*Request error/);
  const last = diff.getByText(/499:.*Request error/);
  await expect(first).toBeInViewport();
  const initialControls = await controls.boundingBox();
  const initialHeader = await header.boundingBox();
  await first.hover();
  await page.mouse.wheel(0, 5000);
  await expect(last).toBeInViewport();
  await last.hover();
  await page.mouse.wheel(0, 500);
  await expect(controls).toBeInViewport();
  await expect(header).toBeInViewport();
  expect(await controls.boundingBox()).toEqual(initialControls);
  expect(await header.boundingBox()).toEqual(initialHeader);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.setViewportSize({ width: 390, height: 600 });
  const mobileControls = await controls.boundingBox();
  await last.hover();
  await page.mouse.wheel(0, 500);
  await expect(last).toBeInViewport();
  await expect(controls).toBeInViewport();
  expect(await controls.boundingBox()).toEqual(mobileControls);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

When("I commit the displayed retry changes outside Pi", async ({ page }) => {
  await expect(page.getByRole("button", { name: /retry\.ts.*Modified/ })).toBeVisible();
  if (!world.harness) throw new Error("Pi harness is not running");
  const cwd = world.harness.workspaceDir;
  execFileSync("git", ["add", "--all"], { cwd });
  execFileSync("git", ["commit", "-m", "Use capped retry backoff"], { cwd });
});

When("I open the previously changed retry file", async ({ page }) => {
  await page.getByRole("button", { name: /retry\.ts.*Modified/ }).click();
});

Then("I can refresh the outdated list and see a clean working tree", async ({ page }) => {
  await expect(page.getByText("The changes list is out of date. Use Refresh tab in the toolbar.")).toBeVisible();
  await page.getByRole("button", { name: "Refresh tab", exact: true }).click();
  await expect(page.locator("aside").getByText("No changes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Changes" })).toHaveAttribute("title", "main: No changes");
});
