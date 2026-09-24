# Project

狀態：**current data authority；runtime capability inactive**。

Project 是跨一個或多個 Repository 的 planning boundary。它擁有 planning facts，但不取得被參照 work 的 authority。

## Current authority

- Project identity。
- ProjectItem reference。
- WBS 與 ordering。
- Project Milestone。
- Project → Repository reference。

Current persisted facts 位於 `700–704` schema object group，semantic lifecycle 是 `current-data-only`。
`packages/project` 已註冊為 module owner，但目前沒有 executable source、public export、Web consumer 或 active runtime capability。

## Invariants

- `Project ≠ WBS`；WBS 只是 Project-owned decomposition。
- Project Item 是 reference，不複製 Repository Issue business truth。
- Project Milestone 與 Repository Milestone 是不同 owner 的 concept。
- Project reference 不轉移 Repository access、Issue lifecycle 或 content authority。
- Cross-owner identity/reference integrity 由 current schema constraints 與 Repository authority保護。

## Runtime activation

`manage-project-planning` 尚未宣告 runtime active。第一個真實 consumer 啟用時才定義：

- Project access / authorization contract。
- planning command、expected version、request replay。
- Repository current-access validation。
- public exports、application/domain source 與 Web presentation。

不得因 persisted data 或 module folder 已存在，就宣稱上述 runtime behavior 已完成。

Canonical machine truth：
[`architecture/semantic-model.json`](../../architecture/semantic-model.json) ·
[`architecture/implementation-topology.json`](../../architecture/implementation-topology.json) ·
[`architecture/data-topology.json`](../../architecture/data-topology.json)
