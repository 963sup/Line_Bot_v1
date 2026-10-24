---
agent: 'agent'
description: 'Change one route or API without creating a second business writer'
---

Follow `docs/tasks/api-change.md`.

API change: ${input:change:Describe the route, protocol, or API behavior to change}

Separate transport changes from business capability changes. Preserve authorization, retry/replay, failure mapping, and secret boundaries where applicable.

Follow the default repository change loop in `docs/reference/engineering/development-workflow.md#default-repository-change-loop`.

## Delivery

Follow the minimum-sufficient implementation rule in root `AGENTS.md` after confirming Root Cause, Owner, Truth and Boundary. Report the changed owner/source, acceptance evidence, validation commands and results, and any unverified behavior.
