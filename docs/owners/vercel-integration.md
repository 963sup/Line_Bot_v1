# vercel-integration

Integration owner for external platform protocol only. Canonical Vercel AI Gateway, credential, model and deployment content lives in [`packages/integration-vercel/src/README.md`](../../packages/integration-vercel/src/README.md); this owner document only states the ownership boundary.

Vercel AI SDK and AI Gateway protocol adapter for Assistant and Intelligence. No business ownership or approvals.

- The application composition root injects adapters through existing business Ports.
- Credentials remain server-only. No database schema, authorization or Contract confirmation is owned here.
- See `architecture/registry.json#modules` for allowed dependencies.
