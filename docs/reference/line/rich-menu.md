# LINE rich-menu reference
## 現行結構
發布六張 Rich Menu 素材，統一使用 LINE Rich Menu 大尺寸範例的 2500 × 1686 解析度與 JPEG 格式。JPEG 適合這批不透明的漸層與插畫素材，可在保留文字與圖示清晰度的同時為未來素材變更留下 1 MB 容量餘裕。檔名由 `definition.ts` 的 page key 與 `.jpg` 副檔名決定；desired state 會從實際素材讀取尺寸。LINE provider 要求圖片為 JPEG 或 PNG、檔案不超過 1 MB；六張 canonical 素材由測試固定檢查不超過 1 MB，通用 image parser 不對任意輸入另加 byte-size 上限。default 使用上班選單。

主選單中央保留上班／下班操作，儲存庫與個人保留直接 URI。外圈表單、異常通報、公告通知、團隊協作使用原生 `richmenuswitch` 切到對應子選單。四個子選單皆有左上角返回箭頭；表單頁另有左上日誌、右上報銷、左下請假、右下即時四個外部 Google Forms URI，精確連結由 `definition.ts` 保存。開啟或提交外部表單不代表本系統建立日誌、報銷、請假或出勤紀錄。其餘三個子選單內部圖示不配置動作、不建立佔位頁。點擊範圍按實際圖片尺寸等比例計算。

## 出勤 menu state
出勤主選單區分 `attendance-in` 與 `attendance-out`，子選單共用一份，不按出勤狀態複製。中央按鈕帶 `clock-in`／`clock-out` intent 進入出勤流程。後端 Attendance state 才是 authority；過時 menu 不得反轉操作；menu sync／notification failure 不回滾合法完成的出勤交易。

個人綁定優先於 default，但它屬於 Attendance runtime responsibility，不是 Rich Menu publication responsibility。Rich Menu publication只證明 LINE menu definition／alias／default；Attendance maintenance 會保留目前正在瀏覽的子選單，並按其名稱解析目前 alias，讓舊版子選單也可收斂；其餘綁定依出勤狀態修正。只有 target 不同時才重新 link，並做 provider readback；背景查詢期間若使用者已切頁，留待後續重試。返回箭頭送出 `attendance-menu` postback，經既有驗簽、資格與去重流程，重新讀取出勤狀態並強制切回上班／下班主選單。LINE link API 沒有 compare-and-set，最後一次讀取與 link 之間的競爭仍屬 provider 限制。
## Alias
Alias 使用 `line_bot_v1-<page>`；實際 menu definition、圖片尺寸與點擊範圍是發布 source。Repository desired state 不證明 LINE remote state 已同步；publication 必須以 LINE readback 作部署證據。

home、四類子選單的 -out aliases，以及 pre-Line_Bot_v1 aliases 已退役。四個目前子選單 aliases 保留。Publication 先設定子選單 aliases，再設定主選單 aliases/default 與 readback，最後移除退役 aliases；Attendance 個人 binding 不參與這個 release transaction。
## Repository operation
從 repository 根目錄只使用 `package.json` 的 canonical entry：

| 命令 | 效果 |
| --- | --- |
| `pnpm line:rich-menu preview all` | 讀取 repository 素材，檢查尺寸與 menu definition；不寫 LINE 遠端狀態 |
| `pnpm line:rich-menu preflight all` | 對 LINE definitions／current aliases/default 做 read-only preflight；不建立 menu、不改 alias/default |
| `pnpm line:rich-menu publish all` | 在單一 process 內重新做 LINE preflight，依序 create／upload／definition readback，再更新 aliases、切 default 並 readback；中途失敗依已知 LINE remote state rollback |

Rich Menu 圖片、發布程式或其執行依賴有待發布變更，且同 SHA 的 main Validate 成功後，Release 才執行單一 `pnpm line:rich-menu publish all`。來源分類由 `scripts/github/release-plan.mjs` 與測試維護；文件與測試本身不觸發發布。每個操作使用自己最近成功的 ancestor job 作 baseline，失敗不推進游標，首次無 baseline 時完整發布。Rich Menu 不等待 Supabase／Vercel；publisher 在單一 process 完成 preflight／create／upload／activate／readback。LINE token 只注入 publish step，current-main 在寫入前驗證；stage 與 MINI App URL 仍由現有 source 決定，不讀 Attendance／Supabase business state。

Publication 不建立 `.artifacts/rich-menu*.json`，Rich Menu ID 只在單次 process 記憶體中傳遞；LINE remote definition／alias／default readback 才是 publication evidence。Create request 若未取得 ID 就失敗，可能是 unknown result；不得盲目重跑。Activation 若失敗，依記憶體 snapshot 回復 default／aliases；本次新建 menus 不自動刪除，避免短暫 alias 可見期間未知好友已切換後被誤刪。需要人工 reconcile 時，非敏感的 retained Rich Menu IDs 與 rollback failure 類別直接留在 workflow log，不另建 receipt source of truth。

圖片修改後必須重新 `preview`／`publish`；publication 會重新 upload 並讀回 remote definition。具日期的 remote publication、手機顯示與實機限制由 [Acceptance evidence](../../change/evidence/acceptance-evidence.md) 保存，不寫回 current contract。

完整發布／回復契約見 [Release process](../operations/release.md)。
## 安全與導覽
- URI 只帶固定 MINI App intent 與必要白名單 view，不帶 token 或私人資料。
- 原生切頁的 `menu=<page>` postback 不觸發出勤或授權；只有返回的 `attendance-menu` 進入既有後端返回流程。URI 與切頁都不授予 module role。
- LINE group、chat 或 Rich Menu context 不等於 TeamMembership、Project membership 或任何管理權限。
- 尚未有資料來源、角色或正式操作契約的項目，不以 Rich Menu 入口宣稱能力完成。
- `publish` 是外部 mutation，不納入一般 `pnpm check`／`pnpm validate`，也不因 merge、push、build 或本地測試成功自動取得發布授權；必須由 current-`main` push 的 GitHub Release，經 successful same-SHA Validate、planner 與 exact-SHA current-main evidence 明確授權。
