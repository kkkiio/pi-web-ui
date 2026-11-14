import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

export type PiWebUiHarness = {
  pageUrl: string;
  port: number;
  workspaceDir: string;
  stop: () => Promise<void>;
  enableEditing: () => Promise<void>;
  command: (message: string) => Promise<void>;
  /** Wait until the session file on disk contains `text`. Rewinds are persisted
   * asynchronously, so a reload right after them can otherwise snapshot an older
   * session and render an empty transcript. */
  waitForSessionText: (text: string) => Promise<void>;
};

export type PiWebUiHarnessOptions = {
  git?: boolean;
  sessionName?: string;
  enableEditing?: boolean;
  cancelNavigation?: boolean;
  autoStart?: boolean;
  conflictTool?: "before" | "after" | "inactive";
  host?: string;
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

  const processOutput: string[] = [];
  const piProcess = spawn(
    process.env.PI_E2E_BIN || path.join(repoRoot, "node_modules/.bin/pi"),
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
      options.sessionName ?? "Pi Web UI E2E",
      "--approve",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      "--extension",
      path.join(repoRoot, "e2e/fixtures/faux-provider-extension.ts"),
      ...(options.conflictTool === "before" || options.conflictTool === "inactive"
        ? ["--extension", path.join(repoRoot, "e2e/fixtures/conflicting-question-extension.ts")]
        : []),
      "--extension",
      path.join(repoRoot, "extensions/mirror-server.ts"),
      ...(options.conflictTool === "after"
        ? ["--extension", path.join(repoRoot, "e2e/fixtures/conflicting-question-extension.ts")]
        : []),
    ],
    {
      cwd: workspaceDir,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_E2E: "1",
        PI_WEB_UI_E2E_CANCEL_NAVIGATION: options.cancelNavigation ? "1" : "0",
        PI_WEB_UI_E2E_CONFLICT_INACTIVE: options.conflictTool === "inactive" ? "1" : "0",
        PI_OFFLINE: "1",
        PI_WEB_UI_HOST: options.host ?? "127.0.0.1",
        PI_WEB_UI_PORT: String(port),
        PI_WEB_UI_STATIC_DIR: path.join(repoRoot, "dist"),
        PI_WEB_UI_E2E_FIXTURE: fixtureName,
        PI_WEB_UI_E2E_EXTERNAL_ARTIFACT: path.join(externalDir, "external-skill.md"),
      },
    },
  );

  captureProcessOutput(piProcess, processOutput);

  let commandId = 0;
  const command = async (message: string) => {
    const id = `command-${++commandId}`;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        piProcess.stdout.off("data", onData);
        reject(new Error(`${message} command timed out:\n${processOutput.join("")}`));
      }, 10000);
      let output = "";
      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        for (const line of output.split("\n")) {
          let response: { type?: string; id?: string; success?: boolean; error?: string };
          try {
            response = JSON.parse(line);
          } catch {
            continue;
          }
          if (response.type !== "response" || response.id !== id) continue;
          clearTimeout(timer);
          piProcess.stdout.off("data", onData);
          if (response.success === false) reject(new Error(response.error || `${message} failed`));
          else resolve();
          return;
        }
      };
      piProcess.stdout.on("data", onData);
      piProcess.stdin.write(`${JSON.stringify({ id, type: "prompt", message })}\n`);
    });
  };
  const enableEditing = () => command("/webui");
  if (options.autoStart !== false) {
    await command("/webui");
    await waitForWebUi(`http://127.0.0.1:${port}`, piProcess, processOutput);
  }
  if (options.enableEditing) await enableEditing();
  const waitForSessionText = async (text: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const files = readdirSync(sessionDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath ?? sessionDir, entry.name));
      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        if (readFileSync(file, "utf8").includes(text)) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`session did not persist: ${text}`);
  };

  return {
    command,
    enableEditing,
    waitForSessionText,
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
