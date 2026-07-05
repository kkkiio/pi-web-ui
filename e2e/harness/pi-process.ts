import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export type PiWebUiHarness = {
  pageUrl: string;
  port: number;
  workspaceDir: string;
  stop: () => Promise<void>;
};

export async function startPiWebUi(fixtureName: string): Promise<PiWebUiHarness> {
  const repoRoot = path.resolve(__dirname, "../..");
  const tempRoot = mkdtempSync(path.join(tmpdir(), "pi-web-ui-e2e-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const externalDir = path.join(tempRoot, "external");
  const agentDir = path.join(tempRoot, "agent");
  const sessionDir = path.join(tempRoot, "sessions");
  const port = await getFreePort();

  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(externalDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  prepareGitWorkspace(workspaceDir);

  const processOutput: string[] = [];
  const piProcess = spawn(
    process.env.PI_E2E_BIN || "pi",
    [
      "--mode",
      "rpc",
      "--model",
      "faux/faux-1",
      "--api-key",
      "faux-key",
      "--session-dir",
      sessionDir,
      "--name",
      "Pi Web UI E2E",
      "--approve",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--extension",
      path.join(repoRoot, "e2e/fixtures/faux-provider-extension.ts"),
      "--extension",
      path.join(repoRoot, "extensions/mirror-server.ts"),
    ],
    {
      cwd: workspaceDir,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_E2E: "1",
        PI_OFFLINE: "1",
        PI_WEB_UI_HOST: "127.0.0.1",
        PI_WEB_UI_PORT: String(port),
        PI_WEB_UI_STATIC_DIR: path.join(repoRoot, "dist"),
        PI_WEB_UI_E2E_FIXTURE: fixtureName,
        PI_WEB_UI_E2E_EXTERNAL_ARTIFACT: path.join(externalDir, "external-skill.md"),
      },
    },
  );

  captureProcessOutput(piProcess, processOutput);
  await waitForWebUi(`http://127.0.0.1:${port}`, piProcess, processOutput);

  return {
    pageUrl: `http://127.0.0.1:${port}`,
    port,
    workspaceDir,
    async stop() {
      await stopProcess(piProcess);
      if (existsSync(tempRoot)) rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

function prepareGitWorkspace(workspaceDir: string) {
  const prdDir = path.join(workspaceDir, "docs/prd");
  mkdirSync(prdDir, { recursive: true });
  writeFileSync(
    path.join(prdDir, "workspace-status-float.md"),
    ["# PRD: Workspace Status Float", "", "Baseline content before the E2E agent update."].join("\n"),
    "utf8",
  );
  execFileSync("git", ["init", "-b", "main"], { cwd: workspaceDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "pi-web-ui-e2e@example.test"], { cwd: workspaceDir });
  execFileSync("git", ["config", "user.name", "Pi Web UI E2E"], { cwd: workspaceDir });
  execFileSync("git", ["add", "."], { cwd: workspaceDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "Initial workspace"], { cwd: workspaceDir, stdio: "ignore" });
}

function captureProcessOutput(process: ChildProcessWithoutNullStreams, output: string[]) {
  const capture = (chunk: Buffer) => {
    output.push(chunk.toString("utf8"));
    if (output.length > 200) output.splice(0, output.length - 200);
  };
  process.stdout.on("data", capture);
  process.stderr.on("data", capture);
}

async function waitForWebUi(
  url: string,
  process: ChildProcessWithoutNullStreams,
  processOutput: string[],
  timeoutMs = 20_000,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (process.exitCode !== null) {
      throw new Error(`pi exited before Web UI started:\n${processOutput.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}:\n${processOutput.join("")}`);
}

async function stopProcess(process: ChildProcessWithoutNullStreams) {
  if (process.exitCode !== null) return;
  process.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => process.once("exit", resolve)),
    new Promise((resolve) =>
      setTimeout(() => {
        if (process.exitCode === null) process.kill("SIGKILL");
        resolve(undefined);
      }, 2_000),
    ),
  ]);
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}
