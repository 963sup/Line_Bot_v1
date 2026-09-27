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

100–863
→ current owner-authoritative object / relationship definitions
  （精確 mapping 查 data-topology.json）

870–891
→ selected reserved target namespaces only
  （pure comments；不定義 current relation）

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

## Reserved target files

`870–891` 只保留已選定 target 的命名空間，且必須是符合 `data-topology.json` reserved declaration 的純 line-comment file。Reserved file 不代表 table、view、function、policy、runtime capability、remote state 或 acceptance 已存在。

啟用 reserved target 時，同一 changeset 必須建立真實 SQL / relation mapping、current owner contract、consumer、authorization/transaction semantics、tests 與適用 evidence；再移除 reserved role。Target rationale / migration state 留在 `docs/090-governance/`。

## Navigation

| Need | Owner |
| --- | --- |
| Exact relation → owner → file mapping | [Data topology](../../architecture/data-topology.json) |
| DDL / schema design semantics | [Schema model](../../docs/040-data/030-schema-model.md) |
| Cross-owner Data Boundary | [Data boundary](../../docs/040-data/010-data-boundary-model.md) |
| Owner business semantics | [Domain owners](../../docs/010-domain-owners/README.md) |
| Remote Supabase operation | [Supabase platform](../../docs/030-platform/020-supabase.md) |
| Local schema change constraints | [AGENTS](AGENTS.md) |

## Validation

`pnpm architecture` 驗證 schema files 與 `data-topology.json` 的 ownership/mapping invariants；`pnpm schema:check` 執行 declarative schema/database contract tests。Remote Supabase convergence 另由 `schema:remote plan/sync/verify` 與 provider readback證明，不能由 local file存在推定。
