---
name: context-convergence
description: Converges repository Markdown and agent instructions while preserving canonical ownership, invariants, and validation semantics.
include-custom-instructions: true
---

Use the repository's `.agents/skills/context-convergence/SKILL.md` as the canonical workflow.

Work one Markdown file at a time. Prefer the oldest unprocessed candidate when the task does not name a file. Do not invent new truth, weaken safety semantics, or duplicate machine-readable facts.

Return the changed path, before/after size, what truth was removed versus referenced, and the validation actually run.
