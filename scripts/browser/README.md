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
| [check-project-imports.mjs](check-project-imports.mjs) | 建立／既有 Project 匯入儲存庫 Issues、條件篩選、未知結果精確重試、後續自動加入、停用及來源權限；1280／390／320px 截圖 |
| `run-local.mjs` | 標準本機 browser suite 入口：build 一次、啟動 loopback production Web、依序執行案例、保存 evidence 並關閉服務。 |
| `check-navigation.mjs` | 列表/詳情、query、前進返回、直接開啟與讀寫途中導覽。 |
| `check-profile.mjs` | Profile client lifecycle、換帳號、遲到回應與 server-page composition。 |
| `check-objects.mjs` | Object Type、工程計量／多視圖／超分拒絕／批次命令重試、不可變內容版本、具名稱關係、Issue 固定版本引用、原命令重試與資格失效；使用真實 Next/browser、隔離 PGlite 及合成 LINE/API。 |
| `check-wbs.mjs` | WBS 編輯／治理與歷史；Repository Insights 的 Issue 期間與來源失敗；Wiki 原文、建立／編輯／exact retry、歷史比較／還原／封存；三者手機版面與資格撤銷清除。真實 Next/browser、隔離 PGlite、合成 LINE/API。 |
| `check-repository-resources.mjs` | Repository 六個主導覽、原生「更多」揭露與資源頁桌面／手機版面；Overview 匿名／權限／封存／舊 WBS 恢復狀態，及 Discussions/Labels/Milestones URL、詳情、分頁、錯誤分類、換帳號與遲到回應清除。Overview 使用真實 route/component 與合成 server query，其餘資源頁使用 Next production routes。 |
| `check-membership.mjs` | 註冊/恢復、Google handoff、會員確認/取消、每日簽到與 profile readback。 |
| `check-member-management.mjs` | 成員搜尋/分頁、停權、原命令重試與撤權。 |
| `check-partner-management.mjs` | Partner 名錄/管理、版本衝突、換帳號與 unknown-result handling。 |
| `check-repository-address.mjs` | Repository 打卡點設定／移除、有效成員讀取、撤權與原命令重試。 |
| `check-auto-clock.mjs` | 自動打卡、定位拒絕、unknown-result resend、首次成功/重播刷新。 |
| `check-permissions.mjs` | 權限確認、重試、撤銷、禁止自改與功能授權隔離。 |
| `measure-loading.mjs` | 在實際 Next production routes 記錄首次載入的 script 解壓 bytes、document/auth 次數、TTFB／DOMContentLoaded；重新整理驗證 Cookie 恢復只有一次 auth 請求。不是 Web Vitals。 |

每次產物位於 `.artifacts/browser/<時間>/`：report.json、各案例結果、建置／服務日誌、截圖與 trace。失敗保留證據並回非零；可用所選 Playwright 的 show-trace 查看。操作約束見 [AGENTS](AGENTS.md)。

此套件不屬於 validate／CI；結果只證明本機 Web 與合成流程，不能代替真實 LINE、DB、手機 GPS 或 OAuth 驗收。

標準 suite 同時執行 `measure-loading.mjs`，產生 `loading-results.json` 與 `loading.log`。每個 route 使用新 context，再以同一 context 重新整理，區分首次憑證交換與 Cookie 恢復；合成 API 即時回覆、業務資格拒絕、攔截停用 HTTP cache，因此時間不能當作成功載入私人內容或 Rich Menu 點擊到可操作的延遲。

`check-navigation.mjs` 同時量測 Home → Explore → Inbox → Home：暖機一輪後執行 20 輪，保存 `shell-navigation.json` 的 p50／p95、各次 API 路徑、RSC／script 解壓 bytes，並斷言共同外殼保留、不增加 document／LIFF 初始化。時間包含 Playwright 操作及斷言，不能當作正式 LINE 延遲或 Web Vitals。`shell-evidence.mjs` 由現有案例共用，保存 Home、Settings、Repository 與本人／訪客／Organization Profile 在 320／390／1280px 的 `shell-*.png` 與版面 JSON；Profile 使用獨立元件 fixture，與 Next production 導覽證據分開。

設定 `REPOSITORY_BENCHMARK=1` 可額外量測六個 Repository 資源頁各 20 次軟導覽，先暖機一輪，再記錄資料可見時間、外殼 DOM 保留、業務 API 次數與解壓後的 RSC／script bytes。結果保存在 `repository-resources-results.json`；這是本機、合成即時 API 的受控比較，時間包含 Playwright 操作／斷言成本，不能當作 production Web Vitals。Overview 的 server query 使用獨立合成 fixture，因此不混入 Next 路由效能數據。

## 個別執行與量測

已有相符的本機正式服務時，設定 `NAVIGATION_BASE=http://127.0.0.1:4117`，用上述 Playwright 環境執行 `node scripts/browser/<腳本>.mjs`；只接受 loopback origin。標準入口優先於手動建置／啟動。

WBS 案例使用 PGlite；個別執行須用 `node --no-wasm-code-gc scripts/browser/check-wbs.mjs`。標準 suite 已為此 subprocess 傳入相同旗標，避免 pinned Node 24 的 WASM code GC 原生崩潰。

[measure-loading.mjs](measure-loading.mjs) 在相同建置、Node／瀏覽器下，以新 context 統計 script 解壓 bytes、script 與 document 次數。它使用合成 SDK、拒絕的業務 API 及停用 HTTP cache 的攔截，不能當作壓縮傳輸量、成功操作延遲或 LCP／INP／CLS。具日期歷史結果由 [Acceptance evidence](../../docs/change/evidence/acceptance-evidence.md) 導覽。
權限流程由 `check-permissions.mjs` 驗證明確確認、原命令跨重新整理重試、撤銷、禁止自改與管理入口隔離，保存 `permissions.png`、`permissions-trace.zip` 及 `permissions-results.json`。
