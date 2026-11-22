import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";
import { startPiWebUi } from "../harness/pi-process";
import { world } from "./world";

const { Given, When, Then } = createBdd();

Given("a lazy Web UI session", async () => {
  world.harness = await startPiWebUi("chat-lifecycle", { autoStart: false, sessionName: "Untitled" });
});

Given("a lazy Web UI session with an unavailable bind address", async () => {
  world.harness = await startPiWebUi("chat-lifecycle", { autoStart: false, host: "203.0.113.123" });
});

When("I have two terminal conversation turns", async () => {
  await world.harness?.command("Please explain the existing project structure.");
  await world.harness?.command("/wait-test-idle");
  await world.harness?.command("Help me choose an approach before changing files.");
  await world.harness?.command("/wait-test-idle");
});

Then("terminal tools and instructions are unchanged", async () => {
  await world.harness?.command("/assert-terminal-unchanged");
});

When("I run webui", async () => {
  await world.harness?.command("/webui");
});

When("I stop webui", async () => {
  await world.harness?.command("/webui-stop");
});

When("I replace the session using {string}", async ({ page: _page }, command: string) => {
  await world.harness?.command(command);
});

Then("the Web UI server is listening", async ({ request }) => {
  const response = await request.get(world.harness?.pageUrl ?? "");
  await expect(response).toBeOK();
});

Then("the Web UI server is not listening", async () => {
  await expect(async () => {
    await expect(fetch(world.harness?.pageUrl ?? "")).rejects.toThrow();
  }).toPass();
});
