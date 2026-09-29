# GitHub integration scope

`.github/` owns triggers, permissions, concurrency, checkout/setup, job dependencies, step-scoped secrets and GitHub artifacts. Executable operation logic belongs in `scripts/`; product/provider behavior stays with its owner.

## Governing files

本 scope 修改前仍必須遵守 root `AGENTS.md#Mandatory governing set`，尤其是以下 current authority / guard：

`architecture/README.md` · `architecture/data-topology.json` · `architecture/implementation-topology.json` · `architecture/domain/fpt/*.json` + `architecture/domain/fpt-source.json` · `architecture/semantic-model.json` · `.dependency-cruiser.mjs` · `biome.json` · `knip.jsonc`

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。`.github` prompt / agent / template 不得把 `architecture/domain/fpt/*.json` 描述為 benchmark 或 optional adoption source；它是 GitHub GraphQL domain truth，只有 `fpt-source.json` 是 provenance evidence。

## Release

- Main push starts read-only release planning and reusable full validation in parallel. Every external operation requires both to succeed for the same SHA; checkout that exact SHA and guard current main before external writes.
- Full validation partitions the canonical command into independent runner groups, with a failing aggregate gate for failed/cancelled/skipped groups. Keep local validation sequential where generated files overlap. Cancel superseded checks, never in-progress external writes.
- Supabase runs only for pending `supabase/schemas/*.sql` changes. Call `pnpm schema:remote sync` once; no automatic compatibility repair or unchanged-schema verification. Apply the declared diff, including destructive DDL, without creating or changing migration history.
- Rich Menu runs only for pending image or publication-code changes. Use one publication job and `pnpm line:rich-menu publish all`; no duplicate direct/after-deployment flows or unrelated provider dependency.
- Web deployment remains affected-build driven. A skipped unchanged-schema job must not block deployment; a failed required schema sync must block it.
- Attendance scheduler remains a separate operation. Run for its own changed inputs or changed schema/Web deployment, accepting unchanged dependencies as skipped.
- Keep source classification and successful-publication baselines in the tested release planner. A failed operation must remain pending on the next run.

## Boundaries / evidence

YAML calls canonical package commands; no parsing, provider SQL, recovery algorithms or parallel implementation of owner behavior. Setup/build, job routing and artifact upload are GitHub plumbing.

Validation is secret-free and read-only. External credentials belong only to their consuming step; checkout does not persist credentials. Serialize writes to the same remote resource, not the entire Release workflow. Keep target, transaction, readback and failure checks; workflow success is not device acceptance.

Run `tooling:check`, affected owner tests and repository checks. Tooling validates wiring and security boundaries; owner tests validate operation behavior. Contracts: [Release](../docs/reference/operations/release.md).
