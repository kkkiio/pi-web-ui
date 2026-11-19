import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { world } from "./world";

/**
 * The `#48` interaction path, driven the way a user drives it.
 *
 * The card is a DIL message; its state is local to that message, and its button sends a
 * turn through `GenUI.issueNewTurn`. Nothing here reads a React prop or a runtime object:
 * a click produces a user message in the transcript, or the feature fails.
 */
const { Given, When, Then } = createBdd();

// The card message, not the answer that follows it: `.last()` would be the newest answer.
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
