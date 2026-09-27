# Google Workspace

Read this file for Google provider ownership. OAuth/write/recovery details: [Google Workspace reference](../reference/platform/google-workspace.md).

## Responsibility

`packages/google-workspace` owns Google provider protocol/adapters. It does not own Google↔User identity linking, Team/Project business truth, or authorization to execute a business operation.

## Invariants

- Google login proof ≠ Workspace API authorization.
- Provider adapter existence ≠ product capability enabled.
- Business owner validates actor/scope/resource before provider write.
- External writes stay outside long DB locks and use stable operation identity/readback for unknown result.
- Tokens/scopes remain server-side minimum-necessary technical capability.

Runtime package: `packages/google-workspace`.
