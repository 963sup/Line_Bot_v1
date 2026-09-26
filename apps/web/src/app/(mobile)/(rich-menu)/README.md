# Rich Menu routes

This directory is the authenticated LINE Rich Menu navigation/composition route group under `(mobile)`.

It exists to make the Rich Menu entry surface explicit without turning presentation labels into business owners. Route Groups are organizational only and do not appear in URLs.

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
└─ Center actions
   ├─ 上班打卡
   └─ 下班打卡
```

## Ownership map

| Rich Menu label | Canonical responsibility |
| --- | --- |
| 數據洞察 | Insight/read projection; concrete data owner must be resolved before implementation |
| 異常事件 | Anomaly/exception projection; source business owner remains authoritative |
| 工作台 | Cross-owner application composition |
| 協作空間 | Collaboration composition over existing owner capabilities |
| 訊息中心 | Notifications recipient projection |
| 上班打卡 | Attendance clock-in |
| 下班打卡 | Attendance clock-out |

## Current implementation rule

This group intentionally starts with navigation contracts only. Do not create placeholder pages that falsely claim a runtime capability exists.

Concrete routes are added only when their canonical URL, owner, public contract, authorization behavior, and validation evidence are known. Existing canonical destinations should be reused rather than duplicated.

See [AGENTS.md](./AGENTS.md) for local change constraints.
