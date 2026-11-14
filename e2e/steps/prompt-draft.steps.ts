import { expect, type Page } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { world } from "./world";

const { Given, When, Then } = createBdd();
const draft = "Keep this as my next draft.";
const imageName = "draft.png";
const composer = (page: Page) => page.getByRole("textbox", { name: "Message Pi", exact: true });

async function prepareDraft(page: Page) {
  await composer(page).fill(draft);
  await page.locator('input[type="file"]').setInputFiles({
    name: imageName,
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByRole("img", { name: imageName })).toBeVisible();
}

Given("Pi runs an eight second draft check", () => {
  world.fixture = "prompt-draft";
});

When("I prepare an illustrated draft while Pi is working", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await prepareDraft(page);
});

When("I press Enter in the draft", async ({ page }) => {
  await composer(page).press("Enter");
});

Then("the illustrated draft is still in the composer", async ({ page }) => {
  await expect(composer(page)).toHaveValue(draft);
  await expect(page.getByRole("img", { name: imageName })).toBeVisible();
});

Then("another client cannot queue a prompt through Web UI", async ({ page }) => {
  const responses = await page.evaluate(async () => {
    const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
    try {
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("WebSocket failed"));
      });
      const results: { ok: boolean; error?: string }[] = [];
      for (const method of ["prompt", "steer", "follow_up"]) {
        results.push(
          await new Promise<{ ok: boolean; error?: string }>((resolve) => {
            socket.onmessage = (event) => {
              const response = JSON.parse(event.data);
              if (response.type === "res" && response.id === method) resolve(response);
            };
            socket.send(JSON.stringify({ type: "req", id: method, method, params: { message: "Do not queue this." } }));
          }),
        );
      }
      return results;
    } finally {
      socket.close();
    }
  });
  expect(responses).toMatchObject([
    { ok: false, error: "Agent is busy. Wait for Pi to finish before sending." },
    { ok: false, error: "Unknown method: steer" },
    { ok: false, error: "Unknown method: follow_up" },
  ]);
});

When("Pi finishes the draft check", async ({ page }) => {
  await expect(page.getByRole("log").getByText("The draft check is complete.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
});

Then("the illustrated draft has not been sent", async ({ page }) => {
  await expect(composer(page)).toHaveValue(draft);
  await expect(page.getByRole("img", { name: imageName })).toBeVisible();
  await expect(page.getByRole("log")).not.toContainText(draft);
  await world.harness?.command("/wait-test-idle");
  // A reload rebuilds the transcript from this same server-side snapshot.
  const entries = await page.evaluate(async () => {
    const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
    try {
      return await new Promise<unknown>((resolve, reject) => {
        socket.onerror = () => reject(new Error("WebSocket failed"));
        socket.onopen = () => socket.send(JSON.stringify({ type: "req", id: "messages", method: "get_messages" }));
        socket.onmessage = (event) => {
          const response = JSON.parse(event.data);
          if (response.type === "res" && response.id === "messages") resolve(response.result);
        };
      });
    } finally {
      socket.close();
    }
  });
  expect(JSON.stringify(entries)).not.toContain(draft);
});

When("I explicitly submit the draft", async ({ page }) => {
  await page.getByRole("button", { name: "Submit", exact: true }).click();
});

Then("the draft attachments are cleared", async ({ page }) => {
  await expect(composer(page)).toHaveValue("");
  await expect(page.locator("footer").getByRole("img", { name: imageName })).toHaveCount(0);
});

When("I stop Pi", async ({ page }) => {
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});

Then("the transcript does not contain the draft", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  await expect(page.getByRole("log")).not.toContainText(draft);
});

When("I disconnect with an illustrated draft", async ({ page, context }) => {
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
  await prepareDraft(page);
  await context.setOffline(true);
  // Closing the actual browser sockets makes the offline transition deterministic.
  await world.harness?.command("/webui-stop");
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
});

When("I reconnect to Pi", async ({ page, context }) => {
  await world.harness?.command("/webui");
  await context.setOffline(false);
  await expect(page.getByText("connected", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
});
