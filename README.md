# Pi Web UI

[![Coverage Status](https://coveralls.io/repos/github/kkkiio/pi-web-ui/badge.svg?branch=main)](https://coveralls.io/github/kkkiio/pi-web-ui?branch=main)

![Pi Web UI showing a follow-up quoted from an export plan](docs/images/pi-web-ui-example.png)

An **interactive agent UI** for the [Pi](https://pi.dev/) coding agent.

## Install

Install from GitHub:

```bash
pi install git:github.com/kkkiio/pi-web-ui
```

Or from npm:

```bash
pi install npm:@kkkiio/pi-web-ui
```

## Usage

1. Start Pi in terminal
2. Enter `/webui` to start the server and open the browser.

Use `/webui-stop` to stop the server.

See [docs/configuration.md](docs/configuration.md) for environment variables, `settings.json`, and remote access setup.

## Features

- [x] Real-time bidirectional sync with Pi TUI
- [x] Git Diff Panel
- [x] Edit Message (inline rollback & resend; enabled by `/webui`)
- [x] Add to Chat
- [x] Git Diff Comment
- [x] Generative UI, including interactive clarification cards
- [ ] BTW / Ask in Side Chat

### Git Diff

Review what the agent changed on disk without leaving the conversation.

![Git Diff panel showing the agent's dry-run edit next to the chat](docs/images/git-diff.png)

### Interactive clarification

Pi can pause to ask how a change should work. Preview the options and submit a choice from the card, or answer in the chat input.

![DIL clarification card previewing how dry-run can report existing files](docs/images/dil-clarification.png)

## How it works

Pi Web UI is a [Pi extension](https://github.com/badlogic/pi-mono#extensions). Running `/webui` starts an HTTP + WebSocket server inside the Pi process. The extension forwards Pi events to the browser, and browser commands execute through Pi's extension API.

```mermaid
graph LR
    A[Pi TUI<br/>terminal] <-->|Pi events| B[Pi Process<br/>pi-web-ui extension]
    B <-->|HTTP + WS :3001| C[Browser]
```
