# Release

Main push starts Release planning and reusable Validate concurrently for its exact SHA. External operations require both successful planning and full validation, then recheck current main before writing. GitHub owns trigger, permissions, job dependencies, secrets and artifacts; commands own executable operations.

GitHub evidence is read through the shared `scripts/providers/github/api.mjs` transport. Job readers paginate `filter=all` and retain the latest attempt/job ID per name: a partial rerun preserves prerequisites that were not rerun, while a newer failed or pending job supersedes every older success. Planning, production deployment and repository imports use this same interpretation. Deployment additionally binds the current run attempt and accepts only nonterminal queued/in-progress Releases with matching immutable identity; completed/cancelled runs cannot authorize a new deployment.

## Pending sources

Provider release workflows own their triggers, exact revision checks, credentials, concurrency and readback. There is no shared release planner command.

| Operation | Changed inputs | Command |
| --- | --- | --- |
| Rich Menu | images, desired-state code, publication policy, LINE adapter and executable inputs | `pnpm line:rich-menu reconcile all` |

No relevant pending source means no remote operation. Rich Menu input classification belongs to the Rich Menu workflow path filters and manifest builder; it does not use a deleted release planner.

## File orphan recovery boundary

File-owned `file:reclaim` provides a read-only plan and separately gated quarantine/delete/readback implementation for never-committed Upload Intents. Production execution has **not** been wired into the main-push-only Release workflow; it must not be invoked from an arbitrary branch or by weakening CI trigger governance. Retained authority and recovery are defined by the [File owner](../../owners/file.md) and [Recovery](recovery.md).


## Execution

- Validate workflow 對 PR 與 `main` 執行 repository validation；merge candidate 必須以 current head 的成功結果為準。Local build evidence 不等於 provider deployment evidence。
- Repository 目前沒有自動 Supabase Schema、Storage 或 Scheduler Release workflow。Production schema 只能由受信任 operator 依已合併、已驗證的 current `main` canonical source 執行 exact bounded DDL，並保存 target／revision preflight、post-write readback 與 migration-history unchanged evidence。需要 runtime 協調、recovery 或 business data transform 的變更，必須在執行前另有對應 owner procedure。
- Rich Menu has one independent GitHub release job. It triggers only when Rich Menu executable inputs change and verifies the exact `main` SHA. The job runs `pnpm line:rich-menu reconcile all` with a per-channel concurrency lock; the command performs preflight, fingerprint comparison, create/upload/activate and readback in one process. Web deployment and LINE publication remain separate evidence; a menu URI change must include its Web deployment gate in the owning release change before publication. Failed reconciliation leaves the revision pending for a later retry and does not claim publication success.
- Vercel、Supabase 與 LINE publication 是彼此獨立的 provider evidence；涉及相依順序的 change 必須在 owning procedure 明確等待前置 readback，不能假設不存在的通用 Release workflow 會代為排序。

Every Production write keeps a current-main check and exact target. Credentials are operation-scoped; general validation remains secret-free. No operation invents business identity or authorization.

## Evidence

Validation, schema convergence, Web deployment, LINE publication and device acceptance are distinct evidence. Artifacts record transient plans/readbacks, never migration or business authority.

Contracts: [Supabase](../platform/supabase.md), [Vercel](../platform/vercel.md), [Rich Menu](../line/rich-menu.md), [Schema](../data/schema.md), [Recovery](recovery.md).
