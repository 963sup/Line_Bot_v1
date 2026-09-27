# @line-work/google-workspace

- Owner boundary: this package owns Google Workspace/Maps provider protocol and adapters, not Account identity links or business authorization. Canonical semantics: [Google Workspace](../../docs/owners/google-workspace.md).
- Server-only. Callers establish identity, scope, resource owner and operation intent before provider access; do not add browser token caches, Firebase authority or arbitrary URL proxying.
- Preserve complete pagination, cancellation/timeout/partial-failure semantics, unknown-write handling and credential redaction. Workspace OAuth and Maps credentials remain separate; address resolution is not Attendance geofence proof.
