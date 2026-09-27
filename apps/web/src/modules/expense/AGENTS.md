# Web expense module

## GitHub Mobile 目標（後續實作）

- Expense detail 依「收據/來源 → 辨識草稿 → 待核對欄位 → 明確確認 → 結果」呈現；主要動作留在內容結尾或不遮擋內容的操作區。
- 人工修改、信心不足、版本衝突與 unknown result 就地區分；confirmed 只代表該 owner 契約，不使用讓人誤會已付款/入帳的標章。
- FPT billing 不是 Expense 對等能力；不因 Mobile 模板而建立未實作的費用首頁列表或 admin 報表。

## 現行 surface 與 invariant

Current URL：`/expenses`；API `/api/expenses/{id}`。FPT 無本產品 Expense 直接等價 owner；不要映射為 GitHub billing。

`/admin/expenses` 是未開放頁面，不宣稱已具備 Expense 管理查詢。保留 receipt intent、revision/conflict 與 unknown result；confirmed Expense 不等於付款、核准或正式會計入帳。

- Owns expense and receipt presentation; Expense owner controls receipt intent, recognition confidence, revision and final command.
- AI recognition is a draft/read result; UI confirmation must still invoke owner authorization and transactional revision checks.
- Never treat uploaded bytes, card rendering or client amount/category as posted ledger facts.
