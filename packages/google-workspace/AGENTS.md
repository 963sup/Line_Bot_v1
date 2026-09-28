# Google Workspace package constraints

Local constraints for `@line_bot_v1/google-workspace`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Integration adapter owns external protocol mapping only; holds no internal business truth.
- OAuth tokens must be passed client-side via Bearer headers; no client secrets in code.
- API failures are translated into structured, recoverable domain error representations.
- Public API surface is defined exclusively in `package.json#exports`.
- Private implementations in `src/` must not be imported via relative paths by external packages.
