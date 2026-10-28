# Serena 使用方式

本文件是此專案的操作速查，依 [Serena 官方文件](https://oraios.github.io/serena/) 與本機 CLI help 核對。2026-10-28 核對版本為 Serena 2.1.0；升級後以 `serena --version`、各指令的 `--help` 及當次 `initial_instructions` 為準。

專案規則見 [AGENTS.md](AGENTS.md)，實際設定見 [project.yml](project.yml)，Codex 啟動設定見 [config.toml](../.codex/config.toml)。本文件不複製記憶、治理規則或產品實作狀態。

## 1. 先確認環境與指令

在 repository 根目錄執行；此專案的 Bash 環境先載入既有工具路徑，不需要重新安裝：

```bash
source .codex/bootstrap/lib/common.sh
serena --version
serena --help
```

`serena --help` 列出最上層 CLI 指令；下一層用 `serena project --help`，具體參數用 `serena project index --help`。不要憑記憶猜參數，也不要把 CLI、MCP tools 與 REPL APIs 混用。

## 2. 常用 CLI 指令

以下以目前專案根目錄為工作目錄。`PATH`、`FILE`、`NAME` 是需替換的參數。

| 指令 | 用途 |
| --- | --- |
| `serena --help` | 列出最上層 CLI 指令。 |
| `serena project --help` | 列出 project 子指令。 |
| `serena project create` | 建立 `.serena/project.yml`；既有專案不必重建。 |
| `serena project create --index` | 建立專案設定後立即索引。 |
| `serena project index` | 建立／更新 LSP 符號快取。 |
| `serena project index PATH` | 對指定專案建立／更新快取。 |
| `serena project index-file FILE` | 只索引指定檔案；完整格式是 `FILE [PROJECT]`。 |
| `serena project health-check` | 檢查專案工具與語言伺服器。 |
| `serena project is_ignored_path PATH` | 檢查路徑是否被專案設定忽略。 |
| `serena start-mcp-server` | 啟動 MCP server；預設 stdio，由 MCP client 管理連線。 |
| `serena start-mcp-server --project-from-cwd` | 啟動時依工作目錄自動選擇專案。 |
| `serena config edit` | 用預設編輯器編輯全域 Serena 設定。 |
| `serena context list` | 列出可用 contexts。 |
| `serena context create NAME` | 建立自訂 context。 |
| `serena context edit NAME` | 編輯自訂 context。 |
| `serena mode list` | 列出可用 modes。 |
| `serena mode create NAME` | 建立自訂 mode。 |
| `serena mode edit NAME` | 編輯自訂 mode。 |
| `serena tools list --all` | 列出所有 tool 定義；不代表當前 session 全部已啟用。 |
| `serena tools description find_symbol` | 查看 classic `find_symbol` tool 的說明。 |
| `serena memories list` | 列出 memories；寫入／刪除另遵循記憶規則。 |
| `serena memories check` | 檢查 memories 間的引用完整性，不是 LSP 索引檢查。 |

其他最上層入口包括 `init`、`setup`、`prompts`、`dashboard-viewer`、`download-ls-dependencies`、`print-system-prompt`、`start-project-server`；使用前先查該命令 `--help`。`serena-hooks` 是獨立 CLI，透過 `serena-hooks --help` 查詢。

## 3. 索引與檢查

```bash
# 預建目前專案的符號快取
serena project index

# 只更新一個檔案
serena project index-file packages/contract/src/domain/commercial-document.ts

# 查看索引參數，例如單檔 timeout 與 log level
serena project index --help

# 排查語言伺服器／專案工具
serena project health-check
```

索引是 LSP 的預先快取；正常使用時 Serena 會自動更新變更檔案，不必每次對話全庫重建。JetBrains backend 的索引由 IDE 處理。不要直接編輯或提交 `.serena/cache/`。

CLI 成功不等於當前 MCP session 已連通。索引後仍須在實際 session 查詢一個已知檔案的符號；跨 package 查引用亦須確認 TypeScript project graph。索引不能證明所有引用都已找齊。

## 4. 自動啟動與 Codex 接線

基本指令：

```bash
serena start-mcp-server --project-from-cwd
```

此處「自動」是啟動 server 時自動偵測專案，不是註冊開機常駐服務。`--project-from-cwd` 往上尋找最近的 `.serena/project.yml` 或 `.git` 邊界，適用 git worktree；因此 client 的工作目錄必須正確。

本專案採 Codex context、REPL 與 LSP。等效 CLI 範例：

```bash
serena start-mcp-server \
  --project-from-cwd \
  --context codex \
  --agent-interface repl \
  --open-web-dashboard false
```

實際啟動沿用 `.codex/config.toml` 的 bootstrap launcher；不要另開無人連線的 stdio server，或在 launcher 裡重新下載工具。一般由 Codex host 啟動 server、連接 stdin/stdout。手動執行命令本身不會把 tools 註冊進現有對話。

context 與 agent interface 在 session 啟動時決定；切換後需重建 session。mode 用於調整任務行為，`--mode` 覆寫 default modes，`--add-mode` 額外加入。設定細節以當前 CLI help 與官方 configuration 為準。

## 5. MCP 與 REPL 正確用法

先確認 host 實際提供的 tools；新的 Serena session 呼叫一次 `initial_instructions`，取得該 session ID 與可用 API。不要沿用上一個 server 的 ID，也不必反覆載入整份 manual。

本專案使用 `serena_repl`。呼叫參數結構：

```json
{
  "session": "由這次 initial_instructions 取得的 ID",
  "code": "s.lsp.get_symbols_overview(relative_path='packages/contract/src/domain/commercial-document.ts', depth=0, max_answer_chars=3000)"
}
```

`code` 是 Python；以下是 REPL 內的程式碼，不是 shell 命令：

```python
# 讓最後一個表達式成為結果，由 Serena renderer 輸出
s.lsp.get_symbols_overview(
    relative_path="packages/contract/src/domain/commercial-document.ts",
    depth=0,
    max_answer_chars=3000,
)
```

使用順序：overview 找符號 → `find_symbol` 讀必要宣告／body → `find_referencing_symbols` 查 consumer → 必要時讀局部檔案 → 修改 → diagnostics 與專案驗證。每個 API 的參數先由當次 manual／API 說明確認，不假設 classic tool 的參數完全相同。

| REPL facade | 主要能力 |
| --- | --- |
| `s.cfg` | 當前設定與 session 狀態，例如 `get_current_config`。 |
| `s.lsp` | overview、find symbol、references、declaration、implementations、diagnostics、rename、safe delete、restart language server。 |
| `s.fs` | ignore-aware 路徑定位、檔案讀取、pattern search。 |
| `s.edit` | 符號／內容修改 API；一般修改仍依 repository 的原生工具分工。 |
| `s.mem` | memories 的列表、讀寫與引用維護。 |
| `s.ext` | 外部專案唯讀查詢，須另符合存取範圍。 |
| `s.shell` | shell 執行能力；一般命令優先使用 Codex 原生執行工具。 |

REPL 的可用能力由 `included_apis`／`excluded_apis` 決定；classic tool interface 才使用 `included_optional_tools`／`excluded_tools` 等設定。`serena tools list --all` 不是 REPL session 的即時 API 清單；JetBrains API 亦不能當作 LSP 能力使用。

## 6. 故障排查

| 現象 | 檢查與處理 |
| --- | --- |
| `serena` 找不到 | 在 repo 根目錄 source bootstrap common.sh，再確認安裝路徑與版本；不要直接安裝另一份最新版。 |
| 缺少符號／首次查詢慢 | 查工作目錄、source path、ignore、語言設定及 workspace LSP；必要時 index-file 或 project index。 |
| 語言伺服器失效 | 先看有界 log／health-check，再視情況用當次 `s.lsp.restart_language_server` API 或重建 session。 |
| host 沒有 Serena tools | 查 client MCP 設定與啟動結果；本機 binary 存在不代表 host 已載入。 |
| 寫入全域目錄失敗 | 使用專案 bootstrap 設定的 `SERENA_HOME`；自建 stdio bridge 要傳遞該環境，不要重設使用者 HOME。 |
| `Failed to parse JSONRPC`，內容是 Python 物件 repr | 檢查 bridge／REPL 是否把非協定文字寫入 MCP stdout；改以最後一個表達式回傳結果。重建 index 無法修復此通訊問題。 |
| index 完成但 shutdown timeout | 分開確認索引 exit status／完成數與後續 session 查詢；保存 cleanup 警告，不直接宣稱所有功能正常。 |

自建 stdio bridge 不可在 server stdout 寫 banner、`print(object)` 或 debug log；診斷寫 stderr／ignored artifact。前次已實測，移除 REPL 的 `print(...)`、改回傳表達式後，符號查詢成功且無 JSONRPC parse error。這是通訊輸出修正，與索引重建是不同操作。

控制 context：先限定 path／symbol／depth，輸出設定合理上限；避免全庫全文、完整 provider response 或反覆讀 manual。完整索引／health-check log 放 ignored artifact，只讀摘要與可行動錯誤。

## 7. 官方來源與更新方式

- [官方文件首頁](https://oraios.github.io/serena/)
- [Running Serena：CLI、MCP 啟動](https://oraios.github.io/serena/02-usage/020_running.html)
- [Project Workflow：建立、索引、啟用](https://oraios.github.io/serena/02-usage/040_workflow.html)
- [Configuration：REPL、contexts、modes](https://oraios.github.io/serena/02-usage/050_configuration.html)
- [Additional Usage：worktrees](https://oraios.github.io/serena/02-usage/999_additional-usage.html)
- [官方文件原始碼](https://github.com/oraios/serena/tree/main/docs/02-usage)

本次官方站直連受限，透過官方 GitHub repository 讀取上述 running、workflow、configuration、additional usage 原始碼；本機參數另以 CLI help 核對。網站主線可能超前已安裝版本。更新本文件時只讀相關章節，核對 CLI help 與實際 session API；不要把此速查表當作新的治理規則或無條件授權。
