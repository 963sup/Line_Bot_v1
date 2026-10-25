# Serena 使用與 Memories

**Owner：** L4 capabilities / Serena project workflow  
**用途：** 定義 Serena MCP、project activation、onboarding 與 memories 的使用邊界。  
**非用途：** 不取代 repository contract、Owner、授權、測試或正式驗證。

## 觸發與使用原則

當任務涉及程式碼結構理解、symbol 導航、references、diagnostics、受控編輯、專案記憶或受控 shell 時，優先使用已配置的 Serena MCP。

使用者在訊息開頭指定 `serena`，表示優先使用 Serena 的提示；它不是自動觸發器，也不授予額外權限。先確認 MCP 與目前 worktree 可用，再依任務需要選擇工具。

Serena 有兩種介面，實際可用工具以目前 configuration 為準：

- **Classic Tools**：每個操作是獨立的 MCP tool，適合單一步驟的 symbol、file、memory 或 workflow 操作。
- **REPL**：由單一 `serena_repl` 以 Python 組合多個 Serena operation，適合先在 Serena 內篩選、聚合結果，再只把必要摘要送入對話上下文。REPL 是 optional/BETA，未啟用時不可假設存在。

官方工具表也標示 optional 與 BETA；未列在目前 `get_current_config` 的 enabled tools 不可呼叫或當成能力保證。

Serena 不取代：

- `pnpm semantic plan/context` 的 Owner 與 contract 定位
- root `AGENTS.md`、architecture、schema 與 source-of-truth
- Codex approval、plan mode、branch/PR 與外部寫入授權
- tests、`pnpm check`、provider readback 或其他 acceptance evidence

## Project lifecycle

依序執行必要步驟，不重複初始化：

1. **Init（必要時）**：只有全域 Serena 設定不存在或需要更新 language backend 時，才執行 `serena init`。
2. **Project creation（必要時）**：使用 `--project-from-cwd` 對應目前 checkout；只有沒有專案設定時才建立 project，必要時才 index。
3. **Activation**：啟用目前 worktree 的 Serena project；不要重複建立既有 project。
4. **Config/memories check**：先讀取 `get_current_config` 與 `list_memories`，再決定是否需要 onboarding。
5. **Onboarding（首次）**：只有 `.serena/memories/` 尚無專案記憶時才執行 onboarding；已有 memories 不重跑。
6. **Task workflow**：先用 Serena 做 bounded exploration，再修改；修改後用 `git diff`、既有 tests 與任務指定 validation 驗證。

MCP 啟動保留 `--context=codex`、`--project-from-cwd` 與 `--open-web-dashboard=false`；不得為了開啟 Dashboard 改變 repository transport contract。

## Memories policy

### 何時讀取 memory

Serena 啟用 project 時會提供可用 memory 的名稱；Agent 應依名稱與任務關聯性選擇性讀取，不應把全部 memory 自動灌入上下文。

- 專案首次 activation：先確認是否存在 memories；沒有才 onboarding。
- 已有 project memories：只讀取與目前 Owner、模組、workflow 或決策直接相關的 memory。
- 看到 `` `mem:NAME` `` 參照：優先讀取其目標，再按需要展開下一層。
- 不確定某 memory 是否相關：先讀名稱，不要為了預防性完整而全部讀取。

### 何時更新 memory

只有當資訊會跨多次任務重複有用，且不屬於更高權威 source-of-truth 時，才更新 memory。以下情況通常應更新：

- 新增或確認可重用的架構決策、Owner boundary 或 workflow 慣例。
- 建立未來任務必須知道的穩定 build/test/tooling 流程。
- 現有 memory 的規則、路徑或 `mem:` 參照已失效，需要修正、rename、split 或刪除。

以下情況不要更新 memory：

- 單次 bug 的暫時除錯紀錄、一次性 command output 或當前 WIP。
- source、schema、AGENTS、architecture 文件已經是 authoritative source 的內容複製。
- secret、credential、個資、provider response 或未驗證推測。
- 只是本次對話的偏好，且沒有跨任務的穩定價值。

需要新增或更新 memory 時，先讀取 `memory_maintenance`，並遵守：

- 只保存可重用的專案慣例、架構決策與工作流程。
- 不保存 secret、credential、個資、短期除錯紀錄或可直接由 source 取得的內容。
- 使用 `mem:` 參照連結相關記憶，避免複製 repository truth。
- memory 是探索與背景資料，不是 domain truth、授權依據或 acceptance evidence。
- 完成異動後，必要時執行 `serena memories check`。

全域設定位於 Windows `%USERPROFILE%\\.serena\\serena_config.yml`；專案設定位於 `.serena/project.yml`。個人環境設定不得提交進 repository。

## Symbol tools 與程式碼更新

Symbol tools 操作的是目前程式碼與 language-server index，不是另一套 symbol memory：

| 目的 | 優先工具 | 結果 |
| --- | --- | --- |
| 看檔案有哪些 top-level symbols | `get_symbols_overview` | 結構摘要，不修改程式碼 |
| 找 symbol 定義 | `find_symbol`、`find_declaration` | declaration/definition evidence |
| 找 consumer | `find_referencing_symbols` | references evidence |
| 找實作 | `find_implementations` | implementation evidence；能力依 language server 而定 |
| 看診斷 | `get_diagnostics_for_file`、`get_diagnostics_for_symbol` | current diagnostics，不等於 acceptance |
| 修改 symbol | `replace_symbol_body`、`insert_before_symbol`、`insert_after_symbol` | 直接修改 source，仍須 `git diff` 與 repository validation |
| 安全移除/改名 | `safe_delete_symbol`、`rename_symbol` | language-server-aware refactor，仍須檢查 public consumers |

程式碼修改後通常由 language server 自動更新索引；只有 diagnostics 或 references 明顯 stale、project configuration 改變或 language server 異常時，才使用 `restart_language_server`。重新索引或 restart 不會取代 tests、architecture checks 或 typecheck。

## 完整工具分類與權限邊界

依官方 Tools/API 分類，Serena 不只有 symbol tools：

| 分類 | 代表工具 | 使用規則 |
| --- | --- | --- |
| `symbol_tools` / `lsp` | declaration、implementations、references、overview、diagnostics、rename、replace、safe delete | 先 bounded navigation，再做最小修改；重構後檢查 public consumers |
| `file_tools` / `fs` | find/list/read/search、create、replace、insert、delete | 只處理明確 scope；大量搜尋優先在 Serena/REPL 內聚合摘要 |
| `memory_tools` / `mem` | list/read/write/edit/rename/delete | `delete_memory` 只有明確指示或授權才能使用；更新前先讀 `memory_maintenance` |
| `config_tools` / `cfg` | activate project、current config、dashboard | 用於確認 session/project state；dashboard 不等於授權 |
| `workflow_tools` / `mem.onboarding` | `initial_instructions`、`onboarding`、`serena_info` | onboarding 僅首次；`serena_info` 按需讀取，避免預載大量說明 |
| `cmd_tools` / `shell` | `execute_shell_command` | 遵守 repository command rules 與 bounded-output，不把原始高量 stdout 灌入上下文 |
| JetBrains / IDE backend | `jb.*`、`ide.*` | 只有對應 backend 與工具啟用時才可使用；BETA/optional 工具不能視為預設能力 |
| external project | `query_project`、`ext.*` | 僅 read-only、明確 external project；不混淆目前 worktree 的 source-of-truth |

Classic Tools 與 REPL 的功能大致重疊，但 REPL 的主要價值是組合操作、保留中間結果與降低上下文輸入；因此對大型 symbol/reference 查詢，若 REPL 可用，優先在 REPL 內篩選後回傳摘要。這不改變 repository validation 或 evidence boundary。

## 官方參考

- [Configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)
- [Memories & Onboarding](https://oraios.github.io/serena/02-usage/045_memories.html)
- [The Project Workflow](https://oraios.github.io/serena/02-usage/040_workflow.html)
