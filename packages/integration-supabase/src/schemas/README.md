# Object / Relationship schema tree

`packages/integration-supabase/src/schemas/` 的 executable SQL 是 application-owned PostgreSQL current desired state。此目錄不是 migration history，也不按 TypeScript package鏡像；relation authority 與 physical file mapping 由 `architecture/registry.json#data` 擁有。

## Authority chain

```text
architecture/registry.json#domain
→ concept / relationship owner

architecture/registry.json#data
→ persisted relation role / semantic owner / physical file

packages/integration-supabase/src/schemas/*.sql
→ actual PostgreSQL definition

packages/<owner>
→ runtime writer / public contract when runtime exists
```

README只提供 navigation；精確 SQL file / relation inventory 不在這裡複製。

## Ordering model

Lexical prefix 用來表達可重建的 dependency order，不是第二套 Domain taxonomy。

```text
000
→ neutral foundation

100–899
→ current owner-authoritative object / relationship definitions
  （精確 mapping 查 registry.json#data；未使用的 prefix 直接留空）

900–930
→ late cross-owner mechanisms
```

新增或搬 relation 時先確定 semantic owner、consumer、Data Boundary 與 dependency，再選 file/prefix；不要為了號碼漂亮重排。

## Owner-local first

Authoritative relation 恰好一個 semantic owner。Owner-local table/view/function/index/trigger/RLS/grant 優先留在同一 authority file；只有物理上必須看到多個 owner 後才能成立的 mechanism 才提升到 late cross-owner files。

Cross-owner mechanism 只允許：

- rebuildable read projection；
- 無法在單一 owner position 宣告的 invariant；
- 真正要求 database atomicity 的 cross-owner transaction coordinator；
- 需要完整 topology 才能建立的 final access enforcement。

它們不得創造新的 business truth。

## Future targets stay outside the schema SSOT

沒有 current executable database object，就不建立 `.sql` placeholder，也不在 `architecture/registry.json#data` 預留 future filename。未使用的 lexical prefix 直接留空；Workforce、Payroll、Audit 等 unresolved rationale 只留在對應 owner contract 或 issue，不建立第二套 target/migration 文件。

啟用新的 persisted fact 時，同一 changeset 才建立 actual SQL、relation mapping、current owner contract、consumer、authorization / transaction semantics、tests 與適用 evidence。這讓 `packages/integration-supabase/src/schemas/*.sql` 永遠只回答「現在的 database desired state 是什麼」。

## Navigation

| Need | Owner |
| --- | --- |
| Exact relation → owner → file mapping | [Data topology](../../../../architecture/registry.json#data) |
| DDL / schema design semantics | [Schema model](../../../../docs/reference/data/schema.md) |
| Cross-owner Data Boundary | [Data boundary](../../../../docs/reference/data/boundaries.md) |
| Owner business semantics | [Domain owners](../../../../docs/owners/README.md) |
| Scoped number/name authority and cutover | [Numbering](../../../../docs/owners/numbering.md) · [Namespace](../../../../docs/owners/namespace.md) |
| Remote Supabase operation | [Canonical Supabase rules](../README.md#canonical-supabase-rules) |
| Local schema change constraints | [AGENTS](AGENTS.md) |

## Validation

`pnpm exec biome check architecture` 與適用 package checks 驗證 schema files 與 `registry.json#data` 的 ownership/mapping invariants；`pnpm schema:check` 執行 declarative schema/database contract tests。Production remote mutation 依 [Canonical Supabase rules](../README.md#canonical-supabase-rules) 執行；provider readback 證明 remote result，不能由 local file 存在推定。
