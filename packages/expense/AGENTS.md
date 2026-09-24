# @line-work/expense

- 本 package 擁有 Expense domain、application、ports、receipt contract 與 receipt-recognition agent。
- Expense OCC revision、terminal idempotency、owner/scope identity、receipt intent、recognition cooldown 與 final transactional revision recheck 不得回流 horizontal `domain` / `application` / `contracts`。
- `agents/receipt` 只輸出不可信的 receipt reading；不得入帳、授權、持久化圖片 bytes 或把 uncertain field 猜成正式值。
- 保留 5MB image bound、schema validation、no-tool/no-retry behavior、timeout/cancellation 與 missing-over-guessing semantics。
- PostgreSQL implementation 目前仍在 legacy Infrastructure；移動 adapter 前必須保留 active-member transaction recheck、owner isolation、revision OCC、receipt-intent atomicity、event/audit persistence 與 runtime RLS boundary。

- Legacy persisted `body.project` is compatibility-only historical data, not a current Project reference or Expense-owned Project authority. New Expense commands must not author or require it; a future Project relationship must use the Project owner's explicit reference contract.
- Account supplies current User qualification facts to the PostgreSQL adapter; Expense translates qualification failure into `ExpenseError` and does not manufacture Account domain errors.
