# Runtime and platform gaps

只保存仍缺放行證據或尚未落實的跨系統項目；已完成的 local architecture/account/team migration 不重複列 gap。

## Runtime / architecture

| ID | Gap | Completion condition |
| --- | --- | --- |
| AR1 | 複合畫面是否需要 route-level slot 未有需求證據 | 每組先定父 layout、URL、用途、資料、權限、loading/error、退出/返回；無需求不建立 slot |
| AR2 | 本地責任邊界有靜態防護，但登入後 UI/device regression evidence 不足 | 指定 revision 完成取消、重試、返回、換帳號、client/server boundary 實機驗收 |
| AR3 | Parallel Routes 是否有實際收益未驗證 | 相同條件比較直接/軟導覽、刷新、慢速、failure、換帳號；無收益不採用 |
| AR4 | Current Organization-scoped Team flow 已有 source，但 LINE group binding／remote/device isolation acceptance 不完整 | 指定環境驗 cross-Organization/Team isolation、last TeamManager、revoke；LINE groupId 永不授予 Team role |
| AR5 | Privacy notice 尚未與實際資料 lifecycle 完整驗收 | 公開告知與用途、retention、delete/revoke/recovery 一致；framework page 不算完成 |

## Package responsibility convergence

依 current module topology 逐一檢查，不由 root file 或資料夾數量判定違規。第一輪先完成 Wiki 的真實 Web consumer／公開契約，再檢查 Insights、Actions 與其 WBS／Notifications 依賴；第二輪追 Team、Organization、Repository、Issue／Discussion 的治理與協作交易；其餘 current packages 依實際 consumer／依賴順序接續。Integration/support/application modules 不建立假的 business Domain，inactive targets 不因目錄對稱而啟用。

每個 package 先讀 owner、FPT/product contracts、public exports、source、schema 與 tests，再追「資格 → replay → load → decision → save」。Domain 承接純業務決策，Application 承接用例與交易協調，Contracts 承接穩定 Port／DTO，Adapter 承接 SQL、鎖、條件寫入與 mapping，Composition 只接線。Root named public entries 可以合法存在；只有確認混合責任或重複 authority 才搬移，不留舊路徑 wrapper，不放寬 governing guards。

下一個深查點是 [Team collaboration](../../../packages/team/src/application/collaboration.ts) 到 [Postgres adapter](../../../packages/team/src/adapters/postgres.ts) 的 transaction／decision 分工：目前 use case 呼叫 repository mutation，而 adapter 同時引用跨 Owner 資格查詢與 Domain policies。這是待追證據，不代表所有 adapter 分支都是 Domain violation。

完成條件：每項修復有具體 source/consumer 證據、單一責任歸屬、同步的公開／資料／依賴契約、既有行為及授權／競爭／replay 回歸證據；以獨立可回滾 PR → main 交付。已完成項回到 owner/source/tests，不在此累積第二份 package review database。

## Supabase / production readiness

| ID | Gap | Completion condition |
| --- | --- | --- |
| S1 | 真實 LINE human identity、User lifecycle 與 optional Google link 缺完整 Android/iOS evidence | 指定 Channel/project 驗 success/expired/conflict/cancel/suspended；Google link 不改 LINE qualification |
| S2 | 指定 PostgreSQL runtime role/TLS/pool/transaction/isolation evidence 不足 | 驗 grants、TLS、pool isolation、uniqueness、replay、rollback、owner/version/audit 與 retention |
| S3 | Production migration/backup/restore/deployment end-to-end 尚未完整 | 唯一 writer、backup reconciliation、isolated restore、deployment、device flow、incremental recovery；不從 repo schema 推定 production |

## Product / AI governance

| ID | Gap | Completion condition |
| --- | --- | --- |
| PG1 | 尚未選定需要新增的完整 case workflow | 先定真實流程的 source/roles/state/cancel/retry/recovery，再決定是否新增 module |
| PG2 | 原件、衍生資料、audit、backup retention/deletion 尚未完整定案 | 每類資料有 owner、期限、revoke、backup deletion/recovery replay，並以實際環境驗證 |
| PG4 | AI provider hard limits、parallel quota、per-case cost 未量測 | 可量測用量/成本；deterministic path 維持零模型呼叫；上限有人工 fallback |
| PG5 | Receipt AI quality/latency/cost 缺正式 benchmark | 授權樣本與人工 baseline 比較 quality/correction/latency/cost，完成 device flow |

完成項移出 gaps，長期契約回到 architecture/module/integration owner；不要把歷史驗收累積在此。
