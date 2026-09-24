# Expense

Expense 目前處理收據辨識後的支出資料整理、人工核對與確認，不是完整費用申請、審批、付款或會計入帳系統。

## State and operations

`pending -> draft -> confirmed`，未結束狀態也可進終態 `cancelled`。`confirmed` 只表示 Expense owner 已確認本系統欄位，不等於主管核准、付款或正式入帳。

正式 command 為 `save | confirm | cancel`。寫入帶 current `revision`；stale revision 拒絕。`confirmed`/`cancelled` 為終態；exact retry 可安全回 current result，不再產生第二 transition。

## Data semantics

Expense 保存 owner、scope、receipt image reference、revision 與支出欄位。Money 使用 decimal string，避免浮點數作正式財務值。`advance | company | unpaid` 是欄位，不是後端付款 evidence。

`project` 目前只是支出欄位；專案文字、LINE groupId、TeamId、OrganizationAccountId 或其他 identifier 不能互換成 authorization scope。

## External expense form boundary

LINE Rich Menu 另有外部費用申請 Google Form 入口。開啟／提交外部表單不會自動改 Expense state。若未來建立 apply/review/approve/pay 流程，必須另定 applicant/reviewer/payer responsibility、state machine、source of truth 與可信 mapping；在此之前不能把 `confirmed` 顯示成「已核准／已付款」。

## Adjacent owners

- [Rich Menu](../030-platform/010-line.md)
- [Security](../050-security/README.md)
- [External workflow gaps](../090-governance/040-gaps/030-external-workflows.md)


## Receipt intake from LINE

Receipt intake 把 LINE chat 中一張明確授權的圖片轉成 Expense draft。LINE transport、AI extraction 與 Expense confirmation 是不同責任；任何一步都不能冒充下一步已完成。

## Intake window

Active Member 以明確記帳意圖開啟短效收件窗口；窗口綁定 channel / group context 與 Member。下一張符合條件的圖片原子消耗窗口並建立一筆 Expense source record。

- 一般圖片不下載、不送 AI、不建立 Expense。
- 相同 scope / owner / image source 不重複建立第二筆。
- 群組只回傳安全操作入口，不在聊天中保存完整財務資料。

## Expense page

操作頁重新核驗目前 Member，並確認本人是該 Expense owner / 合法 scope 後才讀取。

圖片辨識只有在使用者明確按「辨識」後才進行；AI 只產生 draft reading。使用者核對 merchant、amount、currency、date、invoice number、project、payment 等欄位後，才可保存／確認／取消。

## State boundary

- OCR / model result ≠ formal Expense record update。
- `confirmed` 只表示收據整理資料已確認，不等於會計入帳、費用核准或付款完成。
- save / confirm / cancel 不需要再呼叫模型，也不因成功就自動在群組發布財務內容。
- terminal state 與 revision semantics 由 本文 擁有。

## Data and privacy

圖片 bytes 僅在必要處理期間使用，不因 intake 自動成為永久公開檔案。Image reference、Expense owner/scope、version 與必要 audit 由 durable store 保存；取消不是任意刪除歷史證據。

模型輸入限制、圖片大小／格式／timeout 與安全條件由 implementation / AI integration 驗證；文件整理不得移除這些防護。

## Transaction and messaging

收件窗口消耗與 Expense 建立需要原子化，避免同一窗口／圖片重複建單。

Business transaction 與 LINE reply 是不同 transaction：

- Expense 已成功建立但 LINE reply 失敗，不表示資料未建立。
- 外部結果未知時先查 durable result，不盲目重新建立 Expense 或再次送具副作用操作。
- LINE transport replay 不取代 Expense revision / idempotency。

## Adjacent owners

- Expense state / fields：本文
- AI cost / provider behavior：`../../../030-platform/060-ai.md`
- LINE webhook：`../../../030-platform/010-line.md`
- Persistence / replay：`../../../040-data/040-transaction-and-idempotency.md`
