# Project

狀態：**current data authority；runtime capability inactive；ownership model 待導正**。

Project 是跨一個或多個 Repository 的 planning boundary。它擁有 planning facts，但不取得被參照 work 的 authority。Project owner 的 product semantic 是 Account，可為 User 或 Organization；這由 pinned GitHub-like benchmark 的 `ProjectV2.owner`（User | Organization）支撐。

## Current authority

- Project identity。
- ProjectItem reference。
- WBS 與 ordering。
- Project Milestone。
- Project → Repository reference。

Current persisted facts 位於 `700–704` schema object group，semantic lifecycle 是 `current-data-only`。目前 `700_projects.sql` 與 `packages/project` 的 `Project` 型別仍以 `organization_id` / `organizationId` 表示 owner，因而只容許 Organization-owned Project；這是已知 implementation debt，不是 Product ownership contract。

在 ownership model 導正前，不得以目前 Organization-only schema 推導 Project authorization、建立 runtime API，或把該 restriction 升格為 Domain invariant。URL collection canonical name 為 `projects`；目前沒有 Web route、consumer 或 active runtime capability。

## Invariants

- Project owner 是 Account，語意上可為 User 或 Organization。
- `Project ≠ WBS`；WBS 只是 Project-owned decomposition。
- Project Item 是 reference，不複製 Repository Issue business truth。
- Project Milestone 與 Repository Milestone 是不同 owner 的 concept。
- Project reference 不轉移 Repository access、Issue lifecycle 或 content authority。
- Cross-owner identity/reference integrity 由 Project 與 Repository 各自 authority 保護；Project authorization 不得由 Repository access 反向推導。

## Runtime activation

`manage-project-planning` 尚未宣告 runtime active。第一個真實 consumer 啟用前，先完成 owner model 導正，再定義：

- Project access / authorization contract，分別處理 User-owned 與 Organization-owned Project。
- planning command、expected version、request replay。
- Repository current-access validation。
- executable application/domain behavior、runtime public exports 與 Web presentation。

不得因 persisted data 或 module folder 已存在，就宣稱上述 runtime behavior 已完成；也不得在 ownership mismatch 尚未修正時，用 adapter、alias 或 fallback 隱藏它。

Canonical machine truth：
[`architecture/semantic-model.json`](../../architecture/semantic-model.json) ·
[`architecture/implementation-topology.json`](../../architecture/implementation-topology.json) ·
[`architecture/data-topology.json`](../../architecture/data-topology.json)

GitHub-like ownership benchmark：
[`architecture/semantic-benchmark.json`](../../architecture/semantic-benchmark.json)
