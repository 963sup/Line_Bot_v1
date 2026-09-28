# System invariants

任何 refactor、feature、bug fix都必須保持：

1. **Authority**：一個 durable business fact只有一個 authoritative owner；cache/projection loss不改 correctness。
2. **Authorization / isolation**：identity proof不等於 business authorization；mutation在真正 transition boundary重驗 actor、scope、policy。
3. **Concurrency / replay**：mutable state不接受 silent last-write-wins；使用 observed version/state與 stable request identity。
4. **Atomicity / recovery**：共同維持 invariant 的 authoritative effects一起成立；跨 transaction side effect需要 durable identity、idempotent retry與 recovery/readback。
5. **Ownership / dependency**：一個 responsibility一個 owner；consumer只用 owner public contract。
6. **Evidence integrity**：static、test、build、schema、deployment、provider/API、device evidence只證明各自範圍。

另外：
- page、URL、button、provider session不授權；
- not-found / forbidden / source failure / not-implemented / unknown-result不可混成同一結果；
- AI/provider output是 input/draft，正式 write仍經 owner validation/authorization；
- 未啟用 capability不能用 fake data或 disabled shell冒充完成。
