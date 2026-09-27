---
name: context-convergence
description: Standard workflow for Markdown convergence, instruction compression, AGENTS.md minimization, and agent-context optimization. Load whenever reducing or restructuring agent-facing Markdown.
---

# Context convergence

Priority: `Authority > Relevant Context > Responsibility > Machine-readable Truth > Validation Evidence > Encoding`.

Goal: minimum context for a correct agent decision.

1. Unless a file is named, choose the oldest unprocessed Markdown.
2. Read only applicable `AGENTS.md` plus the canonical source needed to judge that file.
3. Give the file one job: instruction, routing, current truth, reference, or change/history.
4. Delete duplicate, stale, vague, historical, example-heavy, or machine-derived text that does not change a decision.
5. Preserve anything that changes Authority, Owner, Truth, Boundary/Dependency, Invariant, Security/Authorization, Recovery, Change Surface, or Validation.
6. Prefer direct natural language and canonical references; do not add process or tooling without need.
7. Existing files must decrease in bytes. If reduction weakens correctness, make no change.
8. Change one file at a time; continue oldest → next oldest.
9. Run only the narrowest canonical validation and report exactly its evidence.

Keep a statement only if removing it could change a correct action.

Preferred shape: `Owner → Boundary → Invariant → Decision Rule → Validation`.

Stop when more reading or compression no longer changes the decision.
