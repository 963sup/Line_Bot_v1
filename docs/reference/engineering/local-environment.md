# Local environment

## Runtime source

Node 的責任分成兩個 contract：`.node-version` 是本地與 CI 可重現執行的 exact Node pin；`package.json#engines.node` 是 Vercel 等 managed runtime 的 Node major compatibility range，兩者 major 必須一致。pnpm exact version 與 package-manager contract 由 `package.json` 擁有；共用依賴基準由 `pnpm-workspace.yaml` 與 lockfile 擁有。文件不複製固定版本作第二份 source of truth。Repository 不保存綁定單一開發機器、使用者目錄或 package store 的 pnpm wrapper。

從 repository 根目錄使用符合 `.node-version` 與 manifest 的 Node／pnpm：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
```

只有需要安裝依賴時才執行 install。不在同一 checkout 同時啟動多套會寫入 node_modules、Next type output 或 build artifact 的流程。

## Environment files

根 `.env.example` 列 application 會直接消費、且本地開發可能需要提供的 configuration 名稱，是 `.env.local` 的名稱範本；Vercel/Supabase/Upstash 等 provider 在 deployment 自動注入的同名值仍由 provider 擁有，不由 repository 複製或維護。純平台／CI／tool-owned variables（例如 `NODE_ENV`、`VERCEL_*`、`GITHUB_*`、browser probe 的 `NAVIGATION_*`）不重複列入。

本地秘密只放被忽略的根 `.env.local`。Shell / deployment environment 優先；測試與 Vercel build 不應意外讀取個人本地 secret。GitHub Actions 不偽造 `VERCEL=1` 來控制本地 loader；真正 Vercel deployment 才使用 Vercel system environment。重複來源要拒絕或明確處理，不打印 secret value。

修改本地 env 後需重啟對應 process；deployment env 只對新 deployment 生效。不要整份複製 local env 到 production。

## Configuration responsibility

- LINE Messaging channel secret/access token：deployment secret；單一 LINE integration provider namespace 與 MINI App Developing / Review / Published public identity 由 source 擁有，不以 env 重複設定：[LINE integrations](../line/identity.md)
- Supabase public/runtime/operator configuration：[integration-supabase Canonical Supabase rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)；跨 package 分類見 [Supabase platform index](../platform/supabase.md)
- Redis：Vercel Marketplace resource 的 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 是唯一 application connection contract；environment namespace 由 runtime environment 推導：[Redis coordination](../platform/redis.md)
- Current AI runtime credential / model setting：[AI integration](../platform/ai.md)
- Workplace / allowed Members：business data，由 Attendance/permission 流程管理，不用 env 授權。

Public configuration（例如 publishable key / public URL）仍不等於 business authorization；browser bundle 不得包含 server credential。

## External tooling

CLI / probe / deployment tools 可能讀 environment 或進行外部寫入。Supabase remote schema tooling 只使用 provider-owned `POSTGRES_URL_NON_POOLING`，並以 `SUPABASE_URL` 驗證 exact project；Web runtime 的 `POSTGRES_URL` 不作 schema/operator fallback。執行前確認 exact project/channel/environment 與既有授權；名稱叫 `check` / `probe` 不代表一定唯讀。

Validation scope 見 [Validation and tooling entry points](validation-pipeline.md)。

## Codex Cloud bootstrap

[Bootstrap](../../../.codex/bootstrap/) 是環境準備的程式來源，Cloud 設定只呼叫入口；devcontainer 本身不是 Cloud 已執行 setup 的證據。

| 路徑 | 唯一責任 |
| --- | --- |
| `install.sh` | 順序安裝已選模組、一次 frozen workspace install、準備 MCP 本地需求與檢查 |
| `verify.sh` | 檢查本地前置條件，分別回報失敗與仍待 host 驗證的項目 |
| `update.sh` | 比對忽略目錄中的安裝指紋；輸入未變且檢查通過就重用，否則重新對齊固定版本 |
| `config/tools.env` | 工具選擇；可由 Cloud 非秘密環境變數 `BOOTSTRAP_TOOLS` 覆寫 |
| `config/mcp.env` | MCP 本地準備／檢查範圍；可由 `BOOTSTRAP_MCP_SERVERS` 覆寫，不改變 host 啟用狀態，不保存 endpoint 或 credential 副本 |
| `config/versions.env` | Python、uv、GitHub CLI、Wrangler、Serena 的 exact pin，以及 Postgres client major |
| `lib/` | 共用環境、偵測、下載／完整性驗證、鎖與結果輸出；不擁有工具專屬決策 |
| `modules/<tool>/{install,verify}.sh` | 各工具自己的行為，供入口載入；Supabase／Vercel 重用 workspace 安裝，不建立 global 副本 |
| `mcp/{install,verify}.sh`、`mcp/servers/` | 調度與各 MCP server 本地前置條件；連接定義仍由 `.codex/config.toml` 擁有 |
| `tests/smoke.sh` | 明確選用的 shell 語法、本地前置條件及 launcher 路徑檢查；不驗收 MCP handshake |

Bootstrap 支援 Linux x86_64／arm64。基礎 image 需有 Bash、curl、tar、sha256sum、awk、install 與 flock。下載保留 TLS 與 checksum 驗證，workspace 安裝使用 frozen lockfile；安裝鎖防止同 checkout 並行寫入。Node／pnpm 版本沿用 `.node-version`／manifest，workspace CLI 版本沿用 manifests／catalog／lockfile，不在 env 檔重複固定。

Docker 不由 task 內另起 daemon；選用時必須有 host 提供的 executable、daemon 與 socket 權限。Postgres 模組只透過具簽章的 distro repository 安裝指定 major 的 client，需要 apt 權限及對應套件來源，不會建立資料庫。兩者預設不啟用；Cloudflare 只準備固定版本 Wrangler，不登入或修改遠端資源。

Cloud 安裝腳本從該設定綁定的 repo root 執行 `bash .codex/bootstrap/install.sh`。恢復快取／更新 checkout 的階段使用 `bash .codex/bootstrap/update.sh`；平台若沒有獨立 maintenance hook，就在任務 startup instructions 呼叫 update。安裝指紋是可丟棄的快取，不是第二份設定來源。必須先讓該 checkout 包含 bootstrap 檔案；草稿保存不代表 main 已更新或環境已發布。

`.codex/config.toml` 只有在實際 host 支援並載入 project MCP 設定時才生效。Context7／Sentry 的連線、OAuth、網路允許清單及 session 的工具登錄要在 host 驗證；container shell 無法替另一個 session 完成連接。`verify.sh` 的 exit 0 只代表本地檢查通過，摘要中的 pending 與 `mcpSession: unverified` 不能被解讀為 MCP 全部完成。

技能沿用既有 [.agents/skills/](../../../.agents/skills/) 與受管理的 lockfile；這次 bootstrap 不複製或搬動第三方技能。

### OpenAI Developer Docs MCP

OpenAI Developer Docs 另以官方 hosted MCP 提供文件查詢，不需本地安裝或 credential；連接位置只由 `.codex/config.toml` 擁有，Cloud 網路需允許 `developers.openai.com`，實際工具註冊與唯讀查詢仍由 host 驗證。

### Local Supabase stack

Default bootstrap checks the image-provided Docker daemon and starts the package-owned [local stack lifecycle](../../../packages/integration-supabase/README.md). Docker endpoint/context/TLS selectors are cleared for the local-socket check; bootstrap never installs or starts a competing daemon. Supabase uses its canonical package workdir and the official `ghcr.io` image registry by default, preserving proxy and registry credentials. Set `SUPABASE_INTERNAL_IMAGE_REGISTRY` only when the environment requires another supported registry.

The default service set and local environment-file instructions live in the package README. Stack setup checks free disk before downloading, waits for CLI health checks, initializes current application SQL without migration history, and verifies PostgreSQL and Storage. `verify.sh` only probes existing services; it does not start them. CLI output may contain local credentials and stays in ignored mode-0600 files. pnpm data directories also live under the workspace, and install runs noninteractively without changing HOME.

### Serena v2 MCP

Serena 依官方安裝模型由 `uv tool install` 建立隔離工具環境；目前固定 `serena-agent==2.1.0`，並使用 Serena 官方建議的 Python 3.13。這不改變專案一般 Python runtime 的 3.12.14。`uvx` 適合臨時執行，但 MCP 每次啟動不應重新解析或下載套件，因此 Codex launcher 使用已安裝的 `$UV_TOOL_BIN_DIR/serena`。

`.codex/config.toml` 最終啟動語意與官方 Codex 範例一致：

```text
serena start-mcp-server --project-from-cwd --context=codex --agent-interface=REPL
```

Repository wrapper 只補固定工具路徑及 workspace cache，不安裝任何內容。CLI 明確固定 REPL，避免 Codex App 未從 project cwd 啟動時先鎖定成另一種 interface。安裝後仍需重新連接或開新 Codex session，以 `/mcp` 確認 Serena 已連線，再實際讀取 initial instructions／啟用目前專案；executable 或 config 存在不等於 MCP handshake 完成。

官方依據：[Serena Quick Start](https://oraios.github.io/serena/#quick-start) · [Codex client setup](https://oraios.github.io/serena/02-usage/030_clients.html#codex-cli-and-app)。

Serena v2 使用 REPL interface，因此 API 開關由 `.serena/project.yml` 的 `included_apis`／`excluded_apis` 管理；傳統 `included_optional_tools`／`excluded_tools` 不控制 REPL 內的 facade。專案開放標準 `fs`、`edit`、`lsp`、`mem`、安全 config 查詢，以及 line edits、diagnostics、language-server restart、safe delete 等 optional API。只關閉 shell、跨 Serena project 查詢與 dashboard；Git、測試與 provider 操作仍由 Codex 原生工具負責。

Serena 遵守 `.gitignore`，並額外排除 architecture／docs／assets／public 靜態資產、SQL schemas、第三方 skills、Codex／GitHub／Serena metadata、依賴、build、coverage、cache 與暫存目錄。這些資料仍可由 Codex 原生工具按任務讀取；排除只避免 TypeScript LSP／Serena index 為非程式或大量 vendor 內容消耗啟動時間與 token。Tests 沒有整體排除，保留 definition／reference／rename 的回歸範圍。

TypeScript LSP 直接重用 workspace 固定的 `typescript-language-server` 5.1.3 與 TypeScript 5.9.3，避免 Serena 建立第二套 npm tool cache。Monorepo 的 server-ready、indexing-start 與 indexing budget 分別設為 30／10／60 秒；timeout 後 Serena 可能回傳部分結果，因此跨 package references 仍需沿 public imports／exports 補查，不能把空結果當成沒有 consumer。

### GitHub MCP credential

官方 GitHub MCP 使用 `https://api.githubcopilot.com/mcp/`，由 `.codex/config.toml` 的 `bearer_token_env_var` 引用 `GITHUB_MCP_TOKEN`。在 Cloud 網路機密資料建立同名 secret，目的地只允許 `api.githubcopilot.com`；真正值由使用者在環境設定輸入 GitHub PAT，不放進 repo、env 範本或日誌。GitHub CLI 的 `GH_TOKEN` 維持既有用途，不另複製值。

目前僅載入 repos／issues／pull_requests toolsets；需要擴大能力時修改真正的 MCP header。網路機密的代理替換需要請求經過受支援的 proxy 路徑；若實際 Codex host 不承接 container 的環境或網路機密，必須在該 host 的安全認證設定接入同一憑證。欄位存在、佔位值或 token 環境變數存在都不代表驗證成功。

### Cloud development tools

| 模組 | 準備內容 | 預設 |
| --- | --- | --- |
| `ripgrep` | `rg`，有範圍的文字／檔案定位 | 啟用 |
| `jq` | JSON 欄位投影、CLI 結果篩選 | 啟用 |
| `shellcheck` | Bash 靜態分析；修改 Bash 且需要靜態檢查時選用 | 選用 |
| `actionlint` | 固定版本 GitHub Actions 檢查器；`pnpm check actionlint` | 選用 |
| `shfmt` | 固定版本 Bash 格式檢查器；`pnpm check shfmt` | 選用 |
| `taplo` | 固定版本 TOML 語法檢查器；`pnpm check taplo` | 選用 |
| `build` | make、GCC／G++、pkg-config；Python 沿用 runtime 模組 | 選用 |
| `browser` | 固定版本 Playwright、Chromium 與所需系統函式庫 | 選用 |

ripgrep、jq 與 native build 工具使用具簽章驗證的 distro 套件來源，沿用 image 的套件版本，不複製進 workspace dependency。缺少套件時需要 root 或非互動 sudo，以及 apt repository 存取；已有工具時跳過安裝。同一次 bootstrap 只更新一次 apt index。ShellCheck、actionlint、shfmt、taplo 使用固定版本的 GitHub release，驗證 checksum 後安裝至 `.tools/codex/bin/`，不需 sudo；各自模組擁有 install／verify，版本由 `config/versions.env` 擁有。ShellCheck／shfmt 的 upstream digest 與 Taplo 的下載 archive hash 固定在各自 installer，升版時同步更新；Taplo release 未提供獨立 upstream checksum。

在目前工具選擇上加入 Web／native 開發能力：

```sh
source .codex/bootstrap/config/tools.env
export BOOTSTRAP_TOOLS="$BOOTSTRAP_TOOLS build browser"
bash .codex/bootstrap/update.sh
```

要讓此選擇跨 Cloud 任務保留，在 Cloud 的一般環境變數設定完整的 `BOOTSTRAP_TOOLS` 清單，或修改 repo 的 `config/tools.env`；它不是機密。Playwright exact pin 在 `config/versions.env`，對應 Chromium revision 由 Playwright 管理，獨立工具安裝在 `.tools/codex/`，瀏覽器快取在 `.cache/ms-playwright/`，不新增第二份 application Playwright dependency。只有缺少 binary 或系統函式庫時才補齊。

瀏覽器下載需要 `cdn.playwright.dev`、`playwright.download.prss.microsoft.com`、`cdn.playwright.download.prss.microsoft.com`。系統函式庫安裝需要 root 或非互動 sudo；bootstrap 不關閉 TLS 驗證，也不繞過平台 proxy／權限。`verify.sh` 只檢查版本、binary 與共享函式庫；選用 browser 後明確執行 `tests/smoke.sh` 才會啟動 Chromium，載入本地測試頁，且不代表 application UI 已驗收。

有 Web 任務時再啟動 dev server，使用相同工具路徑擷取對應頁面，例如：

```sh
bash .codex/bootstrap/install.sh --exec playwright screenshot --browser chromium http://127.0.0.1:3000/ .artifacts/ui/page.png
```

Port 以 dev server 的實際輸出為準；登入狀態與受影響互動仍需按任務驗收。Bootstrap 預設準備 Supabase 本地 stack；Web 與 Redis 依任務啟動，Docker daemon 由 Cloud host 提供。
