# Mobile application route group

## Owner

`(mobile)` owns the authenticated Mobile / LINE MINI App delivery boundary: mobile shell, primary navigation, page composition, direct-entry/refresh/back continuation, and mobile loading/empty/error presentation.

It does not own business truth, authorization, persistence, package boundaries, or resource identity merely because a resource is visible on mobile.

## Current global destinations

| Navigation label | Canonical URL | Responsibility |
| --- | --- | --- |
| Home | `/home` | Cross-owner work composition |
| Inbox | `/notifications` | Notifications recipient projection |
| Explore | `/explore` | Repository discovery composition |
| AI | `/assistant` | Assistant one-shot application surface |

`Inbox` is presentation vocabulary; Notification remains authoritative. `Home` and `Explore` are compositions, not Domain/package owners.

## Invariants

- Route Group does not enter the URL and does not authorize.
- Mobile navigation, resource navigation, and same-page view state are separate layers.
- Page/layout code performs delivery/composition only; it does not duplicate owner use cases.
- Direct open, refresh, soft navigation, and back must converge on the same authoritative query/command semantics.
- Explore current IA is `Discover → /trending / Awesome Lists → Activity`. `/trending` 是 Explore-active secondary surface，直接重用 Repository owner 的 7-day active-Star ranking；Activity 與 Awesome Lists 同樣只消費 Repository owner contracts。Awesome Lists 是 active-owner public Repository Star Lists 的 presentation vocabulary，只顯示 viewer 當下可見的 Repository/count；不建立 Explore/List 第二 authority、cross-owner feed、language metadata 或 recommendation score。
- Home current information architecture is `My Work → Favorites → Shortcuts → Recent`. `Issues` / `Discussions` are Repository selector gateways into canonical scoped resources, never cross-Repository feeds. `Projects` remains a target-only disabled row until a real Project runtime contract exists. `Favorites` reuses Repository Star projection. `Shortcuts` is a fixed presentation list of existing routes, not saved shortcut persistence. `Recent` has no current owner/runtime projection and therefore renders only an explicit empty state; do not synthesize it from browser history, localStorage, notifications or unrelated activity.
- `/repositories` is the current viewer's authorized Repository collection; it does not alias IssueBoard. `/repositories/lists` is Repository-owned Star List collection，`/repositories/lists/{listId}` uses stable ListId locator，`/repositories/lists/discover` composes public List discovery. Repository subresources stay under canonical `/{login}/{repository}/...`.
- `/profile` is the authenticated viewer Profile hub. It may compose owner-approved Account/Repository/Organization projections and Account-owned earned Achievements, but `/{login}` remains the canonical identity locator and share URL. Projects stay visibly unavailable until the Project owner exposes a real runtime read contract.
- `/settings` is viewer Account configuration only; Enterprise, Organization, Team, operational utilities and Admin keep their own owner surfaces instead of being grouped under Settings.
- `/home/assistant` is compatibility-only and redirects to canonical `/assistant`.
- AppShell owns the shared skip target, content frame, and Bottom Navigation only; page-specific headings/actions stay with their destination instead of becoming global shell chrome.
- Home alone renders the Account/Profile avatar in its header. It resolves the current Account-owned login through the trusted membership projection and links to canonical `/{login}`. If an existing Account projection is present but a legacy User has no login, the avatar links only to `/settings/profile` as explicit locator recovery; it must not derive a login from LINE profile data, provider metadata, UserId, or display name. Inbox, Explore, AI, resource/work pages do not repeat it. On a canonical User Profile, a Settings gear is visible only when trusted current membership login equals that Profile login; it links to `/settings`. `/settings` remains viewer configuration, not User identity or a Governance hub.

- `/daily-check-in` is the authenticated DailyCheckIn presentation surface. It is secondary navigation from Home, not a global tab and not part of Settings.

- Home Search routes to `/search`; the current surface filters the authorized Repository collection only and must not claim People/Organization/Issue search coverage.
- Home Refresh performs a full document reload so client-owned viewer projections such as Account avatar and Starred Repositories reinitialize together; `router.refresh()` alone is insufficient for these client states.

- Home Create exposes `New Repository` and `Create Issue`. New Repository routes to `/repositories/new` and consumes the Repository owner create contract; Create Issue仍 routes through `/repositories?intent=create-issue` to choose a writable Repository and then canonical `/{login}/{repository}/issues?create=1`.
