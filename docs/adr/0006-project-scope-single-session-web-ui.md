# ADR 0006: Project Scope — Single-Session Web UI, Not Multi-Agent Manager

## Status

Superseded by [ADR 0012: Central Hub Service with Connect-Out Extension](./0012-central-hub-connect-out-architecture.md)

ADR 0012 把多 session 编排移到了独立的 hub 服务（而非 extension 层），与本 ADR "进程编排不属于 extension 层" 的核心理由一致，但推翻了 "pi-web-ui 是单 session 镜像" 的范围限定。

## Context

We explored introducing a daemon server to manage multiple Pi agent sessions from a single web UI.

## Decision

**pi-web-ui is a single-session web UI for one Pi agent process.**

- pi-web-ui mirrors **one** Pi session to the browser
- The sidebar shows the **active session** plus **history** of past sessions
- There is **no daemon**, **no session pool**, **no multi-agent orchestration**

### In scope

| Scope | Detail |
|-------|--------|
| Real-time mirror | Browser receives Pi events via WebSocket from one Pi process |
| Session history | Browse and search past session files |
| Interactive control | Send prompts, switch models, trigger compaction from the browser |
| File browser | Browse and open project files from the web UI |

### Out of scope

| Non-scope | Why |
|-----------|-----|
| Multi-session daemon | Process management belongs in Pi itself |
| Instance registry | No multi-instance discovery needed |
| HTTP Basic Auth | Insecure over cleartext, localhost-only by default |

## Rationale

A daemon that manages multiple agent sessions and survives terminal closures is a **process management** concern. Pi extensions run inside a single Pi process. Extensions are the wrong layer for process orchestration.

If multi-session support is ever needed, the right place is a Pi-level feature like `pi serve` — not a pi-web-ui extension feature.

## Consequences

### Sidebar redesign

The sidebar will be simplified to reflect single-session scope:
- Remove "Projects" tab
- Rename "Sessions" → "History"
- Add active session summary at top
- Remove project grouping in history list

### Name change

The project has been renamed from **tau-mirror** to **pi-web-ui** to clearly communicate its purpose.

### Auth removal

HTTP Basic Auth is removed. The server binds to `127.0.0.1` by default (ADR 0004), making local access secure. Remote access should use `tailscale serve` or a TLS reverse proxy.

## Alternatives Considered

### Build a full multi-session daemon

Rejected. Wrong architectural layer. Extensions run inside a single Pi process.

### Keep auth

Rejected. HTTP Basic Auth over cleartext provides false security. Localhost binding is the correct security boundary.
