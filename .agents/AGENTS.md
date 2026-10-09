# Skills 管理規則

適用範圍：repository root 下的 `.agents/skills/` 及其所有子目錄與檔案。

- 任何情況下，代理都不得直接新增、修改、刪除、搬移、重新命名或覆寫此目錄內的內容，包括 `SKILL.md`、程式、參考資料與 metadata。
- 技能的安裝、更新與移除，只能透過 Skills CLI 指令進行；以專案根目錄的 `skills-lock.json` 作為技能來源與鎖定資訊的管理紀錄，並由 CLI 同步更新。
- 探索現有技能時，使用 `pnpm skills:list [query]` 依名稱或用途搜尋。
- 技能管理時優先使用可信入口 `D:\Codex\.tools\bin\npx.cmd`，工作目錄為 repository root；不得以全域安裝取代專案安裝。
- 若可信入口不存在，使用 repository packageManager 鎖定的 pnpm 版本啟動固定版本的 Skills CLI；目前 fallback 為 `pnpm@11.25.0` + `skills@1.7.1`：
  `pnpm dlx pnpm@11.25.0 --dir <repository-root> dlx skills@1.7.1 <command>`
- fallback 不得改用 PATH 上未鎖定的 npx、全域安裝或浮動的 skills@latest；升級固定版本時同步檢查 CLI 行為並更新本規則。
- lock-only 技能應先使用固定 Skills CLI 的名稱移除功能清除登錄；若 CLI 無法處理就停止，不手改 lock，也不為清理 metadata 安裝替代來源。
- 不得手動修改技能內容來修正格式、通過檢查、加入專案規則或繞過安裝錯誤；CLI 無法處理時，回報原因並停止該項變更。
- 不得偽造 `skills-lock.json` 中的來源、版本、路徑或雜湊；需要變更技能時，使用上方核准入口啟動 Skills CLI，由 CLI 同步更新。
- 可以唯讀檢查技能內容；專案自身的治理規則應寫在技能目錄之外，不得寫入外部技能。

本規則不削弱 repository 根目錄 `AGENTS.md` 的其他約束，也不授權自動更新或執行技能附帶的程式。
