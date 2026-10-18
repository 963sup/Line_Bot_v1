# Release

Main push starts Release planning and reusable Validate concurrently for its exact SHA. External operations require both successful planning and full validation, then recheck current main before writing. GitHub owns trigger, permissions, job dependencies, secrets and artifacts; commands own executable operations.

## Pending sources

`pnpm github:release-plan` compares each operation with its own successful ancestor job, including completed jobs in still-running Releases. Failed/skipped operations do not advance its cursor; a successful same-SHA operation is not repeated on rerun. Missing baseline means first publication. Planning is an early snapshot: an overlapping operation that finishes later may cause redundant convergence, but resource locks and current-main checks prevent concurrent writes to the same target.

| Operation | Changed inputs | Command |
| --- | --- | --- |
| Supabase | `supabase/schemas/*.sql` | `pnpm schema:remote sync` |
| Rich Menu | images, publication code and its executable inputs | `pnpm line:rich-menu publish all` |
| Web | Turbo Web build graph, excluding publication-only sources | `pnpm vercel:deploy:production --live --sha <sha>` |
| Attendance scheduler | scheduler code, pending schema or Web runtime since scheduler success | `pnpm attendance:scheduler reconcile --live --sha <sha>` |

No relevant pending source means no remote operation. Source classifiers and tests live in `scripts/github/release-plan.mjs`; do not copy their path lists into YAML.

## Execution

- Validate runs eight independent groups, including Web build, on separate runners while release planning runs. All groups must succeed before publication. Local build evidence is not the Vercel production artifact; Vercel still builds with its production configuration during deployment.
- Supabase directly applies the declared diff, including destructive DDL, then verifies parity/security and unchanged migration history. No automatic historical compatibility repair or unchanged-schema verification。每次 remote SQL write 都在 query 前重新驗證 exact release SHA 仍是 current `main`。Scoped identifier authority 的首次 existing-database 變更會先取得 provider recovery readback 或 [Recovery](recovery.md) 規定的 exact project / authority / schema 無備份風險授權，再以 governance + stable table locks 進入明確 stop/drain 維護窗，在同一 DDL transaction 執行一次 cutover並留下 persistent frozen marker；fresh bootstrap 由 catalog 證明無 retained business data時可略過 recovery gate，但同樣先保持 frozen。只有 exact-SHA Vercel production deployment/readback 成功後，Release 才執行 `activate-identifiers` 解凍。部署或 activation 失敗會保留 database freeze，由後續 compatible current-main Release forward-fix；不重 seed或讓舊 writer 恢復。
- Rich Menu has one independent job. Publish performs preflight/create/upload/activate/readback in one process; it does not wait for Supabase or Web deployment.
- Web waits for changed schema sync to succeed; an unchanged, skipped schema job does not block it.
- Web publication baseline advances only after both the exact-SHA deployment/readback and, for workflows containing it, scoped identifier runtime activation succeed. A failed/cancelled/skipped activation keeps the prior Web baseline, so a later documentation-only `main` revision still redeploys the pending compatible runtime before retrying activation. Legacy Release runs without the activation job retain their original deployment evidence.
- Scheduler waits for required schema/Web changes to succeed and accepts unchanged dependencies as skipped. It reconciles pg_cron/pg_net/Vault and reads back the exact job. Missing worker credential or inconsistent target/readback fails closed.

Every write keeps a current-main check and exact target. Supabase and scheduler serialize access to the same database; LINE and Vercel have their own resource locks. There is no whole-Release lock, so unrelated providers in different releases can progress independently. Credentials are step-scoped; general validation remains secret-free. No operation invents business identity or authorization.

## Evidence

Validation, schema convergence, Web deployment, LINE publication and device acceptance are distinct evidence. Artifacts record transient plans/readbacks, never migration or business authority.

Contracts: [Supabase](../platform/supabase.md), [Vercel](../platform/vercel.md), [Rich Menu](../line/rich-menu.md), [Schema](../data/schema.md), [Recovery](recovery.md).
