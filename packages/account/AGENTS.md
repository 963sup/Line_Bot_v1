# Account package constraints

Local constraints for `@line_bot_v1/account`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Account is identity and kind authority; User is human product identity facet.
- Global login namespace is claimed and resolved via @line_bot_v1/namespace; do not maintain a second login lifecycle.
- External identity links (LINE, Google) verify proof before binding to Account.
- Authored User profile status is Account-owned, public-only in the current MVP, and distinct from
  both User lifecycle `status` and LINE provider profile/status data. Organization-scoped status is
  unsupported until Organization qualification and audience reads have an explicit contract.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
