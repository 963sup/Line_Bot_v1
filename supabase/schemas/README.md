# Object / Relationship schema tree

`supabase/schemas/` 的 executable SQL 是 application-owned PostgreSQL current desired state。此目錄不是 migration history，也不按 TypeScript package鏡像；relation authority 與 physical file mapping 由 `architecture/data-topology.json` 擁有。

## Authority chain

```text
architecture/semantic-model.json
→ concept / relationship owner

architecture/data-topology.json
→ persisted relation role / semantic owner / physical file

supabase/schemas/*.sql
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
  （精確 mapping 查 data-topology.json；未使用的 prefix 直接留空）

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

沒有 current executable database object，就不建立 `.sql` placeholder，也不在 `architecture/data-topology.json#files` 預留 future filename。未使用的 lexical prefix 直接留空；Workforce、Payroll、Audit 等 target rationale / migration state 留在 `docs/change/` 與 owner docs。

啟用新的 persisted fact 時，同一 changeset 才建立 actual SQL、relation mapping、current owner contract、consumer、authorization / transaction semantics、tests 與適用 evidence。這讓 `supabase/schemas/*.sql` 永遠只回答「現在的 database desired state 是什麼」。

## Navigation

| Need | Owner |
| --- | --- |
| Exact relation → owner → file mapping | [Data topology](../../architecture/data-topology.json) |
| DDL / schema design semantics | [Schema model](../../docs/reference/data/schema.md) |
| Cross-owner Data Boundary | [Data boundary](../../docs/reference/data/boundaries.md) |
| Owner business semantics | [Domain owners](../../docs/owners/README.md) |
| Remote Supabase operation | [Supabase platform](../../docs/reference/platform/supabase.md) |
| Local schema change constraints | [AGENTS](AGENTS.md) |

## Validation

`pnpm architecture` 驗證 schema files 與 `data-topology.json` 的 ownership/mapping invariants；`pnpm schema:check` 執行 declarative schema/database contract tests。Production remote mutation 由 current `main` 的 GitHub Actions Release 執行；`schema:remote plan/verify` 與 provider readback證明 remote result，不能由 local file 存在推定。
