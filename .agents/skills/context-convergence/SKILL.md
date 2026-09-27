---
name: context-convergence
description: Machine-tracked convergence for all repository Markdown.
---

# Context convergence

Priority: `Authority > Context > Responsibility > Machine Truth > Evidence > Encoding`.
Goal: every Markdown earns its bytes.

Use `pnpm docs:convergence`:

- `status` / `next`: coverage / oldest unresolved
- `begin <path>`: baseline
- `record <path> <keep|updated|distilled|blocked> [--source <path>]`: close file
- `retire <path> <deleted|moved|merged> [target]`: close removed file
- `review-skill <name> <keep|refreshed|blocked>`: imported corpus
- `complete`: strict zero-unresolved check
- `seal`: strict pass → `phase=complete`

Per unit load only applicable AGENTS + authority/freshness evidence; classify truth/instruction/router/reference/change-history/generated-upstream; choose update, distill, move/merge, delete, keep, or upstream refresh.

Preserve Owner/Truth/Boundary, security/authorization, transaction/replay/isolation/recovery, validation. Edited Markdown must shrink; if truth cannot fit, resolve ownership/split. Moves/deletes close references.

After sealing, new/stale Markdown fails `docs:check`.
