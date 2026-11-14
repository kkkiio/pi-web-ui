import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

const { Given, When, Then, After } = createBdd();
let harness: PiWebUiHarness | null = null;

Given("Pi will think and run a command before replying", async ({ page }) => {
  harness = await startPiWebUi("process-group");
  await page.goto(harness.pageUrl);
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
});

When("I send a prompt and open the Thinking process group", async ({ page }) => {
  await page.getByRole("textbox", { name: "Message Pi", exact: true }).fill("Check the process.");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const group = page.getByRole("button", { name: "Thinking…", exact: true });
  await expect(group).toHaveAttribute("aria-expanded", "false");
  const preview = page.getByRole("button", { name: "Thinking… · Inspecting the process", exact: true });
  await expect(preview).toHaveAttribute("aria-expanded", "false");
  await expect(preview).toBeVisible();
  await preview.click();
  const reasoningRow = page.getByRole("button", { name: "Thinking... · Inspecting the process", exact: true });
  await expect(reasoningRow).toHaveAttribute("aria-expanded", "false");
  await reasoningRow.click();
});

Then("the group stays open as the command starts and completes", async ({ page }) => {
  const thinking = page.getByText("I will inspect the process before reporting the result.", { exact: true });
  await expect(page.getByRole("button", { name: /^Running sleep 2/ })).toHaveAttribute("aria-expanded", "true");
  await expect(thinking).toBeVisible();
  const toolRow = page.getByRole("button", { name: /bash.*sleep 2/ });
  await expect(toolRow).toHaveAttribute("aria-expanded", "false");
  await toolRow.click();
  await expect(page.getByText("The process check passed.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1 tool call", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(thinking).toBeVisible();
  await expect(toolRow).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Process check passed", { exact: true })).toBeVisible();
});

After(async () => {
  await harness?.stop();
  harness = null;
});
