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

Given("Pi replies with the same Markdown with and without a layout", async ({ context, page }) => {
  world.fixture = "dil-markdown";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route(
    (url) => url.hostname === "dil-images.example.test",
    async (route) => {
      expect(route.request().headers().referer).toBeUndefined();
      if (new URL(route.request().url()).pathname === "/ok.svg") {
        await route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="48"><rect width="180" height="48" rx="8" fill="#156b72"/><text x="20" y="30" fill="white">Architecture</text></svg>',
        });
      } else {
        expect(new URL(route.request().url()).pathname).toBe("/missing.png");
        await route.fulfill({ status: 404 });
      }
    },
  );
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

  // A Markdown column alignment (`| ---: |`) reaches the cell as a computed text-align.
  const cells = log.locator(".dil-root table tr").nth(1).locator("td");
  await expect(cells.nth(0)).toHaveCSS("text-align", "left");
  await expect(cells.nth(1)).toHaveCSS("text-align", "right");
  await expect(cells.nth(2)).toHaveCSS("text-align", "center");

  // `connector="solid" gap={2}` reaches the list element.
  const list = log.locator(".dil-root ol").first();
  await expect(list).toBeVisible();
  await expect(list).toHaveClass(/space-y-2/);
  await expect(list).toHaveClass(/border-l-2/);
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

Then("the latest assistant answer renders the Markdown features", async ({ page }) => {
  const answer = page.getByRole("log").locator('[data-quote-source="Assistant"] .dil-root').last();
  await expect(answer.getByRole("heading", { name: "Markdown rendering", level: 2 })).toBeVisible();
  await expect(answer.locator("strong")).toHaveText("「重要」");
  await expect(answer.locator("del")).toHaveText("「旧」");
  await expect(answer.getByRole("link", { name: "https://example.test", exact: true })).toHaveAttribute(
    "href",
    "https://example.test",
  );
  await expect(answer.locator("p br")).toHaveCount(1);
  await expect(answer.getByRole("checkbox", { checked: true })).toBeDisabled();
  await expect(answer.getByRole("checkbox", { checked: false })).toBeDisabled();
  await expect(answer).toContainText("Press <kbd>Enter</kbd><br> to continue.");
  await expect(answer).toContainText("[id]: https://example.test/reference");
  await expect(answer).toContainText("[^1]: A footnote");
  await expect(answer).toContainText("![Insecure](http://dil-images.example.test/insecure.png)");

  const image = answer.getByRole("img", { name: "Architecture thumbnail" });
  await expect(image).toBeAttached();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute("loading", "lazy");
  await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(answer.getByText("Image unavailable", { exact: true })).toBeVisible();
  await expect(answer.getByRole("img", { name: "Image unavailable" })).toHaveCount(0);

  const code = answer.locator('[data-language="js"]');
  await expect(code).toContainText("const value = 42;");
  await code.getByRole("button", { name: "Copy code" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("const value = 42;");
  await expect(answer.getByRole("img", { name: "Mermaid diagram" }).locator("svg")).toBeVisible();
  await expect(answer.getByText("invalid diagram source", { exact: true })).toBeVisible();
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
