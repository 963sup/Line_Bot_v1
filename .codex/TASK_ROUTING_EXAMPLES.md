# 六層任務路由範例

本文件是操作範例，不新增 role、capability 或產品 authority。每個任務仍須先遵守 root `AGENTS.md` 的 Owner、consumer、contract 與 evidence 規則。

## 共通路由

```text
L1 Governance / Contract
  → L2 Primary scope
  → L3 enabled Atomic + executor role
  → L4 capability route（只有需要時）
  → L5 task packet / handoff result
  → L6 claim-specific evidence
```

## 新增功能

| 層 | 動作 |
| --- | --- |
| L1 | 確認 business result、Owner、contract、invariants 與 consumer |
| L2 | 若跨 Owner，先用 `semantic-scope`；定義允許/排除路徑 |
| L3 | 以 enabled Atomic 選 `analyst` 或 `change-implementer`，不可直接選 candidate |
| L4 | 只有需要額外方法時選 capability route，例如 `change-application` |
| L5 | 建立一個 task packet；implementation 與 review 分開 |
| L6 | 依 source、test、schema、browser 或 provider claim 分別驗證 |

## Repository mapping and audit

Repository mapping 使用 `investigate.owner-source-consumer`；contract 定位
仍由 L1/L2 authority resolution 負責。架構邊界分析使用
`analyse.architecture-boundary`，root-cause 使用 `analyse.root-cause`，文件
同步使用 `implement.documentation-facts`，diff review 使用
`review.general-diff`，discriminating test design 使用
`design.discriminating-tests`。

PR conflict diagnosis 使用 `analyse.root-cause`；acceptance 使用
`decide.acceptance`；consumer/impact mapping 使用
`investigate.owner-source-consumer` 或 `analyse.architecture-boundary`。
Preparation 與 reporting 都由 L5 task packet/handoff result 表達，不再拆成
`prepare.* → execute.* → report.*` 的 dispatch chain。

## Bug 修復

```text
症狀 → consumer → contract → dependency → Owner → source of truth
```

已知單一 Owner 時直接走 owner contract/source/tests；只有 Owner 或影響範圍不清楚才使用 `semantic-scope`。`runtime-diagnostician` 只負責觀察，不直接宣稱 root cause。

## 架構決策

```text
L1 authority
 → L2 scope
 → analyst：提出有限選項與 trade-off
 → decider：做一個獨立決策
 → change-implementer：套用已決定變更
 → validation-runner：提供對應證據
```

Analyst 不實作，decider 不修改 source，implementer 不接受自己的變更。

## Runtime incident

1. L1/L2 先確認 exact target、環境、時間窗與可觀察問題。
2. 選 `runtime-diagnostician`，必要時使用 `next-runtime-observation` 或 `sentry-incident-observation`。
3. 回傳 observed condition、revision、target、限制與 evidence boundary。
4. 若需要修復，再由 change-implementer 接手；診斷結果不等於 root cause 或 acceptance。

## Database / schema 變更

```text
product policy + data topology
 → schema/data analyst or planner
 → implementation/review
 → local schema + tests
 → remote readback（若明確授權且 target exact）
```

Local schema evidence 與 remote provider evidence 必須分開，migration、authorization、concurrency、rollback 與 recovery 不可用文件摘要取代。

## PR review / merge conflict

1. 先確認 PR head、base、merge-base 與實際 conflict files。
2. 讀衝突兩側的 commit/history 與各檔案 Owner；不要用單純 ours/theirs 取代語意判斷。
3. 逐一保留兩側仍有效的 intent；若 contract 不相容，回到 L1/L2 決定。
4. 由 reviewer 或 validation-runner 提供 bounded diff/check evidence。
5. 只有 checks、review、branch protection 都允許時，才由授權者合併到 `main`；不可繞過 required checks。

## 文件修正

文件若未改變 business、architecture 或 governance meaning，直接由 Primary 維持原路徑修改，執行 `pnpm docs:check`。若文件描述的 contract 已過時，先修 source-of-truth 與 consumer，再同步文件。

## 停止條件

以下情況應回到最早能解決問題的 layer，而不是擴張 scope：缺少產品決策、Owner/consumer 語意衝突、provider target 不明、外部 mutation 未授權、驗證 claim 與 evidence 不匹配。

## Measured performance

```text
scripts/browser/measure-loading.mjs measurement evidence
 → analyst via performance-analyst Atomic
 → smallest evidence-backed improvement
```

The performance analyst may identify the smallest justified change, but does not
modify source, run broad validation, or make an acceptance decision. Without
measurement evidence it stops and returns the gap.

## Authorization review

```text
permission/isolation diff + owner contract + affected tests
 → reviewer via authorization-reviewer Atomic
 → scope and isolation findings
```

The reviewer traces proof, principal, qualification, scope, policy owner and
mutation boundary. It does not grant authorization, edit source, or make the
final acceptance decision.
