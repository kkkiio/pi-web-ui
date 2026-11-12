import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("dry-run reports relative paths without writing", () => {
  const output = mkdtempSync(join(tmpdir(), "export-test-"));
  try {
    const result = execFileSync(process.execPath, ["export.mjs", output, "--dry-run"], { encoding: "utf8" });
    assert.equal(result.trim(), "reports/summary.csv");
    assert.deepEqual(readdirSync(output), []);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
