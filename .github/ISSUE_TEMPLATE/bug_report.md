---
name: Bug 回報
about: 回報可觀察的故障或 regression；根因未知可留待調查
---

## Business outcome / 問題

<!-- 哪個業務／使用者流程應恢復正確？不預先指定 implementation。 -->

## 影響範圍 / 不在範圍

- 受影響的 User／Repository／Project／流程：
- 已知不受影響的部分：

## 重現與目前證據

<!-- 未重現應註明；不得包含 secret、token、個人資料或 production-sensitive payload。 -->

1.
2.
3.

- 預期：
- 實際：
- Source revision / environment（SHA、Web／LINE、DB／provider 等）：
- Log / test / error / screenshot reference：

## Root Cause / Ownership（調查時補充）

<!-- 根因狀態：Confirmed / Hypothesis / Unknown。不要將猜測當證據。 -->
- Root Cause status：Unknown
- Failure mechanism / original trigger：
- Owner / Source of Truth / Consumer / Public contract：
- 適用的 Authorization／Transaction／Replay／Recovery invariants：

## Acceptance

- [ ] 原始故障在指定 scope 已消除，有可追溯 regression evidence
- [ ] 適用的合法／拒絕、版本／並行、rollback／unknown-result 行為已驗證
- [ ] 修正在正確 Owner，沒有新建無責任 abstraction 或 duplicate truth
- [ ] PR、exact SHA、Validation 實際結果已關聯
- [ ] 若需 Release／Provider／Browser／LINE 驗收，已具備證據或有明確後續 Owner

<!-- CI green、PR merged 與 production accepted 是不同事實；Issue 依自身 acceptance 結案。 -->
