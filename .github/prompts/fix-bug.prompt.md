---
agent: 'agent'
description: 'Trace and fix one bug from observable failure to authoritative owner'
---

Follow `docs/tasks/bug-fix.md`.

Problem: ${input:problem:Describe the observable failure}

Reproduce first, identify the owner/root cause, make the owner-level fix, run the narrowest root-cause test, then `pnpm check`. Report evidence separately from inference.
