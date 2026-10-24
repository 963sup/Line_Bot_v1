# Development workflow

## Codex project development

共用工作契約由 repository AGENTS 維護，本文件擁有其操作程序；Codex config/rules/agents/skills 是工程工具設定，不是產品契約，也不證明目前工作階段已載入。

## Project configuration

- `.codex/config.toml`：專案 Codex 設定；agent concurrency 是上限，不是每次都要委派。
- `.codex/agents/`：專案角色責任；當前工具權限與使用者指示優先。
- `.codex/rules/default.rules`：只約束列出的 command patterns；不能取代 GitHub/Supabase/LINE 等實際平台授權。

## Skill selection and compatibility

Repository-installed third-party Skills are optional task methods, not product authority or executable permission. Discover them via `pnpm skills:list [query]` and read only the chosen `.agents/skills/<name>/SKILL.md` plus references needed for the current decision. Selection is `Task → Owner/Truth/Boundary → one applicable method → authorized tool → evidence`; do not preload all Skills, duplicate project invariants inside an external Skill, or install another Skill merely because its title resembles a project responsibility.

- **Instruction priority:** root and nearest `AGENTS.md`, canonical contracts and current source take precedence over third-party Skill examples. In particular, generic `npx skills add/update` advice from `find-skills` is *not* permission to bypass [Skills management](../../../.agents/AGENTS.md). Only the project's pinned/trusted Skills CLI may install, update or remove an entry, and it must keep `skills-lock.json` synchronized; do not hand-edit `.agents/skills/` or its lockfile.
- **Compatibility gate:** before using an external Skill, verify that its referenced local files exist, any required executables/subagents/browser or provider connection are actually available in this session, and all proposed writes fit the task/target authorization. Missing references or unsupported execution steps are an incomplete capability, not instructions to guess a replacement or claim execution; report the precise gap, and switch to an independently verified existing method when possible.
- **Overlap resolution:** keep `AGENTS.md` as the change-policy owner, `docs/` as human-readable routing/why, `architecture/` and source as product authorities, `.agents/skills/` as externally managed methods, and connected Plugins as actual provider capabilities. For overlapping methods (for example First Principles, DDD, debugging or validation), select by the specific decision to make and actual prerequisites; do not create a second project playbook, duplicate source of truth, or add a new Skill without an uncovered consumer.
- **Evidence boundary:** reading a `SKILL.md` proves only that its instructions were inspected. Command output, tests, GitHub CI, provider readback and device acceptance must each be independently verified. If a Skill demands a tool unavailable here, mark that step unverified rather than implying it ran.

## Working principle

Agent 修改前仍須按 repository source priority 檢查 code / manifest / schema / tests / nearest AGENTS。Tool configuration 不建立 compatibility layer、business abstraction 或 architecture exception。

## Default repository change loop

每個任務以一個可驗收結果為單位，從 repository root 工作；依任務使用必要工具，不為完成清單而讀全庫或執行無關程序。

開始時先選擇下方適用的工具，並依 [autonomous delegation](../../../.codex/agents/AGENTS.md#autonomous-delegation) 決定 Primary 直接處理或委派；已有任務授權就直接執行。只在有助於確認 scope、未知數或責任時，以簡短進度說明選擇，不新增逐次核准或任務紀錄。

1. **目標與不變條件**：確認可觀察結果、允許／排除範圍、Owner、consumer 與完成標準，保留現有 WIP。
2. **Owner／契約**：已知 Owner 直接讀其契約、public exports、source/tests 與 nearest AGENTS；未知或跨語意時用 `pnpm semantic context "<intent>"` / `plan`，照 required selectors 讀 authority。歧義先定位，不當成修改授權。
3. **實作／consumers**：文字、SQL、JSON 與文件用 `rg`；有界範圍的 imports／exports／頂層宣告與靜態模組連結用 `pnpm code facts --scope <path>`；特定符號定義／引用用 `pnpm code definition` / `references`；相同語法結構用 `code search`。沿真正依賴展開，查詢的部分結果不等於沒有其他引用。
4. **代表案例**：批次轉換先驗證會命中、應排除與關鍵邊界案例；對同一契約保持一致，不按固定檔案數切割。
5. **完整預覽**：`code rewrite` / `rename` 產生暫存計畫，檢查全部命中、排除理由與 coverage。公開／跨 project 符號沿 public contract 另查 consumers，不能用 project-local rename 冒充全庫遷移。
6. **修改／漏改**：`pnpm patch:apply <plan.json>` 預覽，既有授權內以 `--apply` 套用，再重跑相同搜尋、檢查剩餘命中與 Git diff。一般小修改可直接編輯；批次計畫不繞過內容／雜湊前置條件。預覽是工程步驟，不要求使用者重複確認。
7. **相關驗證**：執行真正受影響的 tests／runtime 驗收與 `pnpm check`；純文件用 `pnpm docs:check`。同 checkout 的 build/type generation/installation 按順序執行。
8. **Exact-head 驗證**：整理 logical commits、push 並建立／更新 PR，明確 fetch main、同步 base；`pnpm change:finalize` 執行完整 `pnpm validate`，並拒絕驗證期間 branch/HEAD/base/upstream 變動。
9. **PR → main**：確認本地、remote branch、PR head 與 CI aggregate `validate` 是相同 SHA；合併前重新確認遠端 base，前進就同步並重驗。按下方 merge 契約交付，讀回 PR merged 狀態與 main commit。明示的唯讀、push-only 或其他交付限制優先。

工具介面與例子見 [source operations](../../../scripts/code/README.md)。`pnpm code` 只查詢／產生計畫，來源寫入仍由 [patch application](../../../scripts/changes/README.md) 擁有；規則／計畫放忽略的 `.artifacts/`，不新增每次任務的永久紀錄。每個寫入面由一位負責者處理；只有獨立 scope 或唯讀分析才並行，需要隔離時使用 worktree。

AGENTS 約束代理行為，CLI 檢查輸入／前置條件，CI 驗證提交結果；三者不互相冒充證據。最終回報 changed behavior/Owner、驗證命令與 SHA、結果及未驗證範圍。開新 Codex 工作階段後，用簡短任務確認能讀到 root AGENTS、本節與工具入口；既有 session 中修改文件或靜態檢查成功不證明新 session 載入。指令探索契約見 [Codex AGENTS](https://learn.chatgpt.com/docs/agent-configuration/agents-md)。

### Tool output budget and stopping rule

完整執行、原始證據保存與 Agent context 是三個邊界。所有工具預設先回傳能改變下一步的最小摘要：搜尋先 count／files／有限命中；Git 先 name-only／stat；API／JSON 先投影必要欄位；checks 全綠只回傳 aggregate，失敗才展開失敗項；test/build 成功只回傳 stage、status、duration 與 revision。高量 stdout/stderr 寫入 ignored artifact，失敗只讀固定上限 tail 與第一個可行動錯誤。工具呼叫明確設定 output cap；不得因方便把完整 diff、log、payload 或檔案樹送入 context。

擴展輸出前先說明尚缺哪個 decision fact，並只讀能回答該問題的 path、stage、range 或 page。若新輸出不會改變修改、驗證或交付決策就停止；不能以重複 readback、等價 local/CI evidence 或「更確定」為由持續累積 context。這個預算不縮小 command、test、CI 或 branch-protection scope。

## Autonomous tool selection

目標是用最小必要成本取得足以修改與驗收的證據。Primary 與子代理按目前要回答的問題主動選用下表；工具結果不擴大任務授權，唯讀角色也不能產生會寫入磁碟的計畫。

| 要回答的問題／操作 | 主動使用 | 完成條件與限制 |
| --- | --- | --- |
| Owner 未知、語意歧義或跨 Owner 影響 | `pnpm semantic plan "<intent>"`；需要載入具體 authority 時用 `context` | 讀取選中的真實契約、來源與 revision；已知 Owner 可直接讀契約，不要求先跑兩個命令。 |
| 已知路徑、精確文字、SQL／JSON／文件引用 | `rg`／`rg --files` 與 targeted reads | 確認搜尋範圍、排除與實際 consumers。文字命中不證明是同一個 TS symbol。 |
| 有界 source 範圍的 imports／exports／頂層宣告與靜態模組連結 | `pnpm code facts --scope <path>`，可重複 scope／exclude | ts-morph 只解析當次 source snapshot，模組目標依實際 tsconfig 解析；查閱 hash、工作樹狀態、package exports 與 partial／邊界。輸出是 stdout 證據，不推導業務 Owner、runtime call graph 或跨 project 完整性。 |
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
| ts-morph | Root pinned direct dependency 擁有唯讀 `code facts` 的語法提取；定義／引用／改名仍使用既有 TypeScript LanguageService，shadcn 保留自己的 transitive dependency。不建立第二套語意查詢或永久索引。 |
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

工具名稱以該版本的 `tools/list` 為準；角色選擇與可選的 GPT-6 開發組由 [model/role routing](../../../.codex/agents/AGENTS.md) 擁有，依任務載入 skills。MCP auto-approval 集中在 parent config，子代理繼承實際權限；免逐次確認不取代任務的寫入授權。Registry 擴展由 `components.json.registries` 擁有；只因實際 consumer 需要加入來源，registry output 仍須經 owner／dependency 檢查。

```sh
pnpm tooling:doctor
pnpm tooling:doctor --mcp
pnpm tooling:doctor --mcp --next-port 3000
```

第一個命令只檢查本地 toolchain、project MCP 設定與已安裝版本。`--mcp` 才啟動兩個已配置的本地 MCP，使用 SDK 的安全預設環境取得 initialize／完整 tools list；不下載套件、不傳遞 provider credentials、不列印 server logs 或 tool descriptions。`--next-port` 使用明確的 loopback port，經已配置的 Next DevTools 檢查 runtime tools 與 project identity；請替換成實際 banner port。診斷結束即關閉其 MCP processes，不啟停應用程式。

以上分別證明 configuration、MCP transport 與 runtime project identity。一般 offline validation 不執行 live probes；診斷不證明目前 Codex session 已重新載入設定、registry 認證或瀏覽器行為。設定變更後重新載入 MCP／開新 session，確認工具可呼叫；UI 變更仍需瀏覽器驗證，再執行 canonical `pnpm check`，merge 前以 exact head 執行 `pnpm validate`。若使用 `next-dev-loop`，先滿足該 skill 的 framework／browser 版本與 preflight。

官方契約：[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Next.js MCP](https://nextjs.org/docs/app/guides/mcp)、[shadcn MCP](https://ui.shadcn.com/docs/mcp)。


## Issue PR and acceptance trace

GitHub Issue owns the problem, intended business result, current evidence and scope-specific acceptance. PR owns the exact proposed changeset and its validation. An Issue can need several PRs; a PR may cover several Issues but must identify the actual acceptance subset.

1. **Issue intake**：使用既有 Bug／Feature 或 Architecture Template，記錄 observable outcome、scope、SHA／環境、預期／實際與 Root Cause status（Confirmed、Hypothesis、Unknown、Not applicable）。Feature／docs 不虛構 Bug 根因；Issue 本身不授予跨 Owner 寫入權限。
2. **Agent 接手**：重新讀 Issue、current main／PR、適用 root + nearest AGENTS、Owner source/contracts/tests。Bug 沿 Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger 查證；若已有合併變更解決同一問題，先驗證，不重做。
3. **PR 對應**：列出對應 Issue acceptance subset、Root Cause evidence（適用時）、Owner/Truth/Boundary、reused capability、新 complexity 必要理由與真實 validation。高內聚／低耦合及 DDD + Hexagonal 不以 folder、最少檔案或通過 CI 代替。
4. **Merge 語意**：僅當 PR merge 本身滿足整張 Issue 的 acceptance，使用 `Closes #N`／`Fixes #N`。分階段交付或需 schema、provider、deployment、browser、LINE device 驗收者使用 `Refs #N`，保留 open Issue 並明確記錄剩餘 Owner/evidence。Existing required checks 和 review settings 是 GitHub 平台權威。
5. **Release／驗收**：沿用現有 main release planner、provider sync/retry/readback；不新增與 Issue 連動的第二套 deployment workflow。將 merge SHA 和適用 release／provider／device evidence 連到 Issue／PR；CI green、Merged、Deployed、Accepted 不互相等同。Issue acceptance 真正滿足或明確記錄 duplicate/not planned/superseded 理由才關閉。
6. **Feedback／Regression**：先比對舊 Issue／PR／merge SHA／release evidence；未解決的同根因重開 Issue，不同根因另建關聯 Issue。只有真實 invariant 值得保護時才新增 regression test/guard，不建第二套任務狀態儲存，Issue 描述更新不觸發完整 CI。

Templates 是資料收集與 Review Interface，不是能自動證明 Root Cause 的 Gate；簡單文件修正可簡述「不適用」。證據強度以 [validation rules](../../rules/validation-evidence.md) 為準。

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

### 高風險變更的審查與批准

目前採單一人類維護者模式：獨立技術審查後，由 repository owner 明確批准合併。獨立技術審查可由未實作該變更的 reviewer／agent 執行，不能冒充另一位人類 approval。此政策不要求不存在的第二位維護者，也不自行新增 CODEOWNERS 或改遠端 ruleset。

Authorization／isolation、schema／資料處置、transaction／replay／recovery、production release 與 governing authority 變更須保留獨立技術審查證據，涵蓋 Owner、受影響 consumers、不變條件與具體失敗路徑。實作者不得把自己的自查當成獨立審查。所有 findings 必須修正或由 owner 明確裁決；仍影響正確性的缺口不得合併。

合併批准須針對可審閱的 PR 與變更範圍；合併時重新核對 exact head、最新 base、獨立審查及完整必要 CI。單純同步 main 且原變更範圍未變，可延用既有批准，但仍須重驗新 head；行為、資料處置或風險範圍改變時取得新的明確批准。出現 blocked、未解決 review、失敗或過期 evidence 時停止合併，先查明原因，不 bypass、不停用 checks、不直接推 main。

GitHub ruleset 的實際 readback 才是平台 enforcement truth；目前政策接受平台不強制第二人 approval 的限制，依獨立技術審查及 owner 明確批准補強，不能宣稱平台會自動阻擋缺少 owner 批准的合併。Release workflow 是否使用 environment 與 approval 以當前 workflow／provider 設定為準；未查證的 environment 不得視為存在保護。合併授權不擴張成任意 production mutation／資料處置授權。


## Validation

Commit 整理不能替代 repository validation，也不能藉 rebase / squash 隱藏失敗。

- 文件修改：`pnpm docs:check`
- 一般程式修改：`pnpm check`
- 合併／發布前：`pnpm validate`

實際驗證責任與證據邊界由 [Validation and tooling entry points](validation-pipeline.md) 擁有。PR 應分開說明本地 static/test/build 與 deployment、remote API、LINE 真機等外部證據。
