# Persistence model

## Responsibility

Durable business truth、ephemeral coordination、projection/cache 必須分責。

```text
Domain / Application
        │
        ├─ Authority    → PostgreSQL / Supabase
        ├─ Coordination → Redis（只在已採用的短期 claim/cache 用途）
        └─ Projection   → 可重建 read model / cache
```

PostgreSQL 保存需要 constraint、transaction、concurrency control、authorization/isolation 與 auditability 的 authoritative facts。Redis/cache 遺失最多影響 latency / availability，不得改變 business correctness。Projection 若能重建，就不是第二份 writable authority。

Aggregate / Domain model 不等於 table model；一致性邊界由「哪些 invariants 必須一起成立」決定。跨 owner database object 只有物理必要時才提升到 cross-owner schema layer。

Transaction / replay 詳見 [Transaction and idempotency](040-transaction-and-idempotency.md)；current SQL truth 見 [Schema model](030-schema-model.md) 與 `supabase/schemas/`。
