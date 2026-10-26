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

修改指引前先核對實際 consumer；不維護 repository 內重複的 agent prompt 或 Markdown review database。

Source-of-truth：[facts/sources-of-truth.md](docs/facts/sources-of-truth.md)。子 AGENTS 只增加 local constraints。

## Completeness and root-cause delivery

- 先把使用者要求轉成明確 scope、完成條件、不可改變條件與受影響檔案清單；「全部」、「完整」、「全面」表示必須處理該 scope 內的所有項目。
- 先找根因，再處理所有由根因影響的 consumer、配置、文件、測試、驗證與部署入口；不得只修第一個失敗點或只完成代表性樣本。
- 發現多個同類項目時，先建立完整 inventory，再逐項處理並重新掃描；不得以抽查、第一階段、主要檔案或高風險項目宣稱整體完成。
- 中途發現工作量大時，不得自行把完整要求降級成分階段交付；若只能完成部分，必須明確標示未完成範圍，不能使用「已完成」或「完整」描述。
- 完成前必須重新檢查原始 scope、搜尋漏改引用、檢查新增/刪除檔案、執行適用驗證，並回報剩餘未處理項目與理由。
- 分層文件、配置、agent、skill 或 route 的整理，必須逐層確認父層與子層責任分配；不得只修改父文件後假設子文件已完成分配。
- Root cause、consumer、contract、dependency、owner、source of truth 與驗證證據未串完整前，不得提交修復結論。

## Change / validation

- 主動依 [development workflow](docs/reference/engineering/development-workflow.md) 選擇能直接回答問題的工具；簡單任務直接完成，每個寫入面與 validation 保持單一負責者。
- Repository 修改固定依 [development change loop](docs/reference/engineering/development-workflow.md#default-repository-change-loop) 執行：先定目標與不變條件、定位 Owner/契約與 consumers，再依任務查詢、預覽、修改、檢查漏改、驗證及交付。已知 Owner 直接讀契約；純文件修正保留原本文件路徑，不強制執行無關工具。
- 批次查改使用 `pnpm code` 產生有覆蓋邊界的預覽／計畫；來源寫入沿用 `pnpm patch:apply`。跨 project／公開契約的部分結果不能宣稱全庫完整；展開實際 consumers 後再修改。
- 保留既有/他人修改；同 checkout 不並行寫同一檔案或產物。
- 工具呼叫先設定足以回答當前問題的輸出上限；列表、diff、log、JSON/API 與 test output 先在工具端投影／計數／摘要。成功不展開原始 log；失敗先讀第一個可行動錯誤與固定 tail，只有該片段不足以改變下一步時才局部擴展。禁止把完整高量輸出直接注入 Agent context。
- 可逆且 contract 已決定的實作直接完成；只有缺少會改變產品語意、資料處置或外部寫入授權的資訊才阻塞。
- JS/TS/JSON 由 Biome formatting；需要時用 `pnpm format`。
- 一般修改 `pnpm check`；文件 `pnpm docs:check`；merge/release `pnpm validate`。Evidence boundary：[validation rules](docs/rules/validation-evidence.md)。
- Merge 前依 [development workflow](docs/reference/engineering/development-workflow.md) 收斂 WIP/fixup history。

Scopes：[`packages/`](packages/AGENTS.md)。GitHub platform settings remain under `.github/`.
