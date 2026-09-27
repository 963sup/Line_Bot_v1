# GitHub integration scope

Release semantics 見 [Release](../docs/reference/operations/release.md)；Supabase provider semantics 見 [Supabase](../docs/reference/platform/supabase.md)；Vercel provider semantics 見 [Vercel](../docs/reference/platform/vercel.md)。

## Ownership

- `.github/` 只擁有 GitHub integration：workflow trigger、permissions、concurrency、checkout/setup、job dependency wiring、affected-source routing contract、GitHub evidence、secret injection boundary、artifact wiring 與 repository collaboration metadata。
- `.github/` 不擁有產品 Domain rule、provider transaction semantics、schema reconciliation algorithm、deployment recovery、LINE publication transaction 或其他可由 owner-local test驗證的 implementation。
- Workflow/job 名稱不是 ownership evidence；跨 provider dependency 必須能對應到真實 consumer contract，不能因為同一 Release event 就建立順序。

## Thin workflow rule

Workflow 是 adapter，不是 implementation module。YAML 允許：

- trigger / permission / concurrency
- checkout / runtime setup
- job `needs` / `if` wiring
- minimal secret injection
- canonical command invocation
- artifact upload / GitHub-native evidence plumbing

Workflow 不應內嵌可獨立測試的：

- 多步 Git history traversal
- baseline selection algorithm
- changed-file classification
- path-policy routing
- complex parsing / loops / branching
- provider-specific reconciliation / recovery
- business or authorization policy

若上述 logic 出現，先確認真正 Owner 與 Source of Truth，再由 workflow 呼叫該 owner 的 canonical executable entrypoint；不得只把 Bash 原封不動搬到新 wrapper。

Trivial fail-closed assertion（例如 exact SHA 仍為 current `main`）可保留在 workflow，前提是它不形成第二套 policy truth；若相同 assertion已有 canonical owner command，優先呼叫 owner command。

## Release

- `validate.yml` 只做 repository validation；`release.yml` 只在 successful same-repository current-`main` validation 後編排 external convergence。
- Affected-source routing 的 policy authority 在 GitHub integration；若 routing algorithm 已超過 thin adapter responsibility，executable implementation 必須移到經 evidence 證明的 operation owner，workflow只消費其 machine-readable result。
- Supabase 每個 validated `main` 都先執行 `schema:remote repair`；affected `supabase/schemas/*.sql` → plain `schema:remote sync`；schema unchanged → `schema:remote verify`。Production mutation 只由 GitHub Actions Release授權，且 migration history fingerprint before/after 必須完全相同。
- Web deployment 只在 `@line-work/web#build` 真正受 pending runtime changes 影響時執行。Vercel Production若依賴 current database contract，可保留 Supabase convergence edge；此 edge必須由 consumer dependency證明，不是 global publication order。
- Rich Menu publication cursor 獨立於 Supabase/Vercel。Publication-only change直接 publish；只有同一 pending change需要新 Web runtime時才等待 exact SHA Vercel deployment。
- Rich Menu definition / desired state / publication transaction 的真正 owner 維持在 Web Rich Menu module；`scripts/line/rich-menu/sync.ts` 只是 CLI execution adapter。
- Vercel provider mutation前仍需 exact target、exact SHA、active Release authorization 與 readback；provider semantics由 Vercel operation owner維護，不在 YAML重寫。

## Security / evidence

- Validation workflow維持 read-only、secret-free、credential-free。External mutation secret只放實際需要的最小 step `env`；checkout不 persist credentials。
- Artifact只保存該 run 的操作 evidence，不成為 acceptance index 或 business truth。
- 每個 external mutation前的 current-main / exact-SHA防護屬 Essential Complexity；可收斂 implementation，但不可刪除 invariant。
- Workflow只因 trigger／permission／external-effect boundary不同而拆分；只有真實多 consumer且 input/permission contract一致才抽 reusable workflow。

## Validation

修改 workflow後跑 `tooling:check` 與相關 owner tests。Tooling guard只應驗 GitHub integration boundary與 canonical command wiring；owner behavior由 owner-local tests驗，不在 `check-tooling` 複製第二套 implementation truth。
