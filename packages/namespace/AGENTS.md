# Namespace package constraints

Local constraints for `@line_bot_v1/namespace`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- User and Organization share the top-level account login namespace; root reservations are strictly protected.
- Global and scoped name claim, rename, release, and reservation use the frozen family profile and occur atomically in the consuming Owner's database transaction.
- Namespace owns binding, occupancy, aliases, normalization, and resolution. The consuming resource Owner retains authorization, lifecycle eligibility, resource version, event, and command replay decisions.
- Resolution returns locator evidence only; it never grants resource access.
- Repository old-name aliases remain occupied for their Repository. Enterprise slug, Account login, and Team slug release rules must not be generalized across families.
- URL paths construct locators; locator resolution never implies authorization.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
