import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { openWebUi, world } from "./world";

const { Given, When, Then } = createBdd();

Given("Pi will run a command and work on a TypeScript file", async ({ page, context }) => {
  world.fixture = "tool-call-views";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWebUi(page);
});

When("I ask Pi to review the file", async ({ page }) => {
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill("Review the example file.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});

Then("I can see the command and its latest output after reloading", async ({ page }) => {
  const group = page.getByRole("button", { name: /^Running printf/ });
  const row = page.getByRole("button", { name: /bash.*printf/i });
  const output = page.getByText("Build started", { exact: true });
  await group.click();
  await row.click();
  await expect(output).toBeVisible();
  await page.reload();
  await group.click();
  await row.click();
  await expect(output).toHaveCSS("color", "rgb(13, 188, 121)");

  await page.getByRole("button", { name: "Copy command", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("while [ ! -f .finish ]");
});

When("the command exits with an error", async () => {
  if (!world.harness) throw new Error("Pi Web UI is not running");
  await writeFile(path.join(world.harness.workspaceDir, ".finish"), "");
});

Then("I can see the failure and quote the command output", async ({ page }) => {
  await expect(page.getByRole("button", { name: /bash.*Exit 7/i })).toBeVisible();
  const output = page.getByText("Build failed", { exact: true });
  await expect(output).toBeVisible();
  await page.getByRole("button", { name: "Copy output", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Build started\nBuild failed\n");
  await expect(page.getByText("The file review is complete.", { exact: true })).toBeVisible();
  await output.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect(page.getByRole("button", { name: "Add to Chat" })).toBeVisible();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
});

Then("I can preview the written and read file content", async ({ page }) => {
  await page.getByRole("button", { name: /write.*example\.ts/i }).click();
  const written = page.getByRole("button", { name: "Show 6 more lines" });
  await expect(written).toBeVisible();
  await written.click();
  await expect(page.getByText("export const item14 = 14;", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /read.*example\.ts.*lines 3–12/i }).click();
  await expect(page.getByText("[2 more lines in file. Use offset=13 to continue.]", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show 2 more lines" })).toBeVisible();
});

Then("I can see and quote the edit diff after reloading the conversation", async ({ page }) => {
  const edit = page.getByRole("button", { name: /edit.*example\.ts/i });
  await edit.click();
  await expect(page.getByText("export const item3 = 30;", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /4 tool calls.*1 failed/ }).click();
  await edit.click();
  const change = page.getByText("export const item3 = 30;", { exact: true });
  await expect(change).toBeVisible();
  await change.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await expect(page.getByRole("button", { name: "Add to Chat" })).toBeVisible();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await page.getByRole("button", { name: "Copy patch", exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("+export const item3 = 30;");
});
