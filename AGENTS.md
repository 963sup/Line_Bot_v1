# Repository change contract

以 current source、manifest、schema、tests、provider readback 證明實際狀態；不以 best practice、舊文件或猜測取代證據。保留他人修改，已授權且可逆的工作直接完成。

## Context hygiene

- 命令先界定問題、目標路徑與預期答案；優先 exact file/package/symbol/revision，不預設掃描整庫。大型檔案先定位 section，HTTPS JSON 先投影必要欄位／數量。
- 高量 test/build/CI/provider 完整輸出留 ignored `.artifacts/` 並保留真實 exit status；context 只讀摘要、第一個可行動錯誤與有界片段。資訊不足才局部擴展，輪詢只報狀態變化。輸出上限不取代相關性判斷。
- 不載入完整環境、DB dump、credential、無關檔案或完整 provider response；不能以 context 截斷縮小實際驗證範圍。限定輸入的 rg/sed/Git pathspec 直接使用，不強制新增 wrapper。
- Root 保留共通約束，nested 只補本地規則，操作手冊按需讀；project instruction chain 保持預設 32 KiB 內，不以提高配置上限代替精簡。

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

- 先確認 Owner、contract、consumers 與 source 結構，再同步文件；architecture 定邊界，source/manifest/schema/tests 證明實際狀態，衝突時找根因。
- [README 結構導覽](README.md#source-與文件結構) 負責導航。Root AGENTS 擁有共通規則，nested 只補 local constraints；package SEMANTICS 只留公開契約術語與來源，docs/owners 只路由，不複述實作。
- 型別、exports、狀態、依賴、SQL 留在 source；registry 只登錄 ID/路徑/schemaVersion，不維護聚合模型、人工依賴清單、重複 agent prompt 或 Markdown review database。不建空 package/layer/SQL placeholder 或無內容文件。
- 搬移／刪除同步 registry、consumers、tests、CI、格式範圍及連結，重搜舊路徑。修改 architecture、manifest/exports、文件邊界或其 consumers 執行 `pnpm check:repository`；快速入口不加入編譯、外部服務、FPT 全文或全庫 AST 掃描。

## Invariants

- 業務規則、用例、查詢政策、授權、交易與 recovery 內聚於 `packages/<owner>`；apps 的 page/API 只處理 delivery、操作與 public capability 呼叫，modules 只組裝 owner 提供的能力與必要的 Web 呈現接線。不得因現有檔案方便而新增 host 業務邏輯。
- 開發依序確認需求、consumer、owner、既有公開能力，再做最小變更與驗證。第一性原理、奧卡姆剃刀落在責任與必要性，不以行數或模板代替。

- 沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth 找根因；完整保持 [system invariants](docs/rules/system-invariants.md) 的 authority、authorization/isolation、concurrency/replay、atomicity/recovery、ownership/dependency 與 evidence integrity。
- 跨 package 只用 public exports；每個 business responsibility 一個 authoritative owner，每個 production source 一個 primary role。維持 DDD + Hexagonal 的 Domain/Application/Port/Adapter 責任與依賴方向，不強建空 layer。
- 無真實 consumer、variation、technology/policy boundary、transaction/recovery 或 isolation responsibility，不新增 abstraction。簡化在確認根因與邊界之後，不能以最少行數／最快 CI 代替正確性；新增 complexity 要有證據。
- 命名不創造 Owner 或依賴方向；新檔名表達業務概念／技術機制與唯一 primary role。既有命名漸進調整，須同步 consumer/export/route/schema/tests，local exception 不複製父規則。
- 不提交 secret、credential、personal data；remote mutation 需 authorization、exact target、readback。Static/test/build/schema/deployment/provider/device evidence 分開，未知明示。

## Retrieval

工具入口：`codex mcp list`；安裝技能先讀 `${CODEX_HOME:-$HOME/.codex}/skills/skill-installer/SKILL.md`。User/system skills 與 repository `.agents/skills` 分開管理，不手改第三方技能或 lockfile。

先用 [task router](docs/README.md) 取最小 context；單一已知 Owner 直接讀 contract + nearest AGENTS。Sources of truth 見 [來源索引](docs/facts/sources-of-truth.md)，不要建立第二套 truth。

## Completeness and root-cause delivery

### Primary agent requirement preflight

- 每次新需求／範圍變更，修改前確認目標與完整 scope、事實／假設、Owner/consumer、新增／修改／移除、驗收與順序。簡單任務精簡說明，不強制模板或新文件。
- 主 agent 負責需求、實作與驗證；只有獨立且能提供新證據的子問題才按需使用 `.codex/agents`。不因多步驟而固定委派、逐角色過關或重複審查；無可用角色時自行完成。
- 長期任務已有計畫時更新該計畫；一般修改直接用 scope、diff 與驗證交付，不另建計畫或治理文件。
- 全部／完整／全面要求先建立 inventory，處理所有受根因影響的 consumer/config/docs/tests/入口並逐層確認責任。不得交代表樣本或自行縮小 scope；部分完成明示未完成項目及原因。
- 每個寫入面與 validation 單一負責者，同 checkout 不並行寫同檔／產物。只有會改變產品語意、資料處置或外部寫入授權的缺口才阻塞。
- 交付前回掃原始 scope、引用與新增／刪除檔案，驗證真實影響；根因、consumer、contract、dependency、Owner、truth 與證據未串完整前不宣稱修復。

## Serena MCP usage

- MCP 分工：serena 查語義；next-devtools 查 Next.js runtime；shadcn 查元件；context7 查版本化 library 文件；github 查 repository/PR/CI；openaiDeveloperDocs 先 search 再 fetch。Repomix 只在跨檔理解確有需要時打包有界範圍，不在每次任務自動整庫打包。工具按需使用，遠端寫入限既有授權與角色權限；登錄不證明 host/runtime 可用。

- Skills 只補技術知識，不另建治理、glossary、報告或確認流程。驗收包含 owner 歸屬、public imports 與重複實作。

- 巢狀 AGENTS 與角色繼承本工具契約，只補 owner 特有查證點。
- LSP 查證：檔案 symbols → exact symbol（按需 body）→ references/implementations → diagnostics；跨 package 補查 public imports/exports。空結果或 timeout 不證明無 consumer。
- Rename/delete 前補查動態／字串 consumer，之後驗證 owner 行為。初始化預建 index，日常重用；API 簽名以 session 為準。

- TS/JS symbols、references、diagnostics、語義重構、safe delete、LSP、memory 任務優先 Serena v2 + LSP；一般文件／設定／shell／Git／patch／驗證用 Codex 原生工具。工具未登錄、能力不足或失敗時明示原因並用原生工具繼續。
- 每個 MCP session 只讀一次 initial_instructions；重用成功能力，CLI 成功不等於 host MCP 成功。按需讀 [Serena README](.serena/README.md) 與 [官方 Tools](https://oraios.github.io/serena/01-about/035_tools.html)。

### Serena context budget

- 不每輪重讀 manual/help、列工具、health-check 或 index；只有 runtime/config 改變或實際失敗才重驗失效層。Index 觸發、ignore、REPL 簽名、跨 package 引用及信任判斷見 Serena README，單檔問題先 index-file。
- Memory 只是檢索入口；持久知識改變才 mutation。首次 mutation 前讀 mem:eme_core 與 mem:memory_maintenance，沿用 owner，完成後 serena memories check。不記錄 credential、branch 狀態、聊天、原始 log 或一次性進度。

## Change / validation

- 按 [development workflow](docs/reference/engineering/development-workflow.md) 定目標／invariants、定位、預覽、修改、漏改回掃、驗證及交付；Merge 前收斂 WIP/fixup history。簡單任務保持簡單。
- 驗證統一 `pnpm check [stage...]`，stage 定義在 `scripts/check.mjs`：`check:repository`、`codex:config`、`hooks`、`lint`、`dependencies`、`knip`、`typecheck`、`test`、`build`、`schema:check`、`patch`。依 scope 選取，額外參數只傳單一 stage。JS/TS/JSON 用 Biome，需要時 `pnpm format`。
- [Validation evidence](docs/rules/validation-evidence.md) 限定每類證據可證明範圍；先最小 affected checks，不足才擴大。check:repository 不替代行為、型別、依賴或 provider 驗證。
- `.codex/hooks.json` 與 `.codex/hooks/` 是支援且信任 hooks 的 host 的本地接線；只追蹤本 turn apply_patch，shell 修改補驗證。Stop 只做 scoped diff/Biome，不證明 type/test/build/provider；preflight 紀錄只證明提醒送達。Cloud 未執行 hook 時主 agent 仍自行 preflight/checks，hook 不啟動索引、安裝或另一個模型。

## Codex Cloud environment

安裝與啟動由 Cloud 環境設定管理。MCP 驗收分開確認 CLI 登錄、host 工具暴露及原生唯讀呼叫；OAuth 與 runtime 缺口明示。保留 Supabase 資料。

Scopes：[`apps/`](apps/AGENTS.md)、[`packages/`](packages/AGENTS.md)、[`docs/`](docs/AGENTS.md)。GitHub platform settings remain under `.github/`.
