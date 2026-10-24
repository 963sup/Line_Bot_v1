---
agent: 'agent'
description: 'Change schema or database state through the authoritative data owner'
---

Follow `docs/tasks/database-change.md`.

Database change: ${input:change:Describe the required persisted-state or schema result}

Identify the relation owner and atomic invariants first. Preserve RLS, grants, tenant isolation, recovery, and remote/local evidence boundaries.

Follow the default repository change loop in `docs/reference/engineering/development-workflow.md#default-repository-change-loop`.

## Delivery

Follow the minimum-sufficient implementation rule in root `AGENTS.md` after confirming Root Cause, Owner, Truth and Boundary. Report the changed owner/source, acceptance evidence, validation commands and results, and any unverified behavior.
