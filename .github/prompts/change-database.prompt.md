---
agent: 'agent'
description: 'Change schema or database state through the authoritative data owner'
---

Follow `docs/tasks/database-change.md`.

Database change: ${input:change:Describe the required persisted-state or schema result}

Identify the relation owner and atomic invariants first. Preserve RLS, grants, tenant isolation, recovery, and remote/local evidence boundaries.
