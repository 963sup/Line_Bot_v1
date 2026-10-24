---
agent: 'agent'
description: 'Find or change one business rule at its semantic owner and executable enforcement'
---

Follow `docs/tasks/business-rule.md`.

Rule: ${input:rule:Name or describe the business rule}

Locate the semantic owner and authoritative implementation before editing prose. If the rule changes, update the minimum executable enforcement/test with it.

Follow the default repository change loop in `docs/reference/engineering/development-workflow.md#default-repository-change-loop`.

## Delivery

Follow the minimum-sufficient implementation rule in root `AGENTS.md` after confirming Root Cause, Owner, Truth and Boundary. Report the changed owner/source, acceptance evidence, validation commands and results, and any unverified behavior.
