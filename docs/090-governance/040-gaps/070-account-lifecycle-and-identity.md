# Account lifecycle / identity gaps

狀態：User registration／pause／restore、管理 suspend／unsuspend、safe read projection、LINE identity mapping、optional Google bind 與 explicit Google unlink 已有 current source。本文只保存尚未形成 current business contract 的 Account/User lifecycle gaps。

## Current decisions

- Account root 只保存 stable identity + immutable kind；User、Enterprise、Organization 是 current facet，不建立 generic Account CRUD。
- User profile metadata 已有 product-owned self mutable model：active User 可讀寫 `display_name`、`bio`、`visibility`，並保留 optimistic version／exact semantic retry。LINE display name/profile 仍是 presentation/provider data，不是 Account authority；`avatar_ref` 目前沒有 upload/write surface。
- Google 是 optional external identity mapping。Explicit unlink 只移除 Google mapping、legacy auth binding 與 pending link request，保留 UserId、LINE identity、qualification history、Ledger／Attendance／Repository Issue／audit facts。
- User pause／restore與 administrator suspend／unsuspend 是 qualification lifecycle，不等於 account deletion。

## Open gates

### Profile publication / discovery

Self Profile 已有 current owner/runtime。尚未完成的是 public／Organization-visible reader、使用者目錄／探索、avatar object ownership/upload 與對應 privacy acceptance；在這些 consumer 與授權 projection 完成前，不把 `visibility` 推導成其他 Domain 的讀權，也不把 LINE/Google profile dump 進 User table。

### Account closure

Permanent closure/delete 尚未定義。需要先確定 retention/legal deletion、historical foreign-key/reference strategy、Wallet/Ledger ownership、open Attendance/Repository Issue responsibility、external identity tombstone/re-registration、audit/recovery。這些未定前，不提供 generic DELETE User。

### Recovery / transfer

Current self recovery 只有 paused -> active，管理 suspension 只能由具權限 actor 解除。Identity transfer、Account merge、Enterprise/Organization ownership transfer都不是 rename/link operation；需要 verified old/new principals、explicit consent/authority、last-owner protection、immutable history mapping、replay/audit/rollback contract 後才能新增。

## Acceptance

任何後續 capability 必須維持 stable UserId、qualification/version、authorization、transaction/replay、history/audit 與 provider-proof boundary；不能以外部 email/display name 或 possession of provider session 推導 ownership。
