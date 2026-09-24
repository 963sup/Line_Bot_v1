# Audit

## Purpose

Audit 用來回答受控的「誰在何時對哪個 business object 做了什麼、結果為何」，不建立一個可以繞過原資料 authorization 的全域讀取後門。

## Minimal content

Audit / command history 只保存追溯需要的 actor、scope、action、target identifier、server time、result、reason/version 與必要受控摘要。Token、secret、完整原始聊天、精確定位或不必要私人正文不因「audit」名義自動保存。

## Access

能讀 audit 不代表能讀原 business object、附件或秘密。來源 object 的 authorization 仍需獨立驗證；直接 link 也不能增加權限。

## Immutability

需要追溯的 command receipt、revision、event history 應採 append-only 或受控版本化；runtime 不取得任意 update/delete audit history 的能力。

同一 business command replay 不應顯示成第二次狀態變更；transport retry / delivery status 與 business event 需分開。

## Retention

Audit 並非自動永久保存。期限、撤銷、備份與 recovery 行為由 [Retention and lifecycle](../040-data/070-retention-and-lifecycle.md) 與對應 module contract 決定。
