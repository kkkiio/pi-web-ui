import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

const { Given, When, Then, After } = createBdd();
let fixtureName = "chat-lifecycle";
let workspaceGit = true;
let cancelNavigation = false;
let harness: PiWebUiHarness | null = null;
Given("当前工作区是 git 仓库", async () => {
  workspaceGit = true;
});
Given("当前工作区不是 git 仓库", async () => {
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
  harness = await startPiWebUi(fixtureName, { git: workspaceGit, cancelNavigation });
  await page.goto(harness.pageUrl);
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
});
When("我发送消息 {string}", async ({ page }, message: string) => {
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill(message);
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});
When("我让 agent 更新 workspace status 文档", async ({ page }) => {
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill("Update the workspace status docs.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByText("Updated the workspace status docs.")).toBeVisible();
});
When("我刷新 Pi Web UI", async ({ page }) => {
  await page.reload();
});
Then("聊天区显示消息 {string}", async ({ page }, text: string) => {
  await expect(page.getByRole("log").getByText(text, { exact: true })).toBeVisible();
});
Then("聊天区显示工具调用 {string}", async ({ page }, name: string) => {
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});
Then("聊天区显示工具错误状态", async ({ page }) => {
  await expect(page.getByText(/error|failed|EISDIR|directory/i).first()).toBeVisible();
});
Then("输入框恢复可提交状态", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
});
Then("默认布局为单栏", async ({ page }) => {
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.locator('[data-slot="sidebar"]')).toHaveCount(0);
  await expect(page.getByTestId("workspace-status-float")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});
Then("Header 显示变更统计", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Open Changes" })).toContainText(/\+\d+.*−\d+/);
});
When("我打开 Changes", async ({ page }) => {
  await page.getByRole("button", { name: "Open Changes" }).click();
});
Then("右侧详情面板显示 git diff tab", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel).toContainText("docs/prd/workspace-status-float.md");
  await expect(panel).toContainText("The workspace float shows the current git branch");
});
When("我隐藏右侧详情面板", async ({ page }) => {
  await page.getByRole("button", { name: "Hide right panel", exact: true }).click();
  await expect(page.locator("aside")).toBeHidden();
});
When("我恢复右侧详情面板", async ({ page }) => {
  await page.getByRole("button", { name: "Show right panel", exact: true }).click();
});
Then("右侧详情面板只显示一个 Changes tab", async ({ page }) => {
  await expect(page.locator("aside").getByRole("button", { name: "Changes", exact: true })).toHaveCount(1);
});
Then("面板显示非 git 状态", async ({ page }) => {
  await expect(page.locator("aside")).toContainText("No git repository");
});
When("我切换到移动端", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});
Then("面板占满移动端宽度", async ({ page }) => {
  const box = await page.locator("aside").boundingBox();
  expect(box?.width).toBe(390);
});
Then("聊天输入框仍然完整可见", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
});
Then("编辑按钮不可用", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Edit message", exact: true })).toBeDisabled();
});
When("我启用行内编辑", async () => {
  await harness?.enableEditing();
});
When("我编辑并重新发送消息", async ({ page }) => {
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill("保留的草稿");
  const edit = page.getByRole("button", { name: "Edit message", exact: true });
  await expect(edit).toBeEnabled();
  await edit.click();
  await page.getByRole("textbox", { name: "Edit message", exact: true }).fill("修改后的问题");
  await page.getByRole("button", { name: "Save & Send", exact: true }).click();
});
Then("旧问题从当前对话移除", async ({ page }) => {
  await expect(page.getByRole("log").getByText("原始问题", { exact: true })).toHaveCount(0);
});
Then("底部草稿保留", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toHaveValue("保留的草稿");
});
After(async () => {
  await harness?.stop();
  harness = null;
  workspaceGit = true;
  cancelNavigation = false;
  fixtureName = "chat-lifecycle";
});

Given("导航会被 extension 取消", async () => {
  cancelNavigation = true;
});
Then("编辑失败后仍保留原对话与草稿", async ({ page }) => {
  await expect(page.getByRole("alert")).toContainText("Navigation cancelled");
  await expect(page.getByRole("textbox", { name: "Edit message", exact: true })).toHaveValue("修改后的问题");
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toHaveValue("保留的草稿");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("log").getByText("原始问题", { exact: true })).toBeVisible();
  await expect(page.getByRole("log").getByText("修改后的问题", { exact: true })).toHaveCount(0);
});

Given("agent 会在同一消息中返回文字与多个工具调用", async () => {
  fixtureName = "edit-history";
});
When("我从 Commands 展开所有工具", async ({ page }) => {
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page.getByRole("button", { name: /^Expand All Tools/ }).click();
});
Then("旧分支的文字和工具行全部移除", async ({ page }) => {
  await expect(page.getByRole("log").getByText("New branch reply", { exact: true })).toBeVisible();
  await expect(page.getByRole("log").getByText("Old branch explanation", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("log").getByText("Old branch done", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "2 tool calls", exact: true })).toHaveCount(0);
  await expect(page.getByRole("log").getByText("write", { exact: true })).toHaveCount(0);
});
