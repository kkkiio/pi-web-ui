import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { startPiWebUi } from "../harness/pi-process";
import { getHarness, setHarness } from "./shared";

const { Given, When, Then, After } = createBdd();

let fixtureName = "chat-lifecycle";
let workspaceGit = true;

Given("当前工作区是 git 仓库", async () => {
  workspaceGit = true;
});

Given("当前工作区不是 git 仓库", async () => {
  fixtureName = "chat-lifecycle";
  workspaceGit = false;
});

Given("agent 会返回普通助手回复", async () => {
  fixtureName = "chat-lifecycle";
});

Given("agent 会更新 workspace status 文档", async () => {
  fixtureName = "workspace-artifact";
});

Given("agent 会执行失败的 write 工具", async () => {
  fixtureName = "tool-failure";
});

When("我打开 Pi Web UI", async ({ page }) => {
  const harness = await startPiWebUi(fixtureName, { git: workspaceGit });
  setHarness(harness);
  await page.goto(harness.pageUrl);
  await expect(page.getByPlaceholder("Message Pi...")).toBeVisible();
});

When("我让 agent 更新 workspace status 文档", async ({ page }) => {
  await page.getByPlaceholder("Message Pi...").fill("Update the workspace status docs.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Updated the workspace status docs.")).toBeVisible({ timeout: 30_000 });
});

When("我发送消息 {string}", async ({ page }, message: string) => {
  await page.getByPlaceholder("Message Pi...").fill(message);
  await page.getByRole("button", { name: "Submit" }).click();
});

When("我刷新 Pi Web UI", async ({ page }) => {
  await page.reload();
  await expect(page.getByPlaceholder("Message Pi...")).toBeVisible();
});

Then("header 显示当前分支", async ({ page }) => {
  await expect(page.getByTestId("header-git-status")).toContainText(/main/);
});

Then("header 显示 git additions 和 deletions", async ({ page }) => {
  const chip = page.getByTestId("header-git-status");
  await expect(chip.getByText(/\+\d+/)).toBeVisible();
  await expect(chip.getByText(/-\d+/)).toBeVisible();
});

Then("header 不显示 git additions 和 deletions", async ({ page }) => {
  const chip = page.getByTestId("header-git-status");
  await expect(chip.getByText(/\+\d+/)).toHaveCount(0);
  await expect(chip.getByText(/-\d+/)).toHaveCount(0);
});

Then("header 不显示 git 状态", async ({ page }) => {
  await expect(page.getByTestId("header-git-status")).toHaveCount(0);
});

When("我打开 header 的 git 状态", async ({ page }) => {
  const chip = page.getByTestId("header-git-status");
  await expect(chip).toBeVisible();
  await expect(chip).toBeEnabled();
  await chip.click();
});

When("我再次打开 header 的 git 状态", async ({ page }) => {
  // The first click opens the right panel asynchronously; wait for it before
  // clicking the (always visible) header chip again.
  await expect(page.locator("aside")).toBeVisible();
  const chip = page.getByTestId("header-git-status");
  await expect(chip).toBeVisible();
  await expect(chip).toBeEnabled();
  await chip.click();
});

When("我隐藏右侧详情面板", async ({ page }) => {
  await page.locator("aside").getByTitle("Hide right panel").click();
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.getByTitle("Show right panel")).toBeVisible();
});

Then("右侧详情面板显示 git diff tab", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel).toContainText("Changes");
  await expect(panel).toContainText("docs/prd/workspace-status-float.md");
  await expect(panel).toContainText("+3");
  await expect(panel).toContainText("-1");
  await expect(panel).toContainText("The workspace float shows the current git branch");
});

Then("右侧详情面板只显示一个 Changes tab", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel.getByRole("button", { name: "Changes" })).toHaveCount(1);
});

When("我关闭当前右侧详情 tab", async ({ page }) => {
  await page.locator("aside").getByTitle("Close tab").click();
});

Then("右侧详情面板隐藏", async ({ page }) => {
  await expect(page.locator("aside")).toHaveCount(0);
});

Then("显示恢复详情面板按钮", async ({ page }) => {
  await expect(page.getByTitle("Show right panel")).toBeVisible();
});

Then("聊天区显示消息 {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("log").getByText(text, { exact: true })).toBeVisible();
});

Then("聊天区显示工具调用 {string}", async ({ page }, toolName: string) => {
  await expect(page.getByText(toolName).first()).toBeVisible();
});

Then("聊天区显示工具错误状态", async ({ page }) => {
  // Error tool blocks auto-expand, so the "Error" heading inside the expanded
  // tool content is only in the DOM when the failure is visible.
  await expect(page.getByRole("heading", { name: "Error" })).toBeVisible();
});

Then("输入框恢复可提交状态", async ({ page }) => {
  const submit = page.getByRole("button", { name: "Submit" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
});

When("我收起左侧边栏", async ({ page }) => {
  const leftSidebar = page.locator('[data-slot="sidebar"][data-side="left"]');
  const trigger = leftSidebar.getByRole("button", { exact: true, name: "Toggle left sidebar" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(leftSidebar).toHaveAttribute("data-state", "collapsed");
});

When("我展开左侧边栏", async ({ page }) => {
  const leftSidebar = page.locator('[data-slot="sidebar"][data-side="left"]');
  const trigger = leftSidebar.getByRole("button", { exact: true, name: "Toggle left sidebar" });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(leftSidebar).toHaveAttribute("data-state", "expanded");
});

Then("左侧边栏只显示图标列", async ({ page }) => {
  const leftSidebar = page.locator('[data-slot="sidebar"][data-side="left"]');
  await expect
    .poll(async () => {
      return leftSidebar.locator('[data-slot="sidebar-container"]').evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return Math.round(rect.width);
      });
    })
    .toBeLessThanOrEqual(64);
});

Then("左侧边栏不显示 session 列表", async ({ page }) => {
  const leftSidebar = page.locator('[data-slot="sidebar"][data-side="left"]');
  await expect(leftSidebar.getByText("Agent Alpha", { exact: true })).toBeHidden();
});

Then("左侧边栏显示 agent session 列表", async ({ page }) => {
  const leftSidebar = page.locator('[data-slot="sidebar"][data-side="left"]');
  await expect(leftSidebar.getByText("Agent Alpha", { exact: true })).toBeVisible();
});

Then("聊天输入框仍然完整可见", async ({ page }) => {
  const input = page.getByPlaceholder("Message Pi...");
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  const box = await input.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
});

After(async () => {
  const harness = getHarness();
  await harness?.stop();
  setHarness(null);
  workspaceGit = true;
});
