# Documentation retrieval contract

Inherits the [root contract](../AGENTS.md). Optimize for relevant information per loaded context.

- A document may contain multiple closely related retrieval sections when that reduces duplicate maintenance. `README` routes only; `AGENTS.md` holds behavior-changing constraints only.
- One fact/rule has one canonical owner; other locations reference it.
- Directory names are navigation and migration aids, not mandatory document boundaries. A canonical guide may combine ownership, architecture, runtime, persistence, contract, and acceptance sections; keep a separate file only when it has an independent lifecycle, access boundary, versioned contract, or materially different audience.
- Unresolved work is tracked by owning packages, issues and PRs; it never overrides current truth.
- Machine semantic/module/data truth lives in `architecture/*.json`; SQL truth in `packages/integration-supabase/src/schemas/`; do not recopy it into prose.
- Git owns review/change history; use ordinary review, without a review-state manifest.
- Moves/deletes update inbound references in the same change; no redirect Markdown.

After docs changes, verify local links and run the applicable static checks; this repository has no dedicated `docs:check` script.

## Documentation restructuring policy

When restructuring documentation, do not default to preserving the existing file tree, directory layering, or one-file-per-owner/domain split. Cross-directory merges, section migration, reference updates, renames, and deletion of confirmed redundant files are allowed within the authorized scope.

Different owners, domains, or maintenance responsibilities may be represented as explicit sections in one authoritative guide. Choose independent files based on information completeness, findability, lifecycle, and long-term maintenance cost—not on directory labels, existing links, or historical classification.

Authorized restructuring follows the root autonomy and validation contract; preserve all inherited invariants and verify every affected inbound reference.

## Naming

- 文件與資料夾名稱應協助查找，但名稱相近的規則、事實、reference 與 change 文件可以在確認資訊完整後合併；合併後保留清楚的章節與 README routing。
- 文件命名不重述 machine truth，也不建立平行命名版本。
