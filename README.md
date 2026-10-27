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

| Command | Meaning |
| --- | --- |
| `pnpm check:repository` | architecture 分片、workspace manifest／exports 與文件邊界檢查 |
| `pnpm lint` | Biome static validation |
| `pnpm typecheck` | workspace TypeScript validation |
| `pnpm test` | workspace tests |
| `pnpm build` | workspace production builds |
| `pnpm exec knip` | official Knip reachability check |

依變更範圍執行上列 package scripts；typecheck 與測試的併發設定由 workspace scripts 擁有，避免 PGlite／WASM 測試互相競爭。

### Repository contracts

`pnpm check:repository` 是本機與 CI 共用的 repository 結構入口，實作位於 [`scripts/check-repository-contracts.mjs`](scripts/check-repository-contracts.mjs)。它使用 Node 內建能力，不需先 build，也不呼叫外部服務，會驗證：

- `architecture/registry.json` 與 domain／module／data 分片的登錄、ID、引用及 ownership；
- workspace manifest、package exports、module 邊界與實際路徑的一致性；
- declarative SQL 檔案清單與 documentation boundary 回歸條件。

它不取代 TypeScript、業務測試、SQL runtime 行為或完整依賴分析。檢查邏輯與測試位於 [`scripts/tooling/`](scripts/tooling/)；修改規則本身時，需同時更新對應測試。

## Supabase Docker stack

本機 stack 使用 [`packages/integration-supabase/src/config.toml`](packages/integration-supabase/src/config.toml)，因此所有 Supabase CLI 指令都要指向該工作目錄。先確保 Docker daemon 可用，再從 repository root 執行：

```sh
pnpm exec supabase start --workdir packages/integration-supabase/src
pnpm exec supabase status --workdir packages/integration-supabase/src
pnpm exec supabase stop --workdir packages/integration-supabase/src --no-backup
```

`start` 會建立本機 Docker services，`status` 只讀取狀態，`stop --no-backup` 會停止 stack 且不保留本機資料備份。這些指令不代表 hosted Supabase 已同步；remote publication 仍依 [Supabase platform contract](docs/reference/platform/supabase.md) 執行。Application PostgreSQL 的 current desired state 只在 [`schemas/`](packages/integration-supabase/src/schemas/) 維護；修改後先執行 `pnpm schema:check`。

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

## Codex Cloud bootstrap

環境準備由 [.codex/bootstrap/](.codex/bootstrap/) 擁有，MCP 連接設定在 [config.toml](.codex/config.toml)。

| 時機 | 從 repo root 執行 |
| --- | --- |
| 新環境／快取重建 | `bash .codex/bootstrap/install.sh` |
| 恢復快取／更新 checkout 後 | `bash .codex/bootstrap/update.sh` |
| 日常快速檢查 | `bash .codex/bootstrap/verify.sh` |
| 明確需要本地 smoke 檢查 | `bash .codex/bootstrap/tests/smoke.sh` |

`install.sh` 會安裝選定的 runtime／CLI、執行一次 frozen workspace install、準備 MCP 的本地依賴，最後呼叫 `verify.sh`。`update.sh` 以設定與 lockfile 指紋判斷是否需要重新收斂，不追蹤 latest，也不修改版本檔或 lockfile。

工具選擇在 [`config/tools.env`](.codex/bootstrap/config/tools.env)，MCP 準備範圍在 [`config/mcp.env`](.codex/bootstrap/config/mcp.env)，額外 exact pins 在 [`config/versions.env`](.codex/bootstrap/config/versions.env)。可用 `BOOTSTRAP_TOOLS` 或 `BOOTSTRAP_MCP_SERVERS` 暫時覆寫清單。Node、pnpm 與 workspace CLI 繼續以 `.node-version`、`package.json`、catalog 與 lockfile 為準。

Docker／Postgres 依任務加入工具清單；Docker 需要 Cloud host 提供 daemon／socket，Postgres 模組只安裝 client。完整責任與 Cloud 接線見 [Cloud bootstrap](docs/reference/engineering/local-environment.md#codex-cloud-bootstrap)。本地工具可執行不代表 MCP 已被當前 session 載入或 OAuth 已完成。

預設也準備 `rg`、`jq`、ShellCheck，方便定位程式、投影 JSON 與檢查 Bash。需要 native dependency 編譯時選用 `build`；需要 UI 驗收時選用 `browser`，提供固定版 Playwright 與 Chromium。啟用方式與平台權限見 [開發工具](docs/reference/engineering/local-environment.md#cloud-development-tools)。

### MCP 安裝與連接

MCP 的唯一 host 設定是 [`.codex/config.toml`](.codex/config.toml)。Bootstrap 只準備本地 executable 與驗證設定；安裝完成後要重新連接或開啟新的 Codex session，再用 `/mcp` 檢查連線並實際呼叫一個唯讀工具。`verify.sh` 顯示 `pending` 代表仍需 host handshake、OAuth 或真實呼叫，不能視為 MCP 已完成。

| MCP | 類型 | 準備／憑證 | 完成方式 |
| --- | --- | --- | --- |
| Serena 2.1.0 | 本機 stdio | Bootstrap 以 `uv tool install` 和 Python 3.13 建立隔離環境；專案設定在 [`.serena/project.yml`](.serena/project.yml) | 重開 session，以 `/mcp` 確認後讀取 Serena initial instructions／啟用目前專案 |
| Next DevTools | 本機 stdio | `pnpm install --frozen-lockfile` 提供 workspace 固定的 `next-devtools-mcp` | 啟動需要診斷的 Next.js app，再從 MCP 查詢該 runtime |
| shadcn | 本機 stdio | workspace lockfile 提供 `apps/web` 的 shadcn CLI | 重開 session，呼叫 registry 的唯讀工具 |
| GitHub | Hosted HTTP | 在 Codex Cloud 建立 `GITHUB_MCP_TOKEN` network secret，只允許 `api.githubcopilot.com`；與 CLI 的 `GH_TOKEN` 分開 | 重開 session，確認 repos／issues／pull requests tools 可讀取授權範圍 |
| Context7 | Hosted HTTP | 不需本機安裝；帳戶要求時由 host 安全提供 `CONTEXT7_API_KEY` | 在 host 完成連線後查詢一個 library 文件 |
| Sentry | Hosted HTTP | 不需本機安裝；由 host 完成 Sentry OAuth | 授權 `org:read`、`project:read`、`event:read` 後執行唯讀查詢 |

GitHub／Context7／Sentry 的 token 或 OAuth 不寫入 repository。完整 bootstrap 責任、Serena API 範圍、Cloud 網路限制與除錯方式見 [local environment](docs/reference/engineering/local-environment.md#codex-cloud-bootstrap)。
