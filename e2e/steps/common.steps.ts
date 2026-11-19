import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { openWebUi, stopWebUi, world } from "./world";

/**
 * Steps shared by every chat-level feature.
 *
 * Regression guarded by "the transcript shows" assertions: the transcript is
 * rebuilt from the Pi session snapshot on connect, so text must come from
 * session entries rather than browser state.
 */
const { Given, When, Then, After } = createBdd();

Given("a git workspace", () => {
  world.workspaceGit = true;
});

Given("a workspace without git", () => {
  world.workspaceGit = false;
});

Given("Pi replies with plain text", () => {
  world.fixture = "chat-lifecycle";
});

Given("Pi replies with a DIL layout", () => {
  world.fixture = "dil-render";
});

Given("Pi replies with DIL math and code", () => {
  world.fixture = "dil-heavy";
});

Given("Pi replies with a DIL diagram", () => {
  world.fixture = "dil-svg";
});

Given("Pi replies with a continued ordered list", () => {
  world.fixture = "dil-list";
});

Given("Pi updates the workspace status document", () => {
  world.fixture = "workspace-artifact";
});

Given("Pi fails its write tool call", () => {
  world.fixture = "tool-failure";
});

Given("Pi returns text and several tool calls in one message", () => {
  world.fixture = "edit-history";
});

Given("the rewind will be cancelled", () => {
  world.cancelNavigation = true;
});

When("I open Pi Web UI", async ({ page }) => {
  await openWebUi(page);
});

When("I send {string}", async ({ page }, message: string) => {
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill(message);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});

When("I ask Pi to update the workspace status docs", async ({ page }) => {
  const composer = page.getByRole("textbox", { name: "Message Pi", exact: true });
  await composer.fill("Update the workspace status docs.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Updated the workspace status docs.")).toBeVisible();
});

When("I reload Pi Web UI", async ({ page }) => {
  await page.reload();
});

Then("the transcript shows {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("log").getByText(text, { exact: true })).toBeVisible();
});

Then("the DIL prompt section is active", async () => {
  await world.harness?.command("/assert-dil-prompt active");
});

Then("the DIL prompt section is inactive", async () => {
  await world.harness?.command("/assert-dil-prompt inactive");
});

Then("the DIL layout is rendered", async ({ page }) => {
  const root = page.getByRole("log").locator(".dil-root");
  await expect(root).toBeVisible();
  await expect(root.getByText("Request path", { exact: true })).toBeVisible();
  await expect(root.getByText("62%")).toBeVisible();
});

Then("the math, the code block and the connected list are rendered", async ({ page }) => {
  const log = page.getByRole("log");
  // KaTeX: an inline formula and a display block, both typeset (not the raw LaTeX source).
  await expect(log.locator(".dil-root .katex").first()).toBeVisible();
  await expect(log.locator(".dil-root .katex-display").first()).toBeVisible();
  // KaTeX keeps the TeX source in its MathML annotation, so the proof is the absence of the
  // `$$` delimiters, which would mean the block was never parsed as math.
  await expect(log.getByText("$$", { exact: true })).toHaveCount(0);

  // Shiki: the fence keeps its language and its code text.
  const code = log.locator('.dil-root [data-language="js"]').first();
  await expect(code).toBeVisible();
  await expect(code).toContainText("const energy");

  // `connector="solid" gap={2}` reaches the list element.
  const list = log.locator(".dil-root ol").first();
  await expect(list).toBeVisible();
  await expect(list).toHaveClass(/space-y-2/);
});

Then("the DIL diagram is rendered", async ({ page }) => {
  const log = page.getByRole("log");
  const svg = log.locator(".dil-root svg").first();
  await expect(svg).toBeVisible();
  // 4 rows × 8 columns of tiles, each one a <rect>.
  await expect(svg.locator("rect")).toHaveCount(32);
  // The marker is declared per diagram, so its id must be namespaced rather than "arrow".
  await expect(svg.locator("marker")).toHaveAttribute("id", /^dil-.+-arrow$/);
  await expect(svg.locator("line")).toHaveAttribute("marker-end", /^url\(#dil-.+-arrow\)$/);
  await expect(log.getByText("4 × 8 tiles").first()).toBeVisible();
});

Then("each diagram keeps its own marker namespace", async ({ page }) => {
  const ids = await page
    .getByRole("log")
    .locator(".dil-root svg marker")
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(ids.length).toBeGreaterThan(1);
  // Two messages, two `<marker id="arrow">`: without a per-message prefix the second
  // reference would resolve to the first diagram's marker.
  expect(new Set(ids).size).toBe(ids.length);
});

Then("the ordered list continues at 5", async ({ page }) => {
  const list = page.getByRole("log").locator(".dil-root ol").first();
  await expect(list).toHaveAttribute("start", "5");
  await expect(list.locator("li")).toHaveCount(2);
});

Then("the transcript does not show raw DIL tags", async ({ page }) => {
  await expect(page.getByRole("log")).not.toContainText("<box");
  await expect(page.getByRole("log")).not.toContainText("</box>");
  await expect(page.getByRole("log")).not.toContainText("<svg");
});

Then("the transcript shows the tool call {string}", async ({ page }, name: string) => {
  const group = page.getByRole("button", { name: /^1 tool call(?: · 1 failed)?$/ });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  await group.click();
  await expect(page.getByRole("log").getByText(name, { exact: true })).toBeVisible();
});

Then("the tool call is marked as failed", async ({ page }) => {
  await expect(page.getByRole("button", { name: "1 tool call · 1 failed", exact: true })).toBeVisible();
});

Then("the composer is ready for the next message", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
});

When("the session is renamed to {string}", async ({ page: _page }, name: string) => {
  await world.harness?.setSessionName(name);
});

Then("the browser tab title is {string}", async ({ page }, title: string) => {
  await expect(page).toHaveTitle(title);
});

Then("the header shows the session name {string}", async ({ page }, name: string) => {
  await expect(page.locator("header").getByText(name, { exact: true })).toBeVisible();
});

After(async () => {
  await stopWebUi();
});
