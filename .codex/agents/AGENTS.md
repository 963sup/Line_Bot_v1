# 模型分工與調度

本檔只擁有人類可讀的 role routing；runtime 共通限制見上一層。同目錄 TOML 擁有角色名稱、模型與行為指示；實際 sandbox、approval 與 MCP 設定繼承 parent session，不能由角色檔覆寫。

## Models

模型版本上限為 GPT-6；角色模型、名稱與檔名須保持一致，不得配置高於 GPT-6 的版本。

- GPT-6 Luna (`gpt-6-luna`)：Primary orchestration、獨立 architecture / acceptance decision 與 `dev6-*` 開發角色組。
- GPT-5.6 Terra (`gpt-5.6-terra`)：root cause、architecture analysis、technical research、bounded implementation、diff review。
- GPT-5.6 Luna (`gpt-5.6-luna`)：repository mapping、evidence verification；也是預設子代理模型。

每個 role 只擁有一個 Primary Responsibility；新增 role 必須有獨立問題、deliverable、stop condition、validation。

## Autonomous delegation

### Task authorization and skills

Primary 的派工若已列明 goal、允許路徑、排除範圍與驗收條件，即授權寫入角色在該範圍內完成可逆編輯；預覽後直接實作，不為每個檔案重複向使用者詢問。外部寫入、超出範圍、資料處置或產品語意不明時仍回報 Primary。工具／sandbox 的實際核准視窗由執行環境管理，角色文字不能取消。

下表為既有 `.agents/skills/` 的選用提示，不要求每次載入，也不授予工具或寫入權限。先按 [skill compatibility gate](../../docs/reference/engineering/development-workflow.md#skill-selection-and-compatibility) 檢查實際需求、檔案與可用工具；唯讀角色只採用技能中的唯讀步驟，技能若要求寫入、額外代理或不相容工具，跳過該步並回報缺口。

| Role | 任務相符時可選的技能 |
| --- | --- |
| `repository-mapper` | 一般定位直接使用 repository 工具；涉及第一性原理結構檢視才選 `code` |
| `root-cause-analyst` | `diagnosing-bugs` |
| `architecture-analyst`、`architecture-decider` | `architecture`；需要比較方案時 `framing-decisions` |
| `implementation-worker`、`dev6-implementation-worker` | `diagnosing-bugs`（bug）、`shadcn`（UI 元件）、`next-dev-loop`（已啟動的 Next.js runtime） |
| `diff-reviewer`、`dev6-diff-reviewer` | `differential-review`（安全相關 diff）、`nextjs-code-review`（Next.js diff） |
| `evidence-verifier` | `spec-to-code-compliance`（文件與實作契約比對） |
| `acceptance-decider` | `post-patch-validation`（安全修補驗收；只讀已執行證據） |
| `technical-researcher` | 依具體技術選適用技能；外部事實仍以版本對應的官方來源為準 |
| `dev6-nextjs-runtime-analyst` | `next-dev-loop`（只採觀察步驟） |
| `dev6-shadcn-registry-researcher` | `shadcn`（只採查詢與組合建議） |
| `dev6-validation-runner` | `verification`（實際端到端驗收）、`post-patch-validation`（安全修補） |

Primary 在每個任務開始時主動判斷是否委派；在任務授權與當前工具限制內，符合下列條件就直接使用最少必要角色，不等待使用者再次指定 agent。簡單、Owner 已知且可直接驗收的任務由 Primary 完成。

| 觸發條件 | 行動與交接 |
| --- | --- |
| 有可獨立回答的未知數，且定位／根因／研究會改變實作決策 | 將有明確 stop condition 的問題交下方適用角色；獨立唯讀問題可並行，沿用已取得證據。 |
| 需要 framework／provider／runtime 的 specialist 證據 | 交給對應既有 specialist；取得來源或實際 runtime 證據後才決定實作。 |
| 決策與契約已確定，變更能形成獨立寫入面 | Primary 可交單一 implementation worker；同檔案／產物只有一位 writer。不同 Owner 仍沿真實契約整合。 |
| 批次變更、公開契約／跨 Owner、authorization／transaction 或 guard 改動需要獨立缺陷檢查 | 實作穩定後交 diff reviewer；reviewer 只讀 diff 與直接 consumers，不重跑整套驗證。 |
| Candidate 已穩定且有明確的驗證執行需求 | 指定一位 validation owner，預設 Primary；只有有獨立執行價值時才另派現有 runner，不為委派改選模型。 |

需要才啟用 `map/root cause/research → decision → implementation → review → validation → evidence/acceptance` 各段；Primary 擁有 scope、決策、授權、整合與最終結論。缺少必要證據時回到真正負責者，修改 candidate 後只失效並重跑受影響證據；merge 仍取得完整 exact-head validation。

所有角色依 [repository change loop](../../docs/reference/engineering/development-workflow.md#default-repository-change-loop) 與 [autonomous tool selection](../../docs/reference/engineering/development-workflow.md#autonomous-tool-selection) 工作。先從業務結果、實際 consumer 與不變條件理解問題，再定位 Owner、可讀契約、source of truth 與受影響依賴；工具用於回答具體未知數，不逐檔搜尋或為了跑滿命令清單而執行。

- Owner 已知且影響有界：直接讀該 Owner 契約、public exports、相關 source/tests。Owner 未知、語意歧義或跨 Owner：先用 `pnpm semantic resolve/plan/context` 定位，再讀選中的真實來源；`candidate`、`no-match` 與工具輸出不授予修改範圍。
- 找實作與 consumers：已知文字／路徑用 `rg`；TS/JS 結構用 `pnpm code facts/definition/references/search`。先確認搜尋邊界、代表案例與跨 project public contract，不把局部結果當全庫完整。
- 改代碼：小範圍直接編輯；批次同型變更由實作者用 `pnpm code rewrite/rename` 產生預覽，檢查命中與排除後以 `pnpm patch:apply` 套用，再重查漏改與 diff。唯讀角色只能做唯讀查詢，不產生寫入計畫或套用修改。
- 驗證：依受影響契約選必要的 `pnpm architecture`、`pnpm boundaries`、相關測試與 runtime 檢查；一般程式變更執行 `pnpm check`，純文件用 `pnpm docs:check`。這些命令各有證據邊界，PR／merge 所需完整驗證仍依 development workflow。實作者回報覆蓋範圍、partial／排除與候選版本，供 reviewer 與 validation owner 接手。

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

## GPT-6 development

| Need | Role | Reasoning | Deliverable |
| --- | --- | --- | --- |
| 已決定的 bounded change，指定 6 實作 | `dev6-implementation-worker` | medium | 最小充分實作、相關驗證與未解決事項 |
| 指定 6 審查 concrete diff | `dev6-diff-reviewer` | high | 有 trigger、位置與影響的 defect findings |
| 執行已指定的 check、test、build 或 runtime smoke | `dev6-validation-runner` | high | exact revision、命令結果與 evidence boundary |
| Next.js route、hydration、compilation 或 runtime 根因 | `dev6-nextjs-runtime-analyst` | high | 正確 checkout/port 的 runtime evidence 與根因 |
| shadcn registry item、範例或組合選擇 | `dev6-shadcn-registry-researcher` | high | 符合現有 UI contract 的選項、來源與預期 diff |

Primary 先確認 Owner、contract 與 scope；需要時由 MCP specialist 蒐證，再交給單一 implementation worker。Diff review 可指出需修正處；修正完成後由指定 validation owner 執行 gates。`evidence-verifier` 檢查 claim 是否被結果支持，仍不執行測試。高風險決策沿用既有 Astra decision roles。這是選擇流程，不要求每次啟用所有角色。

指定 `dev6-*` role 時，角色檔的模型與 effort 生效；不要派原本有固定模型的角色再期待 spawn model 覆蓋它。若主代理也要使用 6，可從 repository 根目錄啟動：

```sh
codex -m gpt-6-luna -c model_reasoning_effort=high
```

上述命令只選擇該次 CLI session 的主模型；專案角色需由新 session 載入，帳號仍須有模型使用權限。桌面版在模型選單選擇 GPT-6 Luna，並在任務中指定所需 `dev6-*` role。

## MCP permissions and evidence

兩個 MCP 的自動核准由 `.codex/config.toml` 的 `mcp_servers.next-devtools.default_tools_approval_mode` 與 `mcp_servers.shadcn.default_tools_approval_mode` 設為 `approve`，parent 與子代理共用；per-tool override 優先。維護設定只針對這兩個 server，不改全域 shell approval、sandbox 或其他 MCP。

MCP 工具免逐次確認不授予產品／provider 寫入權限。Specialist 仍按 role 限制使用觀察／查詢工具；安裝、codemod、cache mutation、瀏覽器業務寫入與外部操作由 Primary 依實際授權處理。角色指示中的唯讀是行為契約，不是獨立 OS sandbox；不要依賴角色檔的 `sandbox_mode`、`approval_policy` 或 `mcp_servers` 來隔離 parent 權限。

設定變更後重新載入 MCP／開新 session，分別確認角色可發現、模型選擇與工具免逐次確認。`tooling:check` 證明靜態契約，`tooling:doctor --mcp` 證明 transport；兩者都不證明當前 session 已套用 approval。實際操作流程見 [Next.js/shadcn agent workflow](../../docs/reference/engineering/development-workflow.md#nextjs-and-shadcn-agent-workflow)；設定語意以 [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) 與 [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) 為準。

## Constraints

- `repository-mapper` / `implementation-worker` / `dev6-implementation-worker` 預設 medium reasoning；其餘 analysis/review/evidence/decision/validation roles high。
- 最多 5 個 subagents；只並行可獨立驗收且不競爭同一寫入面的工作。
- 子代理不自行擴 scope 或再派工；owner/permission/research 缺口回報 Primary。
- 寫入代理保留他人修改；同 checkout 不並行寫同一檔案、migration order 或 generated output。
- Evidence 分開回報 static/test/build/deployment/API readback/device-runtime；未執行不得宣稱。
- 派工至少給 goal、scope、allowed/excluded paths、evidence、invariants、deliverable、stop、validation owner。

模型 ID / role files 以 repository current config/TOML 為 truth；解析成功不代表帳號可用、live reload 或 concurrency 已實測。

## Protected-branch delivery

PR lifecycle, protected-branch rules, validation triggers, merge methods, and evidence boundaries are owned by the [development workflow](../../docs/reference/engineering/development-workflow.md) and [validation rules](../../docs/rules/validation-evidence.md). Agent profiles and routing do not grant push, merge, deployment, or provider-write authorization.
