# Account lifecycle / identity gaps

本文只保存尚未形成 current business contract 的 Account/User lifecycle gaps。Current lifecycle、profile、identity-link 與 qualification 規則由 [Account owner](../../owners/account.md) 擁有。

## Profile publication / discovery

尚未完成：

- Organization-visible reader。
- User directory / discovery。
- Avatar object ownership、upload、resolver 與 privacy acceptance。

完成前：

- 不把 `visibility` 推導成其他 Domain 的讀權。
- 不把 LINE / Google profile 當 User table authority。
- Browser/provider metadata 不建立第二套 profile truth。

## Account closure

Permanent closure/delete 尚未定義。啟用前必須決定：

- retention / legal deletion。
- historical FK/reference strategy。
- Wallet/Ledger ownership。
- open Attendance / Repository Issue responsibility。
- external identity tombstone / re-registration。
- audit / recovery。

以上未定前，不提供 generic DELETE User。

## Recovery / transfer

Identity transfer、Account merge、Enterprise/Organization ownership transfer都不是 rename/link operation。啟用前至少需要：

- verified old/new principals。
- explicit consent / authority。
- last-owner protection。
- immutable history mapping。
- replay / audit / rollback contract。

## Completion condition

任何新 lifecycle capability 必須保持 stable UserId、qualification/version、authorization、transaction/replay、history/audit 與 provider-proof boundary；外部 email/display name/provider session possession 不得推導 ownership。

Current source/status： [Account owner](../../owners/account.md) · [Semantic model](../../../architecture/semantic-model.json)。
