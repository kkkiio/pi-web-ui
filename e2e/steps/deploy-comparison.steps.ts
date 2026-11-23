import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { saveReadmeImage } from "../harness/readme-image";
import { world } from "./world";

const { Given, Then } = createBdd();

Given("Pi is ready to compare deployment strategies", () => {
  world.fixture = "deploy-comparison";
});

Then("I see the deployment strategies side by side", async ({ page }) => {
  const transcript = page.getByRole("log");
  const rolling = transcript.getByText("Rolling deploy", { exact: true });
  const blueGreen = transcript.getByText("Blue-green deploy", { exact: true });
  await expect(rolling).toBeVisible();
  await expect(blueGreen).toBeVisible();
  await expect(transcript.getByText("Mid-rollout", { exact: true })).toBeVisible();
  await expect(transcript.getByText("Switch traffic", { exact: true })).toBeVisible();
  const [left, right] = await Promise.all([rolling.boundingBox(), blueGreen.boundingBox()]);
  expect(left?.y).toBe(right?.y);
  expect(right?.x).toBeGreaterThan(left?.x ?? 0);
});

Then("I capture the deployment comparison for the README", async ({ page }) => {
  const question = page.locator('[id^="user-message-"]').last();
  const comparison = page.getByRole("log").locator(".dil-root");
  await expect(question).toBeInViewport({ ratio: 1 });
  await expect(comparison).toBeInViewport({ ratio: 1 });
  const [prompt, answer] = await Promise.all([question.boundingBox(), comparison.boundingBox()]);
  if (!prompt || !answer) throw new Error("The deployment conversation is missing from the viewport.");

  const padding = 20;
  const x = Math.floor(Math.min(prompt.x, answer.x) - padding);
  const y = Math.floor(prompt.y - padding);
  const right = Math.ceil(Math.max(prompt.x + prompt.width, answer.x + answer.width) + padding);
  const bottom = Math.ceil(answer.y + answer.height + padding);

  await saveReadmeImage(page, "dil-deploy-comparison", { x, y, width: right - x, height: bottom - y });
});
