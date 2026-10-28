# Account

The narrow `readUserDeliveryTarget` PostgreSQL query returns only a currently active User's binding for the requested provider. Notifications owns target snapshots and delivery state; LINE owns provider protocol.

Read this file for the Account owner boundary and invariants. Load [detailed reference](../reference/domains/account.md) only for lifecycle / command / locator / policy details.

## Current responsibility

Account/User 是 current human registration、restore、qualification、optional external identity link confirmation 與 management owner。User lifecycle 使用 `active | paused | suspended`。`Member` 不再是 current identity/domain 名稱；舊 membership routes 與歷史 protocol/payload 只在其既有 owner boundary 需要時保留，不建立第二套 Domain model。

DailyCheckIn 擁有 business-day/reward policy、use case/query 與 atomic claim；Account 只提供 User qualification/lifecycle 與 Account-owned User projection。既有 `/api/membership` 的 default Account + Coin read projection由 Web delivery composition 組合 DailyCheckIn query，不進入 Account application contract；Account Settings 使用 `view=account` 只讀 Account projection，DailyCheckIn UI/recovery 不再由 Account Web module 承擔。External provider verification 屬 Integration/Security；Asset denomination、Wallet balance、Ledger history 各有自己的 owner。

Global User／Organization login 的驗證、綁定、解析與改名由 [Namespace](namespace.md) 集中管理。Account 在原有註冊／資格交易內呼叫 Namespace；Profile 不持有第二套 login lifecycle。

User management suspension/unsuspension uses a Contracts input capability and transaction output Port. Command normalization lives in `application/commands/user-status.ts` and is published through the existing `application/manage-users` entry. Application coordinates current IdentityAccess authority before replay, Domain receives only action/version facts to decide the status transition and its event, and the output Port receives the target and replay/audit evidence. PostgreSQL preserves governance/User locks and atomic status/receipt/event persistence. Authority is rechecked after the status write. The public `PostgresUserManagement` entry assembles these dependencies without changing existing constructor or prototype methods.

Registration, restoration, login rename and optional Google binding follow the same ownership split. Application coordinates locked current facts, Domain decides lifecycle/link transitions and event intent, and persistence saves the User, Namespace binding, identity links and events in the existing transaction. Google confirmation reuses the binding use case with a transaction-scoped Port assembled by Composition; it does not create another Store inside the SQL adapter. Public `PostgresUserStore` and `PostgresGoogleLinkStore` constructors and prototype methods remain stable.

Follow/Unfollow writes recheck current User qualification in the relationship transaction, under the shared governance protocol and User row locks. Domain owns self-follow and followable-target decisions. A prior application read does not authorize a write after qualification is lost; lifecycle pause preserves existing relationships.

Profile field validity, public visibility and version/exact-retry decisions belong to Domain. Application keeps command decoding and projection; the existing Repository implements the locked qualification and atomic save predicates without a separate transaction Port.

Authored Profile status is distinct from User qualification and provider status. Account owns its public-only message, emoji, availability and expiry, with Organization-scoped audience currently unsupported. Application coordinates current qualification, exact replay, Domain version decisions and atomic persistence through a transaction output Port. Clearing preserves the durable version; public reads omit cleared, expired and inactive-user status. A historical command receipt does not replace a current-state read for presentation.

## Invariants

User state 是 current human qualification authority。LINE `destination` 是 Integration 的 signed provider metadata，不是 Account identity 或 business authorization。External link 不轉移歷史 ownership；每個 private request 重新核驗 qualification/permission/scope。Receipt 不作永久授權，Account 不保存可寫 Coin balance，也不修改 Ledger entries。

## Adjacent owners

- Account identity rules are defined by this owner contract, source and tests.
- [DailyCheckIn rules](daily-check-in.md)
- [Asset](asset.md) · [Wallet](wallet.md) · [Ledger](ledger.md)
- [External identity mapping](../reference/data/identity-mapping.md)
- [LINE identity verification](line-integration.md)
- [Feature permissions](../reference/security/permissions.md)
- [Namespace](namespace.md)
