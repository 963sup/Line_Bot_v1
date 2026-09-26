# GitHub integration scope

Release semantics 見 [Release](../docs/070-operations/020-release.md)；Supabase provider semantics 見 [Supabase](../docs/030-platform/020-supabase.md)；Vercel provider semantics 見 [Vercel](../docs/030-platform/040-vercel.md)。

- `.github/` 只擁有 GitHub integration：workflow trigger、permissions、checkout/setup、affected-source routing、GitHub evidence 與 repository collaboration metadata；不擁有產品或 provider 內部規則。
- Workflow 保持 thin adapter：優先呼叫 root canonical commands，不在 YAML 重寫 lint、architecture、test、build 或 provider business logic。
- `validate.yml` 只做 repository validation；`release.yml` 只在 successful same-repository current-`main` validation 後編排 external convergence；`supabase-replace.yml` 只承接 manual business-data cutover/reviewed-plan 流程，不取得 Web deployment ownership。
- Release routing 必須維持：每個 validated `main` 先執行 `schema:remote repair` 恢復 metadata-free runtime compatibility；affected `supabase/schemas/*.sql` → `schema:remote sync`；schema unchanged → `schema:remote verify`；Supabase 成功後才允許 exact validated SHA 的 Vercel Production；Rich Menu 再依 affected source 於 deployment 成功後處理。
- Automatic 與 manual Supabase jobs 共用 production resource concurrency；所有 repository-owned database mutation 另由 provider operation script 的 database lock 序列化。
- Vercel Production mutation 只能經 canonical `vercel:deploy:production` adapter；provider mutation 前必須由 GitHub readback 證明 adapter 位於同 SHA 的 active Release，且 `gate`／`supabase` jobs 已成功。
- Affected-source cursor 只接受先前整體 `conclusion=success` 的 same-repository `Release <validated-sha>`，且該 SHA 必須是 current validated SHA 的 git ancestor。任何 downstream external-effect failure 都不得前進 cursor；沒有合格 baseline 時才使用 empty tree。
- Validation workflow 維持 read-only、secret-free、credential-free。Draft → Ready 是 merge-candidate full-validation intent：`ready_for_review` 對 exact PR head 跑 `pnpm validate`；一般 Ready PR synchronize 保留 `pnpm check` fast feedback，head 改變後必須重新 Draft → Ready 才取得新 revision 的 full validation。External mutation secret 只放實際需要的最小 step `env`；checkout 不 persist credentials。
- Artifact 只保存該 run 的操作 evidence，不成為 acceptance index 或 business truth。
- Workflow 只因 trigger／permission／external-effect boundary 不同而拆分；只有真實多 consumer 且 input/permission contract 一致才抽 reusable workflow。
- 修改 workflow 後跑 `tooling:check` 與相關 tests；若改動受 guard 保護，同步 `scripts/tooling/check-tooling.mjs` 的 positive／violating／repaired cases。
