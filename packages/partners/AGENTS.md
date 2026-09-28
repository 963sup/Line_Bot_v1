# Partners package constraints

Local constraints for `@line_bot_v1/partners`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Partner entity lifecycle is independent of internal organization accounts.
- Referral tracking records must preserve immutable submission timestamps.
- Partner contact mutations require expected version checks.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
