# Context Budget (`context-budget`)

> **Cross-harness context bloat auditor, Turn-0 request inspection proxy, and compaction toolkit for Pi, Claude Code, OpenCode, and Antigravity.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org)
[![Zero External Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](package.json)
[![Compatible Harnesses](https://img.shields.io/badge/harnesses-Pi%20%7C%20Claude%20Code%20%7C%20Antigravity%20%7C%20OpenCode-blueviolet.svg)](#supported-harnesses)

---

## Why Context Budget?

In modern agentic development, developers switch between multiple harnesses (**Pi**, **Claude Code**, **Antigravity**, **OpenCode**). Over time, global configurations and project workspaces accumulate severe **context bloat**:

1. **Global MCP Server Leakage**: A 3D modeling MCP (like Blender) or browser automation server declared globally injects 20–40 tool schemas into **every single turn**, even in a backend API, CLI, or web application project.
2. **Resident Rules Inflation**: `CLAUDE.md`, `AGENTS.md`, or `.cursorrules` balloon beyond 2,000+ tokens with API manuals and test listings that could be loaded on-demand.
3. **Cross-Project Setting Bleed**: Project-specific paths, credentials notes, or environment variables get hardcoded into global settings (e.g. `autoMode.environment`).
4. **Unbounded Terminal Logs**: Unpiped test runs or log dumps compound thousands of tokens into conversation history on every turn.

**Context Budget** provides both a **developer CLI toolkit** and an **agent-facing Skill** to measure, inspect, and eliminate this waste.

---

## Harness Understanding: The Role of Pi

**Pi** (`@earendil-works/pi-coding-agent`) is an open-source, minimalist **agent harness**. A harness provides the runtime execution engine, tool protocol loop, model orchestration, and tree-structured session history (branching, rewinding, and compaction). The models, tools, extensions, and resident rules plugged into the harness determine the agent's behavior. Keeping a harness's resident context lean is vital because every globally mounted MCP or extension tool definition is transmitted on every turn.

---

## The 4 Pillars

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CONTEXT BUDGET ARCHITECTURE                                │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
    ┌─────────────────────────┬────────────────┴────────────────┬─────────────────────────┐
    │                         │                                 │                         │
    ▼                         ▼                                 ▼                         ▼
┌───────────────────┐   ┌───────────────────┐             ┌───────────────────┐     ┌───────────────────┐
│ 1. Multi-Harness  │   │ 2. Turn-0 Sniffer │             │ 3. Historical Log │     │ 4. Live Session   │
│ Config Auditor    │   │ Proxy (proxy.mjs) │             │ Meter & Waste     │     │ Inspection & ACM  │
├───────────────────┤   ├───────────────────┤             ├───────────────────┤     ├───────────────────┤
│ • context-budget  │   │ • Intercepts turn │             │ • token-meter     │     │ • pi-context /    │
│   audit           │   │   zero payloads   │             │   integration     │     │   pi-context-tools│
│ • Scans Pi, Agy,  │   │ • Ranks tool      │             │ • Scans JSONL     │     │ • /context visual │
│   Claude, OpenCode│   │   schemas & rules │             │   session logs    │     │   dashboard       │
│ • Evaluates Fast  │   │ • Anthropic &     │             │ • Flags oversized │     │ • Compaction APIs │
│   Triage criteria │   │   OpenAI formats  │             │   tool responses  │     │   on-demand       │
└───────────────────┘   └───────────────────┘             └───────────────────┘     └───────────────────┘
```

---

## Fast Triage Checklist

Always apply these four core rules when organizing agent configurations:

| Rule | Problem Solved | Recommended Action |
|:---|:---|:---|
| **1. Move Global to Project Scope** | Global MCPs inject 30+ tools into unrelated projects. | Remove domain MCPs from global `~/.gemini` or `~/.pi`; declare them in project `.mcp.json` or `.pi/mcp.json`. |
| **2. Prune Tool Definitions** | Unused tools consume 50–200 tokens each per turn. | Deny-list unused tools or split specialized servers into targeted extensions. |
| **3. Keep Rules Under ~1,000 Tokens** | Bloated resident prompts degrade attention & cost money. | Keep core guidelines resident; use **progressive disclosure** (`docs/spec/...`) for details. |
| **4. Truncate Terminal Outputs** | Raw log dumps blow up conversational history. | Always pipe commands: `head -n 50`, `tail -n 50`, `grep`, or filter noisy outputs. |

---

## How to Add Project-Scoped MCPs

When an MCP server (such as Blender, Docker, Database, or Browser Control) is removed from global configuration, wire it project-locally:

### 1. For the Pi Harness
Place a `.pi/mcp.json` file inside the root of your project:

```json
{
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    }
  }
}
```
When you launch `pi` inside that project directory, Pi automatically merges the project-scoped servers for that session only. You can also run `pi install <source> -l` (or `--local`) to install packages into `.pi/settings.json`.

### 2. For Antigravity (agy)
Place a standard `.mcp.json` file in your repository root (or inside `.agents/mcp_config.json`):

```json
{
  "mcpServers": {
    "blender": {
      "command": "/home/grayson/.local/bin/blender-mcp",
      "args": []
    },
    "browser-control": {
      "command": "node",
      "args": ["/path/to/browser-control-mcp/mcp-server/dist/server.js"],
      "env": {
        "EXTENSION_SECRET": "your-secret",
        "EXTENSION_PORT": "8089"
      }
    }
  }
}
```
Antigravity automatically discovers project-scoped MCP configs by traversing up to the project root.

### 3. For Claude Code
Register via CLI or create `.mcp.json` in the project root:

```bash
# Register project-locally via CLI:
claude mcp add --scope project blender -- uvx blender-mcp

# Or for browser control:
claude mcp add --scope project browser-control -- node /path/to/server.js
```

### 4. For OpenCode
OpenCode recognizes project-local `.mcp.json` or project-level `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    }
  }
}
```

---

## Installation

### 1. Install CLI Globally
```bash
# Clone the repository
git clone git@github.com:prismspecs/context-budget.git
cd context-budget

# Link globally with npm
npm link
```

### 2. Install as an Agent Skill
The repository includes a standard `SKILL.md` compatible with Antigravity, Claude Code, OpenCode, and Pi.

```bash
# Install globally for Antigravity (agy):
mkdir -p ~/.gemini/config/skills/context-budget
cp -r skills/context-budget/* ~/.gemini/config/skills/context-budget/

# Install globally for Claude Code:
mkdir -p ~/.claude/skills/context-budget
cp -r skills/context-budget/* ~/.claude/skills/context-budget/

# Install inside a specific project:
mkdir -p .agents/skills/context-budget
cp -r skills/context-budget/* .agents/skills/context-budget/
```

### 3. Complementary Extensions
```bash
# For Pi Harness (Visual /context dashboard & compaction tools)
pi install npm:pi-context
pi install npm:pi-context-tools

# For Historical Session Auditing
npm install -g @whdrnr2583/token-meter
```

---

## Command Reference

### `context-budget audit`
Performs an offline cross-harness audit of global configurations and the current project workspace.

```bash
context-budget audit

# Output machine-readable JSON:
context-budget audit --json
```

---

### `context-budget proxy` (`proxy.mjs`)
Runs a local Turn-0 Request Inspection Proxy between your harness and your LLM gateway.

```bash
# Live forwarding to Anthropic:
context-budget proxy --port 8080 --target https://api.anthropic.com

# Live forwarding to OpenAI / Modal gateway:
context-budget proxy --port 8080 --target https://api.openai.com

# Mock inspection mode (no API key needed; inspect harness payload instantly):
context-budget proxy --port 8080 --mock
```

Point your agent harness to the proxy:
```bash
# For Anthropic clients:
export ANTHROPIC_BASE_URL="http://127.0.0.1:8080"

# For OpenAI clients:
export OPENAI_BASE_URL="http://127.0.0.1:8080/v1"
```

**What happens on Turn 0:**
1. The raw payload is saved to `.context-audit/turn_0_request.json`.
2. A comprehensive markdown analysis is saved to `.context-audit/turn_0_breakdown.md`.
3. An immediate colorized ranking is printed to the console:
   - **Ranked Tool Schemas**: Parameters schema token weight vs description token weight.
   - **Ranked System Rules**: Markdown slices ranked by token footprint.

---

### `context-budget meter` (`token-meter` integration)
Seamlessly delegates to `token-meter` to analyze historical JSONL sessions.

```bash
# Ingest local sessions into SQLite:
token-meter ingest

# Run cost & efficiency audit:
context-budget meter audit

# Print 30-day token summary & top tools:
context-budget meter stats 30
```

---

## Supported Harnesses

| Harness | Configuration Files Checked | How to Optimize |
|:---|:---|:---|
| **Pi Harness** | `~/.pi/agent/settings.json`<br>`~/.pi/agent/mcp.json` | Use `/context` in session.<br>Install `npm:pi-context`.<br>Move MCPs to project `.pi/mcp.json`. |
| **Claude Code** | `~/.claude/settings.json`<br>`~/.claude/skills/` | Keep `autoMode.environment` clean.<br>Prune dead symlinks in `~/.claude/skills/`.<br>Keep `CLAUDE.md` under 1,000 tokens. |
| **Antigravity (agy)** | `~/.gemini/config/mcp_config.json`<br>`~/.gemini/config/AGENTS.md` | Move non-universal MCP servers to `.mcp.json`.<br>Use `trigger: model_decision` for rules. |
| **OpenCode** | `~/.config/opencode/opencode.json`<br>`~/.config/opencode/AGENTS.md` | Audit instruction file chains. |

---

## Development & Testing

Context Budget has zero production dependencies and runs on native Node.js 18+:

```bash
# Run unit tests:
npm test
```

---

## License

MIT © [Grayson Earle](mailto:graysonearle@gmail.com)
