---
name: write-readme-md
description: Write or update README.md for a project. README.md is for users (human or agent) — what the project is and how to use it. Use when creating README.md from scratch, updating install or usage instructions, or when asked to "maintain the README".
---

# Write README.md

Use this skill when creating or updating `README.md`.

## Philosophy: Get Started, Not Full Docs

README.md is a **getting-started guide** — the minimal path from zero to running. A new user should be able to install and see the project in action within a few minutes. It is **not** comprehensive documentation.

Detailed reference material belongs elsewhere, depending on project needs:
- API docs, configuration reference, architecture decisions → `docs/prd.md` or `docs/prd/`
- Changelog → `CHANGELOG.md` or GitHub Releases
- Contributing guide → `CONTRIBUTING.md`
- In-depth tutorials → project wiki or documentation site

When in doubt, keep it out of README. A short README that gets someone running is better than a long one nobody finishes.

## Mandatory Structure

Only three things are required:

### 1. Opening paragraph (after H1 title)

The first paragraph after the top-level heading must explain **what the project is and what it does**.

**Screenshot or logo.** Before the opening paragraph, include a visual that represents the project:
- **Has a UI (web, GUI, TUI)?** Put a running screenshot at the top. Avoid revealing private information in screenshots — strip local global paths (`HOME`), usernames, API keys, etc.
- **No UI?** Generate a logo image using an image-generation model, based on the project's purpose and name, and embed it in the README.

### 2. H2 — Installation

How to install and set up the project.

**Unpublished projects.** If the project hasn't been published to a remote registry or release channel (npm, GitHub Releases, PyPI, etc.):
- You may write `TODO` as a placeholder for the install section.
- Alternatively, provide source-install commands that clone and set up locally (e.g. `git clone ... && pip install -e .`).
- Do **not** write development commands such as `npm run dev`, `just run`, `cargo run`, or similar. These are for AGENTS.md, not README.md.

### 3. H2 — Usage

How to use the project. Give a **minimal, runnable example** that demonstrates the core workflow — not every feature. Copy-paste should just work.

## Optional Sections

Everything else is optional: features, roadmap, goals, non-goals, FAQ, etc. No rules on these — add what's useful.

## Style

- Write for humans, but keep technical accuracy.
- Commands should be copy-paste-able.

## README vs AGENTS Boundary

| Audience | README.md | AGENTS.md |
|----------|-----------|-----------|
| What the project is and does | ✅ | — |
| Installation and usage | ✅ | — |
| Feature list, roadmap | ✅ | — |
| Directory structure, key files | — | ✅ |
| Build / test / format commands | — | ✅ |
| Architecture guidelines | — | ✅ |
| Mandatory rules and skill triggers | — | ✅ |

If content serves **users**, put it in README.md. Never duplicate between README and AGENTS.

## When to Update

Update README.md when:
- Project purpose or description changes
- Install steps change
- Usage instructions change
- New major features are added

## Templates

- `references/readme-template.md` — README.md skeleton.
