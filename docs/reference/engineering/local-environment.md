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
- Supabase public/runtime/operator configuration：[integration-supabase Canonical Supabase rules](../../../packages/integration-supabase/src/README.md#canonical-supabase-rules)；跨 package 分類見 [Supabase platform index](../platform/README.md#supabase)
- Redis：Vercel Marketplace resource 的 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 是唯一 application connection contract；environment namespace 由 runtime environment 推導：[Redis coordination](../platform/README.md#redis)
- Current AI runtime credential / model setting：[AI integration](../platform/README.md#ai)
- Workplace / allowed Members：business data，由 Attendance/permission 流程管理，不用 env 授權。

Public configuration（例如 publishable key / public URL）仍不等於 business authorization；browser bundle 不得包含 server credential。

## External tooling

CLI / probe / deployment tools 可能讀 environment 或進行外部寫入。Supabase remote schema tooling 只使用 provider-owned `POSTGRES_URL_NON_POOLING`，並以 `SUPABASE_URL` 驗證 exact project；Web runtime 的 `POSTGRES_URL` 不作 schema/operator fallback。執行前確認 exact project/channel/environment 與既有授權；名稱叫 `check` / `probe` 不代表一定唯讀。

Validation scope 見 [Validation and tooling entry points](validation-pipeline.md)。

## Codex Cloud environment

安裝與啟動入口為 [`codex-cloud.sh`](../../../scripts/bootstrap/codex-cloud.sh)。腳本將工具狀態放在 workspace `.cache/`，初始化 Serena trust、產出 Repomix context、登錄 MCP，最後啟動 Supabase local stack；依賴安裝成功不代表最後的 stack 或 host MCP handshake 成功。

### OpenAI Developer Docs MCP

OpenAI Developer Docs 另以官方 hosted MCP 提供文件查詢，不需本地安裝或 credential；repository 的連接位置由 `.codex/config.toml` 擁有。Cloud 網路需允許 `developers.openai.com`，但允許網路不會自動登錄聊天工具；依 [Fresh Cloud MCP registration](codex-agents-and-mcp.md#fresh-cloud-mcp-registration) 同步使用者層登錄並檢查更新後的原生工具，並實際執行 search/fetch 驗收。直接 HTTPS JSON-RPC 可查文件，不能當作已完成 host 登錄。

### Local Supabase stack

Default Cloud environment checks the image-provided Docker daemon and starts the package-owned [local stack lifecycle](../../../packages/integration-supabase/README.md). Docker endpoint/context/TLS selectors are cleared for the local-socket check; Cloud environment never installs or starts a competing daemon. Supabase uses its canonical package workdir and the official `ghcr.io` image registry by default, preserving proxy and registry credentials. Set `SUPABASE_INTERNAL_IMAGE_REGISTRY` only when the environment requires another supported registry.

服務集合、環境檔與 schema checkpoint 處理由 package README 與 [`local-stack.mjs`](../../../packages/integration-supabase/scripts/local-stack.mjs) 擁有。Checkpoint 不一致時保留既有資料，依明確授權收斂。CLI 輸出可能包含本地 credentials，須保存在忽略且受限存取的檔案。

後續 shell 使用 `source scripts/bootstrap/cloud-env.sh` 恢復 workspace 工具與快取路徑；bootstrap 的 export 不會自動傳回父程序。保留 host 的 `HOME` 與 `CODEX_HOME`，Corepack shim、uv binary、Python 與 Serena 均安裝至 workspace。Serena MCP 透過 `scripts/bootstrap/serena-mcp.sh` 載入同一環境並直接執行已安裝工具，不在連線時解析套件。

### Serena v2 MCP

Serena 依官方安裝模型由 `uv tool install` 建立隔離工具環境；目前固定 `serena-agent==2.1.0`，並使用 Serena 官方建議的 Python 3.13。這不改變專案一般 Python runtime 的 3.12.14。`uvx` 適合臨時執行，但 MCP 每次啟動不應重新解析或下載套件，因此 Cloud bootstrap 使用已安裝的 Serena executable。

`.codex/config.toml` 最終啟動語意與官方 Codex 範例一致：

```text
serena start-mcp-server --project-from-cwd --context=codex --agent-interface=REPL
```

Repository wrapper 只補固定工具路徑及 workspace cache，不安裝任何內容。CLI 明確固定 REPL，避免 Codex App 未從 project cwd 啟動時先鎖定成另一種 interface。安裝後仍需重新連接或開新 Codex session，以 `/mcp` 確認 Serena 已連線，再實際讀取 initial instructions／啟用目前專案；executable 或 config 存在不等於 MCP handshake 完成。

官方依據：[Serena Quick Start](https://oraios.github.io/serena/#quick-start) · [Codex client setup](https://oraios.github.io/serena/02-usage/030_clients.html#codex-cli-and-app)。

REPL API、ignore、trusted-project 與跨 package references 限制統一見 [Serena 操作指南](../../../.serena/README.md#5-mcp-與-repl-正確用法)及 [project.yml](../../../.serena/project.yml)。Workspace LSP 的 `ls_path` 只有在 global config 信任專案時才生效；以啟動紀錄確認實際 server，references 空結果仍須交叉核對 public imports／exports。

### GitHub MCP credential

官方 GitHub MCP 使用 `https://api.githubcopilot.com/mcp/`，由 `.codex/config.toml` 的 `bearer_token_env_var` 引用 `GITHUB_MCP_TOKEN`。在 Cloud 網路機密資料建立同名 secret，目的地只允許 `api.githubcopilot.com`；真正值由使用者在環境設定輸入 GitHub PAT，不放進 repo、env 範本或日誌。GitHub CLI 的 `GH_TOKEN` 維持既有用途，不另複製值。

目前僅載入 repos／issues／pull_requests toolsets；需要擴大能力時修改真正的 MCP header。網路機密的代理替換需要請求經過受支援的 proxy 路徑；若實際 Codex host 不承接 container 的環境或網路機密，必須在該 host 的安全認證設定接入同一憑證。欄位存在、佔位值或 token 環境變數存在都不代表驗證成功。

### Cloud development tools

開發工具由 Cloud 環境安裝指令碼提供。依任務使用已安裝的 rg、jq、Playwright 等工具。
