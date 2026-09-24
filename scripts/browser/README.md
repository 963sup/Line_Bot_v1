# 本機瀏覽器測試

從專案根目錄執行；先準備已安裝的 Playwright 與瀏覽器。Codex Desktop 用 workspace dependencies 查得套件路徑：

```powershell
$env:PLAYWRIGHT_PACKAGE_PATH = "C:\path\to\node_modules"
$env:NAVIGATION_BROWSER_CHANNEL = "msedge"
pnpm test:browser
```

`PLAYWRIGHT_PACKAGE_PATH` 指向包含 playwright 的目錄；可直接解析套件時可省略。未指定 channel 時使用配套 Chromium，腳本不自動安裝工具。

[run-local.mjs](run-local.mjs) 使用允許清單環境，不載入根 .env.local，拒絕 apps/web 環境檔及已占用的 4117 端口。只建置一次 Next production Web，啟動 127.0.0.1:4117，依序執行案例並關閉服務。LINE、業務 API 與 Supabase session 使用合成替身；其他遠端請求阻擋。

## 案例與證據

| 腳本 | 主要範圍 |
| --- | --- |
| [check-navigation](check-navigation.mjs) | 列表／詳情、query、前進返回、直接開啟、初始化前接續、讀寫途中導覽 |
| [check-membership](check-membership.mjs) | 註冊／恢復、Google 外部交接不載入 LIFF、原會員確認／取消、無效交接及遲到 profile |
| [check-member-management](check-member-management.mjs) | 搜尋／分頁、停權、原命令重試與撤權 |
| [check-partner-management](check-partner-management.mjs) | 名錄、管理、版本衝突、換帳號與未知結果 |
| [check-workplaces](check-workplaces.mjs) | 地點、人員、管理資格與原命令重試 |
| [check-auto-clock](check-auto-clock.mjs) | 自動打卡、定位拒絕、未知結果重送；面板首次成功不重讀、重播刷新 |

每次產物位於 `.artifacts/browser/<時間>/`：report.json、各案例結果、建置／服務日誌、截圖與 trace。失敗保留證據並回非零；可用所選 Playwright 的 show-trace 查看。操作約束見 [AGENTS](AGENTS.md)。

此套件不屬於 validate／CI；結果只證明本機 Web 與合成流程，不能代替真實 LINE、DB、手機 GPS 或 OAuth 驗收。

## 個別執行與量測

已有相符的本機正式服務時，設定 `NAVIGATION_BASE=http://127.0.0.1:4117`，用上述 Playwright 環境執行 `node scripts/browser/<腳本>.mjs`；只接受 loopback origin。標準入口優先於手動建置／啟動。

[measure-loading.mjs](measure-loading.mjs) 在相同建置、Node／瀏覽器下，以新 context 統計 script 解壓 bytes、script 與 document 次數。它使用合成 SDK、拒絕的業務 API 及停用 HTTP cache 的攔截，不能當作壓縮傳輸量、成功操作延遲或 LCP／INP／CLS。具日期歷史結果由 [Acceptance evidence](../../docs/090-governance/060-acceptance/010-acceptance-evidence.md) 導覽。
權限流程由 `check-permissions.mjs` 驗證明確確認、指定範圍、原命令跨重新整理重試、撤銷、禁止自改與管理入口隔離，保存 `permissions.png`、`permissions-trace.zip` 及 `permissions-results.json`。
