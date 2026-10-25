# Repository change contract

以 repository evidence 確認 current state；不要用 best practice、舊文件或猜測取代 code / manifest / schema / tests。

## Mandatory governing set

以下是完整 governing authority，所有 repository 任務一律遵守。具體讀取依下方 Effective context contract 選取 target ref 的 current file／section／symbol；不要求每次將無關檔案全文預載進 context：

- `architecture/README.md`
- `architecture/data-topology.json`
- `architecture/implementation-topology.json`
- `architecture/domain/fpt/*.json`
- `architecture/domain/fpt-source.json`
- `architecture/semantic-model.json`
- `.dependency-cruiser.mjs`
- `biome.json`
- `knip.jsonc`

這些檔案是 domain truth / architecture / topology / dependency / formatting / reachability 的 governing inputs，不是為了讓 local implementation 或 CI 通過而可任意調整的 escape hatch。

- 一般 feature、refactor、bug fix、CI fix：修 source、ownership、dependency、public export、placement 或真正 root cause；不得透過弱化 governing file、加 ignore、exception、alias、wrapper 或 compatibility surface 消除 violation。
- 若任務本身就是修改 governing file，先證明 authority / contract 為何真的需要改，再同步所有受影響 consumer、guard、tests、docs 與 validation evidence；不得從 symptom 反推規則應放寬。
- `architecture/domain/fpt/*.json` 是從 pinned `github/docs/src/graphql/data/fpt` 原樣 vendoring 的 GitHub GraphQL domain truth；不得手改、轉寫或由 `semantic-model.json` 覆蓋。`semantic-model.json` 只補本產品 owner、invariant、relationship、capability 與 implementation expectation。
- Nested `AGENTS.md` 只能增加 local constraint，不能削弱或覆寫本 governing set。
- 所有 nested scope 完整繼承 [system invariants](docs/rules/system-invariants.md)，包括 bounded tool output；不得以 local validation、debug 或 verbose 慣例恢復無界 stdout／stderr。需要完整原始證據時寫入 ignored artifact，Agent context 只載入摘要與有界片段。

## Effective context contract

1. 一律先讀 root 與沿目標路徑適用的 `AGENTS.md`、[system invariants](docs/rules/system-invariants.md)，再由 [task router](docs/README.md) 取任務入口。子 AGENTS 只補 local constraints，引用本契約，不複製完整 authority 清單。
2. 先定義 task、Owner、consumer 與觸及的 contract。Owner 未知、語意歧義，或跨 Owner 的 capability／public contract／資料／授權影響尚未釐清時，用 `pnpm semantic plan "<intent>"` 定位影響；需要具體 authority selectors 時用 `pnpm semantic context "<intent>"`。已知且影響限於單一 Owner 時，直接讀其 contract、相關 source/tests 及 package exports；已知主要 Owner 不代表跨 Owner 影響已釐清。候選、歧義與 no-match 不授予修改範圍。
3. 依實際責任載入下表來源。JSON 可讀必要 entries，FPT 必須定位 exact file/symbol/field；記錄來源與 revision，working-tree 修改不能冒充 HEAD 內容。Generated projection／工具選取結果僅供定位，不取代 authority。

| 觸發條件 | 必須具體讀取的來源 |
| --- | --- |
| 純文件／連結修正，未改業務或治理語意 | 目標文件、引用的真實來源、root + nearest AGENTS；不預載無關 Domain／FPT。 |
| 單一 Owner source／純業務規則 | Owner contract、public exports、相關 source/tests；semantic model 的 Owner/invariant/capability entries、implementation topology 的 module/dependency entries，以及 Dependency Cruiser、Biome、Knip。 |
| Public contract、跨 Owner 或 authorization 變更 | 上項加實際 provider/consumer 契約、relationship/qualification/trust entries 與受影響 consumers；沿真實依賴擴展，不把 review candidate 當 mutation authority。 |
| Persistence、schema、transaction／replay／recovery 變更 | 上項加 data topology 的 relations/participants、對應 executable SQL、database-write/authorization rules 與必要競爭／rollback tests。 |
| GitHub-derived meaning／FPT-backed contract | 對應 pinned FPT exact file/symbol/field 與 provenance；語意改動同步受影響 overlay/consumer，不能由本地摘要取代。 |
| Governing input／guard 本身變更 | 完整讀取被修改的 authority/guard，以及實際 consumers/tests；先證明 authority/contract 需要改，保留全部 enforcement。 |

4. Owner/語意不明、來源缺失、無法追溯 revision 或選取結果與 source 衝突時，明示 unresolved；先定位或保守展開完整 governing set，不能把空結果解讀為沒有約束。未解決會影響正確性的缺口前不修改該範圍。
5. Context materialization 不改 validation scope：architecture/FPT/schema/security guards 繼續檢查完整 canonical inputs；一般 `pnpm check`、merge/release exact-head `pnpm validate` 的契約維持。

## Invariants

- 先定義 business result，再沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth 找根因。
- 命名只用來降低定位成本，不創造 Owner、契約或相依方向。新檔名以 bounded-context 的業務概念或技術機制加上唯一 primary role 表達；既有名稱採漸進式收斂，只有在同一變更已同步真實 consumer、public export、route/schema 與測試時才改名。
- 每層 `AGENTS.md` 只補自己的命名例外，不能複製或覆寫父層規則；避免讓相同命名規則分散後漂移。
- 保持 [system invariants](docs/rules/system-invariants.md)：authority、authorization/isolation、concurrency/replay、atomicity/recovery、ownership/dependency、evidence integrity。
- 跨 package 只用 public exports；不用 alias/wrapper/facade/compatibility layer 掩蓋 ownership。
- 無真實 consumer、variation、technology/policy boundary、transaction/recovery 或 isolation responsibility，不新增 abstraction。
- 高內聚／低耦合：每項 business responsibility 只有一個 authoritative owner；每個 production source 只有一個 primary role，consumer 只依賴必要 public capability 與正確 dependency direction。維持 DDD + Hexagonal 的 Domain 決策、Application 協調、Port 消費者能力與 Adapter 技術實作；不強制建立空 layer。
- 簡化是在根因、Owner、Truth、Boundary 確認之後選擇最小充分實作，不以最少程式行數、最少檔案或最快 CI 通過取代正確性。優先重用已驗證能力、消除重複 truth／dead code／無責任轉發；新增 complexity 必須有可驗證的必要理由。
- 現代化方案以 current repository 成功 pattern、實際安裝版本及適用官方 contract 為證據，非追求新框架或過度抽象；修改前比較方案及不可失去的 invariant。
- 不提交 secret、credential、personal data；remote mutation 要有 authorization、exact target、readback。
- 不同 evidence 分開回報；未知明示。

## Retrieval

先用 [task router](docs/README.md) 取最小 context；已知且限於單一 Owner 時直接讀 owner contract + nearest `AGENTS.md`。Owner 未知、語意歧義或跨 Owner 影響未釐清時，依上方條件使用 `pnpm semantic plan "<intent>"`，需要具體閱讀來源再用 `context`。

修改指引前先核對實際 consumer；任務入口放 `.github/prompts/`、Codex 角色放 `.codex/agents/`，不維護重複 skill 或 Markdown review database。

Source-of-truth：[facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。子 AGENTS 只增加 local constraints。

## Serena MCP 自動使用規範

本專案已配置 Serena 官方 MCP（`.codex/config.toml`）。AI 在需要程式碼結構理解、symbol 導航、實作編輯、專案記憶或受控 shell 能力時，應主動使用 Serena；不得因舊有「僅 read-only symbol exploration」限制而停用其必要能力。Serena 不取代 `pnpm semantic plan/context`、Owner contract 或 repository governing files；業務真相、授權與驗證仍以 repository evidence 為準。

使用 Serena 時遵循以下生命週期：

1. **Serena init**：`serena init` 是 Serena 安裝後的全域初始化，建立或更新 `%USERPROFILE%\\.serena\\serena_config.yml`，設定預設 language backend；需要時才執行，勿把它與專案 onboarding 混為一談。MCP 已連線且全域設定已存在時，不要每次任務重跑 init。
2. **Project creation / activation**：使用 `--project-from-cwd` 對應目前 checkout；若 Serena 尚未有專案設定，才在專案根目錄使用 `serena project create`，必要時再使用 `serena project index`。啟動後若尚未啟用專案，先啟用目前 worktree，再進行 symbol 或檔案操作；不要重複建立既有 project。
3. **Onboarding**：onboarding 是專案第一次 activation 後的獨立流程；當 `.serena/memories/` 尚無專案記憶時，使用 Serena 的 `onboarding` tool 讓它讀取專案結構、build/test 設定與必要慣例並建立 memories。已有 memories 時不要重複觸發 onboarding；不要用 `serena init` 取代 onboarding。
4. **Workflow**：依「init（必要時）→ project creation（必要時）→ activation → `get_current_config` / `list_memories` → onboarding（首次）→ coding task」順序工作。先用 Serena 了解相關 symbol、consumer、reference 與 diagnostics，再修改；修改後以 `git diff`、既有 tests、`pnpm check` 或任務要求的 validation 驗證。Serena 的結果是探索與操作證據，不是 acceptance evidence。
5. **Memories**：需要保存可重用的專案慣例、架構決策或工作流程時，先讀取 `memory_maintenance`，再更新 `.serena/memories/`；使用 `mem:` 參照連結相關記憶，避免複製 repository truth、secret、credential 或短期除錯紀錄。完成記憶異動後可執行 `serena memories check` 檢查失效參照。
6. **Configuration**：全域設定位於 Windows `%USERPROFILE%\\.serena\\serena_config.yml`，專案設定位於 `.serena/project.yml`；專案特有設定優先放 project config，不把個人環境設定提交進 repository。MCP 啟動參數可覆寫設定；本專案保留 `--context=codex`、`--project-from-cwd` 與 `--open-web-dashboard=false`，因此不得為了開啟 Dashboard 而改變 MCP 啟動流程。
7. **安全與邊界**：Serena 的編輯、shell、memory 與其他工具仍受 Codex approval、plan mode、branch/PR 規範及本檔案約束；工具可用不等於已獲得外部寫入授權。跨 Owner、schema、授權、部署或遠端 mutation 仍須先定位 contract 並取得必要授權。

官方參考：[Configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)、[Memories & Onboarding](https://oraios.github.io/serena/02-usage/045_memories.html)、[The Project Workflow](https://oraios.github.io/serena/02-usage/040_workflow.html)。

## Change / validation

- 主動依 [tool selection](docs/reference/engineering/development-workflow.md#autonomous-tool-selection) 選工具，依 [role routing](.codex/agents/AGENTS.md#autonomous-delegation) 判斷並執行有獨立價值的委派，不等待使用者逐次指定。簡單任務可由 Primary 完成；每個寫入面與 validation 必須有明確負責者，當前任務／工具限制優先。
- Repository 修改固定依 [development change loop](docs/reference/engineering/development-workflow.md#default-repository-change-loop) 執行：先定目標與不變條件、定位 Owner/契約與 consumers，再依任務查詢、預覽、修改、檢查漏改、驗證及交付。已知 Owner 直接讀契約；純文件修正保留原本文件路徑，不強制執行無關工具。
- 批次查改使用 `pnpm code` 產生有覆蓋邊界的預覽／計畫，來源寫入沿用 `pnpm patch:apply`。跨 project／公開契約的部分結果不能宣稱全庫完整；展開實際 consumers 後再修改。已有授權的可逆修改在預覽後直接續行，不新增逐次確認。
- 保留既有/他人修改；同 checkout 不並行寫同一檔案或產物。
- 工具呼叫先設定足以回答當前問題的輸出上限；列表、diff、log、JSON/API 與 test output 先在工具端投影／計數／摘要。成功不展開原始 log；失敗先讀第一個可行動錯誤與固定 tail，只有該片段不足以改變下一步時才局部擴展。禁止把完整高量輸出直接注入 Agent context。
- 可逆且 contract 已決定的實作直接完成；只有缺少會改變產品語意、資料處置或外部寫入授權的資訊才阻塞。
- JS/TS/JSON 由 Biome formatting；需要時用 `pnpm format`。
- 一般修改 `pnpm check`；文件 `pnpm docs:check`；merge/release `pnpm validate`。Evidence boundary：[validation rules](docs/rules/validation-evidence.md)。
- Merge 前依 [development workflow](docs/reference/engineering/development-workflow.md) 收斂 WIP/fixup history。

Scopes：[`packages/`](packages/AGENTS.md) · [`scripts/`](scripts/AGENTS.md) · [`.github/`](.github/AGENTS.md) · [`.codex/`](.codex/AGENTS.md)。
