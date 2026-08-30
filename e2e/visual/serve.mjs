#!/usr/bin/env node
/**
 * Visual scenario gallery for Pi Web UI.
 *
 * Starts a real hub + real pi (rpc mode, faux provider) in a prepared temp
 * workspace, drives it into a fixed UI state, prints the URL, and stays alive
 * for manual/agent inspection. Ctrl-C stops everything and removes the temp dir.
 *
 *   node e2e/visual/serve.mjs <scenario>        # see SCENARIOS below
 *
 * Requires dist/ and dist-hub/ builds (the `just visual <name>` recipe builds
 * them first).
 */
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());

// ── Scenario registry ────────────────────────────────────────────────────────
// workspace: "clean-git" | "messy-git" | "none"
// fixture:   key in e2e/fixtures/faux-provider-extension.ts (faux provider)
// prompt:    sent over rpc stdin after connect; faux provider answers canned
// lookAt:    hints printed for whoever inspects the page
const SCENARIOS = {
  "chat-rich": {
    description: "Thinking blocks + bash tool + image tool result + final answer, clean git workspace",
    workspace: "clean-git",
    samplePng: true,
    fixture: "visual-chat-rich",
    prompt: "run the visual fixture",
    lookAt: [
      "thinking 块的 chevron 与 tool 块右边界对齐，收起朝右、展开朝下",
      "bash 块运行后已自动收起；read 块带图片自动展开，IMAGES 区有缩略图",
      "点击缩略图打开 lightbox，右上角关闭按钮不遮挡图片",
      "header 有 git chip（main，无 +/-）；输入区工具区有 model/thinking 控件",
    ],
  },
  "tool-error": {
    description: "Failing write tool — error block auto-expanded and stays expanded",
    workspace: "clean-git",
    fixture: "tool-failure",
    prompt: "trigger the failing tool",
    lookAt: ["write 工具块自动展开，显示 Error 标题和红色错误内容", "手动收起后不会再被自动展开"],
  },
  "git-clean": {
    description: "Git repo without changes",
    workspace: "clean-git",
    fixture: "chat-lifecycle",
    prompt: null,
    lookAt: ["header git chip 显示 main，没有 +/- 统计", "点击 chip 打开右面板显示 No changes"],
  },
  "git-messy": {
    description: "Git repo with modified + deleted + untracked text + untracked binary files",
    workspace: "messy-git",
    fixture: "chat-lifecycle",
    prompt: null,
    lookAt: [
      "header git chip 显示 main 和 +/- 统计",
      "点击 chip：右面板渲染全部四个文件卡片，不白屏",
      "删除/新增/修改文件渲染 diff 视图，二进制文件显示 fallback 提示",
    ],
  },
  "no-git": {
    description: "Plain workspace without git",
    workspace: "none",
    fixture: "chat-lifecycle",
    prompt: null,
    lookAt: ["header 不显示 git chip", "页面其余部分正常"],
  },
};

// ── Args ─────────────────────────────────────────────────────────────────────
const scenarioName = process.argv[2];
const scenario = SCENARIOS[scenarioName];
if (!scenario) {
  console.error(`Unknown scenario: ${scenarioName ?? "(none)"}\nAvailable:`);
  for (const [name, s] of Object.entries(SCENARIOS)) console.error(`  ${name.padEnd(12)} ${s.description}`);
  process.exit(1);
}

for (const dir of ["dist", "dist-hub"]) {
  if (!existsSync(path.join(repoRoot, dir))) {
    console.error(`${dir}/ missing — run \`just build\` (or use \`just visual ${scenarioName}\`) first.`);
    process.exit(1);
  }
}

// ── Workspace ────────────────────────────────────────────────────────────────
const tempRoot = mkdtempSync(path.join(tmpdir(), "pi-web-ui-visual-"));
const workspaceDir = path.join(tempRoot, "workspace");
mkdirSync(workspaceDir, { recursive: true });
mkdirSync(path.join(tempRoot, "sessions"), { recursive: true });
mkdirSync(path.join(tempRoot, "agent"), { recursive: true });

if (scenario.samplePng) {
  copyFileSync(path.join(repoRoot, "public/icons/pi-web-ui-512.png"), path.join(workspaceDir, "sample.png"));
}
if (scenario.workspace !== "none") {
  const git = (args) => execFileSync("git", args, { cwd: workspaceDir, stdio: "ignore" });
  writeFileSync(path.join(workspaceDir, "notes.md"), "# Notes\n\nline one\nline two\nline three\n");
  if (scenario.workspace === "messy-git") {
    writeFileSync(path.join(workspaceDir, "to-delete.md"), "# Delete me\n\ncontent\n");
  }
  git(["init", "-b", "main"]);
  git(["config", "user.email", "pi-web-ui-visual@example.test"]);
  git(["config", "user.name", "Pi Web UI Visual"]);
  git(["add", "."]);
  git(["commit", "-m", "initial"]);
  if (scenario.workspace === "messy-git") {
    writeFileSync(path.join(workspaceDir, "notes.md"), "# Notes\n\nline one changed\nline two\nline four added\n");
    execFileSync("rm", [path.join(workspaceDir, "to-delete.md")]);
    writeFileSync(path.join(workspaceDir, "untracked.md"), "# New\n\nuntracked content\n");
    writeFileSync(path.join(workspaceDir, "blob.bin"), Buffer.from([0, 1, 2, 0, 255, 0, 254]));
  }
}

// ── Processes ────────────────────────────────────────────────────────────────
const procs = [];
function killAll() {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {}
  }
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {}
}
process.on("exit", killAll);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const port = await new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once("error", reject);
  srv.listen(0, "127.0.0.1", () => {
    const p = srv.address().port;
    srv.close(() => resolve(p));
  });
});

const hub = spawn("node", [path.join(repoRoot, "dist-hub/hub/cli.js"), "--host=127.0.0.1", `--port=${port}`], {
  stdio: ["ignore", "pipe", "pipe"],
});
procs.push(hub);
hub.stderr.on("data", (c) => console.error("[hub]", c.toString().trim()));

for (let i = 0; i < 100; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    if (res.ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const pi = spawn(
  process.env.PI_E2E_BIN || "pi",
  [
    "--mode",
    "rpc",
    "--model",
    "faux/faux-1",
    "--api-key",
    "faux-key",
    "--session-dir",
    path.join(tempRoot, "sessions"),
    "--name",
    `Visual: ${scenarioName}`,
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
      ...process.env,
      PI_CODING_AGENT_DIR: path.join(tempRoot, "agent"),
      PI_E2E: "1",
      PI_OFFLINE: "1",
      PI_WEB_UI_HUB: `ws://127.0.0.1:${port}/ws/extension`,
      PI_WEB_UI_E2E_FIXTURE: scenario.fixture,
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
procs.push(pi);
pi.stderr.on("data", (c) => console.error("[pi]", c.toString().trim()));

// ── rpc driver ───────────────────────────────────────────────────────────────
let buffer = "";
let agentEnded = false;
const waiters = [];
pi.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let nl = buffer.indexOf("\n");
  while (nl >= 0) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.type === "event" && msg.event === "agent_end") agentEnded = true;
      for (const w of [...waiters]) w(msg);
    } catch {}
    nl = buffer.indexOf("\n");
  }
});

const send = (obj) => pi.stdin.write(`${JSON.stringify(obj)}\n`);

function waitFor(pred, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (Date.now() > deadline || pi.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`timeout waiting for ${label}`));
      }
    }, 250);
    waiters.push((msg) => {
      if (pred(msg)) {
        clearInterval(timer);
        resolve(msg);
      }
    });
  });
}

// Wait for the extension to register /webui:connect, then connect to the hub.
for (let i = 0; i < 50; i++) {
  send({ type: "get_commands", id: "probe" });
  try {
    await waitFor(
      (m) =>
        m.type === "response" &&
        m.id === "probe" &&
        m.command === "get_commands" &&
        m.success === true &&
        m.data?.commands?.some((c) => c.name?.includes("webui:connect")),
      1500,
      "webui:connect registration",
    );
    break;
  } catch {
    if (i === 49) throw new Error("pi never registered /webui:connect");
  }
}
send({ type: "prompt", message: "/webui:connect" });
await new Promise((r) => setTimeout(r, 1500));

// Drive the scenario's fixed state.
if (scenario.prompt) {
  send({ type: "prompt", message: scenario.prompt });
  const deadline = Date.now() + 60_000;
  while (!agentEnded && Date.now() < deadline) await new Promise((r) => setTimeout(r, 500));
}

console.log("");
console.log(`Scenario "${scenarioName}" ready: ${scenario.description}`);
console.log(`URL: http://127.0.0.1:${port}`);
if (scenario.lookAt?.length) {
  console.log("看点:");
  for (const hint of scenario.lookAt) console.log(`  - ${hint}`);
}
console.log("");
console.log("Ctrl-C to stop and clean up.");
