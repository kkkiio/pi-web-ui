import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const MAX_FILE_CONTENT_BYTES = 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 10 * 1024 * 1024;
const DIFF_FLAGS = [
  "--no-ext-diff",
  "--no-textconv",
  "--no-color",
  "--src-prefix=a/",
  "--dst-prefix=b/",
  "--find-renames",
];

type ChangedFile = {
  path: string;
  previousPath?: string;
  additions: number;
  deletions: number;
  untracked?: true;
  status: string;
};
type GitQuery =
  | { kind: "status" }
  | { kind: "diff"; path?: string; paths?: string[]; source?: "tracked" | "untracked" };

export function readGitChanges(workspace: string, query: GitQuery) {
  const options = { cwd: workspace, encoding: "utf8" as const, maxBuffer: MAX_GIT_OUTPUT_BYTES };
  const root = spawnSync("git", ["rev-parse", "--show-toplevel"], options);
  if (root.error) throw root.error;
  if (root.status !== 0) {
    return {
      isRepo: false,
      branch: null,
      hasChanges: false,
      additions: 0,
      deletions: 0,
      untracked: 0,
      files: [],
      diff: "",
    };
  }
  const gitRoot = root.stdout.replace(/\r?\n$/, "");
  const gitOptions = { ...options, cwd: gitRoot };
  const head = spawnSync("git", ["rev-parse", "--verify", "--short", "HEAD"], gitOptions);
  const branchResult = spawnSync("git", ["branch", "--show-current"], gitOptions);
  const branch = branchResult.stdout?.trim() || head.stdout?.trim() || null;
  const base =
    head.status === 0
      ? "HEAD"
      : spawnSync("git", ["hash-object", "-t", "tree", "--stdin"], { ...gitOptions, input: "" }).stdout?.trim();
  if (!base) throw new Error("Unable to determine the Git diff base.");

  const requested =
    query.kind === "diff"
      ? (query.paths ?? (query.path ? [relative(gitRoot, resolve(workspace, query.path))] : []))
      : [];
  if (
    requested.some((name) => {
      const location = relative(gitRoot, resolve(gitRoot, name));
      return !location || location === ".." || location.startsWith(`..${sep}`) || isAbsolute(name);
    })
  ) {
    throw new Error("Path outside the Git repository.");
  }
  if (query.kind === "diff" && query.path) {
    const location = relative(workspace, resolve(workspace, query.path));
    if (location === ".." || location.startsWith(`..${sep}`) || isAbsolute(location)) {
      throw new Error("Path outside the workspace.");
    }
  }

  const source = query.kind === "diff" ? query.source : undefined;
  const args = [
    "--literal-pathspecs",
    "diff",
    ...DIFF_FLAGS,
    ...(query.kind === "status" ? ["--raw", "--numstat", "-z"] : ["--patch"]),
    base,
    "--",
    ...requested,
  ];
  const tracked = source === "untracked" ? undefined : spawnSync("git", args, gitOptions);
  if (tracked && (tracked.error || tracked.status !== 0)) {
    throw tracked.error ?? new Error(tracked.stderr.trim() || "Git diff failed.");
  }

  const others =
    source === "tracked"
      ? undefined
      : spawnSync(
          "git",
          ["--literal-pathspecs", "ls-files", "--others", "--exclude-standard", "-z", "--", ...requested],
          gitOptions,
        );
  if (others && (others.error || others.status !== 0)) {
    throw others.error ?? new Error(others.stderr.trim() || "Git could not list untracked files.");
  }

  const untrackedPaths = others?.stdout.split("\0").filter(Boolean) ?? [];
  const files: ChangedFile[] = [];
  if (query.kind === "status" && tracked) {
    const records = tracked.stdout.split("\0");
    const statuses = new Map<string, string>();
    let index = 0;
    while (records[index]?.startsWith(":")) {
      const status = records[index++].split(" ").at(-1)?.[0] ?? "M";
      if (status === "R" || status === "C") index++;
      statuses.set(records[index++], status);
    }
    for (; index < records.length - 1; index++) {
      const record = records[index];
      const addedEnd = record.indexOf("\t");
      const deletedEnd = record.indexOf("\t", addedEnd + 1);
      const filename = record.slice(deletedEnd + 1);
      const filePath = filename || records[index + 2];
      files.push({
        path: filePath,
        status: statuses.get(filePath) || "M",
        previousPath: filename ? undefined : records[index + 1],
        additions: Number(record.slice(0, addedEnd)) || 0,
        deletions: Number(record.slice(addedEnd + 1, deletedEnd)) || 0,
      });
      if (!filename) index += 2;
    }
  }

  const trackedPatch = query.kind === "diff" ? tracked?.stdout || "" : "";
  const parts = [trackedPatch];
  let patchBytes = Buffer.byteLength(trackedPatch);
  for (const filename of untrackedPaths) {
    const absolutePath = resolve(gitRoot, filename);
    const stat = lstatSync(absolutePath, { throwIfNoEntry: false });
    if (!stat || (!stat.isFile() && !stat.isSymbolicLink())) continue;

    if (query.kind === "status") {
      let additions = 0;
      if (stat.size <= MAX_FILE_CONTENT_BYTES) {
        try {
          const content = stat.isSymbolicLink() ? readlinkSync(absolutePath) : readFileSync(absolutePath, "utf8");
          if (content && !content.slice(0, 8000).includes("\0")) {
            additions = (content.match(/\n/g)?.length ?? 0) + (content.endsWith("\n") ? 0 : 1);
          }
        } catch {}
      }
      files.push({ path: filename, additions, deletions: 0, untracked: true, status: "A" });
      continue;
    }

    if (stat.size > MAX_FILE_CONTENT_BYTES) {
      if (requested.length) return { isRepo: true, branch, diff: "", omitted: "File is too large to preview." };
      throw new Error("The Git diff contains an untracked file that is too large to copy.");
    }
    const patch = spawnSync("git", ["diff", "--no-index", ...DIFF_FLAGS, "--", "/dev/null", filename], gitOptions);
    if (patch.error || (patch.status !== 0 && patch.status !== 1)) {
      throw patch.error ?? new Error(patch.stderr.trim() || "Git could not read the new file.");
    }
    patchBytes += Buffer.byteLength(patch.stdout);
    if (patchBytes > MAX_GIT_OUTPUT_BYTES) throw new Error("The combined Git diff is too large to copy.");
    parts.push(patch.stdout);
  }

  if (query.kind === "diff") return { isRepo: true, branch, diff: parts.join("") };
  return {
    isRepo: true,
    branch,
    hasChanges: files.length > 0,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    untracked: untrackedPaths.length,
    files,
  };
}
