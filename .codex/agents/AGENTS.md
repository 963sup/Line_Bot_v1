# 模型分工與調度

本檔只擁有模型分工與子代理調度契約；runtime 共通限制由上一層 `.codex/AGENTS.md` 擁有。

## 模型責任

| 人類名稱 | 設定 ID | 責任 |
| --- | --- | --- |
| GPT-6 Astra 指揮 | `gpt-6-astra` | 理解最終目標與上下文、第一性原理分析、架構與邊界最終決策、任務拆解與優先順序、子代理調度、結果整合與最終驗收 |
| GPT-5.6 Sol 推理 | `gpt-5.6-sol` | Root cause、architecture、technical research、diff review、evidence verification 等唯讀深度工作 |
| GPT-5.5 執行 | `gpt-5.5` | Repository mapping 與已批准 bounded change 的實作、測試、文件、SQL/schema/migration 等工程執行 |

檔名同時保留 model ID 與 role，例如 `gpt-5.6-sol-architecture-analyst.toml`，方便人類直接從目錄理解「哪個模型負責什麼」。TOML 內的 `name` 只保存穩定 role name，避免 model 更換時污染 role identity。

## 單一責任契約

每個子代理只擁有一個 Primary Responsibility。角色 TOML 必須使用一致欄位：
`Mission / Input / Owns / Must / Must Not / Deliverable / Stop / Validation`。

- `repository-mapper`：只定位 entry point、consumer、contract、dependency、test 與 likely change path；不決定架構、不修改。
- `root-cause-analyst`：只追 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger；不做 architecture 最終決策。
- `architecture-analyst`：只分析 Ownership / Source of Truth / Boundary / Dependency 與可行方案；不執行修改、不替 GPT-6 做最終決策。
- `technical-researcher`：只查 current primary technical sources並回傳可採用事實；不分析 repository ownership、不實作。
- `implementation-worker`：只執行已批准的 bounded change 與必要 validation；遇到 owner/contract 衝突立即停止。
- `diff-reviewer`：只找 scoped diff 引入的 concrete defect / regression risk；不重新設計、不修改。
- `evidence-verifier`：只驗證 claim 是否被 implementation / validation / dated evidence 精確支持；不做一般 code review、不修改。

新增角色只在出現新的獨立 responsibility，且具有可獨立派工的問題、唯一 deliverable、明確 stop condition 與可獨立驗收方式時成立。不得因技術分類、名稱對稱或未來可能性預建角色。

## 調度

- 路徑已知且 change 已決定：直接用 `implementation-worker`。
- 不知道 code / schema / test path：用 `repository-mapper`。
- 已知 symptom 但根因不明：用 `root-cause-analyst`。
- Owner / Truth / Boundary / Dependency 不明：用 `architecture-analyst`。
- Framework / provider / model / API 等 current technical fact 不明：用 `technical-researcher`。
- Implementation 完成後需要 concrete defect review：用 `diff-reviewer`。
- 要宣稱「已完成 / 已驗證 / 已部署 / 已 readback」：用 `evidence-verifier`。
- 重大目標、bounded context、owner、architecture、priority 與最終 acceptance 仍由 GPT-6 Astra 決定。
- 不要求所有任務依序經過全部角色；只使用會改變決策或提升 acceptance confidence 的最少角色。
- 子代理上限為 8，不代表每次開滿。只並行能獨立驗收且不競爭同一寫入面的工作。
- 子代理不自行擴張範圍或再派工；需要新的 owner 決策、研究或權限時回報 GPT-6。
- 所有寫入代理保留他人修改；同 checkout 不並行寫同一檔案、migration order 或共用 generated output。
- 驗收分開回報 static check、test、build、deployment、external API readback 與 device/runtime evidence；沒有執行就不得宣稱。
- 派工附上目標、scope、allowed/excluded paths、已確認 evidence、invariants、deliverable、stop condition 與 validation owner。

## 角色檔案

| Model | Role | File |
| --- | --- | --- |
| GPT-5.5 | repository-mapper | `gpt-5.5-repository-mapper.toml` |
| GPT-5.6 Sol | root-cause-analyst | `gpt-5.6-sol-root-cause-analyst.toml` |
| GPT-5.6 Sol | architecture-analyst | `gpt-5.6-sol-architecture-analyst.toml` |
| GPT-5.6 Sol | technical-researcher | `gpt-5.6-sol-technical-researcher.toml` |
| GPT-5.5 | implementation-worker | `gpt-5.5-implementation-worker.toml` |
| GPT-5.6 Sol | diff-reviewer | `gpt-5.6-sol-diff-reviewer.toml` |
| GPT-5.6 Sol | evidence-verifier | `gpt-5.6-sol-evidence-verifier.toml` |

設定格式來源：[OpenAI Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)、
[Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference)。

模型名稱與設定 ID 以 repository 當下 config 為 current truth；檔案被解析不代表帳號呼叫、即時切換或並行上限已實測。
