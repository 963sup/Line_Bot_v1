# Codex runtime-support script constraints

**Layer scope:** L4 Capabilities/transports — runtime transport adapter.

Read [README.md](README.md) for launcher purpose and invocation flow. Scripts in this directory support Codex runtime transport only; they never own product behaviour, repository truth, or external provider mutation.

- Keep launchers deterministic, worktree-relative, and least-privilege. Do not add credentials, product environment loading, dashboard/UI processes, or persistent agent memory without an explicit runtime contract.
- Serena is a coding MCP transport. It is not a product index, a replacement for `pnpm semantic`, or a general agent role; each Atomic still defines its permitted use and evidence boundary.
- Preserve failure diagnostics without emitting secrets or unbounded tool output.
- Validate launcher changes with `pnpm tooling:check`; run the smallest relevant transport diagnosis only when the task explicitly requires runtime evidence.
