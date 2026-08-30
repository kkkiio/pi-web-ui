import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { getHarness, setHarness } from "./shared";

const { When, Then, After } = createBdd();

When("第二个 agent 连接到 hub", async () => {
  const harness = getHarness();
  if (!harness) throw new Error("harness not started");
  await harness.addAgent("Agent Beta");
});

Then("左侧边栏显示 {int} 个 agent 会话", async ({ page }, count: number) => {
  const leftSidebar = page.locator('[data-slot="sidebar"][data-side="left"]');
  await expect(page.getByText("Sessions")).toBeVisible();
  await expect(leftSidebar.getByTestId("session-list-row")).toHaveCount(count);
  await expect(leftSidebar.getByTestId("session-list-row").filter({ hasText: "Agent Alpha" })).toBeVisible();
  await expect(leftSidebar.getByTestId("session-list-row").filter({ hasText: "Agent Beta" })).toBeVisible();
});

When("我切换到 agent {string}", async ({ page }, name: string) => {
  const leftSidebar = page.locator('[data-slot="sidebar"][data-side="left"]');
  await expect(leftSidebar.getByTestId("session-list-row").filter({ hasText: name })).toBeVisible();
  await leftSidebar.getByTestId("session-list-row").filter({ hasText: name }).click();
});

Then("当前会话显示为空", async ({ page }) => {
  await expect(page.getByText("Connect to the running Pi session and send a message.")).toBeVisible();
});

Then("当前会话是 {string}", async ({ page }, name: string) => {
  await expect(page.locator("header").getByText(name, { exact: true })).toBeVisible();
});

Then("聊天区不显示消息 {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("log").getByText(text, { exact: true })).toHaveCount(0);
});

After(async () => {
  const harness = getHarness();
  await harness?.stop();
  setHarness(null);
});
