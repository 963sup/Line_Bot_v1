# Commercial task：程式碼收斂清單

狀態：依目前 source 盤點的候選，不代表已刪除。執行順序與驗收見 [完整實施計畫](2026-10-29-commercial-task-plan.md)。刪除前以 Serena v2/LSP references 與 bounded text search 核對所有 production、test、export、route consumer。

## 可精簡與刪除候選

| 目前位置 | 收斂方式 | 刪除前置條件 |
| --- | --- | --- |
| `apps/web/src/modules/file/commercial-intake-state.ts` 的隨機 analysis/document/draft IDs 與 target persistence | 新 task 只保存 taskId、來源及必要恢復資訊；子命令由 server 推導 | 舊 localStorage pending 有明確讀回/恢復路徑；回應校驗同步 |
| `apps/web/src/modules/file/commercial-intake-panel.tsx` 的 status 後額外 document read、分散恢復編排 | task 回應提供授權後的 stage、receipt 與兩份 draft views；UI 只呈現及送使用者意圖 | task read 重驗來源權限，stale response/session clearing 測試通過 |
| `apps/web/src/modules/file/file-requests.ts` 的 commercialIntake/commercialDocument/commercialTask 三組入口 | 新流程統一 commercialTask；共用 session/denial/raw error 處理 | 所有 consumer 遷移；舊結果查詢仍可用 |
| `apps/web/src/app/api/document-intakes/route.ts`、`commercial-documents/route.ts` | task route 完整後移除無 consumer 的舊 transport | 舊 pending/client 盤點與恢復完成；不能先刪 receipt 查詢 |
| `apps/web/src/modules/document-intake/commercial-intake-http.server.ts` 的 resource 分支及重複 request 解析 | task transport 直接使用 owner public capability；單一 identity/origin/body/error boundary | 新 task 不再只是重建 Request 轉呼叫舊 handler；全部行為測試遷移 |
| `apps/web/src/modules/document-intake/commercial-task-http.server.ts` 的 Request 重建 | 已移除該 wrapper；task route 透過共用的有界 HTTP handler 直接執行 Owner 能力 | 新 task identity/body/Origin 及 legacy pending 相容已加入測試；完整流程仍未驗收 |
| 新 task 與現有 Content/WBS UI 的重複商務匯入操作 | 新商務流程由 task confirm 編排，保留一般 Content/WBS 編輯能力 | 新流程完整跑通，實際 references 證明重複入口無用途 |
| 商務舊規格/實施計畫中的重複目標宣告 | 新計畫為本輪入口；保留必要歷史證據與 source links | 搜尋 inbound links，避免失效引用；不重建已刪 fields/functions 規格 |

## 保留並重用

| 來源 | 保留理由／重用方式 |
| --- | --- |
| Intelligence `commercial-intake.ts` 與 persistence | 一次 dispatch、READY/result、fence 與原命令恢復是真實責任；task 直接調用 |
| Contract commercial document validator/store | 唯一商務事實、來源資格、版本與 receipt 的 owner |
| Content plan use case/store 與 source reader port | 規劃 overlay、工作樹、measure/resource qualification、CAS 與 receipt |
| `ContentWbsExpansionReader`、`importContentWbs`、Project WBS store | exact Content snapshot、Project scope、WBS 草稿與來源覆蓋；擴充 commercial provenance |
| WBS governance/Baseline | 匯入草稿後仍需獨立治理；不能隨 confirm 自動發布 |
| 舊 PO `document-intake`、`purchase-order-content-v1` reader/receipt | 已保存歷史與 pending 的讀回仍需支援；只有 consumer/data inventory 證明可退役才能移除 |
| File/Repository/Project owner access checks | 共用入口不能取代每個 owner 當下授權與來源重驗 |

## 禁止用行數冒充完成

- 不新增跨 owner task table、generic workflow framework 或無責任 wrapper；需要持久化新事實時先證明 owner 與恢復責任。
- 不把商務 JSON 複製進 Content/WBS；工作樹與規劃 overlay 是各自必要的結果。
- 不刪 immutable history、來源 pin、版本、授權、receipt、failure recovery 以減少程式碼。
- 每次收斂後重新搜尋舊 symbol/route/export，移除確定無用的 import、type、test fixture、設定與文件入口。
- 最終回報實際刪除/修改檔案與剩餘 consumer；行數由 Git diff 量測，不預估或承諾固定刪碼比例。
