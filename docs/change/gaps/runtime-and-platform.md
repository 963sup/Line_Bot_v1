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
