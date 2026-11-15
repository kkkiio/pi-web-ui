import net from "node:net";
import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import WebSocket from "ws";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";
import { saveReadmeImage } from "../harness/readme-image";

const { Given, When, Then, After } = createBdd();
let harness: PiWebUiHarness | undefined;
let otherPage: Page | undefined;
let proxy: net.Server | undefined;
const proxySockets = new Set<net.Socket>();
const card = (page: Page) => page.getByTestId("ask-user-question");
const history = (page: Page) => page.getByTestId("ask-user-question-history");

Given("an untouched terminal session", async () => {
  harness = await startPiWebUi("chat-lifecycle", { autoStart: false, sessionName: "Untitled" });
});
When("I have two terminal conversation turns", async () => {
  await harness?.command("Please explain the existing project structure.");
  await harness?.command("/wait-test-idle");
  await harness?.command("Help me choose an approach before changing files.");
  await harness?.command("/wait-test-idle");
});
Then("terminal tools and instructions are unchanged", async () => {
  await harness?.command("/assert-terminal-unchanged");
});

Given("a lazy Web UI session", async () => {
  harness = await startPiWebUi("ask-user-question", { autoStart: false });
});
Given(
  "a lazy Web UI session with a conflicting tool loaded {string}",
  async ({ page: _page }, order: "before" | "after" | "inactive") => {
    harness = await startPiWebUi("ask-user-question", { autoStart: false, conflictTool: order });
  },
);
Given("an activated question session", async ({ page }) => {
  harness = await startPiWebUi("ask-user-question");
  await page.goto(harness.pageUrl);
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
});
Given("an activated question session through a TCP proxy", async ({ page }) => {
  harness = await startPiWebUi("ask-user-question");
  const upstreamPort = harness.port;
  proxy = net.createServer((client) => {
    const upstream = net.connect(upstreamPort, "127.0.0.1");
    proxySockets.add(client);
    client.pipe(upstream).pipe(client);
    client.on("close", () => {
      proxySockets.delete(client);
      upstream.destroy();
    });
    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
  });
  await new Promise<void>((resolve) => proxy?.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("TCP proxy has no port");
  await page.goto(`http://127.0.0.1:${address.port}`);
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
});
When("the network connection drops and reconnects", async ({ page }) => {
  const reconnected = page.waitForEvent("websocket");
  for (const socket of proxySockets) socket.destroy();
  const socket = await reconnected;
  await socket.waitForEvent("framereceived", {
    predicate: (frame) => JSON.parse(String(frame.payload)).event === "state_sync",
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
  await expect(card(page)).toBeVisible();
});
Then("my clarification draft is preserved", async ({ page }) => {
  await card(page).getByRole("button", { name: "Previous question" }).click();
  await expect(card(page).getByLabel("Custom answer: Storage")).toHaveValue("Use an encrypted local file.");
  await card(page).getByRole("button", { name: "Next question" }).click();
  await expect(card(page).getByLabel("Custom answer: Features")).toHaveValue("Add offline access.");
  await expect(card(page).getByRole("checkbox", { name: /Search/ })).toBeChecked();
});
Given("a lazy Web UI session with an unavailable bind address", async () => {
  harness = await startPiWebUi("ask-user-question", { autoStart: false, host: "203.0.113.123" });
});
When("I run webui", async () => {
  await harness?.command("/webui");
});

When("I open webui", async ({ page }) => {
  await harness?.command("/webui");
  await page.goto(harness?.pageUrl ?? "");
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
});
When("I stop webui", async () => {
  await harness?.command("/webui-stop");
});
Then("the Web UI server is not listening", async () => {
  await expect(async () => {
    await expect(fetch(harness?.pageUrl ?? "")).rejects.toThrow();
  }).toPass();
});
// Tool metadata is queried through a test-only Pi command, not a substitute tool or WebSocket mock.
Then("the Web UI question tool is active", async () => {
  await harness?.command("/assert-question-active");
});
Then("the Web UI question tool is inactive", async () => {
  await harness?.command("/assert-question-inactive");
});
Then("the Web UI question tool is absent", async () => {
  await harness?.command("/assert-question-absent");
});
Then("the conflicting question tool is active", async () => {
  await assertTools({ active: ["ask_user_question"] });
});
Then("the conflicting question tool is inactive", async () => {
  await assertTools({ inactive: ["ask_user_question"] });
});
When("I disable an unrelated tool", async () => {
  await harness?.command("/disable-read");
});
Then("the unrelated tool stays disabled", async () => {
  await assertTools({ inactive: ["read"] });
});
When("I replace the session using {string}", async ({ page: _page }, command: string) => {
  await harness?.command(command);
});
When("I run webui after the agent settles", async ({ page }) => {
  await harness?.command("/wait-test-idle");
  await harness?.command("/webui");
  await page.goto(harness?.pageUrl ?? "");
});
function assertTools(state: { active?: string[]; inactive?: string[] }) {
  return harness?.command(`/assert-tool-state ${JSON.stringify(state)}`);
}

Given("Pi is ready to plan the export dry-run", async ({ page }) => {
  harness = await startPiWebUi("export-clarify", { sessionName: "Plan export dry-run" });
  await page.goto(harness.pageUrl);
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
});
When("I ask Pi to add a dry-run flag", async ({ page }) => {
  await page
    .getByRole("textbox", { name: "Message Pi", exact: true })
    .fill("Add `--dry-run` to the export command so I can see which files it would write.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(card(page)).toBeVisible();
});
When("I pick the recommended overwrite behavior", async ({ page }) => {
  await card(page)
    .getByRole("radio", { name: /Mark it as an overwrite/ })
    .click();
  // A single-choice answer advances to the next question; go back to show the choice.
  await card(page).getByRole("button", { name: "Previous question" }).click();
  await card(page).getByText("Preview", { exact: true }).first().click();
});
Then("the question card previews the dry-run output", async ({ page }) => {
  const preview = card(page).getByRole("region", { name: "Option preview" }).first();
  await expect(preview).toContainText("reports/summary.csv   overwrite");
  await expect(card(page).getByRole("radio", { name: /Mark it as an overwrite/ })).toBeChecked();
  await saveReadmeImage(page, "ask-user-question");
});

When("I ask the agent to clarify", async ({ page }) => {
  await page
    .getByRole("textbox", { name: "Message Pi", exact: true })
    .fill("Clarify storage and features before implementing.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(card(page)).toBeVisible();
});
Then("the question card is waiting for answers", async ({ page }) => {
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeHidden();
  await expect(card(page).getByText("Where should we store the project data?")).toBeVisible();
});
Then("submitting unanswered questions is disabled", async ({ page }) => {
  await expect(card(page).getByRole("button", { name: "Continue" })).toBeDisabled();
});
When("I choose project storage and features", async ({ page }) => {
  await card(page)
    .getByRole("radio", { name: /SQLite/ })
    .click();
  await card(page)
    .getByRole("checkbox", { name: /Search/ })
    .check();
  await card(page)
    .getByRole("checkbox", { name: /Export/ })
    .check();
});
Then("the option Markdown preview is visible", async ({ page }) => {
  await card(page).getByText("Preview", { exact: true }).first().click();
  await expect(card(page).getByRole("region", { name: "Option preview" }).first()).toBeVisible();
  await expect(card(page).getByRole("region", { name: "Option preview" }).first()).toContainText(
    "CREATE TABLE projects",
  );
});
When("I enter custom clarification answers", async ({ page }) => {
  await card(page).getByLabel("Custom answer: Storage").fill("Use an encrypted local file.");
  await card(page).getByRole("button", { name: "Continue" }).click();
  await card(page)
    .getByRole("checkbox", { name: /Search/ })
    .check();
  await card(page).getByLabel("Custom answer: Features").fill("Add offline access.");
});
When("I submit the clarification answers", async ({ page }) => {
  await card(page).getByRole("button", { name: "Submit answers" }).click();
});
Then("the agent receives my answers", async ({ page }) => {
  await expect(page.getByText("I received your clarification and can continue.", { exact: true })).toBeVisible();
  await expect(history(page)).toContainText("Answered");
});
When("I reload the question page", async ({ page }) => {
  await page.reload();
});
Then("the answered card is read only", async ({ page }) => {
  await expect(history(page)).toContainText("Answered");
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
});
When("I cancel the clarification", async ({ page }) => {
  await card(page).getByRole("button", { name: "Cancel questions" }).click();
});
When("I abort the question agent", async ({ page }) => {
  await card(page).getByRole("button", { name: "Stop run" }).click();
});
Then("the cancelled card is read only", async ({ page }) => {
  await expect(history(page)).toContainText("Cancelled");
  await expect(card(page)).toHaveCount(0);
});
Then("an invalid answer is refused and the question remains open", async ({ page }) => {
  const verdict = await answer([
    { questionIndex: 0, optionIndexes: [99] },
    { questionIndex: 1, optionIndexes: [0] },
  ]);
  expect(verdict).toMatchObject({ ok: false, code: "invalid_answer" });
  await expect(card(page)).toBeVisible();
});
Then("a duplicate answer is refused", async () => {
  expect(await answer([])).toMatchObject({ ok: false, code: "not_found" });
});
When("another browser opens the pending question", async ({ context }) => {
  otherPage = await context.newPage();
  await otherPage.goto(harness?.pageUrl ?? "");
  await expect(card(otherPage)).toBeVisible();
});
Then("both browsers show an answered question", async ({ page }) => {
  await expect(history(page)).toContainText("Answered");
  if (!otherPage) throw new Error("Second browser was not opened");
  await expect(history(otherPage)).toContainText("Answered");
});

function answer(answers: unknown[]) {
  return wsRequest("answer_question", {
    toolCallId: "ask-storage",
    answers,
  });
}
function wsRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${(harness?.pageUrl ?? "").replace("http:", "ws:")}/ws`);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket request timed out"));
    }, 15_000);
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("open", () => socket.send(JSON.stringify({ type: "req", id: "test-request", method, params })));
    socket.on("message", (raw) => {
      const data = JSON.parse(String(raw));
      if (data.type !== "res" || data.id !== "test-request") return;
      clearTimeout(timer);
      socket.close();
      if (data.ok) resolve(data.result);
      else reject(new Error(data.error));
    });
  });
}

After(async () => {
  for (const socket of proxySockets) socket.destroy();
  if (proxy) await new Promise<void>((resolve) => proxy?.close(() => resolve()));
  proxy = undefined;
  await otherPage?.close();
  otherPage = undefined;
  await harness?.stop();
  harness = undefined;
});

When("I use a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
});
When("I collapse and reopen the question card", async ({ page }) => {
  await card(page).getByLabel("Custom answer: Storage").fill("Use an encrypted local file.");
  await card(page).getByRole("button", { name: "Collapse questions" }).click();
  await expect(card(page).getByRole("button", { name: "Skip" })).toBeHidden();
  await card(page).getByRole("button", { name: "Expand questions" }).click();
  await expect(card(page).getByLabel("Custom answer: Storage")).toHaveValue("Use an encrypted local file.");
});
When("I skip storage and select Search", async ({ page }) => {
  const skip = card(page).getByRole("button", { name: "Skip" });
  await expect(skip).toBeInViewport({ ratio: 1 });
  await skip.click();
  await card(page)
    .getByRole("checkbox", { name: /Search/ })
    .check();
});
Then("the transcript shows that I skipped storage and selected Search", async ({ page }) => {
  await expect(history(page)).toContainText("Where should we store the project data?Skipped");
  await expect(history(page)).toContainText("Which features should be included?Search");
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeInViewport();
});
