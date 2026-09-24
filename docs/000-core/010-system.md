# System

## Product

LINE Work Assistant 讓可信使用者從 LINE 為主的行動入口，在明確 Enterprise／Organization 與工作責任下完成協作、任職、出勤、薪資與企業營運。Desktop Web 提高資訊密度，但不建立第二套 business authority。

Current source 已有 Account/User、Enterprise／Organization governance、Organization-scoped Team、Repository/Issue、Attendance、Expense、Notifications、Partners、DailyCheckIn、Asset/Wallet/Ledger 與 Assistant 等 owner。Workforce／Employment、Attendance Employment cutover 與正式 Payroll 仍有未完成 slice；future/change 狀態只由 Governance 證明。

## Runtime

```text
LINE / Browser
      ↓
Vercel Next.js Web + API
      ↓
Application / Domain
      ↓
Supabase PostgreSQL

External adapters:
LINE · Google · AI provider · Redis · Supabase Auth
```

External proof、UI、provider session、cache 或 projection 都不能反向取代 business authority。

## Mother invariants

1. **Authoritative truth**：同一 durable business fact 只有一個 authority；cache/projection 可失去但不得改變 correctness。
2. **Authorization / isolation**：identity proof 不等於 business authorization；mutation 在真正 transition boundary 重新驗證 actor、scope 與 owner policy。
3. **Concurrency / replay**：mutable state 不接受 silent last-write-wins；需要競爭控制時使用 observed version/state，retry 使用 request identity。
4. **Atomicity / recovery**：共同維持 invariant 的 authoritative effects 一起成立；跨 transaction side effect 需要 durable identity、idempotent retry 與 recovery。
5. **Ownership / dependency**：一個責任一個 owner；consumer 只走 owner public contract。
6. **Evidence integrity**：static、test、build、schema、deployment、API、device evidence 只證明各自範圍。

## Product interaction rules

- Navigation/page/button/URL 不授權。
- Loading、empty、forbidden、source failure、not-implemented 與 unknown-result 必須可區分。
- External entry 只表示「開啟外部服務」，不能冒充已提交、核准、付款或同步。
- 未啟用能力不得以假資料或空殼操作製造完成感。

具體 business rule 由 [Domain owners](../010-domain-owners/README.md) 擁有；runtime implementation 見 [Architecture](../020-architecture/README.md)。
