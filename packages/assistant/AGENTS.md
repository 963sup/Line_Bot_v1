# @line-work/assistant

- 本 package 擁有 Assistant answer application、Gemini provider adapter 與 issue-intake agent。
- `application/answer-question` 只處理由可信 delivery adapter 已導向 Assistant 的文字輸入；它不取得 client role authority、不直接寫其他 bounded context，也不繞過對方 authorization。
- 明確時間問題使用 injected `now()`；Issue prefix 只委派 `draftIssue` 且不消耗 general-generation cooldown；一般生成維持 500-char input、2000-char output bound、cooldown 與 explicit empty/unavailable semantics。
- `adapters/gemini` 固定使用 Developer API (`vertexai: false`)；共用 probe/runtime guard 為 package-private，不形成通用 provider framework。
- `agents/intake` 只產生 Issue draft；不得指派、持久化、授權或發通知。模型輸出不取代 deterministic business rule。
