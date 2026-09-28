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

Audit 並非自動永久保存。期限、撤銷、備份與 recovery 行為由 [Retention and lifecycle](../reference/data/retention.md) 與對應 module contract 決定。

## Governance history query

`GET /api/audit?scopeKind=enterprise|organization&scopeId=<id>` consumes the Identity/Access public evidence projection. Each page requires a current active User and effective owner of the exact active scope. Scope inheritance and Team history are not implied.

`limit` defaults to 50 (1–100); `before` uses the previous response `next` cursor. Ordering is server time then bigint event identity, descending. Events expose actor/target identifiers, action, request identity, time and structured outcome/version; free-text reason, request fingerprint and raw result payload remain private. The request identity links existing immutable command evidence without duplicating it.

The API is read-only; `/admin/audit` remains unavailable. Source events remain Identity/Access-owned; Audit does not gain persistence or source-object authorization. Deployment and device acceptance require separate evidence.
