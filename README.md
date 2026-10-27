# Line_Bot_v1

TypeScript / pnpm monorepo，使用 Next.js、LINE MINI App 與 Supabase，提供 Enterprise / Organization governance、Team collaboration、Repository / Issue 工作管理、Attendance、Expense、Notifications 等企業營運能力。

## 開始

Node / pnpm version 以 repository manifests 為準。

```sh
pnpm install --frozen-lockfile
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

`check:repository` 使用 Node 內建能力，不需先 build，也不呼叫外部服務。它驗證登錄、ID／引用、ownership、module 與 manifest 的一致性、SQL 檔案清單及既有文件回歸條件；不取代 TypeScript、業務測試、SQL 行為或完整依賴分析。

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

## Codex Cloud

環境準備由 [.codex/bootstrap/](.codex/bootstrap/) 擁有，MCP 連接設定在 [config.toml](.codex/config.toml)。

| 時機 | 從 repo root 執行 |
| --- | --- |
| 新環境／快取重建 | `bash .codex/bootstrap/install.sh` |
| 恢復快取／更新 checkout 後 | `bash .codex/bootstrap/update.sh` |
| 日常快速檢查 | `bash .codex/bootstrap/verify.sh` |
| 明確需要本地 smoke 檢查 | `bash .codex/bootstrap/tests/smoke.sh` |

工具選擇與 MCP 本地準備範圍在 `config/tools.env`、`config/mcp.env`；額外版本在 `config/versions.env`。MCP 的 host 啟用與連接仍由 `.codex/config.toml` 擁有。Node、pnpm 與 workspace CLI 沿用既有版本來源。`update.sh` 對齊固定版本，不修改版本檔或 lockfile。

Docker／Postgres 依任務加入工具清單；Docker 需要 Cloud host 提供 daemon／socket，Postgres 模組只安裝 client。完整責任與 Cloud 接線見 [Cloud bootstrap](docs/reference/engineering/local-environment.md#codex-cloud-bootstrap)。本地工具可執行不代表 MCP 已被當前 session 載入或 OAuth 已完成。
