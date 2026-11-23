import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { saveReadmeImage } from "../harness/readme-image";
import { world } from "./world";

/**
 * The `#48` interaction path, driven the way a user drives it.
 *
 * The card is a DIL message; its state is local to that message, and its button sends a
 * turn through `GenUI.issueNewTurn`. Nothing here reads a React prop or a runtime object:
 * a click produces a user message in the transcript, or the feature fails.
 */
const { Given, When, Then } = createBdd();

const card = (page: Page) =>
  page
    .getByRole("log")
    .locator(".dil-root")
    .filter({ has: page.getByRole("radiogroup") });

Given("Pi replies with a DIL interaction card", () => {
  world.fixture = "dil-interaction";
});

Then("the DIL interaction card is rendered", async ({ page }) => {
  await expect(card(page).getByRole("radiogroup")).toBeVisible();
  await expect(card(page).getByRole("button", { name: /提交测试结果/ })).toBeVisible();
  await expect(card(page).getByRole("textbox")).toBeVisible();
  // The default slot value is selected before any interaction.
  await expect(card(page).getByRole("radio", { name: "成功了，能看到 Note On / Note Off" })).toBeChecked();
});

When("I choose {string} in the card", async ({ page }, option: string) => {
  await card(page).getByRole("radio", { name: option }).check();
});

When("I type {string} into the card", async ({ page }, value: string) => {
  await card(page).getByRole("textbox").fill(value);
});

When("I submit the card", async ({ page }) => {
  await card(page)
    .getByRole("button", { name: /提交测试结果/ })
    .click();
});

Then("the card's answer reaches Pi as a user message {string}", async ({ page }, expected: string) => {
  const userMessages = page.locator('[id^="user-message-"]');
  await expect(userMessages.last()).toContainText(expected);
});

Then("the card still shows the answer I chose", async ({ page }) => {
  // State belongs to the card, not to the turn: sending must not reset what the user typed,
  // which is what happens when the runtime is rebuilt on a status change.
  await expect(card(page).getByRole("radio", { name: "浏览器支持 MIDI，但找不到钢琴设备" })).toBeChecked();
  await expect(card(page).getByRole("textbox")).toHaveValue("USB MIDI 列表为空");
});

Then("the composer is still empty after the card is submitted", async ({ page }) => {
  // The card never writes into the composer: it sends, it does not draft.
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toHaveValue("");
});

Given("Pi is ready to clarify the export dry-run", () => {
  world.fixture = "export-clarify";
});

When("I choose {string} in the dry-run card", async ({ page }, choice: string) => {
  await card(page).getByRole("radio", { name: choice, exact: true }).check();
});

Then("the dry-run card previews {string}", async ({ page }, preview: string) => {
  await expect(card(page).getByText(preview, { exact: true })).toBeVisible();
});

Then("I can answer in the chat input", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeEditable();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeVisible();
});

When("I submit the dry-run choice", async ({ page }) => {
  await card(page).getByRole("button", { name: "Submit choice" }).click();
});

Then("the dry-run answers survive a reload", async ({ page }) => {
  const first = "Dry-run behavior for existing export files: Mark overwrites.";
  const second = "Dry-run behavior for existing export files: Show new files only.";
  await world.harness?.waitForSessionText(second);
  await page.reload();
  const userMessages = page.locator('[id^="user-message-"]');
  await expect(userMessages.filter({ hasText: first })).toBeVisible();
  await expect(userMessages.filter({ hasText: second })).toBeVisible();
});

Given("Pi is ready to compare cache strategies", () => {
  world.fixture = "cache-strategy";
});

Then("the cache preview shows {string}", async ({ page }, label: string) => {
  await expect(card(page).getByText(label, { exact: true })).toBeInViewport();
});

Then("I capture the cache strategy for the README", async ({ page }) => {
  await expect(card(page)).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[id^="user-message-"]').last()).toBeInViewport({ ratio: 1 });
  await expect(card(page).getByRole("button", { name: "Plan this approach", exact: true })).toBeEnabled();
  await saveReadmeImage(page, "pi-web-ui-example");
});

When("I select {string} in the cache preview", async ({ page }, action: string) => {
  await card(page).getByRole("button", { name: action, exact: true }).click();
});
