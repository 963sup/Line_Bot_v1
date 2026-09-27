# Account

Read this file for the Account owner boundary and invariants. Load [detailed reference](../reference/domains/account.md) only for lifecycle / command / locator / policy details.

## Current responsibility

Account/User 是 current human registration、restore、qualification、optional external identity link confirmation 與 management owner。User lifecycle 使用 `active | paused | suspended`。`Member` 不再是 current identity/domain 名稱；舊 membership routes 與歷史 protocol/payload 只在其既有 owner boundary 需要時保留，不建立第二套 Domain model。

DailyCheckIn 擁有 business-day/reward policy、use case/query 與 atomic claim；Account 只提供 User qualification/lifecycle 與 Account-owned User projection。既有 `/api/membership` 的 default Account + Coin read projection由 Web delivery composition 組合 DailyCheckIn query，不進入 Account application contract；Account Settings 使用 `view=account` 只讀 Account projection，DailyCheckIn UI/recovery 不再由 Account Web module 承擔。External provider verification 屬 Integration/Security；Asset denomination、Wallet balance、Ledger history 各有自己的 owner。

## Invariants

User state 是 current human qualification authority。LINE `destination` 是 Integration 的 signed provider metadata，不是 Account identity 或 business authorization。External link 不轉移歷史 ownership；每個 private request 重新核驗 qualification/permission/scope。Receipt 不作永久授權，Account 不保存可寫 Coin balance，也不修改 Ledger entries。

## Adjacent owners

- [Account target rules](../change/decisions/account-identity-design.md)
- [DailyCheckIn rules](daily-check-in.md)
- [Asset](asset.md) · [Wallet](wallet.md) · [Ledger](ledger.md)
- [External identity mapping](../reference/data/identity-mapping.md)
- [LINE identity verification](line-integration.md)
- [Feature permissions](../reference/security/permissions.md)
- [Namespace](namespace.md)
