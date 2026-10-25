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

## Repository mapping audit（已啟用 consumer）

本專案的架構盤點與 candidate promotion audit 使用以下實際 workflow：

```text
prepare.repository-mapper
  → execute.repository-mapper
  → report.repository-mapper
```

三個 Atomic 共用 `investigator` executor，但各自保留不同的 input、deliverable
與 stop condition。它們只負責建立 repository evidence，不負責產品決策、修改
source 或接受最終結果；這也是目前第一組由真實 repository task 證明可啟用的
specialised Atomic triplet。

同一 audit 的 contract 定位子流程使用：

```text
prepare.contract-locator
  → execute.contract-locator
  → report.contract-locator
```

它只定位 authority，不解釋產品語意；語意判斷仍回到 L1/L2。

本次六層架構調整的邊界分析使用：

```text
prepare.architecture-analyst
  → execute.architecture-analyst
  → report.architecture-analyst
```

分析結果只提供 Owner、truth、dependency 與 boundary 選項，不直接做最終
architecture decision，也不直接修改 implementation。

本次 audit 文件與路由文件的同步使用：

```text
prepare.documentation-writer
  → execute.documentation-writer
  → report.documentation-writer
```

它只同步已確認的 repository facts；`docs:check` 是文件結構證據，不代表
產品行為或部署驗收。

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
