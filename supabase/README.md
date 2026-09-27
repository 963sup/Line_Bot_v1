# Supabase 開發入口

本 README 只提供導航；不維護第二套 schema、release、recovery 或 remote reconciliation truth。

## Source of Truth

| Concern | Owner |
| --- | --- |
| Current PostgreSQL structure | [`schemas/`](schemas/) |
| Schema semantics / DDL vs data transform | [Schema model](../docs/reference/data/schema.md) |
| Persisted relation ownership | [Data topology](../architecture/data-topology.json) |
| Supabase provider / remote reconciliation | [Supabase platform](../docs/reference/platform/supabase.md) |
| Publication ordering | [Release](../docs/reference/operations/release.md) |
| Backup / restore / recovery | [Recovery](../docs/reference/operations/recovery.md) |
| Historical schema extraction | [History extraction](../docs/change/evidence/schema-history-extraction.md) |
| Object / relationship navigation | [Schema tree](schemas/README.md) |

`supabase/migrations/` 不參與 current schema contract 或 remote deployment；不要把 migration history 當成 current schema authority。

## Common commands

```sh
pnpm schema:check
pnpm schema:local

pnpm schema:remote plan
pnpm schema:remote verify
pnpm schema:remote verify --api
pnpm schema:remote recovery
```

- `schema:check`：驗 declarative schemas 與核心 database boundary。
- `schema:local`：用 current schemas 重建 local application schema。
- `plan / verify / recovery`：read-only remote diagnosis / recovery readback；詳細 contract 見 [Supabase platform](../docs/reference/platform/supabase.md)。
- `repair / prepare / sync`：remote mutation；只允許 current `main` 的 GitHub Actions Release 呼叫，不作本機或任意 branch 操作。

## Change routing

一般 schema change：

```text
edit supabase/schemas/*.sql
→ pnpm schema:check
→ pnpm check
→ validated main
→ Release / Supabase reconciliation
```

若 change 還需要不可由 schema 決定的 business metadata 或 data transform，另外依 owner 建立 data-cutover procedure；不要把 backfill truth 藏進 declarative DDL。

Remote mutation、publication 與 recovery 的完整規則只在上表 canonical owner 維護。
