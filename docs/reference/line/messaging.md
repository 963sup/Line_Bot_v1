# LINE messaging reference

## Messaging delivery

Business transaction 與 LINE reply/push 是不同責任。資料已 commit 後外部訊息失敗，不應回滾已完成 business state；需要可靠投遞時由 durable outbox / retry contract 處理。

平台接受 request 不代表終端裝置已收到訊息。Delivery、手機顯示與 business commit 在 acceptance 中分開驗證。

LINE channel credentials 屬 integration binding；rotation 只更新 credential。若未來出現 autonomous Bot actor use case，必須先由真實 owner 定義 stable identity、grant／delegation 與 scope，而不是從 webhook transport metadata 推導。

## Business flows

Webhook adapter 只做平台解析、驗簽、identity evidence 與 transport。具體 business flow 由 module owner 擁有，例如：

- Attendance workplace chat flow：[Attendance](../../owners/attendance.md)
- Expense receipt intake：[Expense](../../owners/expense.md)
- Rich Menu：`rich-menu.md`

Adapter 不保存第二套 product command/state machine。

## Safety

外部結果未知時不能盲目重送具副作用 message/business command。需要 retry key、lease、stop condition 或 platform-specific window 時，應由對應 integration / operations contract 明確定義。
