# GitHub operation scripts

Own read-only GitHub evidence, pending-source classification and release planning. Provider transactions and recovery belong to their operation scripts.

- `release-plan.mjs` compares each operation against its own successful ancestor publication; failed/skipped jobs cannot advance that cursor. For workflow runs that contain the scoped identifier runtime activation job, Web publication is complete only when both deployment and activation succeeded; legacy runs without that job retain their historical deployment evidence.
- Supabase input is only `supabase/schemas/*.sql`. Rich Menu inputs include assets, operator scripts and executable publication dependencies; documentation/tests alone do not publish.
- Web affected decisions use the Turbo build graph. Publication-only sources must not force a Web deployment.
- Rich Menu remains a single independent GitHub job: menu-only assets do not wait for unrelated provider jobs. If a menu publication depends on pending Web runtime (or has no proven compatible Web publication baseline), its read-only exact-run readiness gate must wait for successful deployment plus identifier activation before LINE mutation; failed, skipped or unknown states fail closed. Planning returns facts; it never mutates providers.
- `current-main.mjs` proves the exact SHA is still main. It does not prove provider readiness.
- Share read-only API transport across actual consumers; fail closed on invalid evidence or network errors. Use read-only tokens.

Behavior is tested here. Tooling checks only canonical workflow wiring and GitHub authorization boundaries, not a second implementation of routing.
