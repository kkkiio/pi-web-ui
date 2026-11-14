import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

const { Given, When, Then, After } = createBdd();
let harness: PiWebUiHarness | null = null;
let prompt = "";
const content = (page: Page) => page.locator(".user-message-content");

Given("a Pi session for user message formatting", async ({ page }) => {
  harness = await startPiWebUi("chat-lifecycle");
  await page.goto(harness.pageUrl);
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
});

When("I submit this formatted user prompt:", async ({ page }, text: string) => {
  prompt = text;
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill(prompt);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("你好，Pi Web UI 已收到消息。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeVisible();
});

async function checkFormatting(page: Page) {
  const body = content(page);
  await expect(body).toContainText('<context source="user">');
  await expect(body).toContainText("</context>");
  await expect(body).toContainText('<script>alert("literal")</script>');
  await expect(body.locator("context, script")).toHaveCount(0);
  await expect(body.locator("strong")).toHaveText(["重点", "中文标点。"]);
  await expect(body.locator("em")).toHaveText("emphasis");
  await expect(body.locator("blockquote")).toHaveText("Quoted instruction");
  await expect(body.locator("li")).toHaveText(["First item", "Second item"]);
  await expect(body.locator("p").first()).toHaveText("First line\nSecond line");
  await expect(body.locator("p").first().locator("br")).toHaveCount(1);
  // Confirm a line break is visible rather than just present in the DOM.
  const height = await body
    .locator("p")
    .first()
    .evaluate((node) => ({
      height: node.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
    }));
  expect(height.height).toBeGreaterThanOrEqual(height.lineHeight * 2 - 1);
  await expect(body).toContainText("escaped dollar: $5");
  await expect(body.locator("p").last()).toHaveText("Unclosed **marker");
  await expect(body.locator("code").first()).toHaveText("<b>inline code</b>");
  await expect(body.locator("pre code.language-mermaid")).toContainText("A --> B");
  await expect(body.locator("svg")).toHaveCount(0);
}

Then("the user prompt displays literal tags and lightweight Markdown", async ({ page }) => {
  await checkFormatting(page);
});

Then("the user prompt displays inline and block math", async ({ page }) => {
  await expect(content(page).locator(".katex")).toHaveCount(2);
  await expect(content(page).locator(".katex-display")).toHaveCount(1);
  await expect(content(page).locator(".katex-html").first()).toBeVisible();
});

Then("the submitted user prompt is preserved after reload", async ({ page }) => {
  if (!harness) throw new Error("Pi harness is not running");
  const directory = path.resolve(harness.workspaceDir, "../sessions");
  const entries = readdirSync(directory, { recursive: true })
    .filter((name) => String(name).endsWith(".jsonl"))
    .flatMap((name) =>
      readFileSync(path.join(directory, String(name)), "utf8")
        .trim()
        .split("\n"),
    )
    .map((line) => JSON.parse(line));
  const user = entries.find((entry) => entry.type === "message" && entry.message?.role === "user");
  expect(user?.message.content.map((part: { text?: string }) => part.text ?? "").join("")).toBe(prompt);
  await page.reload();
  await checkFormatting(page);
  await expect(content(page).locator(".katex")).toHaveCount(2);
});

Then("copying and editing the user prompt preserves its source", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const message = page.locator(".group.is-user");
  await message.hover();
  await message.getByRole("button", { name: "Copy message", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  await message.getByRole("button", { name: "Edit message", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit message", exact: true })).toHaveValue(prompt);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

After(async () => {
  await harness?.stop();
  harness = null;
});
