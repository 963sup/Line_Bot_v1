---
name: context-convergence
description: Standard workflow to review and converge all repository Markdown through machine-tracked outcomes.
---

# Context convergence

Priority: `Authority > Relevant Context > Responsibility > Machine Truth > Evidence > Encoding`.

Goal: every Markdown earns its bytes.

Use `pnpm docs:convergence`:

- `status`: coverage/staleness
- `next`: oldest unresolved work
- `begin <path>`: capture byte/blob baseline
- `record <path> <keep|updated|distilled|blocked> [--source <path>]`: close review
- `review-skill <name> <keep|refreshed|blocked>`: imported corpus
- `complete`: strict zero-unresolved gate

Per item: load only applicable AGENTS + authority/freshness evidence; classify truth/instruction/router/reference/change-history/generated-upstream; choose update, distill, move/merge, delete, keep, or upstream refresh.

Preserve Owner/Truth/Boundary, security/authorization, transaction/replay/isolation/recovery, and validation. Edited existing Markdown must shrink; if required truth cannot fit, resolve ownership/split instead of padding. Moves/deletes close references.

Stop only when manifest coverage is complete and canonical validation passes.
