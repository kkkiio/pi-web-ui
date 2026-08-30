/**
 * Recent-session listing from ~/.pi/agent/sessions (ADR 0012).
 *
 * Metadata only — the hub never renders transcripts. Reading or continuing
 * a full conversation requires a live agent session.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import type { HistorySessionInfo } from "../protocol/index.js";

const MAX_HISTORY_ENTRIES = 200;
const TAIL_SCAN_BYTES = 256 * 1024;

type SessionFileProbe = {
  sessionId: string | null;
  sessionName: string | null;
  cwd: string | null;
};

async function probeSessionFile(filePath: string): Promise<SessionFileProbe> {
  const probe: SessionFileProbe = { sessionId: null, sessionName: null, cwd: null };
  try {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const lines = readline.createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
    let scanned = 0;
    for await (const line of lines) {
      if (++scanned > 50) break;
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { type?: string; id?: string; cwd?: string };
        if (entry.type === "session") {
          probe.sessionId = typeof entry.id === "string" ? entry.id : null;
          probe.cwd = typeof entry.cwd === "string" ? entry.cwd : null;
          break;
        }
      } catch {
        // Skip malformed lines; history listing is best-effort.
      }
    }
    stream.close();
  } catch {}
  probe.sessionName = readSessionNameFromTail(filePath);
  return probe;
}

// The display name lives in the last session_info entry, which is typically
// appended after the first few turns — scan the file tail instead of the head.
function readSessionNameFromTail(filePath: string): string | null {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - TAIL_SCAN_BYTES);
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    const lines = buffer.toString("utf8").split("\n");
    if (start > 0) lines.shift(); // first line may be truncated
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line) as { type?: string; name?: string };
        if (entry.type === "session_info" && typeof entry.name === "string") return entry.name;
      } catch {}
    }
  } catch {}
  return null;
}

function sessionDir(): string {
  const base = (process.env.PI_CODING_AGENT_DIR || path.join(process.env.HOME || "~", ".pi/agent")).replace(
    /^~(?=$|\/)/,
    process.env.HOME || "~",
  );
  return path.join(path.resolve(base), "sessions");
}

export async function listRecentSessions(): Promise<HistorySessionInfo[]> {
  const root = sessionDir();
  const files: Array<{ file: string; mtime: number }> = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        try {
          files.push({ file: fullPath, mtime: fs.statSync(fullPath).mtimeMs });
        } catch {}
      }
    }
  };
  walk(root, 0);

  files.sort((a, b) => b.mtime - a.mtime);
  const top = files.slice(0, MAX_HISTORY_ENTRIES);
  return Promise.all(
    top.map(async ({ file, mtime }) => {
      const probe = await probeSessionFile(file);
      return {
        sessionId: probe.sessionId,
        sessionName: probe.sessionName,
        sessionFile: file,
        cwd: probe.cwd,
        mtime,
      };
    }),
  );
}
