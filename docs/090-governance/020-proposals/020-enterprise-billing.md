# Billing / Charging target business rules

狀態：target 語意與啟用條件，尚無 Billing / Charging runtime/schema 或收款能力。本文的 `Billing / Charging` 只代表 commercial charging／subscription／entitlement responsibility；不是 Finance umbrella。Accounting、Payment、Settlement 各自是不同責任。暫沿 Governance proposal 保存，且不代表 Enterprise Aggregate 內含所有帳單。

## Purpose / owned model

| Concept | 責任 | 不代表 |
| --- | --- | --- |
| Plan | 有版本的商業方案與可購買權益定義 | Role 或 Permission |
| Subscription | 指定方案的訂閱、有效期間與變更歷史 | OrganizationMembership |
| BillingAccount | 付款責任、帳單歸屬及 provider mapping | Account root、User 或會計科目 |
| CostCenter | 費用歸集維度 | Organization identity、Team 或授權 scope |

Enterprise 可作訂閱治理範圍；實際付款人、受益 Organization 與成本歸集可以不同，必須明確記錄關係，不能由組織樹推定。Organization attach/detach 不自動轉移訂閱、付款責任或歷史費用。

## Invariants / authority

- Billing / Charging 管理需要明確 scoped Permission；EnterpriseAdmin 或 OrganizationAdmin 名稱不自動提供 charging、subscription 或 payment execution 能力。
- Entitlement 是產品可用性的必要條件之一，不產生角色權限；付費成功不能繞過 participation、policy 或 resource authorization。
- Plan/version、subscription 生效與終止時間及 provider event identity 可追溯。重送事件不得重複收費或延長權益；舊事件不得回退較新狀態。
- 付款狀態以經驗證的 provider evidence 與本地 durable reconciliation 為依據，不信任 browser success redirect。未知結果保留原 request identity 查回，不換 ID 重送收費。
- 所需 state、receipt 與 audit 原子保存；外部收款無法和本地 transaction 共用 commit 時，必須明確定義重試、對帳與失敗恢復。
- Billing / Charging 不取代 Payroll、Accounting / Finance、Payment、Settlement、Coin Wallet 或 Ledger。需要入帳時透過 Accounting owner 的公開契約；需要實際資金移轉時透過 Payment owner；不能直接修改既有帳本歷史。

## Responsibility boundaries

```text
Billing / Charging
= 計費、方案、訂閱、entitlement、應收 charging decision

Accounting
= 會計 recognition / posting / reporting

Payment
= 實際支付執行與 provider money movement

Settlement
= 多方資金或帳務清算 / 結清
```

Billing / Charging 可以消費已驗證的 Payment outcome，也可以向 Accounting 發出 owner-approved charging/posting input；但不得自行成為 Payment executor 或 Accounting writer。只有真實 settlement use case 出現時才建立 Settlement owner，不預建 umbrella model。

## Activation gate

啟用前須由產品決定付費對象、payer/beneficiary cardinality、計價單位、方案與 entitlement、provider、取消／欠費／退款／寬限期及 scope detach 行為；核定管理授權、並行／重送／亂序對帳測試與恢復流程。尚無這些決策時，不新增收費入口、SDK、空 package 或資料表，也不填造價格或稅務規則。

授權由 [Identity/Access](../../090-governance/020-proposals/040-security-target.md) 擁有；稽核由 [Audit](../../090-governance/020-proposals/040-security-target.md) 擁有。
