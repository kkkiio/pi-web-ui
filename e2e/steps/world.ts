import { expect, type Page } from "@playwright/test";
import { type PiWebUiHarness, startPiWebUi } from "../harness/pi-process";

export type FixtureName = "chat-lifecycle" | "workspace-artifact" | "tool-failure" | "edit-history";

/** Shared state for one scenario. Step files read and write this instead of keeping
 * their own copies, because every step file is registered globally. */
export const world = {
  fixture: "chat-lifecycle" as FixtureName,
  workspaceGit: true,
  cancelNavigation: false,
  harness: null as PiWebUiHarness | null,
};

export async function openWebUi(page: Page) {
  world.harness = await startPiWebUi(world.fixture, {
    git: world.workspaceGit,
    cancelNavigation: world.cancelNavigation,
  });
  await page.goto(world.harness.pageUrl);
  await expect(page.getByRole("textbox", { name: "Message Pi", exact: true })).toBeVisible();
}

export async function stopWebUi() {
  await world.harness?.stop();
  world.harness = null;
  world.fixture = "chat-lifecycle";
  world.workspaceGit = true;
  world.cancelNavigation = false;
}
