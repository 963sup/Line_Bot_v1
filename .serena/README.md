# Serena v2 project guide

Serena is an optional semantic navigation layer. It is not product authority and does not replace repository `AGENTS.md`, source, schemas, tests, exports, or canonical architecture data.

## Availability gate

Per task/session, do one bounded check:

1. Confirm Serena MCP tools are exposed by the host, or run `serena --version` from the repository root.
2. If the executable, MCP tools, LSP, project trust, or session is unavailable, record the failed layer and continue with `rg`, native file tools, TypeScript/package checks, and tests.
3. Do not repeatedly restart Serena, rebuild the index, reread manuals, or treat CLI success as MCP success. Recheck only after runtime/config changes or an actual Serena call failure.

## When to use it

Prefer Serena v2 + LSP for TypeScript/JavaScript symbols, references, diagnostics, semantic edits, safe deletion, and ignore-aware project navigation. Use native tools for ordinary files, configuration, shell, Git, patches, tests, and validation.

At the start of a live MCP session, call `initial_instructions` once if exposed; use that session's API and tool list. Do not reuse another server's session ID or repeatedly inject the manual.

## Project contract

- `.serena/project.yml` owns backend, language servers, ignore paths, API exposure, and read-only policy.
- TypeScript LSP must use the workspace-pinned executable configured there; verify real imports when the project graph is incomplete.
- `cache/` is volatile state: never edit, commit, or use it as evidence.
- `memories/` contains durable retrieval notes; memory mutations require [`memories/AGENTS.md`](memories/AGENTS.md), explicit task scope, and a final `serena memories check`.
- API availability does not authorize shell side effects, external project access, provider writes, or memory writes beyond the task.
- Keep secrets, provider data, personal data, raw logs, task transcripts, and non-general local paths out of `.serena/`.

## Minimal CLI reference

```bash
serena --version
serena project health-check
serena project index-file PATH
serena project index
serena start-mcp-server --project-from-cwd --context=codex --agent-interface=REPL
```

Use `serena <command> --help` when a command is actually needed; do not preload the full CLI manual. Index only the affected file or project when required. A successful index/health-check does not prove host MCP connectivity; verify one known symbol in the live session.

## Failure routing

| Symptom | Bounded response |
|---|---|
| `serena` not found | Check the prepared environment PATH once; then use native tools. Do not install an unpinned copy. |
| Host has no Serena tools | Check MCP registration/startup once; then use native tools. |
| LSP/project graph incomplete | Confirm imports, exports, tsconfig references, and tests with native search. |
| Memory operation needed | Read `memories/AGENTS.md` first; mutate only within explicit scope; run the memory check. |
| JSON-RPC/REPL failure | Preserve protocol stdout; read the bounded error; do not rebuild the index as a communication fix. |

Official references: [Serena](https://oraios.github.io/serena/), [Tools](https://oraios.github.io/serena/01-about/035_tools.html), [MCP clients](https://oraios.github.io/serena/02-usage/030_clients.html), [configuration](https://oraios.github.io/serena/02-usage/050_configuration.html), [security](https://oraios.github.io/serena/02-usage/070_security.html).
