# LINE rich-menu reference
## 現行結構
發布六張 Rich Menu 素材，統一使用 LINE Rich Menu 大尺寸範例的 2500 × 1686 解析度與 JPEG 格式。JPEG 適合這批不透明的漸層與插畫素材，可在保留文字與圖示清晰度的同時為未來素材變更留下 1 MB 容量餘裕。檔名由 `definition.ts` 的 page key 與 `.jpg` 副檔名決定；desired state 會從實際素材讀取尺寸。LINE provider 要求圖片為 JPEG 或 PNG、檔案不超過 1 MB；六張 canonical 素材與通用 image parser 都固定檢查不超過 1 MB。default 使用上班選單。

主選單中央保留上班／下班操作，儲存庫與個人保留直接 URI。外圈表單、異常通報、公告通知、團隊協作使用原生 `richmenuswitch` 切到對應子選單。四個子選單皆有左上角返回箭頭；表單頁另有左上日誌、右上報銷、左下請假、右下即時四個外部 Google Forms URI，精確連結由 `definition.ts` 保存。開啟或提交外部表單不代表本系統建立日誌、報銷、請假或出勤紀錄。其餘三個子選單內部圖示不配置動作、不建立佔位頁。點擊範圍按實際圖片尺寸等比例計算。

## 出勤 menu state
出勤主選單區分 `attendance-in` 與 `attendance-out`，子選單共用一份，不按出勤狀態複製。中央按鈕帶 `clock-in`／`clock-out` intent 進入出勤流程。後端 Attendance state 才是 authority；過時 menu 不得反轉操作；menu sync／notification failure 不回滾合法完成的出勤交易。

個人綁定優先於 default，但它屬於 Attendance runtime responsibility，不是 Rich Menu publication responsibility。Rich Menu publication只證明 LINE menu definition／alias／default；Attendance maintenance 會保留目前正在瀏覽的子選單，並按其名稱解析目前 alias，讓舊版子選單也可收斂；其餘綁定依出勤狀態修正。只有 target 不同時才重新 link，並做 provider readback；背景查詢期間若使用者已切頁，留待後續重試。返回箭頭送出 `attendance-menu` postback，經既有驗簽、資格與去重流程，重新讀取出勤狀態並強制切回上班／下班主選單。LINE link API 沒有 compare-and-set，最後一次讀取與 link 之間的競爭仍屬 provider 限制。
## Alias
Alias 使用 `line_bot_v1-<page>`；實際 menu definition、圖片尺寸與點擊範圍是發布 source。Repository desired state 不證明 LINE remote state 已同步；publication 必須以 LINE readback 作部署證據。

home、四類子選單的 -out aliases，以及 pre-Line_Bot_v1 aliases 已退役。四個目前子選單 aliases 保留。Publication 先設定子選單 aliases，再設定主選單 aliases/default 與 readback，最後移除退役 aliases；Attendance 個人 binding 不參與這個 release transaction。
## Repository operation
Rich Menu 的 repository desired state 由 Web Rich Menu module 產生；LINE API 只由 `@line_bot_v1/line` provider adapter 消費。根目錄的 TypeScript provider command 負責 preview、manifest fingerprint、reconcile 與 drift recovery。

| 命令 | 效果 |
| --- | --- |
| `pnpm line:rich-menu preview all` | 讀取 repository 素材，檢查尺寸、definition 與 manifest fingerprint；不連線、不修改 LINE |
| `pnpm line:rich-menu preflight all` | 讀取 LINE current menus、aliases 與 default，驗證 provider contract；不建立 menu、不改 alias/default |
| `pnpm line:rich-menu reconcile all` | 比對 desired manifest 與遠端 fingerprint，只發布變更頁面，更新穩定 alias/default 並 readback |
| `pnpm line:rich-menu drift all` | 讀取遠端狀態並回報或修復與 current desired manifest 的差異 |

PR 只執行 `preview` 與測試。合併到 `main` 後，`rich-menu-release.yml` 以 exact SHA 執行 `reconcile`；Web deployment 與 LINE publication 是分開 evidence，若 menu URI 同時變更，必須由該 release change 明確提供 Web deployment gate。定期 `rich-menu-drift.yml` 讀取 LINE 遠端狀態，發現 alias、default 或 definition fingerprint 漂移時建立修復結果。LINE token 只注入需要 provider mutation 或 readback 的 step。

每次 reconcile 先產生 immutable manifest summary，包含 revision、page、asset hash、definition hash、fingerprint 與 action；不包含 token。未變更的頁面不建立新 Rich Menu。新發布先切換穩定 alias，舊 Rich Menu ID 保留供 reconciliation 與後續人工清理，不在同一個 publish transaction 盲目刪除。LINE remote definition、alias、default readback 才是 provider evidence；這不等於手機顯示或實機驗收。

圖片修改後，PR 會重新執行 `preview`；合併到 `main` 後 release workflow 執行 `reconcile`，只重新 upload fingerprint 有變化的頁面並讀回 remote definition。具日期的 remote publication、手機顯示與實機限制由 [Acceptance evidence](../../change/evidence/acceptance-evidence.md) 保存，不寫回 current contract。

完整發布／回復契約見 [Release process](../operations/release.md)。
## 安全與導覽
- URI 只帶固定 MINI App intent 與必要白名單 view，不帶 token 或私人資料。
- 原生切頁的 `menu=<page>` postback 不觸發出勤或授權；只有返回的 `attendance-menu` 進入既有後端返回流程。URI 與切頁都不授予 module role。
- LINE group、chat 或 Rich Menu context 不等於 TeamMembership、Project membership 或任何管理權限。
- 尚未有資料來源、角色或正式操作契約的項目，不以 Rich Menu 入口宣稱能力完成。
- `publish` 是外部 mutation，不納入一般 `pnpm check`／`pnpm validate`，也不因 merge、push、build 或本地測試成功自動取得發布授權；必須由 current-`main` push 的 GitHub Release，經 successful same-SHA Validate、planner 與 exact-SHA current-main evidence 明確授權。
