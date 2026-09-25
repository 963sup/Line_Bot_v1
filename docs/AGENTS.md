# 文件約束

任務 routing 先看 [Core](000-core/README.md)；文件結構與 lifecycle 規則由本檔維護，不另建第二份 document-governance truth。

- 以程式、manifest、schema、tests 核對 current；先分辨文件過期或程式違規，不以改文件掩蓋缺陷。
- 一個 contract 只在 canonical owner 維護；其他位置 summary + link，不複製第二套規則。
- `000–070` 保存 current canonical knowledge；decision/proposal/migration/gap/risk/evidence/history 進 `090-governance`。
- README 只 routing；AGENTS 只存 agent 行為約束；machine truth 不在 docs 手抄第二份 authority。
- 先確認 current truth、Root Cause 與 canonical owner；之後刪除、合併、縮短重複內容。已有 owner 能承接時不得新增第二份文件。
- 一般內容文件使用 `010-`、`020-`…三位數間隔；README/AGENTS 例外。
- relocation 必須同 changeset 同步 repository 引用；不保留 redirect shell、空殼或只為相容舊 path 的文件。
- Future/target 不得冒充 current；完成 migration 後，把仍成立的 truth 蒸餾回 canonical owner。
- Raw historical logs、退役 current baseline、已完成且無 recovery value 的 migration、無真實 consumer 的 speculative proposal 不留在 current tree；需要追溯時使用 Git history。不得建立 `090-history/` 作第二套知識面。
- 驗收紀錄標明日期、版本/commit、環境、範圍、結果與未驗證項。
- Retired provider resource ID 不保留在 current docs、acceptance 或 history index；dated evidence 以 retired environment + 日期/commit/範圍描述，current operational target 只 reference canonical operations owner。不得為舊 ID 建 alias、附錄或對照表。
- 操作文件交代 target、precondition、順序、failure/recovery；不得保存秘密或杜撰正式證據。
- 純文件重排不得放寬 authorization、transaction、replay、version、isolation、recovery 或 evidence semantics。
- GitHub-like owner platform 參考：[GitHub GraphQL FPT benchmark](000-core/080-github-graphql-fpt-benchmark.md)；該索引逐檔對應 upstream [GitHub GraphQL data/fpt](https://github.com/github/docs/tree/main/src/graphql/data/fpt) 49 個檔案與 [GraphQL source README](https://github.com/github/docs/blob/main/src/graphql/README.md)。任何 GitHub-like naming、owner、locator、viewer/current actor、Repository、Project、Issue、Discussion、Team、Organization、Enterprise 判斷，先由 benchmark index 定位 relevant upstream fragment，再讀 upstream current content；不得只靠 GitHub Web UI 記憶或一般 best practice。提取的是 owner/category、versioned contract、generated index、change history 與可重建 pipeline；不是複製 GraphQL 檔案格式。
- `fpt` 目錄中的 49 個檔案可作為結構指標逆向分析：`schema-*.json` 是按能力/category 分片的 generated contract，`schema.docs.graphql` 是可讀 schema representation，`category-map.json` 是導航/index，`previews.json` 是 capability gate，`upcoming-changes.json` 與 `graphql_upcoming_changes.public.yml` 是 future/deprecation signal，`changelog.json` 是歷史 change record；同一組 pattern 也以其他版本／部署形態資料夾重現。實施時先建立「檔案責任 → owner → source of truth → consumer → validation/evidence」映射，再決定本專案需要哪些實體檔案。
- 這 49 個檔案不是 49 個待辦，也不是要求本專案建立一套 GraphQL。它們提供的是平台結構檢查表：能力分片、版本平行、可生成資料、導航索引、preview/activation、future change、歷史追蹤、schema validation 與 consumer rendering 必須可分辨；沒有真實 owner、consumer、variation 或 evidence 的項目不得為了目錄對稱而新增。
- Reverse engineering `fpt` 時，必須同時追蹤 source、generator/sync、validator、loader/render consumer 與 generated data；只讀 `data/fpt` 的檔名或 JSON 形狀，不足以宣稱理解其架構或把 pattern 移植到本專案。
- 本專案的 owner registry 必須能從 owner、public contract、source of truth、consumer、version/status 與 evidence 找到完整鏈路；不要用單一總表或跨 owner facade 取代各 owner 的責任。
- current schema／contract、generated snapshot/index、target proposal、migration/recovery history、changelog/future change 必須分層；任何一層都不得冒充另一層的完成證據。
- version 是能力與資料的邊界，不是顯示欄位；不同 version／部署形態不可互相回填，跨 owner reference 必須可驗證，缺少分片不得默認成空資料。
- 呈現方式依問題選擇：Glossary/表格用於 canonical vocabulary 與 ownership；ASCII/Mermaid 用於 boundary/dependency；ERD 只描述 Data Boundary；sequence diagram 描述 interaction/order；state diagram 描述 lifecycle；decision table 描述 policy；invariant list 描述不可破壞條件。圖不能成為第二套 truth，必須與 canonical text / machine source 同 owner。
- 修改後執行 `pnpm docs:check`；它只證明 Markdown 結構與本地 link，不等於 runtime/deployment/API/device verification。
- 更新 agent 指引時，以「何時適用 → 要採取的動作 → 可核對的依據」表達；先找父層與 canonical owner，僅補 local decision gap，不靠增加篇幅或逐檔套相同模板宣稱完整。
- 文件中的命令、路徑與 current claim 須核對當前 script、exports 或測試；`docs:check` 不驗指令可執行性、遠端連結與內容正確性。缺少實證的內容明列待驗證，不推測為已實作。
