# Documentation retrieval contract

Optimize for relevant information per loaded context.

- One file serves one retrieval job. `README` routes only; `AGENTS.md` holds behavior-changing constraints only.
- One fact/rule has one canonical owner; other locations reference it.
- `facts/`, `owners/`, `rules/`, and task routing hold current high-frequency knowledge; `reference/` holds on-demand detail.
- `change/` holds target/proposal/migration/gap/risk/evidence and never overrides current truth.
- Machine semantic/module/data truth lives in `architecture/*.json`; SQL truth in `packages/integration-supabase/src/schemas/`; do not recopy it into prose.
- Git owns review/change history; use ordinary review and `pnpm docs:check`, without a review-state manifest.
- Moves/deletes update inbound references in the same change; no redirect Markdown.
- Documentation changes preserve authorization, transaction, replay/version, isolation, recovery, privacy, and evidence semantics.

Run `pnpm docs:check` after docs changes.

## Naming

- 文件與資料夾名稱表達唯一 retrieval job；README 只作 routing，規則、事實、reference 與 change 不因名稱相近而互相取代。
- 移動或改名必須同一變更更新 inbound references；不建立 redirect Markdown 或平行命名版本。文件命名不重述 machine truth。
