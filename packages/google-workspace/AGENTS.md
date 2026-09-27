# @line-work/google-workspace

Owner: Google Workspace/Maps provider protocol and adapters. Canonical semantics: [Google Workspace](../../docs/owners/google-workspace.md).

- Server-only. Caller establishes identity, scope, resource owner, and operation intent before provider access.
- Do not own Account identity links, business authorization, browser token caches, or arbitrary URL proxying.
- Preserve complete pagination, timeout/cancel/partial-failure and unknown-write semantics, plus credential redaction.
- Keep Workspace OAuth separate from Maps credentials; address resolution is not Attendance geofence proof.
