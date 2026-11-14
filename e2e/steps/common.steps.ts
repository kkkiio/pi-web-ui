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

After(async () => {
  await stopWebUi();
});
