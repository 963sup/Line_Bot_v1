# Content

Repository-scoped complete plan revisions with the strict
`Subject -> Object -> SubObject -> Work -> Task` hierarchy, immutable measure definitions, planned
quantities and exact physical Resource revision pins. Replacement validates the whole document and
appends an immutable revision; the public reader resolves exact historical Work/Task bases for
Contract and Execution.

Content is the engineering-planning stage of **File → Intelligence → Contract → Content → WBS**.
It reads one exact CONFIRMED ContractDocument revision through a public injected reader, applies
the fixed `purchase-order-content-v1` whole-document policy, and stores only its own plan and
source-row coverage. It neither changes Contract commercial facts nor creates WBS; WBS consumes an
immutable Content revision through Content's public reader.

Neutral title/body validation lives in `@line_bot_v1/platform/text`. Read the
[owner contract](../../docs/owners/content.md), [local constraints](AGENTS.md) and generated
[semantics](SEMANTICS.md) before changing this package.
