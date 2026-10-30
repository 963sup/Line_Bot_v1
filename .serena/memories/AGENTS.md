# Serena memory graph contract

Inherits the [Serena project contract](../AGENTS.md).

## Purpose

These files let an AI with zero repository context load only the minimum durable knowledge needed for its task. They are a directed retrieval graph, not a duplicate wiki, task log, or prompt dump.

## Required flat graph

```text
mem:eme_core
├── mem:eme_project_overview
├── mem:eme_architecture_authority
├── mem:eme_architecture_ownership
├── mem:eme_engineering_commands
├── mem:eme_engineering_completion
└── mem:eme_engineering_toolchain
```

- Every project memory is a flat file named `eme_<area>_<topic>.md`: lower-case ASCII and underscores only. No project-memory subdirectories.
- `mem:eme_core` is the only mandatory entry point. It contains routing triggers and no detailed implementation facts.
- Each child has exactly one primary question. It contains dense, stable answers and may link only to a narrower necessary child.
- `memory_maintenance.md` is the one reserved Serena file-name exception: Serena creates and reads it during onboarding. Do not rename it to an `eme_` name.
- Future knowledge uses the same flat scheme, for example `eme_domain_attendance.md`, `eme_app_web.md`, `eme_integration_line.md`, `eme_operation_release.md`, or `eme_decision_identity_isolation.md`.

## Content constraints

- Add only durable, non-obvious facts that prevent costly rediscovery and have a real future consumer.
- Source of truth remains repository code, manifests, schemas, tests, and architecture authority. Never copy large authorities or replace them with prose summaries.
- Do not store temporary status, chat history, branch/SHA-specific evidence, raw command output, credentials, personal data, or generic framework knowledge.
- Parents state when a child is relevant. Children state facts only; they do not repeat task workflow or global instructions.
- References must use backticked `mem:<name>` syntax and target an existing flat memory name, for example `mem:eme_architecture_authority`. Do not create duplicate memories for the same question.

## Mutation constraints

1. Read `mem:eme_core` and `mem:memory_maintenance` before adding or changing a memory.
2. Reuse the existing owner; create a new file only when no current node can own the fact without gaining a second responsibility.
3. Rename through Serena's memory rename operation when available; otherwise update every incoming `mem:` reference atomically.
4. After every graph change, run `serena memories check`. Do not claim the graph is usable if that check reports a broken reference.
