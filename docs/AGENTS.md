# Documentation retrieval contract

Optimize for relevant information per loaded context.

- One file serves one retrieval job. `README` routes only; `AGENTS.md` holds behavior-changing constraints only.
- One fact/rule has one canonical owner; other locations reference it.
- `facts/`, `owners/`, `rules/`, and task routing hold current high-frequency knowledge; `reference/` holds on-demand detail.
- `change/` holds target/proposal/migration/gap/risk/evidence and never overrides current truth.
- Machine semantic/module/data truth lives in `architecture/*.json`; SQL truth in `supabase/schemas/`; do not recopy it into prose.
- Markdown review state lives in `convergence-manifest.json`; use `pnpm docs:convergence <status|next|begin|record|review-skill|complete>`.
- Moves/deletes update inbound references in the same change; no redirect Markdown.
- Documentation changes preserve authorization, transaction, replay/version, isolation, recovery, privacy, and evidence semantics.

Run `pnpm docs:check` after docs changes.
