---
name: context-convergence
description: Converge repository Markdown and agent instructions to the smallest sufficient context without weakening ownership, source-of-truth, boundary, security, or validation semantics. Use for instruction cleanup, Markdown distillation, AGENTS.md minimization, and agent-context optimization.
---

# Context convergence

Reduce decision-path context, not truth.

## Workflow

1. Read only the applicable root/nearest `AGENTS.md` and the canonical source needed for the target file.
2. Pick one existing Markdown file at a time; when order matters, start with the oldest unprocessed candidate.
3. Identify its single retrieval job: instruction, router, current truth, reference, or change/history evidence.
4. Remove duplicated facts, parent rules, examples, history, and machine-readable facts already owned elsewhere. Replace them with direct canonical references when needed.
5. Preserve anything that changes Owner, Source of Truth, Boundary/Dependency, Invariant, Security/Authorization, Recovery, or Validation.
6. For an existing file, require the edited file to be smaller than before. If reduction would weaken semantics, do not force the edit.
7. Validate with the narrowest canonical command that actually covers the change and report only the evidence produced.

## Decision rule

Keep content only if removing it would change a correct agent decision.

Prefer:

`Owner → Boundary → Invariant → Decision Rule → Validation`

Stop when further compression would no longer reduce context without reducing correctness.
