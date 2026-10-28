# Serena project contract

This directory owns Serena's project-local configuration and durable memory graph. It is not product source, architecture authority, or a substitute for repository `AGENTS.md` rules.

## Serena MCP usage

- 操作速查與 LSP／REPL 範例見 [Serena README](README.md)；該文件是使用入口，當前 CLI `--help` 與實際 session 能力優先於速查表中的版本化示例。

- This project uses Serena v2's **REPL** interface as the primary semantic interface. API exposure is configured by `project.yml` together with the global configuration, client context, and active modes; classic tool inclusion lists do not control REPL APIs.
- Normal operation enables all APIs available with the LSP backend: `cfg`, `fs`, `edit`, `mem`, `shell`, `ext`, and `lsp`, including optional methods. JetBrains APIs require the separate JetBrains backend and are not available in this LSP session. Prefer Serena for semantic navigation, symbol edits, safe deletion, and composed ignore-aware reads; Codex-native operations remain available for ordinary file, shell, Git, test, and validation work.
- `initial_instructions` is the session manual. If it is exposed, call it once at session start; do not repeatedly inject its full output into context.
- `no-memories` disables memory tools and onboarding. `no-onboarding` retains memory operations but skips onboarding. A temporary onboarding session requires explicit authorization because onboarding and memory writes are edit-capable.
- Memory operations are: `list_memories`, `read_memory`, `write_memory`, `edit_memory`, `rename_memory`, and `delete_memory`. Prefer `rename_memory` for a rename because it updates marked `mem:` references. Use `delete_memory` only with explicit user authorization.

## Boundaries

- `project.yml` owns Serena's local backend, ignores, API exposure, and read-only policy. File APIs obey the project ignore boundary. API availability does not authorize shell side effects, external-project access, dashboard opening, or memory writes beyond the user's task.
- TypeScript LSP reuses the exact workspace-pinned executable. Keep its configured path and readiness budgets aligned with actual manifests and monorepo size; cross-package reference results still depend on the TypeScript project graph and must be checked against real imports when that graph is incomplete.
- `memories/` holds versioned, durable agent retrieval notes. Its flat `eme_*.md` structure and mutation rules are owned by [memories/AGENTS.md](memories/AGENTS.md).
- `cache/` is volatile LSP state. Never use it as evidence, edit it, or commit it.
- Keep secrets, provider data, personal data, local paths that do not generalize, raw logs, and task transcripts out of this directory.

## Change protocol

1. Treat repository source, schemas, tests, and governing architecture files as truth; a Serena memory only routes an agent to that truth.
2. Keep API exposure aligned with the installed Serena version and selected backend; explicitly include optional methods, which facade-level inclusion alone does not enable.
3. For any memory-graph change, obey `memories/AGENTS.md` and finish with `serena memories check` (with UTF-8 output on Windows when needed). `serena memories initialize` only seeds the reserved maintenance memory; it does not replace project memories.
4. Report memory changes separately from product behavior or validation claims.
