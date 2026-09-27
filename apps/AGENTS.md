# Application delivery boundary

本層擁有應用程式入口與組裝指引；business owner 仍在 `packages`，不因頁面或 API 路徑改變。

## FPT 語意與 GitHub Mobile 布局目標

狀態：四個主目的地 Home / Inbox / Explore / AI 已作為 current app-shell 契約落地；Profile 是 app-shell avatar 可達的 secondary account surface，不佔 Bottom Navigation。其餘 GitHub Mobile pattern 仍只在本地 owner/contract 真實存在時逐 slice 採用。文件或 benchmark 出現一個上游 UI 項目，不代表本產品已具備該 capability。

兩條對照線分開：FPT 提供 resource/owner/relationship、query/mutation、identity/locator 與版本證據；GitHub Mobile 提供手機導覽與資訊層級。不能從 GraphQL schema 推導視覺布局，也不能從畫面推導授權或資料契約。

官方布局參考（2026-09-24 查閱）：

- [GitHub Mobile](https://github.com/mobile) 與 [Mobile 使用說明](https://docs.github.com/en/get-started/using-github/github-mobile)：手機協作、通知及帳號入口。
- [Android navigation，2026-03-20](https://github.blog/changelog/2026-03-20-a-smoother-navigation-experience-in-github-mobile-for-android/)：一致的底部導覽與分頁位置保留。
- [Home shortcuts，2021-08-31](https://github.blog/changelog/2021-08-31-customize-your-mobile-home-tab-shortcuts/)：My Work/Favorites 分區的歷史設計參考，不據此宣稱目前每個平台完全相同。
- [Copilot tab，2026-04-01](https://github.blog/changelog/2026-04-01-github-mobile-stay-in-flow-with-a-refreshed-copilot-tab-and-native-session-logs/)：只借鏡 AI 作為主目的地的資訊架構；本產品映射到既有 Assistant one-shot Ask / Issue draft / Review，不宣稱具備 Copilot session 或 autonomous coding semantics。

採用原則：資源導向、內容優先、緊湊列表、明確上下層、穩定主導覽；保留本產品名稱、LINE 身分流程及實際可用能力。不是 GitHub 品牌、原生系統特效或完整功能的像素複製。

| 目標契約 owner | 寫入位置 |
| --- | --- |
| 頁面層級、全域 tab 與 URL 對應 | `web/src/app/AGENTS.md` 與 route-group AGENTS |
| 各 resource 的列表／詳情／操作投影 | `web/src/modules/<feature>/AGENTS.md` |
| 手機視覺、觸控、可及性與共用組件 | `web/src/shared/ui/AGENTS.md` |
| 導覽接續、狀態隔離與資料失敗 | `web/src/shared/{browser,presentation,server}/AGENTS.md` |

後續每個 UI slice 必須列出：FPT 對照或本地能力理由、current/target 差異、保留 URL、受影響 consumer、拒絕/錯誤/返回與手機驗證。下層只補該責任的決策，不各自發明第二套全域布局。

## 來源與 FPT 對照

- 對照 [GitHub FPT](https://github.com/github/docs/tree/main/src/graphql/data/fpt) 的 resource、relationship、query/mutation、identity/locator 與版本語意；category 檔案不是一檔一 package，也不是 Next.js 路由模板。
- 固定版本與完整分類決策以 [FPT benchmark](../architecture/semantic-benchmark.json) 和 [來源說明](../docs/000-core/080-github-graphql-fpt-benchmark.md) 為準；upstream `main` 只供查證，不自動改本地 pin 或產品能力。
- `schema-users` → Account/User；`schema-orgs` → Organization；`schema-teams` → Organization Team；`schema-enterprise-admin` → Enterprise；`schema-repos`、`schema-issues`、`schema-discussions` → 本產品 Repository owner 的不同資源。這是語意對照，不是資料夾搬移指令。
- Attendance、Expense、Partners、LINE、Google 等本地能力按自身契約治理；不能因 FPT 沒有對應 category 就刪除，也不能因 FPT 有 Project 等 category 就建立空功能。
- 採用狀態、owner、locator 與 evidence 由 [Semantic model](../architecture/semantic-model.json) 擁有；依賴由 [Implementation topology](../architecture/implementation-topology.json) 擁有；URL 由 [Web runtime](../docs/020-architecture/050-runtime-architecture.md) 與實際 route 核對。

## 巢狀指引

| 範圍 | 責任 |
| --- | --- |
| [Web](web/AGENTS.md) | Next.js/runtime 與三個 source 區域的入口 |
| [app](web/src/app/AGENTS.md) | 正式 URL、route group、delivery 與 composition |
| [modules](web/src/modules/AGENTS.md) | 功能畫面、互動、HTTP 投影與 package owner 對照 |
| [shared](web/src/shared/AGENTS.md) | 無 business authority 的共用機制 |

先讀父層，再沿目標路徑讀最近 AGENTS；更深層只補 local invariant，不放寬父層。這些 URL 清單是修改導航，不是第二套可獨立更新的 runtime manifest。

## 修改順序

1. 核對現行 route、consumer、package public contract 與測試，再確認 owner、URL scope、信任邊界及 current/target 狀態。
2. 契約不清楚時先完善相關 AGENTS；建議路徑必須標示 target，不能混入 current URL 清單。文件與程式衝突時指出證據，再修過期文件或違規實作。
3. 改 URL 時同步 page/route、Link/back、LIFF entry allowlist、login continuation、相關 Rich Menu definition、tests 與 canonical locator 文件；已發布 URL 的移除須先查 consumer 與相容策略，不能全域文字替換。
4. 改 owner/能力時同步 semantic/topology 與所屬 AGENTS；不改無關 package，不搬動歷史 wire payload、receipt fingerprint 或已發布協定字串。
5. 文件變更跑 `pnpm docs:check`、`pnpm tooling:check`；程式依根層 validation 契約。指引存在不代表檢查已執行，Git 推送不等於部署或外部服務發布。
