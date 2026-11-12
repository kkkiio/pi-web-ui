import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

const { Given, When, Then, After } = createBdd();
let harness: PiWebUiHarness | null = null;
const partial = "preserve the original request";
const feedback = "Please explain this precisely.";
function persistedPrompt() {
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
  const users = entries.filter((entry) => entry.type === "message" && entry.message?.role === "user");
  return users
    .at(-1)
    ?.message.content.map((part: { text?: string }) => part.text || "")
    .join("");
}

async function selectText(locator: Locator, text: string) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element, selectedText) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    const fullText = nodes.map((node) => node.data).join("");
    const needle = fullText.includes(selectedText) ? selectedText : selectedText.replaceAll("\n", "");
    const start = fullText.indexOf(needle);
    if (start < 0) throw new Error(`Selection not found: ${selectedText}`);
    const range = document.createRange();
    let offset = 0;
    for (const node of nodes) {
      const end = offset + node.length;
      if (start >= offset && start < end) range.setStart(node, start - offset);
      if (start + needle.length > offset && start + needle.length <= end) {
        range.setEnd(node, start + needle.length - offset);
        break;
      }
      offset = end;
    }
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }, text);
}

Given("a transcript with prose, reasoning and tool output", async ({ page }) => {
  harness = await startPiWebUi("transcript-quote");
  await page.goto(harness.pageUrl);
  await page.getByPlaceholder("Message Pi...").fill("Inspect the request.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Explain the selected sentence before changing code.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeVisible();
  // Restore the persisted transcript so later selections cannot race the end-of-turn sync.
  await page.reload();
  await expect(page.getByText("Explain the selected sentence before changing code.", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Message Pi...").fill(feedback);
});

When("I quote a partial assistant sentence", async ({ page }) => {
  await selectText(page.getByText("The retry policy must preserve the original request.", { exact: true }), partial);
  await page.getByRole("button", { name: "Quote / Add to Chat", exact: true }).click();
});
Then("the draft is preserved and focused", async ({ page }) => {
  await expect(page.getByPlaceholder("Message Pi...")).toHaveValue(feedback);
  await expect(page.getByPlaceholder("Message Pi...")).toBeFocused();
  await expect(page.getByRole("group", { name: "Quoted selections" })).toContainText(partial);
});
When("I add reasoning and multiline tool output quotes", async ({ page }) => {
  await page.getByRole("button", { name: /Thought for/ }).click();
  await selectText(
    page.getByText("Inspect the exact failure before making changes.", { exact: true }),
    "exact failure",
  );
  await page.getByRole("button", { name: "Quote / Add to Chat", exact: true }).click();
  await page.getByRole("button", { name: /bash/ }).click();
  await selectText(page.locator('[data-quote-source="bash output"] code'), "first output line\nsecond output line");
  await page.getByRole("button", { name: "Quote / Add to Chat", exact: true }).click();
});
Then("all three quotes are attached", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Remove quote", exact: true })).toHaveCount(3);
  await expect(page.getByRole("group", { name: "Quoted selections" })).toContainText("Assistant reasoning");
  await expect(page.getByRole("group", { name: "Quoted selections" })).toContainText("bash output");
});
When("I submit the quoted feedback", async ({ page }) => {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("group", { name: "Quoted selections" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Message Pi...")).toHaveValue("");
});
Then("Pi receives the exact quotes and feedback after reload", async ({ page }) => {
  await expect(page.getByText("你好，Pi Web UI 已收到消息。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("log").getByText(feedback, { exact: true })).toBeVisible();
  const sent = persistedPrompt();
  expect(sent).toContain(`Quoted from Assistant:\n> ${partial}`);
  expect(sent).toContain("Quoted from Assistant reasoning:\n> exact failure");
  expect(sent).toContain("Quoted from bash output:\n> first output line\n> second output line");
});
When("I remove the attached quote", async ({ page }) => {
  await page.getByRole("button", { name: "Remove quote", exact: true }).click();
});
Then("the draft is preserved without quotes", async ({ page }) => {
  await expect(page.getByRole("group", { name: "Quoted selections" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Message Pi...")).toHaveValue(feedback);
});
When("I select text outside the transcript", async ({ page }) => {
  await selectText(page.locator("footer"), "Enter sends");
});
Then("no quote action is shown", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Quote / Add to Chat", exact: true })).toHaveCount(0);
});
When("I dismiss a transcript selection with Escape", async ({ page }) => {
  await selectText(page.getByText("The retry policy must preserve the original request.", { exact: true }), partial);
  await expect(page.getByRole("button", { name: "Quote / Add to Chat", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});
When("I use a mobile viewport and attach a quote", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByPlaceholder("Message Pi...").fill("");
  await selectText(page.getByText("The retry policy must preserve the original request.", { exact: true }), partial);
  const action = page.getByRole("button", { name: "Quote / Add to Chat", exact: true });
  await expect(action).toBeInViewport();
  await action.click();
});
Then("the quote and composer controls fit the viewport", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Remove quote", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeInViewport();
  await expect(page.getByPlaceholder("Message Pi...")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
When("I send only the quote", async ({ page }) => {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});
Then("Pi receives the quote without feedback", async ({ page }) => {
  await expect(page.getByRole("log").getByText(partial, { exact: true })).toBeVisible();
  expect(persistedPrompt()).toBe(`Quoted from Assistant:\n> ${partial}`);
});
After(async () => {
  await harness?.stop();
  harness = null;
});
