# System

## Product

LINE Work Assistant 是 LINE-first 的 Enterprise Workforce & Operations Management system。可信操作者在明確 Enterprise／Organization／Repository／Project 與工作責任下完成協作、任職、出勤、薪資及其他企業營運；Desktop Web 只提高資訊密度，不建立第二套 business authority。

Current owner、lifecycle 與 capability status 由 [Semantic model](../../architecture/semantic-model.json) 擁有；未完成 target / migration / gap 只由 [Governance](../090-governance/README.md) 證明。

## Runtime

```text
LINE / Browser
      ↓
Next.js / Vercel
      ↓
Application / Domain owners
      ↓
Supabase PostgreSQL

External adapters:
LINE · Google · AI provider · Redis · Supabase Auth
```

Provider proof、UI、client state、cache、projection 或 telemetry 都不能反向取代 business authority。

## Mother invariants

1. **Authority**：同一 durable business fact 只有一個 authoritative owner；projection/cache 可失去但 correctness 不變。
2. **Authorization / isolation**：identity proof 不等於 business authorization；mutation 在真正 transition boundary 重新驗證 actor、scope 與 owner policy。
3. **Concurrency / replay**：mutable state 不接受 silent last-write-wins；競爭控制使用 observed version/state，retry 使用 request identity。
4. **Atomicity / recovery**：共同維持 invariant 的 authoritative effects 一起成立；跨 transaction side effect 需要 durable identity、idempotent retry 與 recovery。
5. **Ownership / dependency**：一個責任一個 owner；consumer 只使用 owner public contract。
6. **Evidence integrity**：static、test、build、schema、deployment、API、provider、device evidence 只證明各自範圍。

## Product interaction invariants

- Navigation、page、button、URL 或 provider session 不授權。
- Loading、empty、forbidden、source failure、not-implemented 與 unknown-result 必須可區分。
- External entry 只表示開啟外部服務，不能冒充已提交、核准、付款或同步。
- AI/provider output 先視為 input/draft；正式 business write 仍經 owner validation、authorization 與 transition。
- 未啟用能力不得用 fake data、disabled shell 或文案製造已完成的語意。

Owner-local business rules 讀 [Domain owners](../010-domain-owners/README.md)；runtime implementation 讀 [Architecture](../020-architecture/README.md)。
