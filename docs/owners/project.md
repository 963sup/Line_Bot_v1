# Project

狀態：**Project identity/read current；planning write data-only**。

Project 是 Account-owned（User 或 Organization）的跨 Repository planning boundary。它擁有 planning facts，但不取得被參照 work 的 authority。GitHub-like ownership benchmark 由 `architecture/domain/fpt/*.json` + `architecture/domain/fpt-source.json` 的 `ProjectV2.owner` 提供；產品採用結果以 `architecture/semantic-model.json` 為準。

## Authority / runtime

- Project 擁有 Project identity、ProjectItem reference、WBS / ordering、Project Milestone、Project → Repository reference。
- `700_projects.sql` 的 owner 是 `owner_account_id + owner_account_kind`，只允許 `USER | ORGANIZATION`；`packages/project` 使用相同 Domain identity。
- `read-projects` 是 current runtime capability：User-owned Project 只對 owner User 可讀；Organization-owned Project 目前只對 current `OrganizationOwner` 可讀。Organization membership 本身不授予 Project read。
- `manage-project-planning` 仍是 data-only；Project create/update、WBS/Item/Milestone mutation、expected version 與 replay command contract 尚未開放。
- Web collection 是 `/projects`，transport 是 `GET /api/projects`。目前沒有 Project detail/write route。

## Invariants

- `Project ≠ WBS`；WBS 是 Project-owned decomposition。
- Project Item 是 reference，不複製 Repository Issue business truth。
- Project Milestone 與 Repository Milestone 是不同 owner 的 concept。
- Project reference 不轉移 Repository access、Issue lifecycle 或 content authority。
- Owner login 只作 locator/presentation，不授權。
- 在 Project-specific access policy 成為 machine truth 前，不得把 Organization member 擴張成 Project viewer。
- Planning write 啟用前必須定義 expected version、request replay、Repository current-access validation 與 mutation consistency boundary。

Canonical machine truth：
[`architecture/semantic-model.json`](../../architecture/semantic-model.json) ·
[`architecture/implementation-topology.json`](../../architecture/implementation-topology.json) ·
[`architecture/data-topology.json`](../../architecture/data-topology.json) ·
[`supabase/schemas/700_projects.sql`](../../supabase/schemas/700_projects.sql)
