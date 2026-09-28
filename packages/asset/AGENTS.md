# Asset package constraints

Local constraints for `@line_bot_v1/asset`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Asset owns definition and denomination; balances and movements are owned by Wallet and Ledger.
- Asset code and scale are immutable once active transactions exist.
- Cross-package reward valuation consumes Asset interfaces via query/stable-identity.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
