# Platform integration root migration — Step 8：行為等價、Release 保護與最後刪除

Status: PROPOSED。上一階段：[Step 7](./platform-integration-root-migration-step-7.md)；下一階段：[End](./platform-integration-root-migration-step-end.md)。

## 先驗收再刪除
1. **來源證據**：所有 root tracked files 在 Step 1 manifest 有 MOVE/UPDATE/DELETE 決策；SQL 有序清單與 SHA 完全吻合；原 native bucket manifest 在新路徑 **唯一**；原 AI provider runtime consumer 已遷到公開 workspace export。
2. **代碼驗證**：執行 `pnpm install --frozen-lockfile`、`pnpm lint`、`pnpm tooling:check`、`pnpm architecture`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm schema:check`、`pnpm docs:check`、`pnpm deadcode` 或當前 CI canonical aggregate（以專案既有指令為權威）。必須保留失敗清單及修正證據，不替換為 weaker smoke。
3. **Vercel**：同一 PR SHA Preview READY、filtered source 上傳/Next build/route resolution、Assistant/Expense/File 的 mock provider smoke；不能只接受 CI full checkout。**Production alias 不自動搬動**。
4. **Supabase**：原生 CLI workdir 下 local schema rebuild 對應 SQL 和 RLS、Storage readback、remote `plan/verify` 只讀。危險操作僅保留 main 的現行 GitHub Release 授權，不在本 PR 執行 `sync`／remote mutation。
5. **功能反例**：LINE signature/idempotency；Assistant draft 不能自動寫 Issue；Intelligence 同 requestId 不重跑 provider、failed/UNKNOWN 不自動再呼叫；Contract 一律 SAVE DRAFT、明確 CONFIRM；File error/readback/tenant scope；RLS/DB isolation。
6. **回滾**：在所有刪除前保留已驗證的 git base SHA／前後差異，若 Preview/CI/drift 失敗，回退 **git commit/部署路徑** 到綠燈狀態，不重寫已持久化的 File/Contract/receipt 歷史，也不執行未授權的 remote rollback。

## 真正的 cutover
以上 1–6 全通過後，從 Git **移除根部 `vercel/` 與 `supabase/`**；在同一次提交更新全部可執行引用、native paths、schema topology、metadata、測試和正式 current docs。刪除後再跑**相同完整驗證**，避免「搬過來能跑、移除舊路徑就壞」。無根部 symlink、沒有第二套 native config、沒有 deprecated alias。

## Red gate
任何 required CI 紅燈或 pending、`Merging is blocked`、Preview ERROR、資料／AI 結果不等價、RLS/owner change 或 SQL drift 都是**不合併、不發布**；不能用 skip/test deletion/關 branch protection 達成綠燈。PR #414 是這組 proposal 的規劃提交，不是聲稱已執行上述實作步驟。
