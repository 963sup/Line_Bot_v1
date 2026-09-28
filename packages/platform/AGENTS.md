# Platform package constraints

Local constraints for `@line_bot_v1/platform`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Platform contains neutral technical utilities only; holds no business authority or domain logic.
- Must not depend on any business domain packages (account, repository, etc.).
- All utilities must be deterministic and testable with mock injection.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
