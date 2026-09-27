# Documentation retrieval contract

Docs 的目標是最小充分上下文，不是主題完整度。

- 一個文件只承擔一種主要 retrieval job；通常不會在同一任務一起使用的內容必須拆開。
- `README` / index 只 routing；`AGENTS.md` 只保存會改變 Agent 行為的 constraints。
- 高頻 knowledge unit 優先保存 why、invariant、dangerous assumption、decision；可可靠由 code / manifest / schema / config / tests 取得的 what 只 link。
- 同一 fact / rule 只有一個 canonical owner；其他位置只 pointer，不複製。
- Current truth 與 target / proposal / migration / dated evidence 分開；歷史只有仍影響 recovery/regression/decision時保留。
- Long reference 可以存在，但不能成為高頻 task 的必讀前置。
- 搬移／刪除文件時同 changeset修所有 repository refs；不留 redirect shell 或 alias doc。
- Machine semantic / module / data truth 分別由 `architecture/semantic-model.json`、`implementation-topology.json`、`data-topology.json` 擁有；actual SQL 由 `supabase/schemas/` 擁有。
- 不因文件整理放寬 authorization、transaction、replay/version、tenant isolation、recovery、privacy 或 evidence semantics。

修改 docs 後跑 `pnpm docs:check`；repository-level收尾依 root `AGENTS.md`。
