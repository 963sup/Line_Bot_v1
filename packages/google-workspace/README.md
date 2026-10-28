# Google Workspace package

Routing and module overview for `@line_bot_v1/google-workspace`.

- Semantic Owner: `google-workspace`
- Authority document: [`docs/owners/google-workspace.md`](../../docs/owners/google-workspace.md)
- Machine boundaries: [`architecture/registry.json#modules`](../../architecture/registry.json#modules)
- Persistence mapping: [`architecture/registry.json#data`](../../architecture/registry.json#data)

## Scope

Integration adapter for Google Workspace OAuth tokens, Calendar, Sheets, and Drive APIs.

## Canonical provider boundary

This package owns Google Workspace transport adapters, OAuth token handling and provider error mapping. It does not own LINE identity, product authorization, Team／Project business state, background synchronization or generic Google action routing. Every write requires a current local owner／scope／version, explicit user confirmation and an operation state that can represent `unknown`; remote success followed by local timeout must reconcile before retry.

Provider identity linking, Workspace account connection and local external-resource binding are separate relationships. Never infer one from another, use email or provider metadata as business authorization, or reuse Supabase／login credentials as Workspace API tokens. OAuth and recovery readiness require package tests, owner contract and provider readback.
