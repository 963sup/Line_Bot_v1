# Architecture

此目錄保存 machine-readable architecture truth；Human docs 只作 explanation / routing。

| 問題 | Authority | Validation / query |
| --- | --- | --- |
| GitHub-like external benchmark 真正提供什麼？ | [Semantic benchmark](semantic-benchmark.json) + JSON 內 pinned upstream provenance | `pnpm architecture` |
| 產品採用什麼語意、owner、relationship、invariant、locator、status？ | [Semantic model](semantic-model.json) | `pnpm semantic check`、`pnpm semantic explain <concept>` |
| 哪個 module 實作 owner、允許依賴誰？ | [Implementation topology](implementation-topology.json) | `pnpm boundaries` |
| 哪個 owner 擁有 persisted relation、誰只 projection/reference？ | [Data topology](data-topology.json) | `pnpm architecture` |
| 實際 SQL / constraint / RLS 是什麼？ | [Declarative schemas](../supabase/schemas/README.md) | `pnpm schema:check` |
| Current human meaning / routing 在哪？ | [Core docs](../docs/000-core/README.md) + [Domain owners](../docs/010-domain-owners/README.md) | `pnpm docs:check` |
| Dated release / remote / device evidence 在哪？ | [Acceptance](../docs/090-governance/060-acceptance/README.md) | evidence 自己的日期 / revision / environment |

```text
External benchmark
        ↓ explicit product adoption
semantic-model.json
        ↓ explicit mapping
implementation-topology.json / data-topology.json
        ↓
source / package exports / supabase schemas / tests
        ↓
evidence
```

Benchmark category 不等於 product owner；Semantic owner 不等於 package；package 不等於 Data Boundary；schema relation 不等於 runtime acceptance。

可讀 projection 使用 `pnpm semantic view docs`，change impact 使用 `pnpm semantic plan "<intent>"` / `pnpm semantic context "<intent>"`。不要手工保存第二套 owner/capability/benchmark 清單。
