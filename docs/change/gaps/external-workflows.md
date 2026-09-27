# External workflow gaps

Rich Menu 目前沿用多個外部 Google Form 入口。這些入口提供低成本操作入口，但不是本系統內已建立的業務 workflow。

## 共通邊界

目前所有外部表單都遵守：

- 開啟表單不等於已提交。
- 表單提交不等於本系統已建立案件、完成核准、付款或修改出勤。
- 不因 Rich Menu 或 URL 存在就宣稱已完成 integration。
- 若未來需要同步，必須先確認外部 source of truth、可信身分關聯、提交 receipt、重送語意與資料保存責任。

## 費用申請

Rich Menu 目前提供既有費用申請表單；Expense module 則是收據資料整理與確認。兩者目前沒有足以宣稱完整 approval / payment workflow 的正式關聯。

若要建立完整流程，需要定案 applicant、reviewer、費用歸屬、approval state、退回、更正、付款證據以及與 Expense 的可信關聯。

## 請假申請

目前只提供既有請假表單入口。本系統尚未據此定義請假資格、排班影響、核准者、核准狀態或 attendance 變更規則。

在正式 workforce / leave contract 建立前，請假表單只能被描述成外部入口。

## 現場稽核、異常回報、改善處理

三項目前都沿用外部表單：

- 現場稽核：收集現場觀察。
- 異常回報：收集具體問題事實。
- 改善處理：收集改善相關資訊。

目前沒有足以宣稱完整 case management 的正式 contract。若要建立案件流程，至少需要：

1. 正式 case ID 與 source of truth。
2. reporter / receiver / assignee / accepter responsibility。
3. 提交、承接、更新、回報完成、退回／驗收、必要重開的 state transition。
4. 附件、時間、多人資訊是否屬於同一案件的明確規則。
5. 撤權、取消、重送與未知結果處理。
6. 通知接收者、觸發、去重與停止條件。

不能因三個表單名稱看起來連續，就自動把不同提交合併成同一案件。

## 完成條件

某個外部入口只有在以下條件成立後才移出本 gaps 文件：

- 對應 module owner 已建立正式 contract，或明確決定永遠只作外部入口。
- 真實手機入口、外部提交／取消與資料結果已驗證。
- 若有同步，已驗證身分、授權、重送、失敗恢復與資料保存。
- 文件不再使用「入口存在」作為「流程完成」的證據。
