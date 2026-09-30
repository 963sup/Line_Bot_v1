# Current schema source

## Governing files

本 scope 修改前仍必須遵守 root `AGENTS.md#Mandatory governing set`，尤其是以下 current authority / guard：

`architecture/README.md` · `architecture/data-topology.json` · `architecture/implementation-topology.json` · `architecture/domain/fpt/*.json` + `architecture/domain/fpt-source.json` · `architecture/semantic-model.json` · `.dependency-cruiser.mjs` · `biome.json` · `knip.jsonc`

Local code、workflow、schema 或 guard 不得繞過、弱化或重定義這些 governing inputs；若發生 violation，先修真正 Owner / Truth / Boundary / Dependency。

- 本目錄只擁有 current declarative PostgreSQL structure；每個 `.sql` 必須含 current executable SQL。歷史／migration／proposal／future filename reservation 不得回流成第二套 current state。
- 物件切分以 [README](README.md) 的 Object / Relationship tree 為導航；真正 owner 由 `architecture/data-topology.json#relations` 機械判定。
- 檔名數字只是 lexical dependency/navigation，不是 owner。新增或搬移 relation 時先用 semantic concept、consumer contract、data-topology mapping 與 package owner 證明 authority，再選最接近的既有區段；不要為了美觀重排號碼。
- 每個 authoritative relation 只屬於一個 semantic owner；authoritative file 不得混 owner。必要 FK 可以跨 owner reference，但 reference 不轉移 authority。
- Authoritative relation 的 table/view/function、index、trigger、RLS policy 與 grant 預設跟隨同一 authority file；只有真正跨 owner 的 projection、invariant、transaction coordinator 或 access surface 才放入 `900–930`。
- `900_cross_owner_projections.sql` 只產生 read-only projection；`910_cross_owner_constraints.sql` 只做跨 owner DB invariant；`920_transaction_coordinators.sql` 只做必須同 transaction 的 coordination；`930_access_enforcement.sql` 只做 cross-owner RLS/grant/executable surface。四者都不得存新的 business fact。
- 搬移或拆檔必須保持 relation/function/trigger/constraint/RLS/grant semantics；若 business model 本身要變，必須同時更新 semantic authority、consumer contract、tests 與 reconciliation evidence，不得靠檔名掩蓋。
- 新增 relation 前先證明 current semantic concept、owner、consumer 與 persistence necessity；沒有 durable fact 就不新增 table。
- Future target、reserved namespace、預想 owner/file name 不得建立 `.sql` placeholder 或 `architecture/data-topology.json#files` entry；未使用的 lexical prefix 直接留空。Target design / migration state 放 `docs/change/` 或 owner docs。
- Schema change 完成後至少跑 `pnpm schema:check`、`pnpm architecture`、`pnpm check`；remote claim 另需 target `plan/sync/verify` readback。
