# @line-work/ledger

Owner: immutable value facts, posting identity, and idempotency. Canonical semantics: [Ledger](../../docs/owners/ledger.md).

- Wallet derives balances; consumers never mutate Ledger persistence directly.
- Preserve holder/scope isolation, source identity, atomicity, immutable history, and reconciliation.
- Exact retry returns the same fact; distinct business events must not reuse a posting identity.
- Do not rewrite historical source tuples or holder IDs for naming symmetry; migration must preserve parity and recovery evidence.
