---
name: Architecture / Ownership
about: 回報具體的責任、Source of Truth、Boundary 或 Dependency 問題
---

## Business result / 受影響的能力

<!-- 何種產品結果／不變數必須正確成立？不能只描述 folder 外觀。 -->

## Current evidence / Root Cause

- Current main SHA、source / test / schema / manifest：
- Symptom → Consumer → Contract → Dependency → Owner → Source of Truth → Original Trigger：
- 已觀察到的責任衝突／duplicate authority／依賴錯置：
- Root Cause status：Unknown（Confirmed / Hypothesis / Unknown）
- 尚未證明的風險：

## Owner / Boundary

<!-- Bounded Context、Module、Data、Consistency、Trust 不機械等同。 -->
- Authoritative Owner / Source of Truth：
- Existing public capability that may be reused：
- Public contract / dependency direction：
- 必須保留的 Authorization／Transaction／Replay／Recovery invariants：

## Correct outcome / Non-goals

- 哪些責任與行為必須成立：
- 哪些既有行為不得改變：
- 不在範圍的重構或新功能：

<!-- 根因確認後才比較 Delete、Merge、Reuse、Refactor、Move、Split、Add；不預設最少行數、檔案或新增 layer。 -->

## Acceptance

- [ ] 根因／責任錯置有 source evidence，或明示剩餘未驗證風險
- [ ] Authority 有唯一 Owner，Consumer 只依賴必要 public contract
- [ ] 高內聚低耦合，無無責任 layer、duplicate writer 或 forwarding wrapper
- [ ] 必要 invariants 與 regression／適用 native concurrency evidence 已驗證
- [ ] PR／exact SHA／CI 及必要 Release／Device evidence 可追溯
