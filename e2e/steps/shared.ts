import type { PiWebUiHarness } from "../harness/pi-process";

// Shared harness state across step-definition modules. "我打开 Pi Web UI"
// lives in workspace-status.steps.ts, while multi-agent steps need the same
// harness instance to spawn extra agents.
let harness: PiWebUiHarness | null = null;

export function getHarness(): PiWebUiHarness | null {
  return harness;
}

export function setHarness(next: PiWebUiHarness | null): void {
  harness = next;
}
