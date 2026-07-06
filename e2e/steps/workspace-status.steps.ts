import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

const { Given, When, Then, After } = createBdd();

let fixtureName = "chat-lifecycle";
let workspaceGit = true;
let harness: PiWebUiHarness | null = null;

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

Given("agent 会写入 workspace 外 Markdown artifact", async () => {
  fixtureName = "external-artifact";
});

Given("agent 会重复写入同一个 Markdown artifact", async () => {
  fixtureName = "duplicate-artifact";
});

Given("agent 会执行失败的 write 工具", async () => {
  fixtureName = "tool-failure";
});

When("我打开 Pi Web UI", async ({ page }) => {
  harness = await startPiWebUi(fixtureName, { git: workspaceGit });
  await page.goto(harness.pageUrl);
  await expect(page.getByPlaceholder("Message Pi...")).toBeVisible();
});

When("我让 agent 更新 workspace status 文档", async ({ page }) => {
  await page.getByPlaceholder("Message Pi...").fill("Update the workspace status docs.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Updated the workspace status docs.")).toBeVisible({ timeout: 30_000 });
});

When("我让 agent 更新 external skill 文档", async ({ page }) => {
  await page.getByPlaceholder("Message Pi...").fill("Update the external skill docs.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Updated the external skill docs.")).toBeVisible({ timeout: 30_000 });
});

When("我让 agent 重复更新同一个 artifact", async ({ page }) => {
  await page.getByPlaceholder("Message Pi...").fill("Update the same artifact twice.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Updated the same artifact twice.")).toBeVisible({ timeout: 30_000 });
});

When("我发送消息 {string}", async ({ page }, message: string) => {
  await page.getByPlaceholder("Message Pi...").fill(message);
  await page.getByRole("button", { name: "Submit" }).click();
});

When("我刷新 Pi Web UI", async ({ page }) => {
  await page.reload();
  await expect(page.getByPlaceholder("Message Pi...")).toBeVisible();
});

Then("Workspace Float 显示当前分支", async ({ page }) => {
  await expect(page.getByTestId("workspace-status-float").getByTestId("workspace-git-row")).toContainText(/main/);
});

Then("Workspace Float 显示 git additions 和 deletions", async ({ page }) => {
  const float = page.getByTestId("workspace-status-float");
  await expect(float.getByText(/\+\d+/)).toBeVisible();
  await expect(float.getByText(/-\d+/)).toBeVisible();
});

Then("Workspace Float 不显示 git additions 和 deletions", async ({ page }) => {
  const float = page.getByTestId("workspace-status-float");
  await expect(float.getByText(/\+\d+/)).toHaveCount(0);
  await expect(float.getByText(/-\d+/)).toHaveCount(0);
});

Then("Workspace Float 显示 git 状态不可用", async ({ page }) => {
  const row = page.getByTestId("workspace-status-float").getByTestId("workspace-git-row");
  await expect(row).toContainText("No git repository");
});

Then("Workspace Float 显示没有变更", async ({ page }) => {
  const row = page.getByTestId("workspace-status-float").getByTestId("workspace-git-row");
  await expect(row).toContainText("No changes");
});

Then("Workspace Float 显示 Markdown artifact", async ({ page }) => {
  await expect(
    page.getByTestId("workspace-status-float").getByTestId("workspace-artifact-row").filter({
      hasText: "workspace-status-float.md",
    }),
  ).toBeVisible();
});

Then("Workspace Float 显示 workspace 外 Markdown artifact", async ({ page }) => {
  await expect(
    page.getByTestId("workspace-status-float").getByTestId("workspace-artifact-row").filter({
      hasText: "external-skill.md",
    }),
  ).toBeVisible();
});

Then("Workspace Float 只显示一个 Markdown artifact", async ({ page }) => {
  await expect(
    page.getByTestId("workspace-status-float").getByTestId("workspace-artifact-row").filter({
      hasText: "workspace-status-float.md",
    }),
  ).toHaveCount(1);
});

When("我打开 Markdown artifact", async ({ page }) => {
  await page
    .getByTestId("workspace-status-float")
    .getByTestId("workspace-artifact-row")
    .filter({ hasText: "workspace-status-float.md" })
    .click();
});

When("我打开 workspace 外 Markdown artifact", async ({ page }) => {
  await page
    .getByTestId("workspace-status-float")
    .getByTestId("workspace-artifact-row")
    .filter({ hasText: "external-skill.md" })
    .click();
});

Then("右侧详情面板显示 artifact 文件内容", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel).toContainText("workspace-status-float.md");
  await expect(panel).toContainText("current git branch and readable diff status");
});

Then("右侧详情面板显示 workspace 外 artifact 文件内容", async ({ page }) => {
  const panel = page.locator("aside");
  await expect(panel).toContainText("external-skill.md");
  await expect(panel).toContainText("outside the git workspace");
});

When("我隐藏右侧详情面板", async ({ page }) => {
  await page.getByTitle("Hide right panel").click();
  await expect(page.getByTitle("Show right panel")).toBeVisible();
});

When("我打开 Changes 行", async ({ page }) => {
  await page.getByTestId("workspace-status-float").getByTestId("workspace-git-row").click();
});

When("我再次打开 Changes 行", async ({ page }) => {
  if (await page.getByTitle("Hide right panel").isVisible()) {
    await page.getByTitle("Hide right panel").click();
    await expect(page.getByTitle("Show right panel")).toBeVisible();
  }
  await page.getByTestId("workspace-status-float").getByTestId("workspace-git-row").click();
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
  await expect(page.getByText(/error|failed|EISDIR|directory/i)).toBeVisible();
});

Then("输入框恢复可提交状态", async ({ page }) => {
  const submit = page.getByRole("button", { name: "Submit" });
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
});

After(async () => {
  await harness?.stop();
  harness = null;
  workspaceGit = true;
});
