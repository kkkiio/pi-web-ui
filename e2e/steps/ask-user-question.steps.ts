import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import WebSocket from "ws";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

const { Given, When, Then, After } = createBdd();
let harness: PiWebUiHarness | undefined;
let otherPage: Page | undefined;
const card = (page: Page) => page.getByTestId("ask-user-question");

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
Given("a lazy Web UI session with an unavailable bind address", async () => {
  harness = await startPiWebUi("ask-user-question", { autoStart: false, host: "203.0.113.123" });
});
When("I attempt activation", async () => {
  await harness?.command("/webui");
});

When("I run webui", async ({ page }) => {
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

When("I ask the agent to clarify", async ({ page }) => {
  await page
    .getByRole("textbox", { name: "Message Pi", exact: true })
    .fill("Clarify storage and features before implementing.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(card(page)).toContainText("Waiting for your answer");
});
Then("the question card is waiting for answers", async ({ page }) => {
  await expect(card(page)).toContainText("Waiting for your answer");
  await expect(card(page).getByText("Where should we store the project data?")).toBeVisible();
});
Then("submitting unanswered questions is disabled", async ({ page }) => {
  await expect(card(page).getByRole("button", { name: "Submit answers" })).toBeDisabled();
});
When("I choose project storage and features", async ({ page }) => {
  await card(page)
    .getByRole("radio", { name: /SQLite/ })
    .check();
  await card(page)
    .getByRole("checkbox", { name: /Search/ })
    .check();
  await card(page)
    .getByRole("checkbox", { name: /Export/ })
    .check();
});
Then("the option Markdown preview is visible", async ({ page }) => {
  await expect(card(page).getByRole("region", { name: "Option preview" })).toContainText("CREATE TABLE projects");
});
When("I enter custom clarification answers", async ({ page }) => {
  await card(page).getByLabel("Custom answer: Storage").fill("Use an encrypted local file.");
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
  await expect(card(page)).toContainText("User has answered your questions:");
});
When("I reload the question page", async ({ page }) => {
  await page.reload();
});
Then("the answered card is read only", async ({ page }) => {
  await expect(card(page)).toContainText("Answered");
  await expect(card(page).getByRole("button", { name: "Submit answers" })).toHaveCount(0);
});
When("I cancel the clarification", async ({ page }) => {
  await card(page).getByRole("button", { name: "Cancel questions" }).click();
});
When("I abort the question agent", async () => {
  await wsRequest("abort");
});
Then("the cancelled card is read only", async ({ page }) => {
  await expect(card(page)).toContainText("Cancelled");
  await expect(card(page).getByRole("button", { name: "Submit answers" })).toHaveCount(0);
});
Then("an invalid answer is refused and the question remains open", async ({ page }) => {
  const verdict = await answer([
    { questionIndex: 0, optionIndexes: [99] },
    { questionIndex: 1, optionIndexes: [0] },
  ]);
  expect(verdict).toMatchObject({ ok: false, code: "invalid_answer" });
  await expect(card(page)).toContainText("Waiting for your answer");
});
Then("a duplicate answer is refused", async () => {
  expect(await answer([])).toMatchObject({ ok: false, code: "not_found" });
});
When("another browser opens the pending question", async ({ context }) => {
  otherPage = await context.newPage();
  await otherPage.goto(harness?.pageUrl ?? "");
  await expect(card(otherPage)).toContainText("Waiting for your answer");
});
Then("both browsers show an answered question", async ({ page }) => {
  await expect(card(page)).toContainText("Answered");
  if (!otherPage) throw new Error("Second browser was not opened");
  await expect(card(otherPage)).toContainText("Answered");
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
  await otherPage?.close();
  otherPage = undefined;
  await harness?.stop();
  harness = undefined;
});
