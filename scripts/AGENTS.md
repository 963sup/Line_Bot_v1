# Repository scripts scope

`scripts/` 只擁有 repository operation orchestration；產品 Domain/Application rule 留在真正 owner。Root `package.json#scripts` 是人、Agent、CI 共用的 canonical command surface，`scripts/**` 是 implementation。

## Side effects

- 預設 read-only。Local mutation 與 remote mutation 必須由命令名稱／入口明確表達。
- Remote mutation 需要 explicit authorization、exact target、precondition、bounded failure handling 與 post-write readback。
- 一般 `check` / `validate` 不隱式執行 production mutation，也不要求正式 credential 的 live probe。
- Static、test、build、remote API、deployment、provider、device evidence 分開回報。

## Generated artifacts

若 script 產生衍生資料，必須分開：

```text
editable source
→ deterministic transform
→ generated projection/index
→ consumer
```

Generated output 必須可由 canonical source 重建；不得手改成永久修復，也不得取得 business authority。Change history、target/preview state 與 current output 分開。產生失敗時不得以部分輸出覆蓋上一個完整版本。

## Change rules

- 腳本按 operation responsibility 就近放置，測試與被測 script 共置；不建立通用 `utils` / wrapper / facade 只為整理目錄。
- Script 只組合既有 owner capability；不得把 authorization、business transition 或 persistence ownership偷偷搬進 CLI。
- 修改 script 時同步其 canonical command、tests、受影響 workflow / docs；沿更深層 AGENTS 套用 browser、LINE、Supabase 等特殊 operation constraints。
- 外部 benchmark 只提供 principle；pinned GitHub-like semantic benchmark 由 `architecture/semantic-benchmark.json` 擁有，不在本檔維護 FPT inventory 或分類規則。

## Validation

先執行受影響 script/tests，再依 root contract 跑 `pnpm check`；merge / release 前用 `pnpm validate`。遠端操作成功與 repository validation 不是同一種證據。
