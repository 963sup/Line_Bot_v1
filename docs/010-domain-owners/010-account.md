# Account

## Current responsibility

Account/User 是 current human registration、restore、qualification、optional external identity link confirmation 與 management owner。User lifecycle 使用 `active | paused | suspended`。`Member` 不再是 current identity/domain 名稱；舊 membership routes 與歷史 protocol/payload 只在其既有 owner boundary 需要時保留，不建立第二套 Domain model。

DailyCheckIn 擁有 business-day/reward policy、use case/query 與 atomic claim；Account 只提供 User qualification/lifecycle 與 Account-owned User projection。既有 `/api/membership` 的 Account + Coin read projection 由 Web delivery composition 組合 DailyCheckIn query，不進入 Account application contract。External provider verification 屬 Integration/Security；Asset denomination、Wallet balance、Ledger history 各有自己的 owner。

## Lifecycle

| State | Transition | Rule |
| --- | --- | --- |
| unregistered | verified LINE identity registers → `active` | 未註冊不能取得 private business access |
| `active` | self pause → `paused` | private operations 仍各自驗 owner/scope |
| `paused` | original LINE identity restores → `active` | 不重建 User、Wallet、Ledger 或 identity history |
| `suspended` | formal management transition only | register/restore/link 不得繞過 suspension |

Stable UserId 不因重新登入、session expiry、重啟或 LINE chat context 改變。

## Registration, restore and identity link

Register 只建立不存在的 User，並在同一 transaction 建立 Account-owned global unique `login`；active exact retry 必須使用同一 login 並回既有結果，不同 login 衝突，paused 衝突，suspended 拒絕。Restore 只恢復 paused；不存在或 suspended 拒絕，active retry 不新增 event。Qualification/state mutation 在同一 transaction；client-supplied ID/status 不是 authority。

Google link 是選填 external identity mapping，不是 LINE 日常 qualification。可信 User 發起短效 request，原發起者明確確認 verified candidate 後才建立 link；不按 email 合併。Request 綁原 User/status/version/expiry/one-time capability；provider token 不保存為 Account record，provider session 失效不改 User lifecycle。已啟用 User 可由同一可信 LINE identity 明確解除 Google mapping；unlink 只刪除 optional Google binding／pending request 並留下 event，不改 UserId、LINE identity、lifecycle 或歷史 ownership。

## User management

Current permissions 是 `users.read` 與獨立的 `users.suspend`；不從 TeamMaintainer、LINE group、OrganizationAdmin 或其他管理能力推定。Read 只取得 safe projection；suspend/unsuspend 需額外 capability，禁止自我停權。Permission persistence 與 public contract 使用相同 User 語意，不保留 `members.*` permission alias；permission schema 的唯一 owner 見 [Feature permissions](../050-security/030-authorization.md)。`membership_denied` 等既有 wire/history code 只保留既有 protocol/history 意義，不重新成為 Domain 名稱。

Active/paused 可進 suspended 並保存前態；解除回可靠前態，未知 legacy 前態回 paused。停權不刪 identity、Ledger、Attendance、Repository Issue 或其他 history，也不自動下班或改派工作。最後一位有效 permission administrator 的既有保護仍保留。

管理命令保留 `requestId`、`expectedVersion`、reason。Qualification、version、state、event、receipt 同 transaction；exact retry 回原結果，不同 payload 共用 ID 拒絕。

## DailyCheckIn integration

Application 先解析可信 LINE subject 並核驗 active User，再以 server time 呼叫 DailyCheckIn policy。PostgreSQL transaction 重新鎖定／驗證 qualification，提交既有 `daily_checkin` audit/protocol result 與 Ledger credit；失敗全部 rollback。

既有外部 protocol 若仍需 composed legacy projection，必須明確留在 protocol adapter，不得再把 `Member` 回流為 Account Domain type。Ledger V1 `membership/daily_checkin/businessDay` 屬已發布歷史 protocol，不因 policy owner 分離而改寫；同一天最多一筆 credit。金額與日界線唯一規則見 [DailyCheckIn](160-daily-check-in.md)。

## Invariants

User state 是 current human qualification authority。LINE `destination` 是 Integration 的 signed provider metadata，不是 Account identity 或 business authorization。External link 不轉移歷史 ownership；每個 private request 重新核驗 qualification/permission/scope。Receipt 不作永久授權，Account 不保存可寫 Coin balance，也不修改 Ledger entries。

## Adjacent owners

- [Account target rules](../090-governance/010-decisions/070-account-identity-design.md)
- [DailyCheckIn rules](160-daily-check-in.md)
- [Asset](130-asset.md) · [Wallet](140-wallet.md) · [Ledger](150-ledger.md)
- [External identity mapping](../040-data/050-identity-mapping.md)
- [LINE identity verification](../030-platform/010-line.md)
- [Feature permissions](../050-security/030-authorization.md)

## Lifecycle/API scope assessment

- User follow relationships：Account/User owns the directional User → User follow fact. `Followers` and `Following` are inbound/outbound reads of the same relationship, not separate domains. The first application surface lists the authenticated User's own relationships; follow/unfollow is idempotent, self-follow is invalid, and pause/suspend does not silently rewrite the relationship history.
- User profile metadata：Account/User owns product-authored profile projection；registration 必須先建立 `login`；current self surface 仍允許 active User 變更 `login`，並讀取／更新 `display_name`、`bio`、`visibility`，以 profile version 做 optimistic concurrency，exact semantic retry 不重複前進版本。`login` 是 Account-owned、lowercase、global unique 的 RepositoryOwner locator；User 與 Organization 共用同一 namespace，reserved root routes 不可成為 login。Authenticated self 以 current viewer context 解析同一個 User，不建立 `me` entity 或 `/me` 第二套 locator；viewer-only 編輯／帳號操作可放在 `/settings/*`，但其 business truth 仍由 Account/User owner 提供。`/{login}` 先由 Account-owned login directory 解析 active User / Organization identity；User 即使尚無 public Profile 仍可由 login 定位。Profile `visibility` 只控制 product-authored profile fields（例如 display name / bio）是否公開，不控制 User identity 是否存在。stable UserId 仍是 identity，display name 與 LINE/provider identity 都不得取代它。LINE display name 與其他 provider profile 仍是外部 identity/presentation data，不複製成 Account authority；Profile 不改寫 User identity、status 或 provider binding。`publicByUserId` 只輸出 `display_name`、`bio`、`avatar_ref` 的 public-safe projection，不輸出 UserId、visibility、version 或 timestamps。`avatar_ref` 是 product-owned opaque reference；目前沒有 upload/write 或 object resolver surface，因此 Web 不把它當外部 URL，先使用由公開名稱/login 衍生的 deterministic fallback avatar。LINE display name/pictureUrl 與其他 provider profile 仍是外部 identity/presentation data，不複製成 Account authority。
- Account closure：目前不提供 permanent delete。User pause／suspend 已覆蓋 qualification lifecycle，而 Ledger、Attendance、Repository Issue、audit/receipt/history 仍引用 stable UserId；在 retention、legal deletion、ownership handoff 與 recovery semantics 定案前，不以 DELETE User 模擬 closure。
- Provider management：Google 是 optional external mapping；current surface 支援 bind、cancel pending request 與 explicit unlink。LINE identity 仍是 registration/restore owner，unlink Google 不得轉移 Account ownership。
- Recovery / transfer：User self restore 只恢復 paused；governance root recovery 仍走受控 operator path。User identity transfer、Enterprise/Organization ownership transfer若未先定義 actor proof、target qualification、history/audit 與 last-owner invariants，不建立 generic transfer endpoint。
