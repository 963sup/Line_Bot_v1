---
agent: 'agent'
description: 'Trace and fix one bug from observable failure to authoritative owner'
---

Follow `docs/tasks/bug-fix.md`.

Problem: ${input:problem:Describe the observable failure}

Reproduce first, identify the owner/root cause, make the owner-level fix, run the narrowest root-cause test, then `pnpm check`. Report evidence separately from inference.

Follow the default repository change loop in `docs/reference/engineering/development-workflow.md#default-repository-change-loop`.

## Delivery

Report the changed owner/source, original reproduction result, validation commands and results, and any unverified behavior.
