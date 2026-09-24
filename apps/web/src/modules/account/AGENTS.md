# Web account module

- Owns account-facing presentation, view models and interaction wiring only; Account package owns identity/lifecycle truth.
- Server revalidates identity, qualification, scope, version and replay; client profile/session state is never authority.
- Do not duplicate Account domain rules or query Account persistence from this module.
