# Workforce package constraints

Local constraints for `@line_bot_v1/workforce`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Module remains inactive until workforce scheduling models and shift contracts are deployed.
- Workforce references User and Workplace entities across domain boundaries.
- Roster publications require versioned approval workflows.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
