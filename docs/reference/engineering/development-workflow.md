# Development workflow

## Codex project development

共用工作契約由 repository AGENTS 維護，本文件擁有其操作程序；Codex config/rules/agents/skills 是工程工具設定，不是產品契約，也不證明目前工作階段已載入。

## Project configuration

- `.codex/config.toml`：專案 Codex 設定；agent concurrency 是上限，不是每次都要委派。
- `.codex/agents/`：專案角色責任；當前工具權限與使用者指示優先。
- `.codex/rules/default.rules`：只約束列出的 command patterns；不能取代 GitHub/Supabase/LINE 等實際平台授權。

## Working principle

Agent 修改前仍須按 repository source priority 檢查 code / manifest / schema / tests / nearest AGENTS。Tool configuration 不建立 compatibility layer、business abstraction 或 architecture exception。

## Default repository change loop

每個任務以一個可驗收結果為單位，從 repository root 工作；依任務使用必要工具，不為完成清單而讀全庫或執行無關程序。

開始時先選擇下方適用的工具，並依 [autonomous delegation](../../../.codex/agents/AGENTS.md#autonomous-delegation) 決定 Primary 直接處理或委派；已有任務授權就直接執行。只在有助於確認 scope、未知數或責任時，以簡短進度說明選擇，不新增逐次核准或任務紀錄。

1. **目標與不變條件**：確認可觀察結果、允許／排除範圍、Owner、consumer 與完成標準，保留現有 WIP。
2. **Owner／契約**：已知 Owner 直接讀其契約、public exports、source/tests 與 nearest AGENTS；未知或跨語意時用 `pnpm semantic context "<intent>"` / `plan`，照 required selectors 讀 authority。歧義先定位，不當成修改授權。
3. **實作／consumers**：文字、SQL、JSON 與文件用 `rg`；符號定義／引用用 `pnpm code definition` / `references`；相同語法結構用 `code search`。沿真正依賴展開，查詢的部分結果不等於沒有其他引用。
4. **代表案例**：批次轉換先驗證會命中、應排除與關鍵邊界案例；對同一契約保持一致，不按固定檔案數切割。
5. **完整預覽**：`code rewrite` / `rename` 產生暫存計畫，檢查全部命中、排除理由與 coverage。公開／跨 project 符號沿 public contract 另查 consumers，不能用 project-local rename 冒充全庫遷移。
6. **修改／漏改**：`pnpm patch:apply <plan.json>` 預覽，既有授權內以 `--apply` 套用，再重跑相同搜尋、檢查剩餘命中與 Git diff。一般小修改可直接編輯；批次計畫不繞過內容／雜湊前置條件。預覽是工程步驟，不要求使用者重複確認。
7. **相關驗證**：執行真正受影響的 tests／runtime 驗收與 `pnpm check`；純文件用 `pnpm docs:check`。同 checkout 的 build/type generation/installation 按順序執行。
8. **Exact-head 驗證**：整理 logical commits、push 並建立／更新 PR，明確 fetch main、同步 base；`pnpm change:finalize` 執行完整 `pnpm validate`，並拒絕驗證期間 branch/HEAD/base/upstream 變動。
9. **PR → main**：確認本地、remote branch、PR head 與 CI aggregate `validate` 是相同 SHA；合併前重新確認遠端 base，前進就同步並重驗。按下方 merge 契約交付，讀回 PR merged 狀態與 main commit。明示的唯讀、push-only 或其他交付限制優先。

工具介面與例子見 [source operations](../../../scripts/code/README.md)。`pnpm code` 只查詢／產生計畫，來源寫入仍由 [patch application](../../../scripts/changes/README.md) 擁有；規則／計畫放忽略的 `.artifacts/`，不新增每次任務的永久紀錄。每個寫入面由一位負責者處理；只有獨立 scope 或唯讀分析才並行，需要隔離時使用 worktree。

AGENTS 約束代理行為，CLI 檢查輸入／前置條件，CI 驗證提交結果；三者不互相冒充證據。最終回報 changed behavior/Owner、驗證命令與 SHA、結果及未驗證範圍。開新 Codex 工作階段後，用簡短任務確認能讀到 root AGENTS、本節與工具入口；既有 session 中修改文件或靜態檢查成功不證明新 session 載入。指令探索契約見 [Codex AGENTS](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。

## Autonomous tool selection

目標是用最小必要成本取得足以修改與驗收的證據。Primary 與子代理按目前要回答的問題主動選用下表；工具結果不擴大任務授權，唯讀角色也不能產生會寫入磁碟的計畫。

| 要回答的問題／操作 | 主動使用 | 完成條件與限制 |
| --- | --- | --- |
| Owner 未知、語意歧義或跨 Owner 影響 | `pnpm semantic plan "<intent>"`；需要載入具體 authority 時用 `context` | 讀取選中的真實契約、來源與 revision；已知 Owner 可直接讀契約，不要求先跑兩個命令。 |
| 已知路徑、精確文字、SQL／JSON／文件引用 | `rg`／`rg --files` 與 targeted reads | 確認搜尋範圍、排除與實際 consumers。文字命中不證明是同一個 TS symbol。 |
| TS／JS symbol 的定義、引用與私有改名 | `pnpm code definition`／`references`／`rename` | 使用現有 TypeScript LanguageService；先查引用再產生改名預覽。project-local、partial、unsupported、公開／跨 project 邊界如實回報，沿 public exports 補查 consumers。 |
| 重複的 JS／TS 語法結構查改 | `pnpm code search`／`rewrite` | 使用 pinned ast-grep；先驗證代表性命中與反例，再檢查全部命中、排除與完整計畫。 |
| 套用已檢查的批次計畫 | `pnpm patch:apply <plan.json>`，再於授權內加 `--apply` | 一個 writer；保留 hash／exact-before 檢查，修改後重查漏改並檢視 diff。一般小修改可直接編輯。 |

工具失敗或 coverage 有缺口時，先讀錯誤與實際契約，採目前允許且能保留證據的操作；不能為完成流程擴大 permission、偽造完整覆蓋或直接繞過 plan preflight。介面細節由各工具 README 擁有。

### Command consolidation

| 項目 | 決定與原因 |
| --- | --- |
| `change:impact` | 移除純轉呼叫入口，統一為 `pnpm semantic plan`；不保留 compatibility alias。 |
| `change:plan`、`semantic:*` package aliases | 維持既有退休／禁止規則。編輯器 task label 不屬 package alias。 |
| `repo:context`／`scripts/context/` | 尚未實作；目前重用 semantic context、`rg` 與 code 查詢，不新增重複索引入口。 |
| ts-morph | Repository 符號工具直接使用 TypeScript LanguageService。shadcn 的 transitive dependency 由其 lockfile 擁有，不因本流程刪除。 |
| `rg`、小範圍直接編輯、`change:status`／`preflight`／`finalize` | 保留各自的文字搜尋、編輯與 Git lifecycle 責任。四項查改能力不取代 validation、architecture/security guards 或 runtime 驗收。 |

### Adoption evidence

標準化的共同輸入是目標、不變條件、Owner／consumer、允許範圍及驗收方式；交接還需指明 candidate revision／WIP、已取得證據、剩餘未知數與 validation owner。完成時回報實際行為、命令結果與 revision、coverage 限制及尚未驗證範圍。使用目前 turn 與忽略的 `.artifacts/` 交換暫存計畫，不建立永久任務 database。

| 證據 | 可以證明 |
| --- | --- |
| `tooling:check`、`docs:check`、CLI regression tests、CI | canonical command／instruction wiring 與可執行前置條件、結果契約。 |
| 新 session 的指引讀回 | 該次 session 能讀取目前指引；不代表已主動選工具或委派。 |
| 未提示工具／角色名稱的新 session 任務與實際工具紀錄 | 該次案例是否自行選對工具、保持單一 writer、按需要委派及如實回報 evidence。 |

修改接線後至少用代表案例觀察行為：單檔文件修正應保持簡單；Owner 未知且有獨立查證面時應定位並適當委派；批次符號／結構變更應產生預覽、經 patch preflight 並重查；公開或跨 project 結果不能被宣稱為完整改名。案例不把工具名稱寫進 prompt，不以重述流程當作實際採用證據。這些是受目前 host、工具與 live instructions 限制的行為驗收，不保證所有未來 session。

## Validation

修改 Codex config、agent、rules、skill metadata 時，使用 repository 現有 tooling checks，包括 `tooling:check`、必要的 `tooling:rules` 與 `docs:check`。

靜態檔存在或 test case 通過不證明新的 ChatGPT/Codex session 已實際載入；需要時在新 session 讀回當前 config/agents/skills。

一般程式與文件驗證入口見 [Validation](validation-pipeline.md)。

## Next.js and shadcn agent workflow

MCP 接入由 `.codex/config.toml` 擁有；可執行版本由對應 workspace manifest 與 lockfile 擁有。從 repository 根目錄啟動 Codex：Next DevTools 使用根 workspace 的 executable，shadcn 使用 `apps/web` 的 executable 與 `components.json`。安裝使用 `pnpm install --frozen-lockfile`；更新 MCP 時修改真正的 dependency pin 與 lockfile，再驗證，不使用 `dlx @latest` 或機器專屬路徑。

| 任務 | 先讀／使用 | 接續驗證 |
| --- | --- | --- |
| 查找、組合或新增 UI | 現有 `apps/web/src/shared/ui`、`apps/web/components.json` 與適用 owner；使用既有 shadcn skill／MCP 查詢 registry item 與範例 | 檢視安裝 diff，保留專案 theme、primitive、aliases 與 owner；瀏覽器操作受影響流程 |
| Next.js API、route 或 server/client boundary | `apps/web/node_modules/next/dist/docs/` 的版本對應文件；不足時使用 Context7／官方來源並確認版本 | 開發伺服器 MCP 的實際 tools 與 runtime；不以其他版本範例覆蓋本地契約 |
| 編譯、hydration 或頁面錯誤 | 啟動 `pnpm dev`，從 banner 取得 port；透過 Next DevTools 查詢該 port 的 tools 與 project metadata | 確認 project path 是目前 checkout 的 `apps/web`，再查 errors、compilation issues 與受影響頁面 |

工具名稱以該版本的 `tools/list` 為準；角色選擇與可選的 GPT-6.1 開發組由 [model/role routing](../../../.codex/agents/AGENTS.md) 擁有，依任務載入 skills。MCP auto-approval 集中在 parent config，子代理繼承實際權限；免逐次確認不取代任務的寫入授權。Registry 擴展由 `components.json.registries` 擁有；只因實際 consumer 需要加入來源，registry output 仍須經 owner／dependency 檢查。

```sh
pnpm tooling:doctor
pnpm tooling:doctor --mcp
pnpm tooling:doctor --mcp --next-port 3000
```

第一個命令只檢查本地 toolchain、project MCP 設定與已安裝版本。`--mcp` 才啟動兩個已配置的本地 MCP，使用 SDK 的安全預設環境取得 initialize／完整 tools list；不下載套件、不傳遞 provider credentials、不列印 server logs 或 tool descriptions。`--next-port` 使用明確的 loopback port，經已配置的 Next DevTools 檢查 runtime tools 與 project identity；請替換成實際 banner port。診斷結束即關閉其 MCP processes，不啟停應用程式。

以上分別證明 configuration、MCP transport 與 runtime project identity。一般 offline validation 不執行 live probes；診斷不證明目前 Codex session 已重新載入設定、registry 認證或瀏覽器行為。設定變更後重新載入 MCP／開新 session，確認工具可呼叫；UI 變更仍需瀏覽器驗證，再執行 canonical `pnpm check`，merge 前以 exact head 執行 `pnpm validate`。若使用 `next-dev-loop`，先滿足該 skill 的 framework／browser 版本與 preflight。

官方契約：[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Next.js MCP](https://nextjs.org/docs/app/guides/mcp)、[shadcn MCP](https://ui.shadcn.com/docs/mcp)。


## Commit and PR workflow

Git history 保存可理解的工程決策，不保存完成工作的每一步操作。Commit 邊界由變更責任、驗證與 rollback boundary 決定，不由檔案數、行數、layer 或工作時間決定。

## Commit boundary

一個 commit 應同時滿足：

- 可以用一句話說明它改變的行為、契約或責任。
- 可以用對應的 test / static check / docs check 獨立驗證。
- revert 時只撤銷一個合理的工程決策，不需要連帶撤銷無關能力。
- 完成該決策所需的 code、tests、schema、docs 與 references 一起提交；不要為了讓 commit 變小而留下中間不一致狀態。

因此不要按「一個檔案一個 commit」或「一個 layer 一個 commit」切割。跨 `web / application / domain / infrastructure` 的單一 use case 可以是一個 commit；相反地，同一個大 commit 若同時改變互不相干的 authorization、Attendance、LINE asset 與 documentation taxonomy，應依責任拆開。

## Branch history

開發中的 branch 可以有 checkpoint、WIP、review fix 或暫時驗證 commit，但 merge 前應整理成 logical history：

1. 對原決策的補漏使用 `fixup`，在送出或合併前 autosquash 回 owner commit。
2. 全域 rename、reference synchronization、format follow-up 等若只是同一決策的完成條件，合併回該決策，不按檔案拆成多個永久 commits。
3. 暫時 workflow、scan、debug 或 verification artifact 若最終不屬產品／工程契約，移除後不要讓「加入」與「刪除」兩個互相抵消的 commits 留在 `main` history。
4. branch 同步 `main` 時優先保持線性歷史；只為解 conflict 或同步進度產生的 merge commit 不應成為永久工程決策。

一般 PR 目標是 1–3 個 logical commits。超過 5 個不是錯誤，但應重新檢查：是需求本身過大、存在多個 rollback boundaries，還是只是 fixup noise。數量只是 review signal，不是機械限制。

## When to split

出現以下任一情況時，優先拆 commit，必要時拆 PR：

- 不同 domain / module owner，且可以獨立交付或回滾。
- 不同 security / transaction / data-isolation 風險，需要不同驗證或 review。
- 一部分失敗時，另一部分仍應安全保留。
- commit message 需要用「以及」「順便」「同時」描述數個無共同 invariant 的改動。

不要為了製造漂亮歷史拆出 compatibility layer、wrapper、placeholder 或中間 abstraction。

## Commit message

沿用 repository 現有語意化格式：

```text
<type>(<scope>): <single decision>
```

`scope` 只在能準確表達 owner 時使用。標題描述完成後的結果，不描述操作過程，例如：

```text
feat(attendance): add replay-safe auto clock flow
docs(attendance): clarify work-session ownership
fix(identity): preserve membership when Google linking fails
```

避免永久歷史出現只描述過程的訊息，例如 `rerun check`、`fix link again`、`sync latest main`、`format follow-up`；這些通常應 fixup 到真正的 owner commit。

## Pull request and merge

PR 描述的是完整 change set；commit history 描述其中值得保留的獨立決策。開發／Agent 高頻修改期間可使用 **Draft** 避免把未完成 head 當成 merge candidate；push 應以 coherent checkpoint 為單位。任何 non-draft PR 的 `opened`、`synchronize`、`reopened`、`ready_for_review` 都對 exact current head 執行完整 `pnpm validate --group <name>` matrix；後續 push 產生新 head 時直接重新完整驗證，不需要 Draft → Ready toggle。Merge candidate 必須以 current head 的 aggregate `validate` 成功為證據；base/main 前進後先更新 branch，再由新的 current head 重新取得完整驗證。

GitHub workflow 的原子邊界是獨立 trigger、permission、external effect 或 rollback responsibility，不是 YAML step 數量；checkout/setup/verify 的重複不足以建立 reusable workflow。只有已有至少兩個真實 consumer，且 inputs、permissions、failure semantics 一致時才抽 reusable owner。

- 預設使用 **Squash merge**，讓 `main` 保留一個完成的 change set。
- 只有 PR 內存在 2–4 個可獨立理解、驗證與 revert，而且保留各自歷史有實際價值的 commits 時，才使用 **Rebase merge**。
- 一般 feature / docs PR 不以 **Merge commit** 保存 branch topology；只有 topology 本身有需要保留的整合意義時才例外。
- 已經進入共享 `main` 的歷史不為了美觀 force rewrite；規則從後續變更開始適用。

## Validation

Commit 整理不能替代 repository validation，也不能藉 rebase / squash 隱藏失敗。

- 文件修改：`pnpm docs:check`
- 一般程式修改：`pnpm check`
- 合併／發布前：`pnpm validate`

實際驗證責任與證據邊界由 [Validation and tooling entry points](validation-pipeline.md) 擁有。PR 應分開說明本地 static/test/build 與 deployment、remote API、LINE 真機等外部證據。
