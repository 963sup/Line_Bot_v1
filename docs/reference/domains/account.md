# Account detailed reference
Low-frequency Account flows and edge cases. The owner boundary and invariants remain canonical in [Account](account.md).
## Lifecycle
| State | Transition | Rule |
| --- | --- | --- |
| unregistered | verified LINE identity registers → `active` | 未註冊不能取得 private business access |
| `active` | self pause → `paused` | private operations 仍各自驗 owner/scope |
| `paused` | original LINE identity restores → `active` | 不重建 User、Wallet、Ledger 或 identity history |
| `suspended` | formal management transition only | register/restore/link 不得繞過 suspension |

Stable UserId 不因重新登入、session expiry、重啟或 LINE chat context 改變。
## Registration, restore and identity link
Register 只建立不存在的 User，並在同一 transaction 建立 Namespace-owned global unique `login`；active exact retry 必須使用同一 login 並回既有結果，不同 login 衝突，paused 衝突，suspended 拒絕。Restore 只恢復 paused；不存在或 suspended 拒絕，active retry 不新增 event。User 交易提交時必須有 Namespace-owned login；缺 login 是資料完整性錯誤，不是日常設定或註冊補救流程。部署前須唯讀核對既有資料，若有缺漏則保留 stable UserId 與歷史，由明確授權的資料修復處理；不得從 LINE display name/picture、Google email、provider subject 或 UserId fabricated backfill。Qualification/state mutation 在同一 transaction；client-supplied ID/status 不是 authority。

Google link 是選填 external identity mapping，不是 LINE 日常 qualification。可信 User 發起短效 request，原發起者明確確認 verified candidate 後才建立 link；不按 email 合併。Request 綁原 User/status/version/expiry/one-time capability；provider token 不保存為 Account record，provider session 失效不改 User lifecycle。已啟用 User 可由同一可信 LINE identity 明確解除 Google mapping；unlink 只刪除 optional Google binding／pending request 並留下 event，不改 UserId、LINE identity、lifecycle 或歷史 ownership。
## User management
Current permissions 是 `users.read` 與獨立的 `users.suspend`；不從 TeamMaintainer、LINE group、OrganizationAdmin 或其他管理能力推定。Read 只取得 safe projection；suspend/unsuspend 需額外 capability，禁止自我停權。Permission persistence 與 public contract 使用相同 User 語意，不保留 `members.*` permission alias；permission schema 的唯一 owner 見 [Feature permissions](../security/permissions.md)。`membership_denied` 等既有 wire/history code 只保留既有 protocol/history 意義，不重新成為 Domain 名稱。

Active/paused 可進 suspended 並保存前態；解除回可靠前態，未知 legacy 前態回 paused。停權不刪 identity、Ledger、Attendance、Repository Issue 或其他 history，也不自動下班或改派工作。最後一位有效 permission administrator 的既有保護仍保留。

管理命令保留 `requestId`、`expectedVersion`、reason。Qualification、version、state、event、receipt 同 transaction；exact retry 回原結果，不同 payload 共用 ID 拒絕。
## DailyCheckIn integration
Application 先解析可信 LINE subject 並核驗 active User，再以 server time 呼叫 DailyCheckIn policy。PostgreSQL transaction 重新鎖定／驗證 qualification，提交既有 `daily_checkin` audit/protocol result 與 Ledger credit；失敗全部 rollback。

既有外部 protocol 若仍需 composed legacy projection，必須明確留在 protocol adapter，不得再把 `Member` 回流為 Account Domain type。Ledger V1 `membership/daily_checkin/businessDay` 屬已發布歷史 protocol，不因 policy owner 分離而改寫；同一天最多一筆 credit。金額與日界線唯一規則見 [DailyCheckIn](daily-check-in.md)。
## Lifecycle/API scope assessment
- User follow relationships：Account/User owns the directional User → User follow fact. `Followers` and `Following` are inbound/outbound reads of the same relationship, not separate domains. The first application surface lists the authenticated User's own relationships; follow/unfollow is idempotent, self-follow is invalid, and pause/suspend does not silently rewrite the relationship history.
- User Achievement facts：Account/User owns persisted earned-recognition facts and their authenticated self read projection. `/{login}` may display those facts to the verified active User viewing their own Profile, but does not invent qualification/grant/progress rules or use Achievement as authorization.
- User profile metadata：Account/User owns product-authored profile projection；registration 必須先建立 `login`；current self surface 仍允許 active User 變更 `login`，並讀取／更新 `display_name`、`bio`、`visibility`，以 profile version 做 optimistic concurrency，exact semantic retry 不重複前進版本。`login` 是 Namespace-owned、lowercase、global unique 的 RepositoryOwner locator；User 與 Organization 共用同一 login namespace。Login normalization、reservation、claim、resolve、rename 與 persistence 由 Namespace 擁有；Account 直接消費 `@line_bot_v1/namespace`，不再維護第二套 login directory。Rename 必須帶讀取時的 `expectedLogin`；舊表單不得覆蓋已更新名稱。Authenticated self 以 current viewer context 解析同一個 User，不建立 `me` entity 或 `/me` 第二套 locator；viewer-only 編輯／帳號操作可放在 `/settings/*`，但其 business truth 仍由 Account/User owner 提供。`/{login}` 先由 Namespace-owned login binding 解析 stable User / Organization identity，再由各 owner 驗證 qualification；User 即使尚無 public Profile 仍可由 login 定位。Profile `visibility` 只控制 product-authored profile fields（例如 display name / bio）是否公開，不控制 User identity 是否存在。stable UserId 仍是 identity，display name 與 LINE/provider identity 都不得取代它。LINE display name 與其他 provider profile 仍是外部 identity/presentation data，不複製成 Account authority；Profile 不改寫 User identity、status 或 provider binding。`publicByUserId` 只輸出 `display_name`、`bio`、`avatar_ref` 的 public-safe projection，不輸出 UserId、visibility、version 或 timestamps。`avatar_ref` 是 product-owned opaque reference；目前沒有 upload/write 或 object resolver surface，因此 Web 不把它當外部 URL，先使用由公開名稱/login 衍生的 deterministic fallback avatar。LINE display name/pictureUrl 與其他 provider profile 仍是外部 identity/presentation data，不複製成 Account authority。
- Account closure：目前不提供 permanent delete。User pause／suspend 已覆蓋 qualification lifecycle，而 Ledger、Attendance、Repository Issue、audit/receipt/history 仍引用 stable UserId；在 retention、legal deletion、ownership handoff 與 recovery semantics 定案前，不以 DELETE User 模擬 closure。
- Provider management：Google 是 optional external mapping；current surface 支援 bind、cancel pending request 與 explicit unlink。LINE identity 仍是 registration/restore owner，unlink Google 不得轉移 Account ownership。
- Recovery / transfer：User self restore 只恢復 paused；governance root recovery 仍走受控 operator path。User identity transfer、Enterprise/Organization ownership transfer若未先定義 actor proof、target qualification、history/audit 與 last-owner invariants，不建立 generic transfer endpoint。

## Ownership

The narrow `readUserDeliveryTarget` PostgreSQL query returns only a currently active User's binding for the requested provider. Notifications owns target snapshots and delivery state; LINE owns provider protocol.

Read this file for the Account owner boundary and invariants. Load [detailed reference](account.md) only for lifecycle / command / locator / policy details.

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
- [Asset](../../owners/asset.md) · [Wallet](wallet.md) · [Ledger](ledger.md)
- [External identity mapping](../data/identity-mapping.md)
- [LINE identity verification](../../owners/line-integration.md)
- [Feature permissions](../security/permissions.md)
- [Namespace](namespace.md)
