# Repository scripts scope

`scripts/` 只擁有 repository operation orchestration；產品 Domain/Application rule、provider transaction semantics 與 persistence authority 留在真正 owner。Root `package.json#scripts` 是人、Agent、CI 共用的 canonical command surface，`scripts/**` 是 implementation。

## Evidence-first ownership

任何新增、搬移、拆分、合併或重新命名 script 前，先以 repository evidence 唯一回答：

1. Primary Responsibility 是什麼？
2. 真實 Consumer 是誰？
3. Canonical Command / Public Entry 是什麼？
4. 真正 Owner 在哪裡？
5. Source of Truth 在哪裡？
6. Side Effect / Transaction / Recovery Boundary 是什麼？
7. 現有 capability 是否已可直接重用？

Path、folder name、file size、技術分類或「看起來更乾淨」都不是 ownership evidence。

CLI / script entrypoint 不等於 capability owner。若 script 只是 argv/env/IO adapter，實際 business/provider behavior 必須留在既有 owner；不得把 owner logic 搬進 script 只為讓 workflow 或 CLI 比較短。

## Structure

- 腳本按「獨立 operation responsibility」就近放置，測試與被測 script 共置。
- 新增子目錄前，必須證明它代表一個已存在且可獨立描述、派工、驗收的 operation responsibility；不得為名稱對稱或未來可能性預建 scope。
- 不建立通用 `utils` / wrapper / facade / manager / service 只為整理目錄。
- 拆分 script 的依據是不同 reason-to-change、consumer、contract、side-effect 或 recovery boundary；不是 LOC。
- 合併 script 的依據是同一 responsibility 與同一 invariant set；不得為減少檔案數吞併不同 owner。
- Existing successful pattern 優先於 generic best practice；先逆向 repository 內已驗證的 thin entrypoint / owner module / orchestration pattern，再設計新結構。

## Workflow boundary

當 GitHub Actions 內出現可獨立測試的 parsing、diff、classification、routing policy、provider behavior 或 recovery logic時，不得直接把 YAML/Bash 原封不動搬進新的 generic script。先沿 Consumer → Contract → Owner → Source of Truth 找真正 responsibility，再決定 executable implementation 應放哪個既有 owner。

Workflow 可以呼叫 canonical command；script 可以 orchestration 既有 capability；兩者都不得創造新的 business authority。

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

- Script 只組合既有 owner capability；不得把 authorization、business transition 或 persistence ownership 偷偷搬進 CLI。
- 修改 script 時同步其 canonical command、tests、受影響 workflow / docs；沿更深層 AGENTS 套用 browser、LINE、Supabase 等特殊 operation constraints。
- 外部 benchmark 只提供 principle；pinned GitHub-like semantic benchmark 由 `architecture/semantic-benchmark.json` 擁有，不在本檔維護 FPT inventory 或分類規則。

## Validation

先執行受影響 script/tests，再依 root contract 跑 `pnpm check`；merge / release 前用 `pnpm validate`。遠端操作成功與 repository validation 不是同一種證據。
