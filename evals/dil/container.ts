/**
 * Docker sandbox manager & Pi tool-operations proxy for `projectRepo` runs.
 *
 * Maintains a bare git cache under `evals/dil/.cache/repos/` and a Linux-installed
 * `node_modules` cache under `evals/dil/.cache/deps/`, checks out a throwaway local
 * copy into `tmpdir()`, mounts it at `/workspace/<projectName>` inside a `--network=none`
 * container (`pi-dil-sandbox:latest`), and exposes a Pi `InlineExtension` that proxies
 * `read`, `write`, `edit`, and `bash` into that container.
 */

import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  type BashOperations,
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type EditOperations,
  type InlineExtension,
  type ReadOperations,
  type WriteOperations,
} from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCKER_DIR = join(HERE, "docker");
const CACHE_REPOS_DIR = join(HERE, ".cache", "repos");
const CACHE_DEPS_DIR = join(HERE, ".cache", "deps");
const SANDBOX_IMAGE = "pi-dil-sandbox:latest";
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const EXEC_TIMEOUT_MS = 60_000;
const DEPS_INSTALL_TIMEOUT_MS = 5 * 60_000;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export interface ParsedProjectRepo {
  readonly url: string;
  readonly ref: string;
  readonly projectName: string;
  readonly cacheKey: string;
}

export interface RepoSandbox {
  readonly workDir: string;
  readonly containerId: string;
  readonly extension: InlineExtension;
  dispose(): Promise<void>;
}

let imageReadyPromise: Promise<void> | null = null;
const bareRepoQueue = new Map<string, Promise<unknown>>();
const depsQueue = new Map<string, Promise<unknown>>();
const activeSandboxes = new Set<{ readonly containerId: string; readonly cloneRoot: string }>();
let cleanupHooksInstalled = false;

function cleanupActiveSandboxesSync(): void {
  for (const entry of [...activeSandboxes]) {
    activeSandboxes.delete(entry);
    try {
      execFileSync("docker", ["rm", "-f", entry.containerId], { stdio: "ignore", timeout: 10_000 });
    } catch {
      // Ignore cleanup errors during process exit
    }
    try {
      rmSync(entry.cloneRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors during process exit
    }
  }
}

function installCleanupHooks(): void {
  if (cleanupHooksInstalled) return;
  cleanupHooksInstalled = true;
  process.once("exit", cleanupActiveSandboxesSync);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      cleanupActiveSandboxesSync();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

/** Parse `<git-url>@<ref>` (or `<git-url>`) into normalized repo metadata and a cache key. */
export function parseProjectRepo(projectRepo: string): ParsedProjectRepo {
  const trimmed = projectRepo.trim();
  if (!trimmed) {
    throw new Error("projectRepo must not be empty");
  }

  let url: string;
  let ref: string;

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    const parsed = new URL(trimmed);
    const atIndex = parsed.pathname.indexOf("@");
    if (atIndex >= 0) {
      ref = parsed.pathname.slice(atIndex + 1);
      parsed.pathname = parsed.pathname.slice(0, atIndex);
      url = parsed.toString();
    } else {
      url = trimmed;
      ref = "HEAD";
    }
  } else {
    const colonIndex = trimmed.indexOf(":");
    const atIndex = colonIndex >= 0 ? trimmed.indexOf("@", colonIndex + 1) : trimmed.lastIndexOf("@");
    if (atIndex > 0) {
      url = trimmed.slice(0, atIndex);
      ref = trimmed.slice(atIndex + 1);
    } else {
      url = trimmed;
      ref = "HEAD";
    }
  }

  if (!ref || ref.startsWith("-")) {
    throw new Error(`Invalid git ref in projectRepo: ${projectRepo}`);
  }
  const normalizedUrl = url.replace(/\/+$/, "");
  if (!normalizedUrl || normalizedUrl.startsWith("-")) {
    throw new Error(`Invalid git URL in projectRepo: ${projectRepo}`);
  }

  const lastSegment = normalizedUrl.split(/[/:]/).filter(Boolean).pop() ?? "";
  const projectName = lastSegment.replace(/\.git$/i, "").replace(/[^A-Za-z0-9._-]/g, "-");
  if (!projectName || projectName === "." || projectName === "..") {
    throw new Error(`Cannot derive projectName from projectRepo: ${projectRepo}`);
  }

  const slug = normalizedUrl
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
    .replace(/\.git$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 8);
  const cacheKey = `${slug || projectName}-${hash}`;

  return { url: normalizedUrl, ref, projectName, cacheKey };
}

/** Verify `pi-dil-sandbox:latest` exists locally, or build it from `evals/dil/docker/`. */
export async function ensureSandboxImage(): Promise<void> {
  imageReadyPromise ??= ensureSandboxImageOnce().catch((error) => {
    imageReadyPromise = null;
    throw error;
  });
  return imageReadyPromise;
}

async function ensureSandboxImageOnce(): Promise<void> {
  try {
    await execFileAsync("docker", ["image", "inspect", SANDBOX_IMAGE]);
    return;
  } catch (inspectError) {
    try {
      await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"]);
    } catch {
      const detail = inspectError instanceof Error ? inspectError.message : String(inspectError);
      throw new Error(`Docker daemon is unavailable (${detail}). Start Docker and retry.`);
    }
  }

  process.stderr.write(`[pi-sandbox] Docker image ${SANDBOX_IMAGE} not found; building from ${DOCKER_DIR}...\n`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["build", "-t", SANDBOX_IMAGE, DOCKER_DIR], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`docker build -t ${SANDBOX_IMAGE} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

function withBareRepoLock<T>(cacheKey: string, task: () => Promise<T>): Promise<T> {
  const previous = bareRepoQueue.get(cacheKey) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  const tail = next.catch(() => undefined);
  bareRepoQueue.set(cacheKey, tail);
  void tail.then(() => {
    if (bareRepoQueue.get(cacheKey) === tail) bareRepoQueue.delete(cacheKey);
  });
  return next;
}

async function resolveCommitInRepo(repoDir: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoDir, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
      { maxBuffer: GIT_MAX_BUFFER },
    );
    const sha = stdout.trim();
    return sha || null;
  } catch {
    return null;
  }
}

async function ensureBareRepo(parsed: ParsedProjectRepo): Promise<{ bareDir: string; commitSha: string }> {
  return withBareRepoLock(parsed.cacheKey, async () => {
    const bareDir = join(CACHE_REPOS_DIR, `${parsed.cacheKey}.git`);
    if (!existsSync(bareDir)) {
      await mkdir(CACHE_REPOS_DIR, { recursive: true });
      const tmpBare = join(CACHE_REPOS_DIR, `.tmp-${parsed.cacheKey}-${randomUUID()}`);
      try {
        await execFileAsync("git", ["clone", "--bare", "--", parsed.url, tmpBare], { maxBuffer: GIT_MAX_BUFFER });
        await rename(tmpBare, bareDir);
      } catch (error) {
        await rm(tmpBare, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    }

    let commitSha = await resolveCommitInRepo(bareDir, parsed.ref);
    if (!commitSha) {
      await execFileAsync("git", ["-C", bareDir, "fetch", "--tags", "origin", "+refs/heads/*:refs/heads/*"], {
        maxBuffer: GIT_MAX_BUFFER,
      });
      commitSha = await resolveCommitInRepo(bareDir, parsed.ref);
    }

    if (!commitSha && parsed.ref !== "HEAD") {
      await execFileAsync("git", ["-C", bareDir, "fetch", "origin", parsed.ref], { maxBuffer: GIT_MAX_BUFFER });
      commitSha =
        (await resolveCommitInRepo(bareDir, parsed.ref)) ?? (await resolveCommitInRepo(bareDir, "FETCH_HEAD"));
    }

    if (!commitSha) {
      throw new Error(`Unable to resolve git ref "${parsed.ref}" in ${parsed.url}`);
    }

    return { bareDir, commitSha };
  });
}

async function withDepsLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = depsQueue.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  depsQueue.set(key, next);
  try {
    return await next;
  } finally {
    if (depsQueue.get(key) === next) {
      depsQueue.delete(key);
    }
  }
}

/**
 * Install Node dependencies once per `(repo, commit)` inside a temporary Linux container
 * matching `SANDBOX_IMAGE` (like devcontainer `postCreateCommand`), and cache the
 * resulting `node_modules` directory for read-only mounting into `--network=none` runs.
 */
async function ensureDepsCache(
  parsed: ParsedProjectRepo,
  commitSha: string,
  hostWorkDir: string,
  containerCwd: string,
): Promise<string | null> {
  if (!existsSync(join(hostWorkDir, "package.json"))) {
    return null;
  }
  const depsKey = `${parsed.cacheKey}-${commitSha.slice(0, 12)}`;
  const cacheDir = join(CACHE_DEPS_DIR, depsKey);
  const cachedNodeModules = join(cacheDir, "node_modules");

  return withDepsLock(depsKey, async () => {
    if (existsSync(cachedNodeModules)) {
      return cachedNodeModules;
    }

    await mkdir(CACHE_DEPS_DIR, { recursive: true });
    const stagingDir = join(CACHE_DEPS_DIR, `${depsKey}.tmp-${randomUUID().slice(0, 8)}`);
    const stagingNodeModules = join(stagingDir, "node_modules");
    await mkdir(stagingNodeModules, { recursive: true });
    await mkdir(join(hostWorkDir, "node_modules"), { recursive: true });

    const installCmd = existsSync(join(hostWorkDir, "package-lock.json"))
      ? "npm ci --no-audit --no-fund"
      : "npm install --no-audit --no-fund";
    process.stderr.write(
      `[dil-eval] Installing dependencies for ${parsed.projectName}@${parsed.ref} in container...\n`,
    );

    try {
      await execFileAsync(
        "docker",
        [
          "run",
          "--rm",
          "--memory=4g",
          "--cpus=2",
          "-v",
          `${hostWorkDir}:${containerCwd}`,
          "-v",
          `${stagingNodeModules}:${containerCwd}/node_modules`,
          "-w",
          containerCwd,
          SANDBOX_IMAGE,
          "bash",
          "-lc",
          installCmd,
        ],
        { maxBuffer: GIT_MAX_BUFFER, timeout: DEPS_INSTALL_TIMEOUT_MS },
      );

      if (!existsSync(cachedNodeModules)) {
        await rename(stagingDir, cacheDir);
      } else {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      }
      return cachedNodeModules;
    } catch (error) {
      await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  });
}

async function createWorkingCopy(
  bareDir: string,
  parsed: ParsedProjectRepo,
  commitSha: string,
): Promise<{ cloneRoot: string; hostWorkDir: string }> {
  const cloneRoot = await mkdtemp(join(tmpdir(), "pi-ws-"));
  const hostWorkDir = join(cloneRoot, parsed.projectName);
  try {
    await execFileAsync("git", ["clone", "--local", "--no-checkout", "--", bareDir, hostWorkDir], {
      maxBuffer: GIT_MAX_BUFFER,
    });
    try {
      await execFileAsync("git", ["-C", hostWorkDir, "checkout", "--detach", parsed.ref], {
        maxBuffer: GIT_MAX_BUFFER,
      });
    } catch {
      await execFileAsync("git", ["-C", hostWorkDir, "checkout", "--detach", commitSha], {
        maxBuffer: GIT_MAX_BUFFER,
      });
    }
    return { cloneRoot, hostWorkDir };
  } catch (error) {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function stripAtPrefix(inputPath: string): string {
  return inputPath.startsWith("@") ? inputPath.slice(1) : inputPath;
}

function dockerExec(containerId: string, args: readonly string[], stdinContent?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const useStdin = stdinContent !== undefined;
    const child = spawn("docker", ["exec", ...(useStdin ? ["-i"] : []), containerId, ...args], {
      stdio: [useStdin ? "pipe" : "ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const finish = (err: Error | null, output?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(output ?? Buffer.alloc(0));
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`Sandbox exec timed out after ${EXEC_TIMEOUT_MS}ms`));
    }, EXEC_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    if (child.stdin) {
      child.stdin.on("error", () => undefined);
    }
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        const errText = Buffer.concat(stderrChunks).toString("utf8").trim();
        finish(new Error(errText || `Command failed with exit code ${code ?? "unknown"}`));
        return;
      }
      finish(null, Buffer.concat(stdoutChunks));
    });

    if (useStdin && child.stdin) {
      child.stdin.end(stdinContent, "utf8");
    }
  });
}

function createDockerReadOps(containerId: string): ReadOperations {
  return {
    readFile: (p) => dockerExec(containerId, ["cat", "--", stripAtPrefix(p)]),
    access: (p) => dockerExec(containerId, ["test", "-r", stripAtPrefix(p)]).then(() => undefined),
    detectImageMimeType: async (p) => {
      try {
        const result = await dockerExec(containerId, ["file", "--mime-type", "-b", "--", stripAtPrefix(p)]);
        const mime = result.toString("utf8").trim();
        return IMAGE_MIME_TYPES.has(mime) ? mime : null;
      } catch {
        return null;
      }
    },
  };
}

function createDockerWriteOps(containerId: string): WriteOperations {
  return {
    writeFile: (p, content) =>
      dockerExec(containerId, ["sh", "-c", 'cat > "$1"', "_", stripAtPrefix(p)], content).then(() => undefined),
    mkdir: (dir) => dockerExec(containerId, ["mkdir", "-p", "--", stripAtPrefix(dir)]).then(() => undefined),
  };
}

function createDockerEditOps(containerId: string): EditOperations {
  const readOps = createDockerReadOps(containerId);
  const writeOps = createDockerWriteOps(containerId);
  return {
    readFile: readOps.readFile,
    writeFile: writeOps.writeFile,
    access: (p) =>
      dockerExec(containerId, ["sh", "-c", 'test -r "$1" && test -w "$1"', "_", stripAtPrefix(p)]).then(
        () => undefined,
      ),
  };
}

function createDockerBashOps(containerId: string): BashOperations {
  return {
    exec: (command, cwd, { onData, signal, timeout }) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new Error("aborted"));
          return;
        }
        const child = spawn("docker", ["exec", "-w", cwd, containerId, "bash", "-lc", command], {
          stdio: ["ignore", "pipe", "pipe"],
        });

        let settled = false;
        let timedOut = false;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        };

        const finishReject = (err: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        };

        const finishResolve = (exitCode: number | null) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({ exitCode });
        };

        const onAbort = () => {
          child.kill("SIGKILL");
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        const timer =
          timeout && timeout > 0
            ? setTimeout(() => {
                timedOut = true;
                child.kill("SIGKILL");
              }, timeout * 1000)
            : undefined;

        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.on("error", (error) => finishReject(error));
        child.on("close", (code, signalName) => {
          if (signal?.aborted) {
            finishReject(new Error("aborted"));
          } else if (timedOut) {
            finishReject(new Error(`timeout:${timeout}`));
          } else if (code === null && signalName) {
            finishResolve(128);
          } else {
            finishResolve(code);
          }
        });
      }),
  };
}

function createWorkspaceSandboxExtension(containerId: string, workDir: string): InlineExtension {
  const readOps = createDockerReadOps(containerId);
  const writeOps = createDockerWriteOps(containerId);
  const editOps = createDockerEditOps(containerId);
  const bashOps = createDockerBashOps(containerId);

  return {
    name: "docker-workspace",
    hidden: true,
    factory: (pi) => {
      pi.registerTool(createReadToolDefinition(workDir, { operations: readOps }));
      pi.registerTool(createWriteToolDefinition(workDir, { operations: writeOps }));
      pi.registerTool(createEditToolDefinition(workDir, { operations: editOps }));
      pi.registerTool(createBashToolDefinition(workDir, { operations: bashOps, exposeSessionEnvironment: false }));

      pi.on("user_bash", () => ({ operations: bashOps }));
    },
  };
}

/**
 * Prepare a throwaway working copy of `projectRepo`, ensure its Linux `node_modules`
 * cache when `package.json` is present, start an isolated `--network=none` Docker
 * container mounting it at `/workspace/<projectName>`, and return the Pi `InlineExtension`
 * that proxies file/shell tools into that container.
 */
export async function startRepoSandbox(projectRepo: string): Promise<RepoSandbox> {
  const parsed = parseProjectRepo(projectRepo);
  await ensureSandboxImage();
  const { bareDir, commitSha } = await ensureBareRepo(parsed);
  const { cloneRoot, hostWorkDir } = await createWorkingCopy(bareDir, parsed, commitSha);
  const containerCwd = posix.join("/workspace", parsed.projectName);

  let containerId = "";
  try {
    const cachedNodeModules = await ensureDepsCache(parsed, commitSha, hostWorkDir, containerCwd);
    const volumeArgs = ["-v", `${hostWorkDir}:${containerCwd}`];
    if (cachedNodeModules) {
      await mkdir(join(hostWorkDir, "node_modules"), { recursive: true });
      volumeArgs.push("-v", `${cachedNodeModules}:${containerCwd}/node_modules:ro`);
    }

    const { stdout } = await execFileAsync("docker", [
      "run",
      "-d",
      "--rm",
      "--network=none",
      "--memory=2g",
      "--cpus=2",
      ...volumeArgs,
      "-w",
      containerCwd,
      SANDBOX_IMAGE,
      "sleep",
      "infinity",
    ]);
    containerId = stdout.trim();
    if (!containerId) {
      throw new Error("docker run -d did not return a container id");
    }
  } catch (error) {
    await rm(cloneRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  const extension = createWorkspaceSandboxExtension(containerId, containerCwd);
  const tracked = { containerId, cloneRoot };
  installCleanupHooks();
  activeSandboxes.add(tracked);
  let disposed = false;

  return {
    workDir: containerCwd,
    containerId,
    extension,
    async dispose() {
      if (disposed) return;
      disposed = true;
      activeSandboxes.delete(tracked);
      await execFileAsync("docker", ["rm", "-f", containerId]).catch(() => undefined);
      await rm(cloneRoot, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
