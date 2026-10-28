# Supabase platform reference

Supabase 的整合規則與 provider-specific content 由 [`integration-supabase`](../../../packages/integration-supabase/src/README.md) 擁有。本文件是跨 package 的分類索引；不保存第二套 schema、environment、operator 或 capability contract。

## Canonical content

- [Canonical Supabase rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)：schema authority、environment boundary、remote operator、readback、migration-history 與 change flow。
- [Source of Truth](../../../packages/integration-supabase/src/README.md#source-of-truth)：schemas、Bucket config、registry 與 recovery／release routing。
- [Capability routing](../../../packages/integration-supabase/src/README.md#capability-routing--prepared-layout)：Auth、Storage、Realtime、Cron、Queues、Vector、Webhooks、Functions 與 tests 的啟用條件。
- [Package capability docs](../../../packages/integration-supabase/src/README.md#各能力開發規格)：各能力的 adapter、security、runner 與 readback 入口。

## Cross-package boundaries

### Auth boundary

Supabase Auth 只提供 provider proof；LINE Member、Membership、Organization、Employment、authorization 與 business identity mapping 仍由對應 domain owner 擁有。需要 provider identity linking 時，請遵循 package 的 Auth capability 文件與 Account owner contract，不把 provider metadata 當成產品權限來源。

### PostgreSQL runtime

Runtime 使用 integration package 的 server-only adapter；private application schema、`line_app` role、RLS/grants 與 transaction boundary 的詳細規則集中在 package README 與 source-local `AGENTS.md`。Browser 不直接取得 private business table access，service-role credential 也不取代 application authorization。

### Environment variables

Provider variable 的命名、secret boundary 與用途以 package source／adapter 和 [local environment](../engineering/local-environment.md) 為準。不要在本文件複製 secret 表或聲稱 hosted project 已同步；remote readback 必須依 package 的 canonical rules 執行。

## Capability classification

以下只記錄跨 package 的分類，細節由 package 文件維護：

| Capability | Current status | Canonical content |
| --- | --- | --- |
| PostgreSQL / Auth / Storage | 已有整合與 runtime consumers | [`integration-supabase/src`](../../../packages/integration-supabase/src/README.md) |
| Edge Functions | 尚無 current deployed consumer | [`functions/README.md`](../../../packages/integration-supabase/src/functions/README.md) |
| Realtime | 尚無 current private subscription consumer | [`realtime/README.md`](../../../packages/integration-supabase/src/realtime/README.md) |
| Cron | 沿用既有 owner scheduler；不建立第二套 scheduler | [`cron/README.md`](../../../packages/integration-supabase/src/cron/README.md) |
| Queues / Vector / Webhooks | 尚未啟用；先證明 durable consumer、owner、provenance 與 recovery contract | package capability docs |

## Retained cross-system responsibilities

- Release 文件只負責 publication ordering 與 evidence：[Release](../operations/release.md)。
- Schema 文件只負責 DDL／data transform 的語意：[Schema model](../data/schema.md)。
- Recovery 文件只負責 backup、restore 與 recovery evidence：[Recovery](../operations/recovery.md)。
- Supabase-specific 操作內容、規則與過時 capability 設計不在這些 cross-system 文件重複維護。

