# Repository Pulse internal command

Build workspaces and run `pnpm insights:run`. Supply one JSON object on stdin with `proof` and `query`: repositoryId and optional epoch-millisecond from/to. Never save real proofs in examples or pass them in argv.

This is a read-only database operation. [Insights](../../docs/owners/insights.md) composes owner-published metrics; the host verifies LINE identity and injects the current Repository scope. Output preserves source availability and recorded-history coverage.
