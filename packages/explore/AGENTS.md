# Explore package constraints

Local constraints for `@line_bot_v1/explore`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Explore is a read projection over Repository and Star facts; it has no independent write authority.
- Repository visibility and access must be respected before including items in trending/explore results.
- Public exports expose read-model query interfaces only.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
