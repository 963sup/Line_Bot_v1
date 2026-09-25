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
- Do not invent Favorites, saved Shortcuts, Recent activity, Trending, Templates, Activity feed, or Project runtime capability without a selected owner and real contract.
- `/home/assistant` is compatibility-only and redirects to canonical `/assistant`.
- AppShell owns the shared skip target, content frame, and Bottom Navigation only; page-specific headings/actions stay with their destination instead of becoming global shell chrome.
- Home alone renders the Account/Profile avatar in its header. It resolves the current Account-owned login through the trusted membership projection and links to canonical `/{login}`; Inbox, Explore, AI, resource/work pages do not repeat it. `/settings` remains viewer configuration, not User identity.
