# Architecture

此目錄保存 machine-readable architecture truth；Human docs 只作 explanation / routing。

| 問題 | Authority | Validation / query |
| --- | --- | --- |
| GitHub GraphQL domain 真正定義什麼？ | [Vendored FPT JSON](domain/fpt/)；[provenance](domain/fpt-source.json) 只記錄 pinned upstream revision/blob integrity | `pnpm architecture` |
| Line_Bot_v1 如何擁有、約束或實作這些語意，以及有哪些本地 extension？ | [Product domain overlay](semantic-model.json) | `pnpm semantic check`、`pnpm semantic explain <concept>` |
| 哪個 module 實作 owner、允許依賴誰，以及哪些 FPT package boundary 已選為非 runtime target？ | [Implementation topology](implementation-topology.json) | `pnpm boundaries`、`pnpm semantic view modules` |
| 哪個 owner 擁有 persisted relation、誰只 projection/reference？ | [Data topology](data-topology.json) | `pnpm architecture` |
| 實際 SQL / constraint / RLS 是什麼？ | [Declarative schemas](../supabase/schemas/README.md) | `pnpm schema:check` |
| Current human meaning / routing 在哪？ | [Core docs](../docs/README.md) + [Domain owners](../docs/owners/README.md) | `pnpm docs:check` |
| Dated release / remote / device evidence 在哪？ | [Acceptance](../docs/change/evidence/README.md) | evidence 自己的日期 / revision / environment |

```text
github/docs FPT JSON
        ↓ exact vendored mirror; no semantic rewrite
architecture/domain/fpt/*.json
        ↓ direct file/symbol/field references
semantic-model.json
        ↓ owner/invariant/capability/implementation overlay only
implementation-topology.json / data-topology.json
        ↓
source / package exports / supabase schemas / tests
        ↓
evidence
```

FPT category 不等於 package 或 Bounded Context；但 FPT 中的 GitHub GraphQL resource、field、query、mutation、interface、enum、union、input object 與 scalar 不得由本地摘要重新定義。Product overlay 的 FPT reference 只保存 exact `file` / `symbol` / optional `field`；FPT-backed concept 不得另存 `canonicalName`、`definition` 或其他 semantic summary，名稱與 GitHub meaning 必須直接由 FPT resolve。Local-only concept 才擁有本地 `canonicalName` / `definition`。category/adoption 都由 FPT 或產品狀態推導，不另存第二份。Code/SCM capability 可以依產品 scope 維持未實作，不能因此刪改 FPT truth。

可讀 projection 使用 `pnpm semantic view docs`，change impact 使用 `pnpm semantic plan "<intent>"` / `pnpm semantic context "<intent>"`。不要手工保存第二套 FPT node、edge、adoption 或 category 清單。


## Current modules vs selected targets

`implementation-topology.json#modules` 與 `#applications` 只描述目前真正存在、可執行的 workspace；它們的 dependency allowlist 會進入 runtime / build boundary enforcement。

`implementation-topology.json#targetModules` 只描述已由 FPT lifecycle / ownership 證據選定、但尚未成為 runtime workspace 的 package boundary。每個 target 必須列出 `fptFiles`、可直接 resolve 的 `fptRoots`（exact `file` + `symbol`）與預期 dependency direction；不得另外保存 GitHub semantic summary。其 semantic owner 必須是 `selected-target`。Target 不建立 `package.json`、source、route、schema 或 runtime import，也不加入 application allowlist / Dependency Cruiser current workspace graph。

Promotion 是顯式 authority transition：只有當真正要搬移 current concept/data/capability ownership 時，才同步修改 semantic owner、data topology、module topology、consumer contract 與 runtime evidence；不得因為 target 已存在就假定 migration 已完成。空 FPT category、GraphQL primitives 或能由既有 owner 承接的語意不會為了目錄對稱建立 domain package。跨多個 owner 的真實 query/composition contract 可以成為 `application-module` target，但不得取得被搜尋/聚合 resource 的 business authority。
