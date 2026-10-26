# Serena project contract

This directory owns Serena's project-local configuration and durable memory graph. It is not product source, architecture authority, or a substitute for repository `AGENTS.md` rules.

## Serena MCP usage

- This project uses Serena v2's **REPL** interface as the primary semantic interface. The REPL is exposed through the combined global configuration, client context, active modes, and `project.yml`; a listed API is not permission to widen the persistent set.
- Normal operation exposes the REPL plus project activation/configuration operations, on-demand `serena_info`, the LSP APIs (`lsp.get_diagnostics_for_symbol`, `lsp.restart_language_server`, `lsp.safe_delete_symbol`), symbol-aware editing, and project-memory operations. Shell execution, external-project querying, arbitrary file creation, and dashboard opening are excluded; use Serena for structure-aware symbol edits and safe deletion, and Codex-native file operations for ordinary line/file changes.
- `initial_instructions` is the session manual. If it is exposed, call it once at session start; do not repeatedly inject its full output into context.
- `no-memories` disables memory tools and onboarding. `no-onboarding` retains memory operations but skips onboarding. A temporary onboarding session requires explicit authorization because onboarding and memory writes are edit-capable.
- Memory operations are: `list_memories`, `read_memory`, `write_memory`, `edit_memory`, `rename_memory`, and `delete_memory`. Prefer `rename_memory` for a rename because it updates marked `mem:` references. Use `delete_memory` only with explicit user authorization. Do not enable shell tools just to maintain memories.

## Boundaries

- `project.yml` owns Serena's local backend, ignores, tool exposure, and read-only policy. The normal configuration remains a bounded semantic, diagnostic, symbol-edit, and safe-refactoring surface. Do not broaden it permanently merely to perform a one-off investigation or onboarding.
- `memories/` holds versioned, durable agent retrieval notes. Its flat `eme_*.md` structure and mutation rules are owned by [memories/AGENTS.md](memories/AGENTS.md).
- `cache/` is volatile LSP state. Never use it as evidence, edit it, or commit it.
- Keep secrets, provider data, personal data, local paths that do not generalize, raw logs, and task transcripts out of this directory.

## Change protocol

1. Treat repository source, schemas, tests, and governing architecture files as truth; a Serena memory only routes an agent to that truth.
2. Preserve the bounded REPL API set. A temporary onboarding session may add only its required workflow tools for that session and must be restored afterward.
3. For any memory-graph change, obey `memories/AGENTS.md` and finish with `serena memories check` (with UTF-8 output on Windows when needed). `serena memories initialize` only seeds the reserved maintenance memory; it does not replace project memories.
4. Report memory changes separately from product behavior or validation claims.
