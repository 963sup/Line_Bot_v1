# Codex runtime scope

- `.codex/` owns Codex runtime config, agent profiles, and command-safety policy; never product/business/repository truth.
- `config.toml` stores machine config; [agents/AGENTS.md](agents/AGENTS.md) owns human-readable model/role routing.
- Agent profiles may restrict role/tools but do not duplicate repository rules; root + nearest AGENTS still apply.
- `rules/*.rules` enforces Codex command safety only and never replaces external-platform authorization.
- Validate runtime config with `tooling:check`; use `tooling:rules` for execpolicy semantics. Static success ≠ current-session reload.
- Do not broaden sandbox/approval or command prefixes to make a task pass; verify allow/deny cases and report runtime-load evidence separately.
