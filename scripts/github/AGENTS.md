# GitHub operation scripts

Own read-only GitHub evidence, pending-source classification and release planning. Provider transactions and recovery belong to their operation scripts.

- `release-plan.mjs` compares each operation against its own successful ancestor publication; failed/skipped jobs cannot advance that cursor.
- Supabase input is only `supabase/schemas/*.sql`. Rich Menu inputs include assets, operator scripts and executable publication dependencies; documentation/tests alone do not publish.
- Web affected decisions use the Turbo build graph. Publication-only sources must not force a Web deployment.
- Rich Menu publication is independent of Supabase/Vercel. Planning returns facts; it never mutates providers.
- `current-main.mjs` proves the exact SHA is still main. It does not prove provider readiness.
- Share read-only API transport across actual consumers; fail closed on invalid evidence or network errors. Use read-only tokens.

Behavior is tested here. Tooling checks only canonical workflow wiring and GitHub authorization boundaries, not a second implementation of routing.
