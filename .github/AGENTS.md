# GitHub integration scope

`.github/` owns triggers, permissions, concurrency, checkout/setup, job dependencies, step-scoped secrets and GitHub artifacts. Executable operation logic belongs in `scripts/`; product/provider behavior stays with its owner.

## Governing files

完整 authority 與讀取條件繼承 [root context contract](../AGENTS.md#effective-context-contract)；本檔只增加 local constraints，不另存 governing 清單。

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。`.github` prompt / agent / template 不得把 `architecture/domain/fpt/*.json` 描述為 benchmark 或 optional adoption source；它是 GitHub GraphQL domain truth，只有 `fpt-source.json` 是 provenance evidence。

## Release

- Main push starts read-only release planning and reusable changed-owner validation in parallel. Every external operation requires both to succeed for the same SHA; checkout that exact SHA and guard current main before external writes.
- Validation uses the same changed-owner selection contract in every environment: a reliable Git comparison selects only responsible groups and their transitive Turbo consumers; an absent or unreadable comparison conservatively selects every group. The aggregate gate rejects failed/cancelled/skipped selected groups. Keep local validation sequential where generated files overlap. Cancel superseded checks, never in-progress external writes.
- Supabase application schema runs only for pending `supabase/schemas/*.sql` changes. Call `pnpm schema:remote sync` once; no automatic compatibility repair or unchanged-schema verification. The separate File Bucket provider job runs only for changed native Storage configuration/operator, after any required schema convergence; it uses `pnpm storage:remote sync` once with exact target/current-main readback and scoped credentials. Apply the declared diff, including destructive DDL, without creating or changing migration history.
- Rich Menu runs only for pending image or publication-code changes. Use one publication job and `pnpm line:rich-menu publish all`; no duplicate direct/after-deployment flows or unrelated provider dependency.
- Web deployment remains affected-build driven. Skipped unchanged-schema/Storage jobs do not block deployment; failed required Schema or Storage publication blocks it.
- Attendance scheduler remains a separate operation. Run for its own changed inputs or changed schema/Web deployment, accepting unchanged dependencies as skipped.
- Keep source classification and successful-publication baselines in the tested release planner. A failed operation must remain pending on the next run.

## Issue / PR integration

- `ISSUE_TEMPLATE/` is GitHub intake and `pull_request_template.md` is PR evidence presentation. [Development workflow](../docs/reference/engineering/development-workflow.md#issue-pr-and-acceptance-trace) owns the Issue → PR → Merge → Acceptance → Regression procedure; neither template owns business truth or a second task database.
- Issue documents observable outcome, source evidence, root cause status and acceptance. PR documents the exact delivered subset, Owner / public boundary, minimum sufficient implementation and actual checks. Do not invent a bug root cause for feature/docs tasks.
- Use `Closes #N` only when merge satisfies the whole Issue; otherwise use `Refs #N` and name the remaining Release/Provider/Device acceptance Owner. A PR merge, green CI, deployed SHA and accepted business result are distinct.
- Do not create Issue-event validation jobs, auto-close workers or a second release/readback workflow. Regression trace links prior Issue / PR / SHA; reopen unresolved same-cause work or link a genuinely different-cause Issue.

## Boundaries / evidence

YAML calls canonical package commands; no parsing, provider SQL, recovery algorithms or parallel implementation of owner behavior. Setup/build, job routing and artifact upload are GitHub plumbing.

Validation is secret-free and read-only. External credentials belong only to their consuming step; checkout does not persist credentials. Serialize writes to the same remote resource, not the entire Release workflow. Keep target, transaction, readback and failure checks; workflow success is not device acceptance.

Run `tooling:check`, affected owner tests and repository checks. Tooling validates wiring and security boundaries; owner tests validate operation behavior. Contracts: [Release](../docs/reference/operations/release.md).
