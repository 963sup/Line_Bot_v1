# GitHub integration scope

Release semantics 見 [Release](../docs/reference/operations/release.md)；Supabase provider semantics 見 [Supabase](../docs/reference/platform/supabase.md)；Vercel provider semantics 見 [Vercel](../docs/reference/platform/vercel.md)。

- `.github/` 只擁有 GitHub integration：workflow trigger、permissions、checkout/setup、affected-source routing、GitHub evidence 與 repository collaboration metadata；不擁有產品或 provider 內部規則。
- Workflow 保持 thin adapter：優先呼叫 root canonical commands，不在 YAML 重寫 lint、architecture、test、build 或 provider business logic。
- `validate.yml` 只做 repository validation；`release.yml` 只在 successful same-repository current-`main` validation 後編排 external convergence。
- `release_plan` 是 read-only Release router。它必須先確認 validated SHA 仍是 current `main`，再以各 external owner 最近一次成功 job 的 ancestor SHA 作獨立 baseline；不得因另一 owner failure 共用或前進錯誤 cursor。
- Supabase 每個 validated `main` 都先執行 `schema:remote repair`；該 owner baseline 之後若 affected `supabase/schemas/*.sql`，執行 plain `schema:remote sync`，否則執行 `schema:remote verify`。Production mutation 只由 GitHub Actions Release 授權，且 migration history fingerprint before/after 必須完全相同。
- Web deployment 只在 `@line-work/web#build` 真正受 pending deployment changes 影響時執行。Vercel Production 仍必須等待 Supabase current-contract convergence，因 Web runtime 依賴 database contract；這是實際 runtime dependency，不是 global release ordering。
- Rich Menu publication baseline 獨立於 Supabase/Vercel。Rich Menu desired state changed 且沒有 pending Web runtime dependency時，直接由 validated current `main` publish；若同一 pending change 需要新 Web runtime，才等待 exact SHA Vercel deployment 成功後 publish。
- Rich Menu publication-only source 是 `assets/line/rich-menu/**`、`apps/web/src/modules/assistant/rich-menu/definition.ts`、`desired-state.server.ts`。這些來源本身不得因位於 Web package 就被誤判成必須部署 Web runtime。
- Supabase Production mutation只使用 repository-owned `schema:remote repair|sync`；本機與任意 branch production mutation禁止。所有 database mutation由 provider operation script 的 advisory lock序列化。
- Vercel Production mutation只能經 canonical `vercel:deploy:production` adapter；provider mutation前由 GitHub readback證明 adapter 位於同 SHA 的 active Release，且 `release_plan` 已成功。跨 provider dependency由 Release graph 擁有，不由 Vercel adapter硬編碼。
- Validation workflow維持 read-only、secret-free、credential-free。External mutation secret只放實際需要的最小 step `env`；checkout不 persist credentials。
- Artifact只保存該 run 的操作 evidence，不成為 acceptance index 或 business truth。
- Workflow只因 trigger／permission／external-effect boundary不同而拆分；只有真實多 consumer且 input/permission contract一致才抽 reusable workflow。
- 修改 workflow後跑 `tooling:check` 與相關 tests；若改動受 guard保護，同步 `scripts/tooling/check-tooling.mjs` 的 positive／violating／repaired cases。
