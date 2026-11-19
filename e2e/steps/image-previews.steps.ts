import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { world } from "./world";

const { Given, When, Then } = createBdd();

Given("Pi will read a PNG image from the workspace", () => {
  world.fixture = "image-previews";
});

When("I send an image attachment without text", async ({ page }) => {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create a canvas for the PNG fixture");
    ctx.fillStyle = "#064e3b";
    ctx.fillRect(0, 0, 640, 320);
    ctx.fillStyle = "#a7f3d0";
    ctx.font = "48px sans-serif";
    ctx.fillText("Image preview", 48, 168);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const buffer = Buffer.from(data, "base64");
  if (!world.harness) throw new Error("Pi Web UI is not running");
  await writeFile(path.join(world.harness.workspaceDir, "preview.png"), buffer);
  await page.getByLabel("Upload files").setInputFiles({ name: "preview.png", mimeType: "image/png", buffer });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});

async function expectPreview(page: Page, trigger: Locator) {
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Image 1" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img")).toHaveJSProperty("naturalWidth", 640);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

Then("the user attachment opens as an image preview", async ({ page }) => {
  const user = page.getByRole("log").locator(".is-user");
  await expectPreview(page, user.getByRole("button", { name: "View image 1", exact: true }));
});

Then("the read tool shows its result text and an image preview", async ({ page }) => {
  const log = page.getByRole("log");
  await expect(log.getByText("The image was read successfully.", { exact: true })).toBeVisible();
  await log.getByRole("button", { name: /^1 tool call/ }).click();
  const tool = log.getByRole("button", { name: /\bread\b.*preview\.png/i });
  await tool.click();
  await expect(log.getByText(/Read image file/)).toBeVisible();
  await expect(log.getByText(/iVBORw0KGgo/)).toHaveCount(0);
  await expectPreview(
    page,
    log
      .locator(":not(.is-user) > [data-slot=collapsible-content]")
      .getByRole("button", { name: "View image 1", exact: true }),
  );
});
