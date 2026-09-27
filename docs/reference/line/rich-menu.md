# LINE rich-menu reference

## 現行結構

主選單中央提供出勤操作，外圈提供 Repository、異常通報、表單作業、團隊協作、個人、通知等入口。current `profile` intent 解析到 authenticated `/profile` viewer hub；既有 `membership` intent 只作相容 protocol 名稱並仍解析到 `/settings`，不再作 Rich Menu 個人入口。`/profile` 不建立第二套 User identity；canonical share/public locator 仍是 `/{login}`。

原生子選單、外部表單與 Rich Menu switch 只負責 navigation。Rich Menu 的產品入口以 `uri` action 直接指向 source-owned current-stage `miniapp.line.me` permanent URL，加上白名單 intent；不經額外產品 redirect。表單開啟不代表提交成功，也不建立本系統的審批、案件或出勤結果。

正式素材共六張：

- `work-assistant-attendance-in.png`
- `work-assistant-attendance-out.png`
- `work-assistant-team.png`
- `work-assistant-forms.png`
- `work-assistant-notifications.png`
- `work-assistant-incident.png`

`home` 與 `attendance-in` 共用 attendance-in 圖片；四類子選單的基本／`-out` 狀態各自共用同一張 PNG。Repository 由主選單 URI 直接開啟既有工作面，不建立額外 submenu；四類子選單各有基本／`-out` 狀態，加上 `home`／`attendance-in`／`attendance-out`，共十一份 menu configuration。

## 出勤 menu state

Rich Menu 目前區分 `attendance-in` 與 `attendance-out` 主狀態及其對應子選單版本。中央按鈕帶 `clock-in`／`clock-out` intent 進入出勤流程。後端 Attendance state 才是 authority；過時 menu 不得反轉操作；menu sync／notification failure 不回滾合法完成的出勤交易。

個人綁定優先於 default，但它屬於 Attendance runtime responsibility，不是 Rich Menu publication responsibility。Rich Menu publication 只證明 LINE menu definition／alias／default；既有個人 binding 的重新同步由 Attendance flow 在使用者操作或 maintenance 時處理。

## Alias

Alias 使用 `work-assistant-<page>`；實際 menu definition、圖片尺寸與點擊範圍是發布 source。Repository desired state 不證明 LINE remote state 已同步；publication 必須以 LINE readback 作部署證據。

`work-assistant-tasks` 與 `work-assistant-tasks-out` 是退役 aliases。Publication 先完成新 aliases/default 與 readback，再移除退役 aliases；Attendance 個人 binding 不參與這個 release transaction。

## Repository operation

從 repository 根目錄只使用 `package.json` 的 canonical entry：

| 命令 | 效果 |
| --- | --- |
| `pnpm line:rich-menu preview all` | 讀取 repository 素材，檢查尺寸與 menu definition；不寫 LINE 遠端狀態 |
| `pnpm line:rich-menu preflight all` | 對 LINE definitions／current aliases/default 做 read-only preflight；不建立 menu、不改 alias/default |
| `pnpm line:rich-menu publish all` | 在單一 process 內重新做 LINE preflight，依序 create／upload／definition readback，再更新 aliases、切 default 並 readback；中途失敗依已知 LINE remote state rollback |

Rich Menu desired-state source 是 release-owned external state。當 `assets/line/rich-menu/**`、`definition.ts` 或 `desired-state.server.ts` 的變更合併到 `main`，同 SHA repository `Validate` 成功後 GitHub `Release` 才進入 LINE publication path；changed-source detection 只以前次成功 workflow_run Release 的 `Release <validated-sha>` run-name／display title、成功固定 `gate` job 與 git ancestor check 建立 baseline，避免 multi-commit push 漏掉早一個 commit 的素材或 definition 變更。沒有合格 baseline 時以 empty tree 做首次 bootstrap，因此 existing desired state 可能被全量收斂一次。它先要求 `mini-app-line` Vercel deployment 成功，再做 repository-only preview，最後以單一 `publish all` process 重新執行 LINE preflight／create／upload／activate／readback。沒有 Rich Menu desired-state change 時不配置 LINE publication job。LINE secret `LINE_CHANNEL_ACCESS_TOKEN` 只注入 publish step；Current-stage MINI App URL 仍由 repository source 擁有，不把公開 LIFF / Login Channel identity 重複存成 secret，也不讀 Attendance／Supabase runtime configuration。

Publication 不建立 `.artifacts/rich-menu*.json`，Rich Menu ID 只在單次 process 記憶體中傳遞；LINE remote definition／alias／default readback 才是 publication evidence。Create request 若未取得 ID 就失敗，可能是 unknown result；不得盲目重跑。Activation 若失敗，依記憶體 snapshot 回復 default／aliases；本次新建 menus 不自動刪除，避免短暫 alias 可見期間未知好友已切換後被誤刪。需要人工 reconcile 時，非敏感的 retained Rich Menu IDs 與 rollback failure 類別直接留在 workflow log，不另建 receipt source of truth。

圖片修改後必須重新 `preview`／`publish`；publication 會重新 upload 並讀回 remote definition。具日期的 remote publication、手機顯示與實機限制由 [Acceptance evidence](../../change/evidence/acceptance-evidence.md) 保存，不寫回 current contract。

完整發布／回復 gate 見 [Release process](../release.md)。

## 安全與導覽

- URI 只帶固定 MINI App intent 與必要白名單 view，不帶 token 或私人資料。
- `richmenuswitch` 只切換畫面，不授予 module role。
- LINE group、chat 或 Rich Menu context 不等於 TeamMembership、Project membership 或任何管理權限。
- 尚未有資料來源、角色或正式操作契約的項目，不以 Rich Menu 入口宣稱能力完成。
- `publish` 是外部 mutation，不納入一般 `pnpm check`／`pnpm validate`，也不因 merge、push、build 或本地測試成功自動取得發布授權；必須由 main 的 manual release workflow 明確授權。
