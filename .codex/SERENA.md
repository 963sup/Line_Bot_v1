# Serena 使用與 Memories

**Owner：** L4 capabilities / Serena project workflow  
**用途：** 定義 Serena MCP、project activation、onboarding 與 memories 的使用邊界。  
**非用途：** 不取代 repository contract、Owner、授權、測試或正式驗證。

## 觸發與使用原則

當任務涉及程式碼結構理解、symbol 導航、references、diagnostics、受控編輯、專案記憶或受控 shell 時，優先使用已配置的 Serena MCP。

使用者在訊息開頭指定 `serena`，表示優先使用 Serena 的提示；它不是自動觸發器，也不授予額外權限。先確認 MCP 與目前 worktree 可用，再依任務需要選擇工具。

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

需要新增或更新 memory 時，先讀取 `memory_maintenance`，並遵守：

- 只保存可重用的專案慣例、架構決策與工作流程。
- 不保存 secret、credential、個資、短期除錯紀錄或可直接由 source 取得的內容。
- 使用 `mem:` 參照連結相關記憶，避免複製 repository truth。
- memory 是探索與背景資料，不是 domain truth、授權依據或 acceptance evidence。
- 完成異動後，必要時執行 `serena memories check`。

全域設定位於 Windows `%USERPROFILE%\\.serena\\serena_config.yml`；專案設定位於 `.serena/project.yml`。個人環境設定不得提交進 repository。

## 官方參考

- [Configuration](https://oraios.github.io/serena/02-usage/050_configuration.html)
- [Memories & Onboarding](https://oraios.github.io/serena/02-usage/045_memories.html)
- [The Project Workflow](https://oraios.github.io/serena/02-usage/040_workflow.html)
