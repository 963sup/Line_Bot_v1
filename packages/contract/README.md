# Contract

Contract contains two independent aggregates. Historical engineering agreements pin exact Content
Work/Task plan items and retain their current lifecycle/revision format. Purchase-order documents
use the Contract-owned document intake contract, retain every accepted source row and commercial
value, pin an exact File revision, and commit drafts/confirmations atomically with request receipts.

In the current document flow, **File → Intelligence → Contract → Content → WBS**, Contract is the
structured commercial-truth owner. Intelligence submits one complete untrusted candidate through
Contract's public command; only a CONFIRMED ContractDocument revision may be read by Content's
fixed whole-document expansion. Contract never creates Content nodes or WBS records.
The new purchase-order aggregate does not decode or rewrite historical engineering-agreement rows.

The published `purchase-order/v1` schema describes provider input. `intentFingerprint` is a technical
idempotency key supplied by the calling Intelligence attempt for pre-provider receipt recovery; it
is not authorization or user confirmation. The provider extracts every source row and Contract
derives the displayed row count from that candidate. A person must read the saved draft and
diagnostics before confirming; discrepancy acknowledgement reasons must come from that human
review and must never be generated from provider output.

Read the [owner contract](../../docs/owners/contract.md), [local constraints](AGENTS.md),
[generated semantics](SEMANTICS.md) and [authenticated CLI](../../scripts/README.md).
