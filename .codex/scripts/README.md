# Codex runtime-support scripts

**Layer coverage:** L4 Capabilities/transports — runtime transport adapter.

This directory contains support code for configured Codex transports. It is not a general automation directory and does not own application execution.

## Function, use, and non-goals

Use these files only to bridge `.codex/config.toml` to a local runtime transport.
They must remain worktree-local, deterministic, and provider-neutral. Product
automation belongs under repository `scripts/`, not here.

| File | Title / function | Called by | Effect boundary |
| --- | --- | --- |
| [start-serena.mjs](start-serena.mjs) | Serena MCP launcher | `config.toml` MCP registration | Resolves only the current worktree and local Serena installation; starts no dashboard or memory store. |
| [serena-entry.py](serena-entry.py) | Serena CLI entry adapter | `start-serena.mjs` | Avoids the Windows console shim; performs no product operation. |
| [configure-serena.py](configure-serena.py) | Serena least-privilege configurator | Explicit Serena setup/maintenance | Restricts the server to symbol-query tools and disables GUI/dashboard. |

## Runtime flow

`config.toml` registers `start-serena.mjs`. The launcher resolves the current checkout and its local Serena installation, then starts the MCP entry point. When Serena is absent, it fails with a bounded diagnostic rather than downloading or configuring a global tool.

Serena is supplementary symbol exploration. Primary first uses `pnpm semantic plan/context` for owner and contract resolution; `repository-mapper` may use Serena only when that resolution remains insufficient. See [agents/README.md](../agents/README.md) for the role boundary.

## Change and validation

Read [AGENTS.md](AGENTS.md) before editing. Launcher configuration changes use `pnpm tooling:check`. A successful static check does not prove the current Codex session has restarted, authenticated, or connected to the MCP server.

## Approval boundary

These launchers do not auto-install dependencies, load product credentials, or grant MCP authority. Whether the current session may start or use a transport is still decided by its configured approval policy. A transport process being available does not authorize its product-side effects.

## Naming and admission rule

Use `<transport>-<primary-action>.<ext>` for a launcher or adapter. Do not add a
script merely to wrap a generic command. A new file requires a configured
transport consumer, a distinct least-privilege boundary, a deterministic failure
mode, and a validation path.
