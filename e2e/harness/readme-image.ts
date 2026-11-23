import path from "node:path";
import type { Page, PageScreenshotOptions } from "@playwright/test";

/**
 * README images are a by-product of the `@readme` scenarios: every E2E run rewrites
 * `docs/images/<name>.png`, and a changed image shows up in the git diff for review.
 * They are not snapshot assertions.
 */
export async function saveReadmeImage(page: Page, name: string, clip?: PageScreenshotOptions["clip"]) {
  // Park the pointer so hover styles do not leak into the image.
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: path.resolve(__dirname, "../../docs/images", `${name}.png`),
    animations: "disabled",
    caret: "hide",
    clip,
  });
}
