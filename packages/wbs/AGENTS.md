# WBS scope

繼承 [packages 約束](../AGENTS.md)。

變更匯入或治理時，分別驗證草稿版本與 Baseline；匯入成功不等於正式發布。

實際公開入口以 [package.json](./package.json) 為準，行為以 [source](./src/) 與 [tests](./test/) 確認。

## WBS import and publication authority

- Project-scoped WBS owns its draft graph, immutable revisions, proposals/reviews, approval policies, published Baselines, events and receipts. Project controls its own membership/lifecycle; Repository is only the source scope for Content provenance, not the WBS aggregate owner.
- Import an authorized, explicitly disclosed, fixed **Content revision** via Content's public reader. Persist `content-wbs-v1` (or a newly versioned mapping), Content revision/version, complete node coverage and source Contract row dispositions in WBS-owned immutable evidence.
- WBS must not parse File, invoke Intelligence, change Contract/Content state, or read a mutable Content head in place of the pinned revision. Its Bootstrap receives the Content reader from Host, and missing wiring must fail closed on import.
- Importing a WBS draft is not Baseline publication. Keep governance/policy/permission checks, review evidence, expected-version, replay and transaction boundaries on the WBS Owner side; do not auto-create Issues.
