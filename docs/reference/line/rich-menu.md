# LINE rich-menu reference
## 現行結構
主選單中央提供出勤操作，外圈提供 Repository、異常通報、表單作業、團隊協作、個人、通知等入口。current `profile` intent 與既有 `membership` protocol alias 都解析到 authenticated `/profile` viewer hub；個人入口只有一個 product destination，不再保留 `/settings` 雙軌。`/profile` 不建立第二套 User identity；canonical share/public locator 仍是 `/{login}`。

原生子選單、外部表單與 Rich Menu switch 只負責 navigation。Rich Menu 的產品入口以 `uri` action 直接指向 source-owned current-stage `miniapp.line.me` permanent URL，加上白名單 intent；不經額外產品 redirect。表單開啟不代表提交成功，也不建立本系統的審批、案件或出勤結果。

正式素材共六張：

- `line_bot_v1-attendance-in.png`
- `line_bot_v1-attendance-out.png`
- `line_bot_v1-team.png`
- `line_bot_v1-forms.png`
- `line_bot_v1-notifications.png`
- `line_bot_v1-incident.png`

`home` 與 `attendance-in` 共用 attendance-in 圖片；四類子選單的基本／`-out` 狀態各自共用同一張 PNG。Repository 由主選單 URI 直接開啟既有工作面，不建立額外 submenu；四類子選單各有基本／`-out` 狀態，加上 `home`／`attendance-in`／`attendance-out`，共十一份 menu configuration。
## 出勤 menu state
Rich Menu 目前區分 `attendance-in` 與 `attendance-out` 主狀態及其對應子選單版本。中央按鈕帶 `clock-in`／`clock-out` intent 進入出勤流程。後端 Attendance state 才是 authority；過時 menu 不得反轉操作；menu sync／notification failure 不回滾合法完成的出勤交易。

個人綁定優先於 default，但它屬於 Attendance runtime responsibility，不是 Rich Menu publication responsibility。Rich Menu publication只證明 LINE menu definition／alias／default；Attendance maintenance 會週期性比較目前 alias target 與 per-user binding，只有不一致時才重新 link，再以 provider readback 驗證。如此 Rich Menu 換版後，既有 per-user binding 也會由同一 reconciliation loop 收斂。
## Alias
Alias 使用 `line_bot_v1-<page>`；實際 menu definition、圖片尺寸與點擊範圍是發布 source。Repository desired state 不證明 LINE remote state 已同步；publication 必須以 LINE readback 作部署證據。

pre-Line_Bot_v1 tasks／announcements aliases 已退役。Publication 先完成新 aliases/default 與 readback，再移除退役 aliases；Attendance 個人 binding 不參與這個 release transaction。
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
- `richmenuswitch` 只切換畫面，不授予 module role。
- LINE group、chat 或 Rich Menu context 不等於 TeamMembership、Project membership 或任何管理權限。
- 尚未有資料來源、角色或正式操作契約的項目，不以 Rich Menu 入口宣稱能力完成。
- `publish` 是外部 mutation，不納入一般 `pnpm check`／`pnpm validate`，也不因 merge、push、build 或本地測試成功自動取得發布授權；必須由 successful current-`main` Validate 觸發的 GitHub Release，經 planner 與 exact-SHA current-main evidence 明確授權。
