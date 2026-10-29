# Serena 使用方式

本文件是此專案的操作速查，依 [Serena 官方文件](https://oraios.github.io/serena/) 與本機 CLI help 核對。2026-10-28 核對版本為 Serena 2.1.0；升級後以 `serena --version`、各指令的 `--help` 及當次 `initial_instructions` 為準。

Serena v2 的 [Tools 官方文件](https://oraios.github.io/serena/01-about/035_tools.html) 是本專案最優先的工具使用參考；涉及語義定位、符號、引用、LSP、診斷、重構或 safe delete 時，先使用 Serena v2 MCP／LSP tools，再使用其他工具。若本文件、CLI help、session manual 與官方 Tools 文件不一致，以當前 session 的 `initial_instructions`、CLI help 及官方 v2 Tools 文件為準。

專案規則見 [AGENTS.md](AGENTS.md)，實際設定見 [project.yml](project.yml)，Codex 啟動設定見 [config.toml](../.codex/config.toml)。本文件不複製記憶、治理規則或產品實作狀態。

根目錄共通契約見 [repository AGENTS.md](../AGENTS.md)，記憶操作另依 [memories/AGENTS.md](memories/AGENTS.md)。以下操作說明不增加工具或寫入授權。

## 1. 先確認環境與指令

以下預檢每個新 session 按需執行一次；已成功的能力直接重用，只有 runtime／設定改變或呼叫失敗才重驗該層。不要每輪讀完整手冊、列工具、health-check 或重建 index。觸發規則見根 AGENTS.md 的 Serena context budget。

`serena download-ls-dependencies python typescript` 用於預先下載指定語言伺服器依賴，適合新環境、離線準備或確認缺依賴時執行，不是日常啟動指令。Serena 的 Python launcher runtime 與 Python 語言伺服器是不同需求；本專案 `project.yml` 只啟用 TypeScript，且使用已安裝的 workspace `typescript-language-server`，兩者已工作時不必執行此下載。只有要分析 Python source 並啟用對應 server 時才需要評估 Python LSP。

在 repository 根目錄執行；此專案的 Bash 環境先載入既有工具路徑，不需要重新安裝：

```bash
export PATH="$HOME/.local/bin:$PWD/node_modules/.bin:$PATH"
serena --version
serena --help
```

`serena --help` 列出最上層 CLI 指令；下一層用 `serena project --help`，具體參數用 `serena project index --help`。不要憑記憶猜參數，也不要把 CLI、MCP tools 與 REPL APIs 混用。

### 專案設定與信任

以下設定的唯一來源是 [project.yml](project.yml)；排查時讀取當前值，不把本表當作 runtime 已採用的證據：

| 設定 | 本專案用途 |
| --- | --- |
| `language_backend`、`language_servers` | LSP backend，啟用 TypeScript；Serena 的 Python runtime 不等於 Python LSP。 |
| `agent_interface` | REPL；在 `serena_repl` 中執行 Python。 |
| `default_modes` | interactive/editing；實際 API 還受 context、全域設定與 session 影響。 |
| `ls_workspace_folders` | workspace 範圍；仍受 ignore 與 TypeScript project graph 限制。 |
| `ls_specific_settings.typescript.ls_path` | 選用 workspace-pinned `node_modules/.bin/typescript-language-server`。 |
| `read_only` | Serena API 的編輯限制，不是 host sandbox 或任務寫入授權。 |

Serena 的全域 `trusted_project_path_patterns` 決定是否套用專案的 `ls_specific_settings`。未信任時，包括 `ls_path` 的專案覆寫會被忽略；應核對當前設定與 LSP 啟動日誌，不能只看到 YAML 就宣稱使用 workspace server。這是 Serena 自身的信任判斷，與 Codex 是否信任並載入 `.codex/config.toml` 是不同層級。參考 [Trusted Projects](https://oraios.github.io/serena/02-usage/070_security.html#trusted-projects)。

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

本專案另忽略 `docs/`、`architecture/`、`.serena/`、`.codex/` 等路徑，完整範圍以 `project.yml` 為準。Serena 搜尋不到不等於檔案不存在；治理／設定檔改用原生工具讀取，不為查一次檔案就放寬 ignores。

跨 package 引用取決於 TypeScript project graph；必要時查 consumer 的 tsconfig references、library 的 composite/declaration/source mapping 與真實 imports。空 references 不能證明沒有 consumer；public API rename 或 safe delete 須以明確範圍的 exports、原生搜尋及 tests 交叉核對。相關說明見 [TypeScript configuration](https://oraios.github.io/serena/02-usage/050_configuration.html#typescript)。

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

實際啟動使用環境已安裝的 `serena`，設定見 `.codex/config.toml`。登錄後確認 host 工具清單更新並做原生呼叫驗收。

連線驗收在實際目標 host 依序確認：Serena 已 connected（支援時用 `/mcp`）→ 正確專案／worktree → 本 session 的 `initial_instructions` → 一個已知 TypeScript 檔案的符號查詢。跨 package 任務還須核對引用完整性。CLI 版本、索引或 stdio 程序成功均不能代替 host 工具登錄；Cloud 未暴露 Serena 工具時，應先處理 host 接線。

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

先查相關 facade 或單一方法的當前簽名，不要把 classic tools 參數直接套入：

```python
s.info("lsp.find_symbol")
```

同一 session 需要比較少量方法時，可一次查詢：

```python
s.info("lsp.get_symbols_overview", "lsp.find_referencing_symbols")
```

確認簽名後再呼叫：

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

頂層變數可在同一 REPL session 保留；需要時以 `s.vars()` 查看、`s.clear()` 清除。先限制 path/symbol/depth 與回傳大小，再在 REPL 彙總結果，不長期保留大型結果或把 facade 存入變數。REPL 是 Python 執行環境；`read_only` 與 API inclusion 不能取代 host/container 的檔案權限隔離。

### Memories 與 onboarding

本專案已有 memories；按任務讀取相關節點，不為補文件或啟動新 session 重跑 onboarding。`no-onboarding` 只略過 onboarding，`no-memories` 停用 memories 及依賴它的 onboarding。`serena memories initialize` 建立保留的維護記憶，不代替專案 onboarding。寫入、rename、delete 與引用檢查均遵循 [memory contract](memories/AGENTS.md)，不在 README 重述整套授權規則。

## 6. 故障排查

| 現象 | 檢查與處理 |
| --- | --- |
| `serena` 找不到 | 在 repo 根目錄 確認 PATH 包含 uv tool bin directory，再確認安裝路徑與版本；不要直接安裝另一份最新版。 |
| 缺少符號／首次查詢慢 | 查工作目錄、source path、ignore、語言設定及 workspace LSP；必要時 index-file 或 project index。 |
| 語言伺服器失效 | 先看有界 log／health-check，再視情況用當次 `s.lsp.restart_language_server` API 或重建 session。 |
| host 沒有 Serena tools | 查 client MCP 設定與啟動結果；本機 binary 存在不代表 host 已載入。 |
| 已設定 `ls_path`，runtime 卻使用其他 LSP | 核對 Serena 全域 trusted project patterns、session 設定與 LSP 啟動紀錄；不要與 Codex project trust 混為一談。 |
| references 為空或跨 package consumer 遺漏 | 查 TypeScript project graph、exports 與實際 imports，使用限定範圍的原生搜尋交叉驗證。 |
| 寫入全域目錄失敗 | 使用專案 Cloud environment 設定的 `SERENA_HOME`；自建 stdio bridge 要傳遞該環境，不要重設使用者 HOME。 |
| `Failed to parse JSONRPC`，內容是 Python 物件 repr | 檢查 bridge／REPL 是否把非協定文字寫入 MCP stdout；改以最後一個表達式回傳結果。重建 index 無法修復此通訊問題。 |
| index 完成但 shutdown timeout | 分開確認索引 exit status／完成數與後續 session 查詢；保存 cleanup 警告，不直接宣稱所有功能正常。 |

自建 stdio bridge 不可在 server stdout 寫 banner、`print(object)` 或 debug log；診斷寫 stderr／ignored artifact。前次已實測，移除 REPL 的 `print(...)`、改回傳表達式後，符號查詢成功且無 JSONRPC parse error。這是通訊輸出修正，與索引重建是不同操作。

控制 context：先限定 path／symbol／depth，輸出設定合理上限；避免全庫全文、完整 provider response 或反覆讀 manual。完整索引／health-check log 放 ignored artifact，只讀摘要與可行動錯誤。

## 7. 官方來源與更新方式

- [官方文件首頁](https://oraios.github.io/serena/)
- [Tools 與 REPL API](https://oraios.github.io/serena/01-about/035_tools.html)
- [Running Serena：CLI、MCP 啟動](https://oraios.github.io/serena/02-usage/020_running.html)
- [Connecting MCP Clients](https://oraios.github.io/serena/02-usage/030_clients.html)
- [Project Workflow：建立、索引、啟用](https://oraios.github.io/serena/02-usage/040_workflow.html)
- [Memories & Onboarding](https://oraios.github.io/serena/02-usage/045_memories.html)
- [Configuration：REPL、contexts、modes](https://oraios.github.io/serena/02-usage/050_configuration.html)
- [Security Considerations](https://oraios.github.io/serena/02-usage/070_security.html)
- [Additional Usage：worktrees](https://oraios.github.io/serena/02-usage/999_additional-usage.html)
- [官方文件原始碼](https://github.com/oraios/serena/tree/main/docs/02-usage)

官方網站與 GitHub main 可能超前已安裝版本。更新本文件時只讀相關章節，核對已安裝版本、CLI help 與實際 session API；不要把此速查表當作新的治理規則或無條件授權。

2026-10-29 整合補充資料時，以本機 Serena 2.1.0 的 CLI help 與安裝來源核對 `s.info` 及 trusted-project 對 LS 設定的判斷；沒有因此宣稱已驗收 Cloud MCP 登錄或 LSP session。
