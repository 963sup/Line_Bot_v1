---
name: context-convergence
description: Standard workflow to review and converge repository Markdown through update, distillation, relocation, deletion, or compression.
---

# Context convergence

Priority: `Authority > Relevant Context > Responsibility > Machine Truth > Evidence > Encoding`.

Goal: every Markdown earns its bytes.

1. Inventory all `*.md`; process oldest-modified first.
2. Per file, load only applicable `AGENTS.md`, authoritative owner/source, and freshness evidence.
3. Classify: truth, instruction, router, reference, change/history, generated/upstream.
4. Check for stale, duplicate, misplaced, vague, obsolete, or machine-derived content.
5. Choose: update, distill, move/merge, delete, keep, or upstream-refresh. Review external corpus too; refresh via its source workflow, not silent local rewrite.
6. Preserve Authority, Owner, Boundary/Dependency, Invariants, Security/Authorization, Transaction/Replay/Isolation/Recovery, and Validation semantics.
7. Edited existing files must shrink in bytes. If truth cannot be updated while shrinking, resolve ownership/split instead of padding.
8. Continue until every Markdown has an outcome.
9. Run only the narrowest canonical validation and report exact evidence.

Keep text only when removing it could change a correct decision or required explanation.

Shape: `Owner → Truth → Boundary → Invariant → Decision → Validation`.
