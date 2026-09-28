# Namespace package constraints

Local constraints for `@line_bot_v1/namespace`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- User and Organization share the top-level account login namespace; root reservations are strictly protected.
- Login claim, rename, and reservation must occur atomically in the authoritative database transaction.
- URL paths construct locators; locator resolution never implies authorization.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
