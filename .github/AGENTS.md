# GitHub integration scope

Release semantics見 [Release](../docs/reference/operations/release.md)；provider semantics見 [Supabase](../docs/reference/platform/supabase.md) 與 [Vercel](../docs/reference/platform/vercel.md)。

## Owner / boundary

- `.github/` 只擁有 GitHub trigger、permissions、concurrency、checkout/setup、job dependency/routing、secret injection boundary、artifact與 GitHub evidence。
- Workflow/job 名稱不建立 owner；產品規則、schema/deployment/recovery、LINE publication與其他 owner-local implementation 留在真正 owner。
- 跨 provider dependency 必須來自 consumer contract，不因同一 Release event 建立順序。

## Thin workflow

YAML 只保留 trigger/permission/concurrency、setup、`needs`/`if`、最小 secret injection、canonical command與 GitHub-native evidence plumbing。Baseline selection、changed-file classification、provider reconciliation/recovery、loops/complex parsing與 business/auth policy 必須在可測試 owner command；已有 canonical assertion 時 workflow 不重寫。

## Release invariants

- `validate.yml` 只做 repository validation；`release.yml` 只在 successful same-repository current-`main` validation 後收斂 external state。
- Supabase：每個 validated `main` 先 `schema:remote repair`；schema changed → `sync`，unchanged → `verify`；remote mutation只允許 validated-main Release，migration history before/after不變。
- Web：只有 `@line_bot_v1/web#build` pending runtime change才部署；需要 database contract時保留 Supabase edge。
- Attendance scheduler：只由 `pnpm attendance:scheduler reconcile` 收斂；等待 Supabase，pending Web runtime時再等待 exact-SHA Vercel。缺 worker credential、target/readback不一致均 fail closed；YAML不重寫 cron/Vault logic。
- Rich Menu cursor獨立於 Supabase/Vercel；publication-only change直接 publish，只有需要新 Web runtime才等待 exact-SHA deployment。Definition/publication transaction仍由 Web Rich Menu module擁有。
- Vercel mutation前需要 exact target/SHA、active Release authorization與 provider readback。
- 每個 external mutation前保留 current-main / exact-SHA guard。

## Security / evidence

Validation維持 read-only、secret-free、credential-free。External secret只注入需要它的 step；checkout不 persist credentials。Artifact只保存該 run evidence，不成 acceptance/business truth；owner success不可冒充其他 owner或 device/business acceptance。

## Validation

Workflow change跑 `tooling:check` 與相關 owner tests；GitHub guard只驗 integration boundary/canonical wiring，owner behavior由 owner-local tests驗。
