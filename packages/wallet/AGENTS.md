# Wallet package constraints

Local constraints for `@line_bot_v1/wallet`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Wallet acts as the application gateway for user balance queries and credit/debit intents.
- Wallet delegates atomic balance mutations to @line_bot_v1/ledger; does not bypass ledger invariants.
- Wallet balance view is a real-time aggregate of verified ledger entries.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
