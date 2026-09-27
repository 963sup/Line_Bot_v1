# Four-model cutover validation — 2026-09-14

本輪涵蓋當時的 User/Organization/Enterprise/Organization-scoped Team cutover。結果來自含未提交修改的 working tree，因此不是 current main 或 current remote acceptance。

## Retained result

第一次完整 validation 到 Web tests 時出現多個 503 / fixture mismatch。共同來源包含 Web composition fixture 仍注入舊 identity store、UI lifecycle vocabulary 與 current contract 不一致，以及相關 assertion 尚未同步。

修正 owner/consumer 接線後，同日重新執行完整 repository validation：

- Web 主測試 65/65。
- Application 40/40。
- Infrastructure 91/91。
- Typecheck、architecture、deadcode 與 Next.js production build 通過。

本輪保留的工程結論只有：

- replay 不取代 current authorization；
- lifecycle/version 變化必須使舊 qualification 失效；
- owner rename/cutover 必須追到 composition、fixture、tests 與 dependency guards；
- immutable historical wire/receipt 與 current domain vocabulary 必須分開；
- 多個入口同時失敗時先追共同 composition/dependency，不逐 endpoint patch。

## Boundary

這是 dated repository validation，不是 current Supabase、deployment、LINE device 或 business acceptance。原始 console logs 與 hash 已移出 working tree；需要稽核時由 Git history 取得。
