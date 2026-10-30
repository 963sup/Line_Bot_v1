# Content scope

繼承 [packages 約束](../AGENTS.md)。

變更計畫或匯入時，核對來源版本與轉換結果；計畫編輯不得回寫來源商務資料。

實際公開入口以 [package.json](./package.json) 為準，行為以 [source](./src/) 與 [tests](./test/) 確認。

## Content work-definition and mapping authority

- Content owns Repository-scoped plan structure, work/task identities, quantities, immutable Content revisions and source-row disposition. It never owns or overwrites Contract commercial facts or WBS Baselines.
- Contract-document import consumes an **authorized CONFIRMED ContractDocument revision**, pins its document/revision and original File/revision/SHA, and saves a complete per-row coverage map plus explicit mapping version in the new Content revision.
- Existing `purchase-order-content-v1` mapping is historical behavior: do not silently alter the algorithm behind the same version. Material/service classification alone is not sufficient evidence of actual engineering work. Any stricter rule must be a newly versioned mapping with explicit review criteria, migration/compatibility and tests; unknown rows must not silently become Tasks.
- Require exact expectedVersion, stable request fingerprint and idempotent replay. A source revision change creates a new mapping result; never rewrite an older Content revision to track the upstream head.
