import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

const { Given, When, Then, After } = createBdd();

let fixtureName = "chat-lifecycle";
let harness: PiWebUiHarness | null = null;

Given("a temporary git workspace", async () => {
  fixtureName = "chat-lifecycle";
});

Given("the faux response fixture is {string}", async ({ page: _page }, name: string) => {
  fixtureName = name;
});

When("I open Pi Web UI", async ({ page }) => {
  harness = await startPiWebUi(fixtureName);
  await page.goto(harness.pageUrl);
  await expect(page.getByPlaceholder("Message Pi...")).toBeVisible();
});

When("I ask the agent to update the workspace status docs", async ({ page }) => {
  await page.getByPlaceholder("Message Pi...").fill("Update the workspace status docs.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Updated the workspace status docs.")).toBeVisible({ timeout: 30_000 });
});

Then("the workspace float shows the current branch", async ({ page }) => {
  await expect(page.getByTestId("workspace-status-float").getByTestId("workspace-git-row")).toContainText(/main/);
});

Then("the workspace float shows git additions and deletions", async ({ page }) => {
  const float = page.getByTestId("workspace-status-float");
  await expect(float.getByText(/\+\d+/)).toBeVisible();
  await expect(float.getByText(/-\d+/)).toBeVisible();
});

Then("the workspace float shows the Markdown artifact", async ({ page }) => {
  await expect(
    page.getByTestId("workspace-status-float").getByTestId("workspace-artifact-row").filter({
      hasText: "workspace-status-float.md",
    }),
  ).toBeVisible();
});

When("I open the Markdown artifact", async ({ page }) => {
  await page
    .getByTestId("workspace-status-float")
    .getByTestId("workspace-artifact-row")
    .filter({ hasText: "workspace-status-float.md" })
    .click();
});

Then("the right panel shows the artifact file content", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel).toContainText("workspace-status-float.md");
  await expect(panel).toContainText("faux provider during a real Pi E2E scenario");
});

When("I hide the right panel", async ({ page }) => {
  await page.getByTitle("Hide right panel").click();
  await expect(page.getByTitle("Show right panel")).toBeVisible();
});

When("I open the Changes row", async ({ page }) => {
  await page.getByTestId("workspace-status-float").getByTestId("workspace-git-row").click();
});

Then("the right panel shows the git diff tab", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel).toContainText("Changes");
  await expect(panel).toContainText("diff --git");
  await expect(panel).toContainText("docs/prd/workspace-status-float.md");
});

After(async () => {
  await harness?.stop();
  harness = null;
});
