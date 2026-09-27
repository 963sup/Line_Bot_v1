# Atomic declarative schema / remote convergence evidence

日期：2026-09-18。Revision：`30eaa741048799b62a2704da163334e2f5297ef8`。本 evidence 使用 retired Supabase environment，只保留仍有 recovery / regression 價值的 convergence 結論。

## Retained result

- Declarative SQL 依 owner / dependency 重排；跨 owner constraint/projection 留在 cross-owner tail，不把 file 當 business owner。
- Repository `pnpm validate` 在該 revision 通過。
- Remote readback 發現 Permission schema/literal 落後於當時 runtime contract；preflight 證明既有 rows 可無損轉換。
- Data-preserving transaction 將 Permission columns/constraints/literals 與相關 function contract 收斂到當時 current naming。
- Cutover 沒有建立 compatibility view、alias 或 dual-write，也沒有放寬 RLS/grants/authorization。
- Post-sync readback 驗證 row counts、constraints/functions、runtime role visibility 與 legacy literal removal。
- Database readback、repository validation、Vercel deployment、LINE device/business acceptance 分開；本 evidence 沒有宣稱後兩者完成。

## Boundary

Current desired schema 只由 `supabase/schemas/` 擁有。這份 2026-09-18 remote evidence 不得用來推導目前 operational target、目前 row counts 或目前 remote parity。

原始 provider identifiers、deployment ID、advisor snapshot、row counts 與逐項 catalog output 已從 working tree 蒸餾；需要稽核時由 Git history 取得。
