# Codex runtime scope

**Layer scope:** L2 Orchestration and L4 Capabilities/transports.

Read [README.md](README.md) for the six-layer design and directory map. This file
contains only the runtime constraints that apply to every child.

- `.codex/` owns Codex runtime configuration, role profiles, command-safety policy, and support launchers. It never owns product/business/repository truth.
- Keep the separation: `config.toml` configures transport; `agents/` owns roles and handoffs; `rules/` owns command-pattern safety; `scripts/` owns runtime support only.
- When a task needs L4 capability selection rather than a known direct path, read [CAPABILITIES.md](CAPABILITIES.md) and select only its matching route; do not infer a route from installed-tool inventory.
- Root plus nearest `AGENTS.md` always apply. Role files cannot override parent sandbox, approval, provider authorization, or repository governance.
- `rules/*.rules` only classify shell commands. They do not authorize provider writes, deployment, data handling, or a change of product scope.
- Do not broaden sandbox, approval, MCP, or command prefixes merely to pass a task. Preserve least privilege and report an unavailable capability instead.
- Validate changes under this tree with `pnpm tooling:check`; validate rule semantics with `pnpm tooling:rules`; validate Markdown links with `pnpm docs:check`. Static checks do not prove a running session reloaded configuration.
