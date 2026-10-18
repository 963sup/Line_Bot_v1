# Project package constraints

Local constraints for `@line_bot_v1/project`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Project references work items (issues) but does not acquire Issue or Repository source authority.
- Project owns current Project authorization and lifecycle. WBS owns Project-scoped WBS documents/Revisions/governance; Actions owns fixed automation rules/Runs. Consumers use Project's public content-scope output contract.
- Project field value changes must not mutate the underlying issue truth.
- Project items can be draft items or references to external work items.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
