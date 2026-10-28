# Line_Bot_v1

TypeScript / pnpm monorepo，使用 Next.js、LINE MINI App 與 Supabase，提供 Enterprise / Organization governance、Team collaboration、Repository / Issue 工作管理、Attendance、Expense、Notifications 等企業營運能力。

## 開始

Node / pnpm version 以 repository manifests 為準。一般 Web 開發不需要先啟動本機 Supabase。

```sh
pnpm install --frozen-lockfile
pnpm check:repository
pnpm dev
```

常用驗證：

所有 repository 驗證統一經過 `scripts/check.mjs`。`pnpm check` 依序執行契約、Codex 設定、hooks 自測、Biome、Dependency Cruiser、Knip、型別、測試、建置、schema 與 patch 檢查，任一階段失敗即停止。可用 `pnpm check lint typecheck` 選取階段；`pnpm check lint -- package.json` 將參數傳給單一工具。既有根目錄驗證 scripts 也轉入此入口，package 內部 scripts 維持由 Turbo 呼叫。格式修正須明確執行 `pnpm format`，不列入預設檢查。CI 依環境選取階段。

| Command | Meaning |
| --- | --- |
| `pnpm check:repository` | architecture 分片、workspace manifest／exports 與文件邊界檢查 |
| `pnpm lint` | Biome static validation |
| `pnpm typecheck` | workspace TypeScript validation |
| `pnpm test` | workspace tests |
| `pnpm build` | workspace production builds |
| `pnpm check dependencies` | Dependency Cruiser dependency boundaries |
| `pnpm check knip` | official Knip reachability check |

依變更範圍選取階段；入口限制 typecheck 與測試最多同時執行兩個 Turbo tasks，避免 PGlite／WASM 測試互相競爭。

### Repository contracts

`pnpm check:repository` 是本機與 CI 共用的 repository 結構入口，實作位於 [`scripts/check-repository-contracts.mjs`](scripts/check-repository-contracts.mjs)。它使用 Node 內建能力，不需先 build，也不呼叫外部服務，會驗證：

- `architecture/registry.json` 與 domain／module／data 分片的登錄、ID、引用及 ownership；
- workspace manifest、package exports、module 邊界與實際路徑的一致性；
- declarative SQL 檔案清單與 documentation boundary 回歸條件。

它不取代 TypeScript、業務測試、SQL runtime 行為或完整依賴分析。檢查邏輯與測試位於 [`scripts/tooling/`](scripts/tooling/)；修改規則本身時，需同時更新對應測試。

## Supabase Docker stack

本機 stack 由 [`integration-supabase`](packages/integration-supabase/README.md) 管理；唯一設定是 [`supabase/config.toml`](packages/integration-supabase/supabase/config.toml)。Cloud image 已提供 Docker，bootstrap 會檢查既有 daemon 並準備 stack。從 repository root 執行：

```sh
pnpm provider:supabase start
pnpm provider:supabase verify
pnpm provider:supabase status
source packages/integration-supabase/.temp/local.env
pnpm supabase:stop
```

預設提供 Database、Auth、REST、Storage 與 Gateway；需要 Studio、Realtime 等額外服務時明確執行 `pnpm provider:supabase start --full`，並預留額外磁碟。`status`／`verify` 不安裝或啟動服務；`stop` 保留本機 volumes。環境檔只含本地 stack 憑證、被 Git 忽略且不輸出到日誌。首次啟動從 [`current schemas`](packages/integration-supabase/src/schemas/) 在單一 transaction 建立應用結構，不建立或重播 migration history；既有資料不自動重設，schema 變動要求明確 reconcile。這些指令不代表 hosted Supabase 已同步；remote publication 規則見 [integration-supabase Canonical Supabase rules](packages/integration-supabase/src/README.md#canonical-supabase-rules)。

## 找資訊

環境問題先看 [local environment](docs/reference/engineering/local-environment.md)。修改前用 Git、`rg`、nearest `AGENTS.md` 與相關 package exports 找影響範圍；提交前執行受影響的 lint、typecheck、test 與 build。

不要先讀完整 architecture 文件。從 [docs task router](docs/README.md) 依任務載入最小上下文。

Machine-readable architecture 入口是 [registry.json](architecture/registry.json)。已知 owner 時只取該 owner 與相關 module／data 分片；共通分類才查 vocabulary，GitHub 語意才查對應 FPT 欄位。Owner ID 與 package 名稱可能不同，請依 registry 與 module 的 `semanticOwner` 對應。

## Source 與文件結構

```text
architecture/
├── registry.json               # schemaVersion、ID 與分片位置
├── fpt/                        # 原樣保留的 GitHub domain truth
├── fpt-source.json             # FPT 來源與 pinned revision
├── domain/
│   ├── vocabulary.json         # 共通術語、分類與全域語意規則
│   └── owners/<owner>.json     # owner 的概念、能力與關係
├── modules/
│   ├── configuration.json      # 全域模組架構設定
│   └── <module>.json           # package 路徑、owner、狀態與允許依賴
└── data/
    ├── configuration.json      # schemaRoot、database schema 與資料規則
    ├── shared.json             # 無單一業務 owner 的跨 owner 機制
    └── <owner>.json            # owner 的資料關係與 SQL 位置

packages/<package>/
├── package.json                # 真實 exports、依賴與 scripts
├── src/                        # 實作與契約
├── test/                       # 行為證據（實際配置以 package 為準）
├── AGENTS.md                   # 此 scope 額外的修改約束
├── README.md                   # 使用入口與 source／test 導覽
└── SEMANTICS.md                # 基本術語與精確來源連結

docs/owners/<owner>.md          # 跨 package 的 owner 導覽
scripts/
├── check-repository-contracts.mjs
└── tooling/
    ├── repository-contracts.mjs
    ├── repository-contracts.test.mjs
    └── documentation-boundary.test.mjs
```

以上說明檔案的責任，不要求為每個 package 補齊空文件或空目錄。全域設定與 shared 資料集中保留，避免複製到每個 owner；`target` module 表示目標結構，不代表已有 runtime。

修改順序是確認 owner／契約與 consumers → 決定 source 結構 → 修改實作及必要的 architecture 契約 → 同步受影響文件 → 執行驗證。文件連到真正來源，不複製 JSON、型別、狀態表、依賴清單或 SQL 定義；歷史決策依任務需要再讀。

分片用來縮小每次讀取的上下文；完整 repository 檢查仍驗證所有登錄分片。Dependency Cruiser 只讀 module 分片，不載入 domain、data 或 FPT。檢查入口與 CI 使用同一個 `pnpm check:repository`。

Source-of-truth 分工見 [sources of truth](docs/facts/sources-of-truth.md)；AI 修改規則見 [AGENTS.md](AGENTS.md)。

本機 validation 不代表 Supabase remote convergence、Vercel deployment、LINE publication 或真機 acceptance。

## Codex lifecycle hooks

[`.codex/hooks.json`](.codex/hooks.json) 註冊三個薄事件處理器：SessionStart 回傳分支、revision、tracked changes 數量與安裝標記；PostToolUse 記錄 apply_patch 的新增／修改／刪除／搬移路徑；Stop 經 `scripts/check.mjs` 執行該範圍的 diff 與 Biome 檢查。同 turn、同內容使用既有結果，失敗最多要求續跑一次，不安裝工具、不格式化、不操作遠端。

事件紀錄、內容指紋、結果與完整日誌位於 ignored `.artifacts/hooks/`，不保存原始 patch 或對話內容。只覆蓋 apply_patch；shell 或其他編輯方式、型別、業務測試、build、schema 與 provider 驗收需另外確認。執行 `pnpm check hooks` 可測試事件協定與去重行為。

依 [官方 hooks 文件](https://learn.chatgpt.com/docs/hooks)，專案 hooks 需由支援該功能的 host 載入及信任；CLI 可用 `/hooks` 檢視與信任設定。設定變更後需重新檢視信任。Cloud orchestration 有模式限制；模擬事件測試成功不代表當前 Cloud／桌面 session 已觸發 hooks。請以新 session 的實際事件確認，無法載入時仍手動執行適用的 `pnpm check`。

專用子代理與 MCP 使用方式見 [Codex agents and MCP](docs/reference/engineering/codex-agents-and-mcp.md)；實際設定以 [`.codex/config.toml`](.codex/config.toml) 與 `.codex/agents/*.toml` 為準。依任務呼叫，不在每次修改時自動執行；設定需由支援自訂 agent 的 Codex session 載入。

## Codex Cloud bootstrap

環境準備由 [.codex/bootstrap/](.codex/bootstrap/) 擁有，MCP 連接設定在 [config.toml](.codex/config.toml)。

| 時機 | 從 repo root 執行 |
| --- | --- |
| 新環境／快取重建 | `bash .codex/bootstrap/install.sh` |
| 恢復快取／更新 checkout 後 | `bash .codex/bootstrap/update.sh` |
| 日常快速檢查 | `pnpm check bootstrap` |
| 明確需要本地 smoke 檢查 | `pnpm check bootstrap:smoke` |

`install.sh` 會安裝選定的 runtime／CLI、執行一次 frozen workspace install、準備 MCP 的本地依賴，最後呼叫 `verify.sh`。`update.sh` 以設定與 lockfile 指紋判斷是否需要重新收斂，不追蹤 latest，也不修改版本檔或 lockfile。

在 Codex Cloud 環境設定中，Setup script 使用 `bash .codex/bootstrap/install.sh`，Maintenance script 使用 `bash .codex/bootstrap/update.sh`。Repository 內有腳本不代表 Cloud 已設定或成功執行；以實際退出碼及 `.tools/codex/installed.sha256` 完成標記確認安裝結果。Bootstrap 與 smoke 是明確選取的環境檢查，不加入預設 `pnpm check`。

安裝腳本的 PATH 不會傳回父層 shell。後續命令若要使用 bootstrap 安裝的固定版本，先執行 `source .codex/bootstrap/lib/common.sh`，再執行 `pnpm check bootstrap` 或需要的工具。完整安裝日誌位於 `.artifacts/codex-cloud/`；安裝失敗先讀取失敗 stage 與對應日誌，不使用降低 TLS 驗證或繞過 proxy 的方式重試。

ShellCheck 是選用的 Bash 靜態分析工具，不阻擋預設初始化。需要時在 `BOOTSTRAP_TOOLS` 清單加入 `shellcheck`；installer 下載固定版本的官方 binary、驗證 SHA-256，再安裝至 `.tools/codex/bin/shellcheck`，不需要 root 或 sudo。明確選取卻無法安裝時仍會報錯。失敗前已完成的工具會保留，重新執行仍按固定版本檢查；沒有完成標記代表整體安裝尚未完成。

Bootstrap 將 `SUPABASE_HOME` 指向 workspace 的 `.cache/supabase`，避免 Supabase CLI 在唯讀的使用者目錄建立快取；版本仍依 lockfile 固定。

工具選擇在 [`config/tools.env`](.codex/bootstrap/config/tools.env)，MCP 準備範圍在 [`config/mcp.env`](.codex/bootstrap/config/mcp.env)，額外 exact pins 在 [`config/versions.env`](.codex/bootstrap/config/versions.env)。可用 `BOOTSTRAP_TOOLS` 或 `BOOTSTRAP_MCP_SERVERS` 暫時覆寫清單。Node、pnpm 與 workspace CLI 繼續以 `.node-version`、`package.json`、catalog 與 lockfile 為準。

Docker 預設沿用 Cloud host 提供的 daemon／socket 並準備 Supabase stack；Postgres CLI 依任務加入，該模組只安裝 client。完整責任與 Cloud 接線見 [Cloud bootstrap](docs/reference/engineering/local-environment.md#codex-cloud-bootstrap)。本地工具可執行不代表 MCP 已被當前 session 載入或 OAuth 已完成。

預設也準備 `rg`、`jq`，方便定位程式與投影 JSON。Bash 靜態分析選用 `shellcheck`；需要 native dependency 編譯時選用 `build`；需要 UI 驗收時選用 `browser`，提供固定版 Playwright 與 Chromium。啟用方式與平台權限見 [開發工具](docs/reference/engineering/local-environment.md#cloud-development-tools)。

GitHub Actions、Bash 格式與 TOML 檢查可選用 `actionlint`、`shfmt`、`taplo`。每個模組的 install／verify 位於 `.codex/bootstrap/modules/<tool>/`，版本在 `config/versions.env`，執行檔安裝至 `.tools/codex/bin/`，下載檔保留於 `.tools/codex/downloads/`。啟用方式：

```sh
source .codex/bootstrap/config/tools.env
export BOOTSTRAP_TOOLS="$BOOTSTRAP_TOOLS actionlint shfmt taplo"
bash .codex/bootstrap/update.sh
pnpm check actionlint shfmt taplo
```

這三個階段需明確選取，不加入預設 `pnpm check`。actionlint 檢查 workflows，shfmt 檢查 bootstrap Bash 格式，taplo 檢查 Codex 與 Supabase TOML 語法；它們不在檢查時安裝工具，也不自動改檔。ast-grep、TypeScript 與 Biome 繼續由 workspace lockfile 安裝，不新增全域副本。

### MCP 安裝與連接

MCP 的唯一 host 設定是 [`.codex/config.toml`](.codex/config.toml)。Bootstrap 只準備本地 executable 與驗證設定；安裝完成後要重新連接或開啟新的 Codex session，再用 `/mcp` 檢查連線並實際呼叫一個唯讀工具。`verify.sh` 顯示 `pending` 代表仍需 host handshake、OAuth 或真實呼叫，不能視為 MCP 已完成。

根層設定將工具輸出預算設為 3,000 tokens、project instructions 上限設為 32,768 bytes，並啟用 live web search；這些不是 MCP server 欄位。Hooks 明確啟用，agents 維持每 session 最多 4 個並行子代理、深度 2。CLI 0.163.0 的 multi_agent、shell_snapshot、unified_exec 與 goals 已預設啟用，未重複覆寫；升版時依適用 schema 與實際預設重驗。輸出預算不取代 artifact／欄位投影；指令上限也不保證所有 nested AGENTS 都能完整載入。`pnpm check codex:config` 驗證設定層級、agent 檔案引用與 hooks 接線，CI 使用同一入口。

| MCP | 類型 | 準備／憑證 | 完成方式 |
| --- | --- | --- | --- |
| OpenAI Developer Docs | Hosted HTTP | `https://developers.openai.com/mcp`，不需本地安裝或憑證；Cloud 網路需允許 `developers.openai.com` | 在新 session 連線後執行文件唯讀查詢 |
| Serena 2.1.0 | 本機 stdio | Bootstrap 以 `uv tool install` 和 Python 3.13 建立隔離環境；專案設定在 [`.serena/project.yml`](.serena/project.yml) | 重開 session，以 `/mcp` 確認後讀取 Serena initial instructions／啟用目前專案 |
| Next DevTools | 本機 stdio | `pnpm install --frozen-lockfile` 提供 workspace 固定的 `next-devtools-mcp` | 啟動需要診斷的 Next.js app，再從 MCP 查詢該 runtime |
| shadcn | 本機 stdio | workspace lockfile 提供 `apps/web` 的 shadcn CLI | 重開 session，呼叫 registry 的唯讀工具 |
| GitHub | Hosted HTTP | 在 Codex Cloud 建立 `GITHUB_MCP_TOKEN` network secret，只允許 `api.githubcopilot.com`；與 CLI 的 `GH_TOKEN` 分開 | 重開 session，確認 repos／issues／pull requests tools 可讀取授權範圍 |
| Context7 | Hosted HTTP | 不需本機安裝；帳戶要求時由 host 安全提供 `CONTEXT7_API_KEY` | 在 host 完成連線後查詢一個 library 文件 |
| Sentry | Hosted HTTP | 不需本機安裝；由 host 完成 Sentry OAuth | 授權 `org:read`、`project:read`、`event:read` 後執行唯讀查詢 |

GitHub／Context7／Sentry 的 token 或 OAuth 不寫入 repository。完整 bootstrap 責任、Serena API 範圍、Cloud 網路限制與除錯方式見 [local environment](docs/reference/engineering/local-environment.md#codex-cloud-bootstrap)。
