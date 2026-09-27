# Documentation retrieval contract

Optimize for relevant information / loaded context.

- One file serves one primary retrieval job; information not usually needed in the same decision belongs in another unit.
- `README` is routing only. `AGENTS.md` contains behavior-changing constraints only.
- High-frequency docs preserve why, invariant, dangerous assumption and decision; reliable code/manifest/schema/config facts are linked, not recopied.
- One fact/rule has one canonical owner; other locations use pointers.
- Current knowledge lives in `facts/`, `owners/`, `rules/`, task routing and machine sources. Detailed low-frequency knowledge lives in `reference/`.
- Target/proposal/migration/gap/risk/dated evidence live in `change/`; they never override current truth.
- Do not create redirect/alias Markdown when moving knowledge. Fix all references in the same change.
- Machine semantic/module/data truth: `architecture/semantic-model.json`, `implementation-topology.json`, `data-topology.json`; actual SQL: `supabase/schemas/`.
- Documentation refactors must not weaken authorization, transaction, replay/version, tenant isolation, recovery, privacy or evidence semantics.

After docs changes run `pnpm docs:check`; repository-level completion follows root `AGENTS.md`.
