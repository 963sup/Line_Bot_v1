# Repository change contract

以 repository evidence 確認 current state；不要用 best practice、舊文件或猜測取代 code / manifest / schema / tests。

## Context hygiene

- 命令執行前先界定輸入範圍、目標路徑、必要檔案與預期答案；不得以整個 repository 作為預設輸入。
- 優先指定明確檔案、package、scope、測試名稱、JSON field 或 revision；避免無範圍的 glob、遞迴掃描與全庫查詢。
- 不得把完整檔案、完整環境、資料庫 dump 或 provider response 預設帶入上下文；敏感值不得帶入上下文。
- 讀取大型檔案時先用 `rg`、`jq`、`sed -n` 或欄位投影定位必要片段，不要先完整載入再過濾。
- 測試、lint、typecheck 與 build 優先使用最小 affected scope；只有錯誤原因或 release evidence 不足時才擴大輸入範圍。
- 命令可以產生完整輸出，但不得將無關的完整輸出帶入上下文。
- 完整 build、test、CI、provider、API 或 runtime log 可寫入 ignored artifact；上下文只讀取摘要、可行動錯誤、相關片段與必要尾端。
- 成功結果只保留結論、exit status、結果數量、目標路徑與必要證據，不重複完整日誌。
- 失敗時先讀第一個可行動錯誤，再讀相關 stack trace 或尾端；資訊不足時才局部擴大讀取。
- 不為了證明命令已執行而貼出完整輸出；回報命令、結果與影響範圍即可。
- 輸出上限是保護措施，不取代相關性判斷；相關且必要的片段優先於固定行數。
- 可能產生高量輸出的 test、build、lint、typecheck、provider、CI 或輪詢命令，將完整 log 寫入 ignored artifact；上下文只讀取結構化摘要或有界錯誤片段。輪詢只回報有意義的狀態變化。輸出控制不綁定特定 repository wrapper。
- HTTPS JSON 回應在工具端只投影當前決策所需欄位；未選欄位、物件內容及大型陣列不可帶入上下文。
- `rg`、`sed -n`、Git pathspec 等已明確限制輸出的定位命令可直接執行；不可為了省略篩選而將無界命令包裝成 bounded command。

## Serena MCP usage

完整的 Serena CLI、MCP、REPL 與 LSP 操作速查見 [`.serena/README.md`](.serena/README.md)；Serena v2 [Tools 官方文件](https://oraios.github.io/serena/01-about/035_tools.html) 是語義工具的最優先參考，開始 Serena 工作前再以當前 CLI `--help` 與 session `initial_instructions` 核對可用能力。

- Serena MCP 可用時，涉及 TypeScript/JavaScript 符號、跨檔案引用、宣告、實作、診斷、語義重構、safe delete、LSP 或 project memory 的任務，主動優先使用 Serena。
- Serena v2 + LSP 是本 repository 的首選語義工具鏈；Serena 以 workspace-pinned Python runtime 啟動，並透過 TypeScript LSP 處理本專案的 TS/JS 符號。只有 Serena 未啟動、能力不足或任務屬於一般檔案／shell／Git／驗證操作時，才改用 Codex 原生工具。
- 每個新的 Serena MCP session 先呼叫一次 `initial_instructions`；不要重複把完整 Serena manual 帶入上下文。
- 需要了解專案結構、符號關係或跨 package dependency 時，先使用 Serena 的 `serena_repl`、symbol overview、find symbol、find references、diagnostics 或 LSP 操作，再決定是否需要讀取完整檔案。
- Serena 只負責語義定位、符號操作、診斷、重構、project activation 與 memory routing；一般檔案讀寫、patch、shell、Git、測試與驗證使用 Codex 原生工具。
- Serena memory 只作為檢索入口；source、manifest、schema、tests、architecture authority 與 provider readback 才是完成與正確性的證據。
- 對持久且非顯然的 repository 慣例、工具鏈、架構決策或完成證據，使用 Serena v2 memory API 讀取／新增／更新／重新命名／刪除；先讀 `mem:eme_core` 與 `mem:memory_maintenance`，沿用既有 owner，完成後執行 `serena memories check`。不要把 branch 狀態、聊天紀錄、原始 log、credential 或一次性進度寫入 memory。
- Serena session 未啟動、工具不可用或結果不足時，明示原因並使用 Codex 原生工具繼續，不得假設 Serena 結果等於完整 repository evidence。
- 不為一次性文字查找、單檔文件修改、設定檔修改或簡單命令強制呼叫 Serena；主動使用必須能降低符號定位或跨檔案推理成本。

### Serena context budget

- 同一存活 session 已成功呼叫的能力直接重用；不每輪重讀 manual、README、help、完整工具清單或重跑 health-check。只有 session／runtime／設定改變或實際呼叫失敗時，針對失效層重新檢查；CLI 與 hosted MCP 的證據分開。
- `project index` 僅在使用者要求、首次缺索引、大量來源新增／搬移／刪除或分支切換後查詢證實快取失效時執行。一般修改使用自動同步；單檔問題先用 `index-file`，不以索引解決權限或 MCP 通訊錯誤。
- 批量重構先用限定 path/symbol 的 overview/reference 建立完整清單，再依當前 v2 API 說明使用可用批量工具；只回傳必要差異、數量及失敗項，完成後 reference／diagnostics 回掃並跑受影響驗證。
- Memory 按任務讀相關節點；`eme_core` 與 `memory_maintenance` 在本 session 首次 memory mutation 前讀一次，未變更時重用。只在持久知識改變時更新，變更後 check；不把每輪工具可用狀態寫入 memory。
- Hook 只注入短入口提醒，不啟動 index、安裝、help、全庫查詢或另一個模型。完整 log 留 ignored artifact，不作下一輪預設 context。

### MCP availability evidence

目前以 [`.codex/config.toml`](.codex/config.toml) 為 MCP 設定來源；以下是最近一次本地 bootstrap 核對結果，不代表每個 Codex host session 都已完成登入或連線：

| MCP | 狀態 | 使用規則 |
| --- | --- | --- |
| `serena` | 已核對可用：Serena 2.1.0、Python 3.13、LSP、REPL | 語義定位、符號、引用、診斷、重構優先使用 |
| `next-devtools` | 已核對本地 launcher 可用 | Next.js runtime／診斷需要時使用 |
| `shadcn` | 已核對本地 launcher 可用 | 元件庫查詢／操作需要時使用 |
| `github` | Token binding 已核對；實際 hosted handshake 仍需當前 host 驗證 | repository、PR、issue 操作使用；不把 Token 寫入 repository |
| `context7` | 已配置 `CONTEXT7_API_KEY` 引用；本地 shell 未提供該值時不可用 | 文件查詢需要時使用；缺少 key 要明示，不猜測結果 |
| `openaiDeveloperDocs` | 端點已配置；host handshake 未核對 | OpenAI 官方文件查詢需要時使用 |
| `sentry` | 端點已配置；OAuth／host handshake 未核對 | 只有當前 host 完成 OAuth 後使用 |

若 MCP 實際呼叫失敗，先回報具體 server、工具與授權／連線原因，再使用已核對的 Serena 或 Codex 原生工具；不得把「設定存在」宣稱為「服務可用」。

## Mandatory governing set

以下是完整 governing authority，所有 repository 任務一律遵守。具體讀取依下方 Effective context contract 選取 target ref 的 current file／section／symbol；不要求每次將無關檔案全文預載進 context：

- `architecture/registry.json`：ID、分片路徑與 schemaVersion；依任務選取下列分片，禁止預載整套模型。
- `architecture/domain/vocabulary.json` 與 `architecture/domain/owners/*.json`：共通語彙與各 owner 的概念、能力、關係。
- `architecture/modules/*.json`：模組路徑、owner 與允許依賴；target 不代表 current runtime。
- `architecture/data/*.json`：資料關係、SQL 位置與共用機制。
- `architecture/fpt/*.json`
- `architecture/fpt-source.json`
- `.dependency-cruiser.mjs`
- `biome.json`
- `knip.jsonc`

這些檔案是 domain truth / architecture / topology / dependency / formatting / reachability 的 governing inputs，不是為了讓 local implementation 或 CI 通過而可任意調整的 escape hatch。

- 一般 feature、refactor、bug fix、CI fix：修 source、ownership、dependency、public export、placement 或真正 root cause；不得透過弱化 governing file、加 ignore、exception、alias、wrapper 或 compatibility surface 消除 violation。
- 若任務本身就是修改 governing file，先證明 authority / contract 為何真的需要改，再同步所有受影響 consumer、guard、tests、docs 與 validation evidence；不得從 symptom 反推規則應放寬。
- `architecture/fpt/*.json` 是從 pinned `github/docs/src/graphql/data/fpt` 原樣 vendoring 的 GitHub GraphQL domain truth；不得手改、轉寫或由產品 domain 分片覆蓋。`domain/vocabulary.json` 與 `domain/owners/*.json` 只補本產品 owner、invariant、relationship、capability 與 implementation expectation。
- Nested `AGENTS.md` 只能增加 local constraint，不能削弱或覆寫本 governing set。
- 所有 nested scope 完整繼承 [system invariants](docs/rules/system-invariants.md)，包括 bounded tool output；不得以 local validation、debug 或 verbose 慣例恢復無界 stdout／stderr。需要完整原始證據時寫入 ignored artifact，Agent context 只載入摘要與有界片段。

## Effective context contract

1. 一律先讀 root 與沿目標路徑適用的 `AGENTS.md`、[system invariants](docs/rules/system-invariants.md)，再由 [task router](docs/README.md) 取任務入口。子 AGENTS 只補 local constraints，引用本契約，不複製完整 authority 清單。
2. 先定義 task、Owner、consumer 與觸及的 contract。Owner 未知、語意歧義，或跨 Owner 的 capability／public contract／資料／授權影響尚未釐清時，用 `rg`、package exports、source/tests 與 architecture JSON 定位影響；不得把不確定的候選當成修改範圍。
3. 從 `architecture/registry.json` 的 `domain.owners[ownerId]`、`modules.entries[packageName]`、`data.owners[ownerId]` 選取分片；Owner ID 不一定等於 package 名稱，以 module 的 `semanticOwner` 對應。只讀相關分片／欄位；共通規則再讀 vocabulary 或 configuration，跨 owner 機制再讀 data/shared。FPT 必須定位 exact file/symbol/field；記錄來源與 revision，working-tree 修改不能冒充 HEAD 內容。Generated projection／工具選取結果僅供定位，不取代 authority。

| 觸發條件 | 必須具體讀取的來源 |
| --- | --- |
| 純文件／連結修正，未改業務或治理語意 | 目標文件、引用的真實來源、root + nearest AGENTS；不預載無關 Domain／FPT。 |
| 單一 Owner source／純業務規則 | Owner contract、public exports、相關 source/tests；domain owner 的 invariant/capability 引用、必要的 vocabulary 規則、module 的 dependency entries，以及 Dependency Cruiser、Biome、Knip。 |
| Public contract、跨 Owner 或 authorization 變更 | 上項加實際 provider/consumer 契約、relationship/qualification/trust entries 與受影響 consumers；沿真實依賴擴展，不把 review candidate 當 mutation authority。 |
| Persistence、schema、transaction／replay／recovery 變更 | 上項加 data owner 分片的 relations/participants，涉及跨 owner 機制才加 shared 分片；對應 executable SQL、database-write/authorization rules 與必要競爭／rollback tests。 |
| GitHub-derived meaning／FPT-backed contract | 對應 pinned FPT exact file/symbol/field 與 provenance；語意改動同步受影響 overlay/consumer，不能由本地摘要取代。 |
| Governing input／guard 本身變更 | 完整讀取被修改的 authority/guard，以及實際 consumers/tests；先證明 authority/contract 需要改，保留全部 enforcement。 |

4. Owner/語意不明、來源缺失、無法追溯 revision 或選取結果與 source 衝突時，明示 unresolved；針對缺口沿 registry、public contracts 與真實依賴擴展讀取，不能把空結果解讀為沒有約束，也不能預設載入全部 owner／FPT 來代替定位。未解決會影響正確性的缺口前不修改該範圍。
5. Context materialization 不改 validation scope：architecture/FPT/schema/security guards 繼續檢查完整 canonical inputs；依變更執行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 或適用 provider/package tests。

## Source-first documentation contract

- 先確認 owner、契約與 consumers，決定 source 結構；完成必要的 source／architecture 變更，再同步文件。Architecture 宣告規範邊界，source／manifest／schema／tests 證明實際狀態；兩者衝突時查明原因，不以文件或實作單方面覆蓋契約。
- 目錄與檔案責任以 [README 的結構導覽](README.md#source-與文件結構) 為入口。Registry 只登錄 ID、位置與 schemaVersion，不內嵌另一份 owner／module／data 定義；不建立整包聚合 JSON 或第二套人工依賴清單。
- Root `AGENTS.md` 擁有共通修改規則；nested `AGENTS.md` 只補該 scope 特有約束，不複製父規則。`README.md` 提供使用與導航；package `SEMANTICS.md` 只保留理解公開契約所需術語及來源連結；`docs/owners/<owner>.md` 路由到實際 package／契約／資料來源，不重述實作細節。
- 機械可推導的型別、exports、狀態、依賴與 SQL 定義留在真正來源；文件用精確連結。禁止為了對齊目錄範本新增空 package、空 layer、SQL placeholder 或無內容文件。
- Source 移動／刪除時，同步 registry、真實 consumers、測試、CI、格式檢查範圍與受影響連結；重新搜尋舊路徑。FPT 移動必須保持 vendor 檔案內容不變，來源資訊維持在 `architecture/fpt-source.json`。
- 變更 architecture、manifest／exports、文件邊界或其 consumers 時執行 `pnpm check:repository`；它是快速結構檢查，不取代受影響的行為測試、Dependency Cruiser、型別檢查或 provider 驗證。保留完整登錄檢查，只讀 JSON／manifest 與檔案清單，不把編譯、FPT 全文、外部服務或全庫 AST 掃描加入此快速入口。

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

先用 [task router](docs/README.md) 取最小 context；已知且限於單一 Owner 時直接讀 owner contract + nearest `AGENTS.md`。需要跨檔案定位時使用 bounded `rg`、package exports、architecture JSON 與相關 tests。

修改指引前先核對實際 consumer；不維護 repository 內重複的 agent prompt 或 Markdown review database。

Source-of-truth：[facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。子 AGENTS 只增加 local constraints。

## Completeness and root-cause delivery

### Primary agent requirement preflight

- 每次接收新需求或範圍變更，主 agent 在修改前先核對：目標與完整範圍、已驗證事實／假設、Owner／consumer、新增／修改／移除清單、驗收與執行順序。簡單變更直接精簡說明，不強制新增文件。
- 跨 Owner、多步驟、需求歧義或批量重構時，使用 `.codex/agents/requirement-architect.toml` 的唯讀角色協助釐清；目前 host 無該角色或無法委派時，由主 agent 執行同一檢查並明示工具限制，不阻塞已授權工作。
- 大型任務先更新唯一既有總體計畫，列出總段數、各段產物／驗收、目前狀態與完整刪碼候選；不得邊做邊自行縮小交付範圍。續作先讀計畫與實際 diff，不重建平行規格。
- 主 agent 整合角色結果並負責執行到底；需求規畫不替代架構審查、測試或使用者驗收，也不增加已授權實作的確認輪次。
- SessionStart hook 提供此規則的提醒，無法證明每個需求都已檢查；hook 未觸發時上述規則仍適用。

- 先把使用者要求轉成明確 scope、完成條件、不可改變條件與受影響檔案清單；「全部」、「完整」、「全面」表示必須處理該 scope 內的所有項目。
- 先找根因，再處理所有由根因影響的 consumer、配置、文件、測試、驗證與部署入口；不得只修第一個失敗點或只完成代表性樣本。
- 發現多個同類項目時，先建立完整 inventory，再逐項處理並重新掃描；不得以抽查、第一階段、主要檔案或高風險項目宣稱整體完成。
- 中途發現工作量大時，不得自行把完整要求降級成分階段交付；若只能完成部分，必須明確標示未完成範圍，不能使用「已完成」或「完整」描述。
- 完成前必須重新檢查原始 scope、搜尋漏改引用、檢查新增/刪除檔案、執行適用驗證，並回報剩餘未處理項目與理由。
- 分層文件、配置、agent、skill 或 route 的整理，必須逐層確認父層與子層責任分配；不得只修改父文件後假設子文件已完成分配。
- Root cause、consumer、contract、dependency、owner、source of truth 與驗證證據未串完整前，不得提交修復結論。

## Change / validation

- Lifecycle hooks 由 `.codex/hooks.json` 接線、`.codex/hooks/` 擁有事件處理，驗證仍經 `scripts/check.mjs`。只追蹤本 session／turn 的 apply_patch 路徑；shell 修改需人工選取驗證。Stop hook 僅執行 scoped diff／Biome 快速檢查，不代替 typecheck、業務測試、build 或 provider evidence。不得因 hooks 未觸發、未信任或只通過快速檢查而宣稱完整驗證。

- Repository 驗證統一透過 `pnpm check [stage...]`，包含 `check:repository`、`codex:config`（設定與 agent／hook 引用）、`hooks`（事件處理回歸測試）、`lint`（Biome）、`dependencies`（Dependency Cruiser）、`knip`、`typecheck`、`test`、`build`、`schema:check` 與 `patch`。單一 stage 可用 `--` 傳遞工具參數；根目錄既有驗證 scripts 亦轉入同一入口。

- 主動依 [development workflow](docs/reference/engineering/development-workflow.md) 選擇能直接回答問題的工具；簡單任務直接完成，每個寫入面與 validation 保持單一負責者。
- Repository 修改固定依 [development change loop](docs/reference/engineering/development-workflow.md#default-repository-change-loop) 執行：先定目標與不變條件、定位 Owner/契約與 consumers，再依任務查詢、預覽、修改、檢查漏改、驗證及交付。已知 Owner 直接讀契約；純文件修正保留原本文件路徑，不強制執行無關工具。
- 批次查改使用 bounded `rg` 與原生 patch；跨 project／公開契約的部分結果不能宣稱全庫完整；展開實際 consumers 後再修改。
- 保留既有/他人修改；同 checkout 不並行寫同一檔案或產物。
- 工具呼叫先設定足以回答當前問題的輸出上限；列表、diff、log、JSON/API 與 test output 先在工具端投影／計數／摘要。成功不展開原始 log；失敗先讀第一個可行動錯誤與固定 tail，只有該片段不足以改變下一步時才局部擴展。禁止把完整高量輸出直接注入 Agent context。
- 可逆且 contract 已決定的實作直接完成；只有缺少會改變產品語意、資料處置或外部寫入授權的資訊才阻塞。
- JS/TS/JSON 由 Biome formatting；需要時用 `pnpm format`。
- 一般修改依 scope 使用 `pnpm check lint typecheck test build`、`pnpm check dependencies` 或 `pnpm check knip`。Evidence boundary：[validation rules](docs/rules/validation-evidence.md)。
- Merge 前依 [development workflow](docs/reference/engineering/development-workflow.md) 收斂 WIP/fixup history。

## Codex Cloud bootstrap

- 環境入口在 `.codex/bootstrap/`；新建／重建使用 `install.sh`，恢復快取或更新 checkout 使用 `update.sh`，日常檢查使用 `verify.sh`。不要每次任務重裝工具、build 全部 packages 或重新索引全庫。
- Cloud setup 執行 `bash .codex/bootstrap/install.sh`，maintenance 執行 `bash .codex/bootstrap/update.sh`；這些腳本準備環境。環境驗證統一透過 `pnpm check bootstrap`，明確要求 smoke 時使用 `pnpm check bootstrap:smoke`，兩者不納入預設 repository checks。
- 安裝後依 bootstrap 選定路徑使用工具：後續 shell 命令先 `source .codex/bootstrap/lib/common.sh`。不能假設安裝 subprocess 修改的 PATH 會回傳目前 session。
- 只有 install exit 0 且 `.tools/codex/installed.sha256` 已寫入才回報安裝完成；verify exit 0 只證明本地檢查通過。失敗讀取 stage 與完整日誌的有界片段，不以 node_modules 存在推論完整初始化，也不繞過 proxy／TLS 或自動升級版本。
- ShellCheck 為選用工具，只在 `BOOTSTRAP_TOOLS` 明確選取時安裝與驗證。使用固定版本的官方 binary、驗證 SHA-256，安裝至 `.tools/codex/bin/shellcheck`，不依賴 apt／sudo。其他已選取的系統套件若需要 root 或非互動 sudo，回報 image／權限阻塞與已完成階段，不以部分安裝宣稱初始化成功。
- `actionlint`、`shfmt`、`taplo` 為選用工具，使用各自 `modules/<tool>/install.sh`／`verify.sh` 與固定版本，下載須驗證 checksum；不另建全域 npm 副本。程式檢查透過 `pnpm check actionlint shfmt taplo`，檢查階段不得下載、安裝或自動改檔。workspace 已擁有的 ast-grep、TypeScript、Biome 沿用 lockfile。
- `config/` 擁有啟用項目與額外版本，`lib/` 擁有共用 primitive，`modules/<tool>/` 各自擁有 install／verify，`mcp/servers/<server>/` 只處理該 server 的本地需求。不要在 root scripts、devcontainer 或 Cloud 設定另抄一套安裝內容。
- `verify.sh` 不安裝工具或啟動服務；`tests/smoke.sh` 是明確選用的本地驗證，不得以 smoke 或 executable 存在宣稱 hosted MCP、OAuth、provider 或當前 session 已就緒。使用者要求不實測時不執行它們，交付時明示未驗證。
- `.codex/config.toml` 的 stdio launcher 選用同一套已準備的工具路徑，不能在 MCP 啟動時下載或安裝。Hosted MCP 與 OAuth 由實際 Codex host 管理；以該 session 的真實工具呼叫確認可用性，缺少工具時如實回報。
- 工具與快取放在被忽略的 `.tools/`、`.cache/`，完整安裝日誌在 `.artifacts/codex-cloud/`；不改寫使用者的 HOME，不把 credential 值寫入 repo 或 bootstrap 設定。

Scopes：[`packages/`](packages/AGENTS.md)。GitHub platform settings remain under `.github/`.
