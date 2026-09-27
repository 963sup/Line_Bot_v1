# Database write rules

修改 PostgreSQL 前只載入本文件 + affected owner contract；SQL細節再按需讀 schema reference。

## Authority

```text
semantic-model
→ data-topology
→ supabase/schemas/*.sql
→ owner adapter / use case
```

- `supabase/schemas/` 是 current declarative DDL；migration history不是 current authority。
- Authoritative relation恰好一個 semantic owner；cross-owner mechanism不能取得 business truth。
- Domain model不等於 table model；transaction boundary由必須一起成立的 invariants決定。

## Write invariants

- Authoritative state change透過 owner use case / adapter；runtime不因共用 DB connection取得其他 owner mutation authority。
- Authorization、qualification、expected version、request replay與共同 effects需要在真正 transaction boundary重驗／提交。
- Same request identity只能 exact replay；不同 fingerprint共用 ID拒絕。
- Long external API call不放在 DB lock內；business commit後的 external effect需要 durable expectation + idempotent retry/readback。
- RLS/grants為 defense in depth；不得用 schema change放寬 tenant/data isolation。

## Workflow

```text
identify owner + invariant
→ edit declarative schema / owner adapter
→ update data-topology if ownership/mapping changes
→ pnpm schema:check
→ pnpm check
→ remote reconciliation only through release/authorized operation
```

Data transform / preserved business rows不是純 DDL；需要獨立 cutover/recovery procedure。
