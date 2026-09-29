---
agent: 'agent'
description: 'Resolve one ownership, boundary, dependency, or architecture change from repository evidence'
---

Follow `docs/tasks/architecture-change.md`.

Architecture intent: ${input:intent:Describe the business result or architecture problem}

If the intent uses GitHub-derived semantics, resolve the exact `architecture/domain/fpt/*.json` file/symbol/field before the local overlay. FPT is domain truth, not a benchmark or implementation opt-in. Return a unique Owner, Source of Truth, Boundary/Dependency direction, correct change, and Validation. Do not add abstractions from pattern preference alone.
