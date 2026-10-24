# 模型分工與調度

本檔只擁有人類可讀的 role routing；runtime 共通限制見上一層。同目錄 TOML 擁有角色名稱、模型與行為指示；實際 sandbox、approval 與 MCP 設定繼承 parent session，不能由角色檔覆寫。

## Models

- GPT-6 Astra (`gpt-6-astra`)：Primary orchestration；需要獨立最終 architecture / acceptance decision 時使用。
- GPT-5.6 Sol (`gpt-5.6-sol`)：repository mapping、root cause、architecture analysis、technical research、bounded implementation、diff review、evidence verification。
- GPT-6.1 Sol (`gpt-6.1-sol`)：額外的開發角色組；使用下方 `dev61-*` roles，不改既有預設模型與角色。

每個 role 只擁有一個 Primary Responsibility；新增 role 必須有獨立問題、deliverable、stop condition、validation。

## Autonomous delegation

Primary 在每個任務開始時主動判斷是否委派；在任務授權與當前工具限制內，符合下列條件就直接使用最少必要角色，不等待使用者再次指定 agent。簡單、Owner 已知且可直接驗收的任務由 Primary 完成。

| 觸發條件 | 行動與交接 |
| --- | --- |
| 有可獨立回答的未知數，且定位／根因／研究會改變實作決策 | 將有明確 stop condition 的問題交下方適用角色；獨立唯讀問題可並行，沿用已取得證據。 |
| 需要 framework／provider／runtime 的 specialist 證據 | 交給對應既有 specialist；取得來源或實際 runtime 證據後才決定實作。 |
| 決策與契約已確定，變更能形成獨立寫入面 | Primary 可交單一 implementation worker；同檔案／產物只有一位 writer。不同 Owner 仍沿真實契約整合。 |
| 批次變更、公開契約／跨 Owner、authorization／transaction 或 guard 改動需要獨立缺陷檢查 | 實作穩定後交 diff reviewer；reviewer 只讀 diff 與直接 consumers，不重跑整套驗證。 |
| Candidate 已穩定且有明確的驗證執行需求 | 指定一位 validation owner，預設 Primary；只有有獨立執行價值時才另派現有 runner，不為委派改選模型。 |

需要才啟用 `map/root cause/research → decision → implementation → review → validation → evidence/acceptance` 各段；Primary 擁有 scope、決策、授權、整合與最終結論。缺少必要證據時回到真正負責者，修改 candidate 後只失效並重跑受影響證據；merge 仍取得完整 exact-head validation。

所有角色依 [autonomous tool selection](../../docs/reference/engineering/development-workflow.md#autonomous-tool-selection) 選擇語意、文字、symbol／AST 查詢或 patch application。唯讀角色可執行 `semantic plan/context` 等唯讀查詢；不能產生會寫入磁碟的變更計畫、套用修改或執行超出自身責任的 gates。實作者回報覆蓋範圍、partial／排除與候選版本，供 reviewer 與 validation owner 接手。

派工使用下方既有 task packet 欄位，並補足候選 revision／WIP 與可重用證據；將「發現」、「決策」、「修改」及「執行通過」分開回報。新 session 的實際委派與工具使用才是該次採用證據；角色可見、`agents.enabled` 或 concurrency 設定本身不證明已使用。

## Routing

| Need | Role |
| --- | --- |
| 路徑未知 | `repository-mapper` |
| symptom 有、根因未知 | `root-cause-analyst` |
| Owner/Truth/Boundary/Dependency 分析 | `architecture-analyst` |
| current framework/provider/API/CLI facts (GitHub CLI, Supabase, Vercel, pnpm/Codex CLI) | `technical-researcher` |
| tooling / command-policy failure with unknown cause | `root-cause-analyst` |
| 已決定的 bounded source/schema/workflow/Codex-config change | `implementation-worker` |
| concrete diff defect/regression review | `diff-reviewer` |
| completion/evidence claim verification | `evidence-verifier` |
| 獨立最終 architecture decision | `architecture-decider` |
| 高風險最終 acceptance | `acceptance-decider` |

Primary GPT-6 可直接做 final decision；不為形式重派。只使用會改變決策或提升 acceptance confidence 的最少 roles。

## GPT-6.1 development

| Need | Role | Reasoning | Deliverable |
| --- | --- | --- | --- |
| 已決定的 bounded change，指定 6.1 實作 | `dev61-implementation-worker` | medium | 最小充分實作、相關驗證與未解決事項 |
| 指定 6.1 審查 concrete diff | `dev61-diff-reviewer` | high | 有 trigger、位置與影響的 defect findings |
| 執行已指定的 check、test、build 或 runtime smoke | `dev61-validation-runner` | high | exact revision、命令結果與 evidence boundary |
| Next.js route、hydration、compilation 或 runtime 根因 | `dev61-nextjs-runtime-analyst` | high | 正確 checkout/port 的 runtime evidence 與根因 |
| shadcn registry item、範例或組合選擇 | `dev61-shadcn-registry-researcher` | high | 符合現有 UI contract 的選項、來源與預期 diff |

Primary 先確認 Owner、contract 與 scope；需要時由 MCP specialist 蒐證，再交給單一 implementation worker。Diff review 可指出需修正處；修正完成後由指定 validation owner 執行 gates。`evidence-verifier` 檢查 claim 是否被結果支持，仍不執行測試。高風險決策沿用既有 Astra decision roles。這是選擇流程，不要求每次啟用所有角色。

指定 `dev61-*` role 時，角色檔的模型與 effort 生效；不要派原本有固定模型的角色再期待 spawn model 覆蓋它。若主代理也要使用 6.1，可從 repository 根目錄啟動：

```sh
codex -m gpt-6.1-sol -c model_reasoning_effort=high
```

上述命令只選擇該次 CLI session 的主模型；專案角色需由新 session 載入，帳號仍須有模型使用權限。桌面版在模型選單選擇 GPT-6.1 Sol，並在任務中指定所需 `dev61-*` role。

## MCP permissions and evidence

兩個 MCP 的自動核准由 `.codex/config.toml` 的 `mcp_servers.next-devtools.default_tools_approval_mode` 與 `mcp_servers.shadcn.default_tools_approval_mode` 設為 `approve`，parent 與子代理共用；per-tool override 優先。維護設定只針對這兩個 server，不改全域 shell approval、sandbox 或其他 MCP。

MCP 工具免逐次確認不授予產品／provider 寫入權限。Specialist 仍按 role 限制使用觀察／查詢工具；安裝、codemod、cache mutation、瀏覽器業務寫入與外部操作由 Primary 依實際授權處理。角色指示中的唯讀是行為契約，不是獨立 OS sandbox；不要依賴角色檔的 `sandbox_mode`、`approval_policy` 或 `mcp_servers` 來隔離 parent 權限。

設定變更後重新載入 MCP／開新 session，分別確認角色可發現、模型選擇與工具免逐次確認。`tooling:check` 證明靜態契約，`tooling:doctor --mcp` 證明 transport；兩者都不證明當前 session 已套用 approval。實際操作流程見 [Next.js/shadcn agent workflow](../../docs/reference/engineering/development-workflow.md#nextjs-and-shadcn-agent-workflow)；設定語意以 [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) 與 [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) 為準。

## Constraints

- `repository-mapper` / `implementation-worker` / `dev61-implementation-worker` 預設 medium reasoning；其餘 analysis/review/evidence/decision/validation roles high。
- 最多 8 個 subagents；只並行可獨立驗收且不競爭同一寫入面的工作。
- 子代理不自行擴 scope 或再派工；owner/permission/research 缺口回報 Primary。
- 寫入代理保留他人修改；同 checkout 不並行寫同一檔案、migration order 或 generated output。
- Evidence 分開回報 static/test/build/deployment/API readback/device-runtime；未執行不得宣稱。
- 派工至少給 goal、scope、allowed/excluded paths、evidence、invariants、deliverable、stop、validation owner。

模型 ID / role files 以 repository current config/TOML 為 truth；解析成功不代表帳號可用、live reload 或 concurrency 已實測。

## Protected-branch delivery

PR lifecycle, protected-branch rules, validation triggers, merge methods, and evidence boundaries are owned by the [development workflow](../../docs/reference/engineering/development-workflow.md) and [validation rules](../../docs/rules/validation-evidence.md). Agent profiles and routing do not grant push, merge, deployment, or provider-write authorization.
