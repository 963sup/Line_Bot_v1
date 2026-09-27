# Active risks

Risk 描述仍可能發生的損害；Gap 描述未完成與 completion condition。已完成 migration 不繼續作 active risk，但 compatibility/history 與尚未 cutover 的 writer 仍需防誤用。

| ID | Risk | Trigger / consequence | Mitigation / owner |
| --- | --- | --- | --- |
| R01 | Local source 被誤認 remote release | adapter/schema/menu 存在但 remote/device 未驗 | Operations + Acceptance 分層 evidence |
| R02 | External form 被誤認 internal workflow | 無可信 receipt/mapping 卻標完成 | Product/Integration + workflow gap |
| R03 | Stale identity/permission/scope | 換 actor/revoke 後 cache/舊 response 繼續 | server current recheck、key/invalidation/late-response isolation |
| R04 | Unknown-result retry 重複 effect | response loss 後換 requestId 重送 | owner durable key/fingerprint/version/readback |
| R05 | Recovery evidence 不足 | backup/restore/reconcile 未測 | Operations recovery；不靜默切第二 writer |
| R06 | AI output 被當 authority | draft/answer 直接成正式 write/amount/approval | deterministic owner command gate |
| R08 | Workforce/Payroll 過度宣稱 | policy/source/correction/retention 未完成卻宣稱法遵算薪 | required inputs/rule versions/business sign-off |
| R09 | Provider outage/quota 被誤當 business rollback | LINE/Google/AI/Redis失敗盲 retry | timeout/failure/readback；committed state不回滾 |
| R10 | Scope/role collapse | EnterpriseAdmin、OrganizationMembership、TeamManager、Employment混用 | typed owner relation/scope recheck |
| R11 | Target docs 被當 current | 假設 table/export/permission 已存在 | current/target/evidence + source/schema tests |
| R12 | Payroll source/version drift | upstream correction 靜默改舊結果 | pin input versions、immutable FINALIZED、new version/adjustment |
| R13 | Compatibility literal 被誤當第二 current writer | Member/WorkGroup/history name 被重新實作，或 Attendance Member→Employment cutover形成雙 writer | single owner/writer；history只讀；Employment cutover一次完成/reconcile |
| R14 | Account rekey/wrong-kind | 強制 text→UUID、generic FK 只驗存在 | identity continuity、kind-aware facet/human FK negative tests |
| R15 | Principal/holder/scope 混用 | scope/Bot 隱藏 actual actor、value歸錯人 | actual Principal + typed subject/scope/delegation；Wallet/Ledger enforcement |
| R16 | 文件/CI 被誤當 implementation acceptance | 改 docs、跑 CI、SQL success 就宣稱 remote/runtime完成 | D/G/I/S/R/V evidence 分層 |

DailyCheckIn/Attendance V1 source key、receipt fingerprint/result、Ledger history不可為 owner rename 改寫。Employment cutover保留既有 per-human reward/replay/history邊界。Schema-first不表示 retained deployment history 可刪；remote環境/retention未知預設 preserve-data，incompatible DB cutover 前停止舊 writer。

Risk 必須落到 architecture/security guard、constraint/transaction、negative/concurrency/recovery tests；已消除項移除，長期 invariant 回 canonical owner。

- [Account ADR](../010-decisions/070-account-identity-design.md)
- [Migration](../030-migrations/040-enterprise-organization-workforce-payroll.md)
- [Gaps](../040-gaps/README.md)
- [Acceptance](../060-acceptance/README.md)
