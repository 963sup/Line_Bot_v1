# Web 模組約束

## Mobile resource presentation target

- 依 FPT 區分 User/Organization/Repository/Issue/Discussion/Team 等身份與關係，依本地 owner 提供資料；首頁捷徑、列表 row、詳情、操作頁是同一 contract 的投影，不各寫一套 use case。
- 列表優先呈現資源種類/狀態、主要名稱、owner/scope 與必要 metadata；詳情先 identity/context，再 body/relations/history，再 owner 允許的操作。未提供 count/history 的 contract 不渲染虛構數字或 timeline。
- 每個 feature 只定義自己的 row/detail/action 內容，主 tab 由 app、視覺 primitive 由 shared/ui 擁有；不在 module 新建平行 shell。
- Loading、empty、restricted、not-found、upstream failure、未開放與 unknown result 是不同畫面狀態。GitHub Mobile 的 swipe/overflow/批次操作只在本地 command、權限與重播契約完整時採用，並保留可見且可及的替代按鈕。
- 下層 Mobile 目標皆供後續實作；Current URL 與只讀/寫入能力限制不因布局目標改變。

## Owner / FPT 對照與修改入口

每個 feature 的 local AGENTS 記錄其現有 URL 與 package responsibility；URL 的 route owner 仍在 [app](../app/AGENTS.md)。先讀 local mapping，再查 consumer 與 exports，不依資料夾大小拆模組。

- Account/User、Organization、Enterprise、Team、Repository 依 [apps FPT 對照](../../../AGENTS.md)；Repository 包含 Issue、Discussion、Comment、Label、Milestone，不按 upstream 分片機械拆 package。
- `account` 目前含 Identity/Access 的 permissions presenter；這是 Web surface 放置現況，不更改其 package authority，也不是要求這次搬檔。
- `apps/web/src/modules` 的完整性由「真實 Web consumer / presentation responsibility」決定，不與 `packages/<owner>`、FPT category 或主導覽一一對稱。Project / Workforce / Payroll / Audit 等若沒有 current Web surface，就不建立空 module。DailyCheckIn 已有獨立 claim/recovery/UI lifecycle，因此由 `modules/daily-check-in` 承接；Identity/Access、LINE 等若尚無獨立 UI lifecycle 可維持既有 presentation/composition。
- Notifications 的本地 recipient/read-state 契約不能只由 FPT activity 類別推導；Assistant、Attendance、Diary、Expense、Partners 的本地用途須保留自己的 evidence。
- 模組內若出現新獨立的 lifecycle/authorization/consumer，先在 local AGENTS 寫清責任與邊界，再決定分檔；只為分類整齊不建立空資料夾或通用 resource manager。
- 改 module 需同步對應 route/composition、browser-safe imports、錯誤投影與 tests；不以檔案搬移改 wire URL、command fingerprint 或資料 ownership。

責任與允許依賴見 [Module ownership](../../../../docs/020-architecture/030-module-boundaries.md) 與 [Dependency rules](../../../../docs/020-architecture/040-dependency-rules.md)。

- module 擁有專用畫面、互動、文案與 HTTP 投影；用例／查詢協調放 application，規則放 domain。
- 不 import app 或其他 module 私有實作；跨功能具體依賴由 app/api/_composition 注入。
- request path 先以第一性原理確認真正 use case 與 owner，再追 dependency 根因；根因確認後用奧卡姆剃刀移除只轉傳參數或結果、沒有 policy / translation / transaction / recovery 責任的 service、manager、repository wrapper。
- client 不得直接、間接或 type-only 引用 server；server 接線用 .server.ts，連線／設定延遲取得，import 不產生外部副作用。
- 前端只投影資格；私有狀態在身分失效或切換時清除，遲到回應不得覆蓋新狀態，失敗不當空資料。
- 檔案預設平放；不建立四層模板、雜項 services／utils、轉傳 wrapper 或第二套型別。
