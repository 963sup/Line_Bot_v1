# Codex runtime-support script constraints

Read [README.md](README.md) for launcher purpose and invocation flow. Scripts in this directory support Codex runtime transport only; they never own product behaviour, repository truth, or external provider mutation.

- Keep launchers deterministic, worktree-relative, and least-privilege. Do not add credentials, product environment loading, dashboard/UI processes, or persistent agent memory without an explicit runtime contract.
- Serena remains a bounded, read-only symbol-exploration transport. It is not a product index, a replacement for `pnpm semantic`, or a general agent role.
- Preserve failure diagnostics without emitting secrets or unbounded tool output.
- Validate launcher changes with `pnpm tooling:check`; run the smallest relevant transport diagnosis only when the task explicitly requires runtime evidence.
