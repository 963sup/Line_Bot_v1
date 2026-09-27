---
name: context-convergence
description: Machine-tracked workflow to review and converge all repository Markdown.
---

# Context convergence

Priority: `Authority > Relevant Context > Responsibility > Machine Truth > Evidence > Encoding`.

Goal: every Markdown earns its bytes.

Use `pnpm docs:convergence`:

- `status` / `next`: coverage and oldest unresolved work
- `begin <path>`: capture baseline
- `record <path> <keep|updated|distilled|blocked> [--source <path>]`: close review
- `review-skill <name> <keep|refreshed|blocked>`: imported corpus
- `complete`: strict zero-unresolved check
- `seal`: pass strict check then set `phase=complete`

Per item load only applicable AGENTS + authority/freshness evidence; classify truth/instruction/router/reference/change-history/generated-upstream; then update, distill, move/merge, delete, keep, or refresh upstream.

Preserve Owner/Truth/Boundary, security/authorization, transaction/replay/isolation/recovery, and validation. Edited existing Markdown must shrink; if required truth cannot fit, resolve ownership/split. Moves/deletes close references.

After sealing, new/stale Markdown fails `docs:check` until reviewed.
