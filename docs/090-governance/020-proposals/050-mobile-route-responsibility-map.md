# Mobile Route Responsibility Map

Status: Implementation in progress  
Observed branch: `fix/vercel-node-runtime-contract`  
Observed head: `9f0b5f0acc9b926de8556e7eeea0dbff392d6f00`

## 1. Purpose

這份文件定義 `apps/web/src/app/(mobile)` 的 Route Responsibility Map。第一階段已將一般 authenticated mobile surfaces 與主 shell 移至 `(mobile)`；Repository canonical root 與 Issue / Discussion / Label / Milestone subresources 也已收斂至 `(resource)`，舊 `(app)` partition 已移除。

目標不是把 `(app)` 改名，而是用一致判準重新審視目前 App Router placement，找出真正的 delivery responsibility、canonical locator 與 ownership 錯位，再決定後續 relocation。

```text
Current routes
↓
Route responsibility
↓
Canonical locator semantics
↓
Runtime / layout boundary
↓
Target route group
↓
Owner contract
↓
Validation
```

`(mobile)` 是 Mobile / LINE MINI App application delivery boundary，不是新的 Domain、Bounded Context、Package、Data Boundary 或 authorization boundary。

## 2. First-principles boundary

`(mobile)` 存在的理由是目前產品已存在一組共同 lifecycle 的 presentation responsibility：

```text
Mobile Application Delivery
=
authenticated mobile shell
+ primary mobile navigation
+ mobile work surfaces
+ direct-entry / continuation / back behavior
+ mobile composition of existing owner capabilities
```

它不擁有：

- Account、Repository、Attendance、Assistant、Project 等 business truth。
- identity、qualification、authorization、permission 或 tenant scope。
- package private implementation。
- persistence、schema 或 database access policy。
- stable resource semantics 只因「手機會顯示」就改成 mobile-owned truth。

Route Group 只表達 runtime/layout responsibility；括號名稱不進正式 URL，也不授權。

## 3. Route responsibility taxonomy

每條 page route 先判斷 responsibility，再判斷 physical placement。

| Responsibility | 判斷問題 | Target partition |
| --- | --- | --- |
| Mobile application surface | 是否屬於 authenticated MINI App/mobile shell 的主要工作流程或 viewer 設定？ | `(mobile)` |
| Canonical public/private resource locator | 是否以同一 canonical locator 表達可公開或需重新授權的 resource identity？ | `(resource)` |
| Public identity/content | 是否不要求 authenticated mobile shell，且只讀 public information / login intent？ | `(public)` |
| Administration | 是否是明確管理 UI shell / privileged administration workflow？ | `(admin)` |
| Onboarding | 是否處理 register / restore / completion lifecycle？ | `(onboarding)` |
| System continuation | 是否處理 callback、provider handoff、unavailable/result 等 system lifecycle？ | `(system)` |
| HTTP transport | 是否是 API / webhook / command-query transport？ | `api` |

判斷停止條件：

```text
同一 URL
→ 必須只有一個 route owner

同一 route
→ 必須能唯一回答 delivery responsibility

回答不唯一
→ 先解 architecture ambiguity
→ 不搬檔案
```

## 4. Target top-level map

```text
apps/web/src/app/
│
├─ (mobile)/
│  ├─ layout.tsx
│  ├─ _shell/
│  ├─ home/
│  ├─ notifications/       # Navigation label: Inbox
│  ├─ explore/
│  ├─ assistant/
│  ├─ repositories/
│  ├─ attendance/
│  ├─ diary/
│  ├─ expenses/
│  ├─ organizations/
│  ├─ enterprises/
│  ├─ team/
│  ├─ partners/
│  ├─ settings/
│  ├─ history/
│  ├─ feedback/
│  └─ planned/
│
├─ (resource)/
│  └─ [login]/
│     └─ [repository]/
│        ├─ page.tsx
│        ├─ issues/
│        ├─ discussions/
│        ├─ labels/
│        └─ milestones/
│
├─ (public)/
├─ (admin)/
├─ (onboarding)/
├─ (system)/
└─ api/
```

這是 target responsibility map，不代表上述目錄已全部實作。

## 5. Current `(app)` route classification

### 5.1 Mobile application surfaces

這些 route 的 current responsibility 與 `(mobile)` 對齊；後續 relocation 時應保留 URL，除非另有 canonical URL 根因修正。

| Current URL | Current source | Semantic role | Business / capability owner | Target |
| --- | --- | --- | --- | --- |
| `/home` | `(app)/home/page.tsx` | Composition + global destination | Web composition over existing owners | `(mobile)` |
| `/notifications` | `(app)/notifications/page.tsx` | Notification inbox projection + global destination | Notifications | `(mobile)` |
| `/notifications/{notificationId}` | `(app)/notifications/[notificationId]/page.tsx` | Recipient-scoped notification detail | Notifications | `(mobile)` |
| `/explore` | `(app)/explore/page.tsx` | Discovery composition + global destination | Web composition; Repository supplies current discovery/Star | `(mobile)` |
| `/attendance` | `(app)/attendance/page.tsx` | Attendance mobile work surface | Attendance | `(mobile)` |
| `/attendance/clock-in` | `(app)/attendance/clock-in/page.tsx` | Explicit Attendance workflow | Attendance | `(mobile)` |
| `/attendance/clock-out` | `(app)/attendance/clock-out/page.tsx` | Explicit Attendance workflow | Attendance | `(mobile)` |
| `/diary` | `(app)/diary/page.tsx` | External-entry/product surface; not Diary authority | Web/external entry | `(mobile)` |
| `/expenses` | `(app)/expenses/page.tsx` | Expense application surface | Expense | `(mobile)` |
| `/repositories` | `(app)/repositories/page.tsx` | Repository collection/workbench | Repository | `(mobile)` |
| `/organizations` | `(app)/organizations/page.tsx` | Organization collection/governance surface | Organization | `(mobile)` |
| `/organizations/{login}/teams/{teamSlug}` | `(app)/organizations/[login]/teams/[teamSlug]/page.tsx` | Authenticated Organization Team governance detail | Team + Organization scope | `(mobile)` |
| `/team` | `(app)/team/page.tsx` | Organization Team collection/workbench | Team | `(mobile)` |
| `/enterprises` | `(app)/enterprises/page.tsx` | Enterprise collection | Enterprise | `(mobile)` |
| `/enterprises/{slug}` | `(app)/enterprises/[slug]/page.tsx` | Authenticated Enterprise governance detail | Enterprise | `(mobile)` |
| `/enterprises/{slug}/teams/{teamSlug}` | `(app)/enterprises/[slug]/teams/[teamSlug]/page.tsx` | Enterprise Team governance detail | Enterprise | `(mobile)` |
| `/partners` | `(app)/partners/page.tsx` | Partner directory surface | Partner Directory | `(mobile)` |
| `/partners/news` | `(app)/partners/news/page.tsx` | Partner news view | Partner Directory / Web projection | `(mobile)` |
| `/partners/referrals` | `(app)/partners/referrals/page.tsx` | Partner referral surface | Partner Directory | `(mobile)` |
| `/settings` | `(app)/settings/page.tsx` | Current viewer configuration | Account/Web settings | `(mobile)` |
| `/settings/profile` | `(app)/settings/profile/page.tsx` | Viewer profile editing/configuration; not User identity locator | Account | `(mobile)` |
| `/settings/network` | `(app)/settings/network/page.tsx` | Viewer network configuration | Account | `(mobile)` |
| `/settings/permissions` | `(app)/settings/permissions/page.tsx` | Viewer permission/configuration surface | Identity Access + Account | `(mobile)` |
| `/history` | `(app)/history/page.tsx` | Mobile history/work-record entry | Composition over real owners | `(mobile)` |
| `/feedback` | `(app)/feedback/page.tsx` | Feedback application entry | Web/product surface | `(mobile)` |
| `/planned` | `(app)/planned/page.tsx` | Explicit planned/unavailable result | Web/product surface | `(mobile)` |

### 5.2 Canonical Repository resource hierarchy

目前 Repository root 已由 `(resource)/[login]/[repository]/page.tsx` 擁有，但其 Issue / Discussion / Label / Milestone 子資源仍物理位於 `(app)`。

這不是單純資料夾不整齊，而是同一 canonical Repository resource hierarchy 被兩個 route partitions 切開。後續實作應優先驗證 layout、direct-open、public/private resolution 與 authorization consumer，再決定收斂至 `(resource)`。

| Current URL | Current source | Semantic role | Owner | Target hypothesis |
| --- | --- | --- | --- | --- |
| `/{login}/{repository}` | `(resource)/[login]/[repository]/page.tsx` | Canonical Repository locator | Repository | `(resource)` |
| `/{login}/{repository}/issues` | `(app)/[login]/[repository]/issues/page.tsx` | Repository-scoped Issue collection | Repository | `(resource)` |
| `/{login}/{repository}/issues/{issueNumber}` | `(app)/[login]/[repository]/issues/[issueNumber]/page.tsx` | Repository-scoped Issue identity | Repository | `(resource)` |
| `/{login}/{repository}/discussions` | `(app)/[login]/[repository]/discussions/page.tsx` | Repository-scoped Discussion collection | Repository | `(resource)` |
| `/{login}/{repository}/discussions/{discussionId}` | `(app)/[login]/[repository]/discussions/[discussionId]/page.tsx` | Repository-scoped Discussion identity | Repository | `(resource)` |
| `/{login}/{repository}/labels` | `(app)/[login]/[repository]/labels/page.tsx` | Repository-owned Label collection | Repository | `(resource)` |
| `/{login}/{repository}/milestones` | `(app)/[login]/[repository]/milestones/page.tsx` | Repository Milestone collection | Repository | `(resource)` |
| `/{login}/{repository}/milestones/{milestoneNumber}` | `(app)/[login]/[repository]/milestones/[milestoneNumber]/page.tsx` | Repository Milestone identity | Repository | `(resource)` |

`Target hypothesis` 不等於已核准搬移。實作前必須驗證目前 `(app)` layout/shell 是否提供必要 mobile continuation，以及 `(resource)` 是否能承接同一 UX 而不建立第二套 authorization 或 business query。

### 5.3 Assistant hierarchy conflict

Current:

```text
Bottom navigation
Home | Inbox | Explore | AI

URL
/home
/notifications
/explore
/home/assistant
```

如果 AI 是與 Home / Inbox / Explore 同級的 global destination，`/home/assistant` 的 path hierarchy 與 navigation hierarchy 不一致。

Target hypothesis:

```text
(mobile)/assistant/page.tsx
→ /assistant
```

Current `/home/assistant` 需在實作 phase 決定 compatibility / redirect policy；本 proposal 不先改 URL。

這個 URL 問題與 Assistant application ownership split 是不同層級。搬 route 不能代替 `@line-work/assistant` 與 Web module responsibility 的後續收斂。

### 5.4 Inbox naming

UI vocabulary:

```text
Inbox
```

Canonical product concept:

```text
Notification = authoritative recipient-addressed fact
Inbox = recipient-scoped derived projection
```

因此 target physical route 保持：

```text
(mobile)/notifications/
→ /notifications
```

不因 navigation label 為 Inbox 改成 `/inbox`，也不建立 Inbox package / schema / owner。

## 6. Routes explicitly outside `(mobile)`

「手機可開啟」不是 `(mobile)` admission rule。

| Current route | Current partition | Why not mobile-owned |
| --- | --- | --- |
| `/`、`/login`、`/privacy`、`/terms` | `(public)` | Public content/login intent，不要求 authenticated mobile shell |
| `/{login}` | `(public)` | User / Organization public identity locator |
| `/{login}/{repository}` | `(resource)` | Canonical Repository resource locator，可依 visibility/current identity解析不同 projection |
| `/admin/**` | `(admin)` | Administration lifecycle / shell |
| `/membership/register`、`/membership/restore`、`/complete` | `(onboarding)` | Onboarding lifecycle |
| `/auth/callback`、`/google-link`、`/unavailable` | `(system)` | Provider/system continuation |
| `/api/**` | `api` | HTTP transport boundary |

## 7. Mobile shell responsibility

Target `(mobile)` shell owns only presentation/runtime concerns:

### Owns

- authenticated mobile application shell;
- primary mobile navigation;
- mobile page composition;
- direct-open / refresh / safe-back continuation;
- mobile loading / empty / error presentation;
- navigation label and active-state projection.

### Consumes

- Account current User / profile capabilities;
- Notifications inbox/read projection;
- Repository collection, discovery, Star and resource capabilities;
- Attendance application capabilities;
- Expense, Organization, Enterprise, Team, Partner capabilities;
- Assistant application capabilities.

### Does not own

- business authorization;
- entity lifecycle;
- repository/resource permission;
- Account identity authority;
- durable replay/version truth;
- Project capability merely because Home shows Projects;
- Trending/Activity/Templates without a real owner;
- Favorites/Shortcuts persistence until their canonical business responsibility is explicitly selected.

## 8. Invariants

1. Route Group 不進 URL。
2. Route Group 不授權。
3. 一個正式 URL 只能有一個 route owner。
4. `page.tsx` / layout 只做 delivery/composition，不複製 owner use case。
5. Mobile navigation、resource navigation、same-page filter/view 是三個不同層級。
6. `Inbox` 是 presentation vocabulary；Notification 仍是 authoritative owner concept。
7. `Explore` 是 composition，不因有 route 就建立 Domain/package。
8. `Home` 是 composition，不擁有 Repository、Project、Star、Favorite、Shortcut truth。
9. `/{login}/{repository}` 及子資源保持同一 Repository locator semantics；physical partition 不得造成第二套 resource authority。
10. Selected Organization/Team/Repository/Employment 等 URL/state 只代表 intent，protected operation 仍由 owner 重新驗證。
11. Direct open、refresh、soft navigation、back 必須回到同一 authoritative query/command semantics。
12. 不以 local/browser history 冒充 Recent business activity。
13. 不以 Star 數量冒充 Trending。
14. 不以 route relocation 解決 Assistant application ownership 問題。

## 9. Architecture findings exposed by this map

### Finding A — `(app)` responsibility 過寬

`(app)` 目前同時包含：

- global mobile destinations;
- mobile workflow surfaces;
- viewer settings;
- authenticated governance details;
- Repository canonical subresources.

因此名稱 `app` 幾乎無法預測 runtime/layout responsibility。

### Finding B — Repository hierarchy partition split（已修正）

Repository root 在 `(resource)`，Repository subresources 在 `(app)`。這需要沿 layout、resource header、direct entry、authorization 與 back-navigation 查根因，不應只因目錄對稱搬移。

### Finding C — Assistant navigation hierarchy drift

AI 是 primary global destination，但 current URL 為 `/home/assistant`。需要把 navigation hierarchy 與 canonical locator 重新對齊。

### Finding D — Presentation names 不應變 business owner

`Inbox`、`Home`、`Explore` 都是 presentation/application semantics。它們不能因 target `(mobile)` tree 出現就變成新的 package/schema/domain。

## 10. Implementation gates

這份 map 只完成 Target responsibility classification。開始 relocation 前，逐 route 必須完成：

```text
Current page
↓
current layout / shell dependency
↓
module consumer
↓
_composition wiring
↓
package public capability
↓
authorization / qualification contract
↓
direct-open + refresh + back behavior
↓
target partition decision
```

只有上述鏈路可唯一回答，才搬 route。

後續 `(mobile)` 成為 current implementation 後，仍成立的 route responsibility 應蒸餾回 `docs/020-architecture/050-runtime-architecture.md`；本 proposal 隨 migration 完成後移除，不保留第二套 current truth。

## 11. Validation target

文件階段：

```text
pnpm docs:check
```

實作 relocation 階段：

```text
pnpm check
pnpm architecture
pnpm validate
```

並分開驗證：

- canonical URL unchanged unless explicitly approved;
- direct open;
- hard refresh;
- mobile soft navigation;
- browser back/forward;
- LINE MINI App entry / continuation;
- unauthorized/private resource;
- revoked access;
- loading / empty / error;
- old URL compatibility when canonical URL changes.

Static validation 不等於 Browser / LINE device evidence。
