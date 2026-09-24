# Current schema source

- 本目錄只擁有 current declarative PostgreSQL structure；歷史／migration／proposal 不得回流成第二套 current SQL。
- 物件切分以 [README](README.md) 的 Object / Relationship tree 為導航；真正 owner 由 `architecture/data-topology.json#relations` 機械判定。
- 每個 authoritative relation 只屬於一個 semantic owner；authoritative file 不得混 owner。必要 FK 可以跨 owner reference，但 reference 不轉移 authority。
- `900_cross_owner_projections.sql` 只產生 read-only projection；`910_cross_owner_constraints.sql` 只做跨 owner DB invariant；`920_transaction_coordinators.sql` 只做必須同 transaction 的 coordination；`930_access_enforcement.sql` 只做 cross-owner RLS/grant/executable surface。四者都不得存新的 business fact。
- 搬移或拆檔必須保持 relation/function/trigger/constraint/RLS/grant semantics；若 business model 本身要變，必須同時更新 semantic authority、consumer contract、tests 與 reconciliation evidence，不得靠檔名掩蓋。
- 新增 relation 前先證明 current semantic concept、owner、consumer 與 persistence necessity；沒有 durable fact 就不新增 table。
- Schema change 完成後至少跑 `pnpm schema:check`、`pnpm architecture`、`pnpm check`；remote claim 另需 target `plan/sync/verify` readback。
