# Codex runtime scope

- `.codex/` 只擁有 Codex runtime configuration、agent role profiles 與 execution safety policy；不是產品 architecture、business rule 或 repository knowledge 的第二個 owner。
- `config.toml` 只保存 runtime 必須的 machine configuration；模型責任與調度的 human-readable canonical contract 由 [agents/AGENTS.md](agents/AGENTS.md) 擁有。
- `agents/*.toml` 定義角色的可執行 profile 與權限限制；不得複製完整 repository 規則，執行時仍套用 root 與 nearest local AGENTS。
- `rules/*.rules` 只處理能由 Codex runtime enforcement 的 command safety；不能取代 GitHub、Supabase、LINE、Vercel 等平台本身的 authorization。
- 修改 runtime config、agent profile 或 rules 時使用既有 `tooling:check`，需要 execpolicy semantic 驗證時再跑 `tooling:rules`；檔案存在或靜態解析成功不代表目前 session 已熱載入。
- 未有真實 runtime constraint 時不新增第二套 config、wrapper 或 compatibility layer。
