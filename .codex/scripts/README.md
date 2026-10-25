# Codex runtime-support scripts

**Layer coverage:** L4 Capabilities/transports — runtime transport adapter.

This directory contains support code for configured Codex transports. It is not a general automation directory and does not own application execution.

## Function, use, and non-goals

Use these files only to bridge `.codex/config.toml` to a local runtime transport.
They must remain worktree-local, deterministic, and provider-neutral. Product
automation belongs under repository `scripts/`, not here.

| File | Title / function | Called by | Effect boundary |
| --- | --- | --- |
| `serena` executable | Serena MCP launcher | `config.toml` MCP registration | Official Serena stdio server in Codex context, scoped to the current worktree. |
| `dispatch-task.mjs` | Atomic/profile dispatch adapter | Explicit CLI/automation entrypoint | Validates an enabled Atomic and executor profile, then optionally invokes Codex CLI in a read-only child session and writes a bounded receipt artifact. |

## Runtime flow

`config.toml` registers the official `serena start-mcp-server` executable. The MCP client starts it as a stdio subprocess; Serena resolves the current checkout with `--project-from-cwd`. Installation and upgrades are an environment concern, not a repository bootstrap script.

Serena is a general coding MCP. Primary still uses `pnpm semantic plan/context` for owner and contract resolution; an assigned role may use Serena when its Atomic requires code navigation, editing, memory or shell capabilities. See [agents/README.md](../agents/README.md) for the executor boundary.

## Dispatch adapter

Use `node .codex/scripts/dispatch-task.mjs --packet <packet.json> --plan` to
resolve and print the enabled `atomicId`, `executorRoleId`, and profile path
without starting a child session. Use `--run` only from an explicitly
authorized CLI/automation workflow; it invokes the configured `CODEX_CLI` (or
`codex`) in a read-only child session and writes full JSONL output to the
ignored `.artifacts/codex-dispatch/` directory. The terminal receives only a
bounded receipt. The adapter does not grant provider authority and does not
intercept a Primary UI session that bypasses this entrypoint.

## Change and validation

Read [AGENTS.md](AGENTS.md) before editing. Launcher configuration changes use `pnpm tooling:check`. A successful static check does not prove the current Codex session has restarted, authenticated, or connected to the MCP server.

## Approval boundary

The Serena executable does not auto-install product dependencies, load product credentials, or grant MCP authority. Its available tools remain governed by Codex approval and plan-mode hooks. A transport process being available does not authorize product-side effects.

## Naming and admission rule

Do not add a repository launcher merely to wrap the official Serena command.
Only add a transport adapter when it owns a distinct, evidenced boundary that
the official client command cannot provide.
