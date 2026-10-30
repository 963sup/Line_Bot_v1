# Google Workspace package constraints

Local constraints for `@line_bot_v1/google-workspace`. Parent rules: [`packages/AGENTS.md`](../AGENTS.md).

## Local Invariants

- Integration adapter owns external protocol mapping only; holds no internal business truth.
- OAuth requests pass the caller-supplied access token in the Authorization Bearer header; this transport rule does not require moving credentials into browser code.
- API failures are translated into structured, recoverable domain error representations.
