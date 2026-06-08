<h1 align="center">bwoc-plugin-openclaw</h1>

<p align="center">
  <strong>BWOC → OpenClaw</strong> plugin adapter — bring the BWOC agent fleet into <a href="https://docs.openclaw.ai">OpenClaw</a>.
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg">
  <a href="https://bemindlabs.github.io/bwoc-handbook/"><img alt="Handbook" src="https://img.shields.io/badge/docs-BWOC%20Handbook-1f6feb"></a>
  <img alt="Status" src="https://img.shields.io/badge/status-WIP-orange">
  <img alt="Host" src="https://img.shields.io/badge/host-OpenClaw-111827">
  <img alt="Part of BWOC" src="https://img.shields.io/badge/part%20of-BWOC-6f42c1">
  <img alt="Runtime" src="https://img.shields.io/badge/runtime-Node.js-339933">
</p>

---

## ✨ Overview

`bwoc-plugin-openclaw` is a **native OpenClaw plugin** that registers the [**BWOC**](https://github.com/bemindlabs/BWOC-Framework) agent fleet into the OpenClaw Gateway: coordination **tools**, fleet **agents/harnesses**, **skills**, and a **memory slot** — all wrapping the `bwoc` CLI.

Unlike the declarative adapters, OpenClaw plugins run an **in-process runtime module** (`src/index.js`). Each registered tool shells out to `bwoc`; OpenClaw also natively maps Claude/Codex-style bundles, so BWOC skills re-export cleanly.

> [!NOTE]
> **Status: WIP.** Coordination tools and the `bwoc` exec helper are implemented and unit-tested. The exact OpenClaw tool-registration call is TODO-guarded pending host confirmation — see the [roadmap](#️-roadmap).

## 🧩 What it exposes

| Surface | BWOC capability | Wraps |
|---|---|---|
| **Tools** | Coordinate the fleet | `bwoc list` · `status` · `send` · `run` · `chat` · `task` · `team` |
| **Agent harness** | Delegate to any agent | `bwoc run <agent>` |
| **Skills** | Reuse BWOC skills | Claude/Codex-compatible bundle |
| **Memory slot** | Shared deep-memory | `plugins.slots.memory` → `bwoc memory` |

## 🏗️ How it works

```
OpenClaw Gateway  ──tool call──▶  src/index.js  ──exec──▶  bwoc CLI  ──▶  BWOC workspace
                                  (api.on / registerHook)             (agents, teams,
                                                                       tasks, memory)
```

The plugin declares compatibility via `openclaw.compat.pluginApi` and `openclaw.install.minHostVersion`. The host must have `bwoc` on `PATH`.

## 📋 Prerequisites

- [OpenClaw](https://docs.openclaw.ai) with a running Gateway
- Node.js ≥ 18
- The [`bwoc` CLI](https://github.com/bemindlabs/BWOC-Framework) installed and on `PATH`
- 📚 Reference: the [BWOC Handbook](https://bemindlabs.github.io/bwoc-handbook/)
- A BWOC workspace (`bwoc init`) reachable from the Gateway

## 📦 Installation

```bash
openclaw plugins install git:github.com/bemindlabs/bwoc-plugin-openclaw
openclaw plugins enable bwoc
# installing/updating plugin code requires a Gateway restart
openclaw gateway status --deep --require-rpc
```

Local development:

```bash
openclaw plugins install ./bwoc-plugin-openclaw   # or --link ./bwoc-plugin-openclaw
```

## 🚀 Usage

```text
# tools registered by the plugin (call from any OpenClaw agent)
bwoc_list                 # list registered agents
bwoc_status <agent>   # health + identity snapshot
bwoc_send <agent> ... # append a message to an agent's inbox
bwoc_run  <agent> ... # run a single task headless

# verify active registrations
openclaw plugins inspect bwoc --runtime --json
```

## 🗂️ Repository layout

```
bwoc-plugin-openclaw/
├── openclaw.plugin.json     # native manifest + compat/install metadata
├── package.json             # npm package (type: module)
├── src/
│   └── index.js             # register(api) — tools/hooks wrapping `bwoc`
└── ...
```

## 🛠️ Development

```bash
npm install
npm run lint
npm test
npm run build
```

## 🗺️ Roadmap

- [x] Scaffold: `openclaw.plugin.json`, `package.json`, entry module
- [x] Coordination tools (`bwoc_list/status/send/run/chat/task/team`) + exec helper
- [x] Agent harness delegation (`bwoc run <agent>`)
- [x] Memory slot provider (`bwoc memory`) — `src/memory.js`
- [x] Skill bundle (Claude/Codex-compatible) — `scripts/sync-skills`
- [ ] Confirm host tool-registration API + `openclaw plugins inspect --runtime` smoke test

## 🔗 BWOC host-adapter set

One of five BWOC → host adapters, one per agent host:

| Host | Repo |
|---|---|
| Claude Code | [bwoc-plugin-claude](https://github.com/bemindlabs/bwoc-plugin-claude) |
| OpenAI Codex | [bwoc-plugin-codex](https://github.com/bemindlabs/bwoc-plugin-codex) |
| Antigravity | [bwoc-plugin-agy](https://github.com/bemindlabs/bwoc-plugin-agy) |
| **OpenClaw** | [bwoc-plugin-openclaw](https://github.com/bemindlabs/bwoc-plugin-openclaw) |
| Hermes | [bwoc-plugin-hermes](https://github.com/bemindlabs/bwoc-plugin-hermes) |

## 🙏 Maintainer

Maintained by **Bemind Technology**, part of the BWOC host-adapter set. This connector is **generic**: it ships no agents, teams, or workspace identities of its own — it discovers your fleet from the local `bwoc` workspace at runtime.

## 🤝 Contributing

Issues and PRs welcome. Keep the runtime module a **thin wrapper over the `bwoc` CLI** — logic belongs in the framework, not here.

## 📄 License

[MIT](LICENSE) © Bemind Technology
