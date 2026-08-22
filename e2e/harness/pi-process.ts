import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export type PiWebUiHarness = {
  pageUrl: string;
  port: number;
  workspaceDir: string;
  /** Spawn an additional Pi agent that connects to the same hub. */
  addAgent: (name: string) => Promise<void>;
  stop: () => Promise<void>;
};

export type PiWebUiHarnessOptions = {
  git?: boolean;
};

export async function startPiWebUi(fixtureName: string, options: PiWebUiHarnessOptions = {}): Promise<PiWebUiHarness> {
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
  if (options.git !== false) prepareGitWorkspace(workspaceDir);

  // ── Hub process (ADR 0012): node dist-hub/hub/cli.js ──────────────────
  // Explicit --host/--port args; strip legacy PI_WEB_UI_* env so the CLI's
  // env-overrides-argv behavior cannot pick up stale values.
  const hubEnv = { ...process.env };
  delete hubEnv.PI_WEB_UI_HOST;
  delete hubEnv.PI_WEB_UI_PORT;
  delete hubEnv.PI_WEB_UI_STATIC_DIR;
  const hubOutput: string[] = [];
  const hubProcess = spawn("node", [path.join(repoRoot, "dist-hub/hub/cli.js"), "--host=127.0.0.1", `--port=${port}`], {
    env: hubEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  captureProcessOutput(hubProcess, hubOutput);
  await waitForHttp(`http://127.0.0.1:${port}/`, hubProcess, hubOutput, "hub");

  // ── Pi process: rpc + faux provider + connect-out extension ───────────
  const piEnv = { ...process.env };
  delete piEnv.PI_WEB_UI_HOST;
  delete piEnv.PI_WEB_UI_PORT;
  delete piEnv.PI_WEB_UI_STATIC_DIR;
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
      "Agent Alpha",
      "--approve",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--extension",
      path.join(repoRoot, "e2e/fixtures/faux-provider-extension.ts"),
      "--extension",
      path.join(repoRoot, "extensions/pi-web-ui.ts"),
    ],
    {
      cwd: workspaceDir,
      env: {
        ...piEnv,
        PI_CODING_AGENT_DIR: agentDir,
        PI_E2E: "1",
        PI_OFFLINE: "1",
        PI_WEB_UI_HUB: `ws://127.0.0.1:${port}/ws/extension`,
        PI_WEB_UI_E2E_FIXTURE: fixtureName,
        PI_WEB_UI_E2E_EXTERNAL_ARTIFACT: path.join(externalDir, "external-skill.md"),
      },
    },
  );

  captureProcessOutput(piProcess, processOutput);

  // Additional Pi agents sharing the same hub (multi-agent scenarios).
  const extraAgents: Array<{ process: ChildProcessWithoutNullStreams; output: string[]; name: string }> = [];

  // Soft wait: give the extension time to connect to the hub before the
  // browser opens the page. UI steps then poll for the agent to appear
  // (the hub broadcasts hub:sessions when the extension handshakes).
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (piProcess.exitCode !== null) {
    throw new Error(`pi exited before connecting to hub:\n${processOutput.join("")}`);
  }

  const spawnAgent = (name: string, index: number) => {
    const workspaceB = path.join(tempRoot, `workspace-${index}`);
    const sessionDirB = path.join(tempRoot, `sessions-${index}`);
    const agentDirB = path.join(tempRoot, `agent-${index}`);
    mkdirSync(workspaceB, { recursive: true });
    mkdirSync(sessionDirB, { recursive: true });
    mkdirSync(agentDirB, { recursive: true });
    const output: string[] = [];
    const agentProcess = spawn(
      process.env.PI_E2E_BIN || "pi",
      [
        "--mode",
        "rpc",
        "--model",
        "faux/faux-1",
        "--api-key",
        "faux-key",
        "--session-dir",
        sessionDirB,
        "--name",
        name,
        "--approve",
        "--no-skills",
        "--no-prompt-templates",
        "--no-context-files",
        "--extension",
        path.join(repoRoot, "e2e/fixtures/faux-provider-extension.ts"),
        "--extension",
        path.join(repoRoot, "extensions/pi-web-ui.ts"),
      ],
      {
        cwd: workspaceB,
        env: {
          ...piEnv,
          PI_CODING_AGENT_DIR: agentDirB,
          PI_E2E: "1",
          PI_OFFLINE: "1",
          PI_WEB_UI_HUB: `ws://127.0.0.1:${port}/ws/extension`,
          PI_WEB_UI_E2E_FIXTURE: fixtureName,
          PI_WEB_UI_E2E_EXTERNAL_ARTIFACT: path.join(externalDir, "external-skill.md"),
        },
      },
    );
    captureProcessOutput(agentProcess, output);
    extraAgents.push({ process: agentProcess, output, name });
    return agentProcess;
  };

  return {
    pageUrl: `http://127.0.0.1:${port}`,
    port,
    workspaceDir,
    async addAgent(name: string) {
      const agentProcess = spawnAgent(name, extraAgents.length + 1);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (agentProcess.exitCode !== null) {
        const entry = extraAgents[extraAgents.length - 1];
        throw new Error(`added agent "${name}" exited before connecting to hub:\n${entry.output.join("")}`);
      }
    },
    async stop() {
      for (const agent of [...extraAgents].reverse()) await stopProcess(agent.process);
      await stopProcess(piProcess);
      await stopProcess(hubProcess);
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

async function waitForHttp(
  url: string,
  process: ChildProcessWithoutNullStreams,
  processOutput: string[],
  label: string,
  timeoutMs = 30_000,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (process.exitCode !== null) {
      throw new Error(`${label} exited before serving ${url}:\n${processOutput.join("")}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}:\n${processOutput.join("")}`);
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
