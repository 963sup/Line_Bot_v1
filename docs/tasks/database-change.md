# Change database state or schema

## Load

- affected owner contract
- [database write rules](../rules/database-writes.md)
- 只有需要 preserved business data / remote cutover 時再讀 Supabase/recovery reference

## Decide

1. 這是 current DDL、Data Boundary change、還是 data transform？
2. Relation authority owner是誰？
3. 哪些 invariants必須同 transaction成立？
4. RLS/grants/tenant isolation是否保持？
5. Remote operation是否需要 business metadata或 recovery authorization？

## Execute

修改 `supabase/schemas/`；ownership/mapping改變才同步 `architecture/data-topology.json`。Runtime writer仍走 owner use case/adapter。

## Validate

`pnpm schema:check` → `pnpm check`。Remote convergence另用 release / authorized `schema:remote` readback，不以 local success冒充。
