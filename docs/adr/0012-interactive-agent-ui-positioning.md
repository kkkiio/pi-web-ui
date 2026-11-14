# ADR 0012: Product Positioning — Interactive Agent UI for High-Agency Coding Models

## Status

Accepted

## Context

Modern coding-specialized and long-horizon models (most notably GPT coding variants, DeepSeek, and models with similar post-training traits) exhibit a recurring set of failure modes during real-world software engineering:

1. **Cryptic expression & literal interpretation ("not speaking human")**: Responses are often terse, obscure, and interpret user phrasing overly literally.
2. **Divergent explanations that leave pitfalls**: Models like DeepSeek tend to diverge when explaining or reasoning, and combined with poor expression ability, continuously leave ambiguities and pitfalls in their responses.
3. **High execution impulse + weak intent comprehension**: Instead of pausing to clarify ambiguity, the model rushes into multi-step tool calls and code edits that deviate from the user's actual intent.

A passive terminal stream or generic multi-pane chat mirror is poorly suited to countering these behaviors:

- Pointing out a flaw in a single sentence, tool output, or changed code hunk requires manually copying text and explaining where it came from.
- Asking "what did you mean by X?" in the main thread often triggers the model's execution impulse to rewrite code or pollutes the main context window with side discussions.
- Text-only prompts rarely induce high-impulse models to stop and discuss trade-offs with the user before acting.

## Decision

**Position Pi Web UI as an "Interactive Agent UI" designed to interrogate, steer, and align high-impulse coding models.**

While remaining a single-session Web UI running inside the Pi process (ADR 0006) with thin event transport (ADR 0002), Pi Web UI focuses its product surface on **human-agent alignment and interactive steerability**, and cuts passive/redundant chrome that does not serve this goal.

### Core Interactive Capabilities

| Capability                     | Problem Addressed                                       | Interactive Mechanism                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add to Chat**                | Divergent explanations & literal interpretation         | Select any span in the transcript (assistant text, reasoning, or tool output) and attach it as a structured quote in the composer to pin feedback to exact words.                        |
| **Git Diff + Line Comment**    | Code changes that deviate from intent                   | Inspect workspace changes in the Right Panel and click **Comment** on specific diff lines (Codex-style) to quote file/line changes with inline feedback directly into the chat composer. |
| **BTW / Ask in Side Chat**     | Cryptic, pitfall-heavy explanations & execution impulse | Open an isolated side inquiry in the Right Panel to unpack cryptic or divergent claims without derailing the main agent or triggering unwanted edits.                                    |
| **AskUserQuestion**            | Rushing into execution on ambiguous intent              | Provide structured clarification UI (multi-choice / form cards) and agent tooling so the LLM actively questions and aligns with the user before executing long tasks.                    |
| **Inline Edit Message**        | Prompt typos & early first-turn derailment              | Edit any previous user message inline (`Save & Send`) to rewind to that point via `navigate_tree` and re-run with clarified wording.                                                     |
| **Generative UI** _(Research)_ | Dense, hard-to-parse prose explanations                 | Render interactive, task-specific UI views (explored via open alternatives to declarative/SFC UI dialects) when visual inspection beats walls of text.                                   |

### Feature Cuts & UI Simplification

To keep the interface focused and unobstructed:

- **Cut Left Sidebar & Session Tree Sidebar**: Single-session scope does not need a session switcher, and exposing raw tree branching (`Branch` / `Continue`) adds cognitive overhead. Layout simplifies to **Single-Column Main Chat + On-Demand Right Panel**.
- **Revert `Branch` to Inline `Edit Message`**: Users want to fix typos or rephrase a prompt in place (`Save & Send`), not manage tree branches manually.
- **Cut Workspace Status Float**: Floating overlays in the chat viewport occlude transcript text. Git diff summary moves into the top header bar as a clean button that toggles the Right Panel.
- **Cut Markdown Artifacts & Architecture Mode UI**: Passive Markdown file mirroring and extension-specific `/arch` switches do not address the core interactive alignment problem.

## Architectural Guardrails

1. **Single-Session Process Scope (ADR 0006)**: Interactive steering features operate within the active Pi extension process, rather than introducing an external multi-agent daemon.
2. **Thin Transport Boundary (ADR 0002)**: `extensions/mirror-server.ts` remains a thin transport and command bridge. Transcript quoting, diff line commenting, side-chat presentation, and generative UI rendering belong in `src/web/`.

## Consequences

### Positive

- Gives Pi Web UI a sharp product identity focused on taming cryptic, high-impulse coding models.
- Eliminates layout clutter (no 3-column squeeze, no floating card blocking transcript text).
- Turns Git Diff from a passive viewer into an active steering tool via Codex-style line comments.

### Negative

- Requires cleaning up legacy components (`conversation-sidebar*`, `workspace-status-float`, `workspace-artifacts`, `Branch` actions) in subsequent implementation passes.
- Generative UI requires separate technical research to find a safe, open-source rendering model before implementation.

## References

- `README.md`
- `AGENTS.md`
- `docs/prd/columns-layout.md`
- `docs/prd/edit-message.md`
- `docs/prd/right-panel.md`
- `docs/adr/0002-web-ui-extension-event-protocol.md`
- `docs/adr/0006-project-scope-single-session-web-ui.md`
