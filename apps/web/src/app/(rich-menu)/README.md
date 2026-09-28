# Rich Menu routes

This directory is the authenticated LINE Rich Menu navigation/composition route group directly under `apps/web/src/app`.

`(rich-menu)` is parallel to `(mobile)`. It exists to make the Rich Menu entry surface explicit without turning presentation labels into business owners. Route Groups are organizational only and do not appear in URLs.

## Information architecture

```text
Rich Menu
│
├─ Top row
│  ├─ 數據洞察
│  ├─ 異常事件
│  ├─ 工作台
│  ├─ 協作空間
│  └─ 訊息中心
│
└─ Center entry
   └─ 工時紀錄（Time Tracking）
      ├─ 開始工作（Start）
      └─ 結束工作（Stop）
```

## Ownership map

| Rich Menu label | Canonical responsibility |
| --- | --- |
| 數據洞察 | Insight/read projection; concrete data owner must be resolved before implementation |
| 異常事件 | Anomaly/exception projection; source business owner remains authoritative |
| 工作台 | Cross-owner application composition |
| 協作空間 | Collaboration composition over existing owner capabilities |
| 訊息中心 | Notifications recipient projection |
| 工時紀錄（Time Tracking） | Time Tracking entry; `開始工作（Start）` starts a tracked work interval and `結束工作（Stop）` ends it. Current underlying business authority remains Attendance until a separately validated domain migration. |

## Responsibility routing

```text
Rich Menu entry / route composition
→ apps/web/src/app/(rich-menu)

LINE Rich Menu provider capability
→ packages/line-channel

Rich Menu repository operations
→ scripts/line/rich-menu

Release orchestration
→ .github/workflows/release.yml

Business behavior / data
→ actual owning package / schema
```

## Current implementation rule

This group intentionally starts with navigation contracts only. Do not create placeholder pages that falsely claim a runtime capability exists.

Concrete routes are added only when their canonical URL, owner, public contract, authorization behavior, and validation evidence are known. Existing canonical destinations should be reused rather than duplicated.

See [AGENTS.md](./AGENTS.md) for local change constraints.
