# Codex runtime-support scripts

This directory contains support code for configured Codex transports. It is not a general automation directory and does not own application execution.

| File | Responsibility |
| --- | --- |
| [start-serena.mjs](start-serena.mjs) | Starts the worktree-local Serena MCP server with the repository's bounded tool set and no memories/dashboard. |
| [serena-entry.py](serena-entry.py) | Invokes Serena's installed Python CLI without the Windows console shim. |
| [configure-serena.py](configure-serena.py) | Applies the least-privilege Serena configuration: symbol queries only, no GUI/dashboard. |

## Runtime flow

`config.toml` registers `start-serena.mjs`. The launcher resolves the current checkout and its local Serena installation, then starts the MCP entry point. When Serena is absent, it fails with a bounded diagnostic rather than downloading or configuring a global tool.

Serena is supplementary symbol exploration. Primary first uses `pnpm semantic plan/context` for owner and contract resolution; `repository-mapper` may use Serena only when that resolution remains insufficient. See [agents/README.md](../agents/README.md) for the role boundary.

## Change and validation

Read [AGENTS.md](AGENTS.md) before editing. Launcher configuration changes use `pnpm tooling:check`. A successful static check does not prove the current Codex session has restarted, authenticated, or connected to the MCP server.
