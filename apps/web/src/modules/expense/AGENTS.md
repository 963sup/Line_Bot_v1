# Web expense module


## 現行 surface 與 invariant

Current URL：`/expenses`；API `/api/expenses/{id}`。FPT 無本產品 Expense 直接等價 owner；不要映射為 GitHub billing。

`/admin/expenses` 是未開放頁面，不宣稱已具備 Expense 管理查詢。保留 receipt intent、revision/conflict 與 unknown result；confirmed Expense 不等於付款、核准或正式會計入帳。

- Owns expense and receipt presentation; Expense owner controls receipt intent, recognition confidence, revision and final command.
- AI recognition is a draft/read result; UI confirmation must still invoke owner authorization and transactional revision checks.
- Never treat uploaded bytes, card rendering or client amount/category as posted ledger facts.

- Legacy Expense `project` JSON may exist in stored historical rows, but Web must not expose or edit it as a current Project. Project is a separate planning owner and remains inactive in this surface until a real Project reference contract exists.
